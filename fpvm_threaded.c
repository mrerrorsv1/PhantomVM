#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

/*
 * fpvm_threaded.c
 * نسخة C مبسطة من مفسر PhantomVM باستخدام:
 * - Computed Goto في التنفيذ
 * - Direct Threaded Code (stream يحتوي عناوين handlers)
 *
 * Requires GNU C extension: labels-as-values.
 */

enum {
  OP_HLT     = 0x00,
  OP_PUSH_N  = 0x01,
  OP_PUSH_R  = 0x02,
  OP_POP     = 0x03,
  OP_POP_R   = 0x04,
  OP_DUP     = 0x05,
  OP_ADD_R_N = 0x06,
  OP_ADD_R_R = 0x07,
  OP_SUB_R_N = 0x08,
  OP_SUB_R_R = 0x09,
  OP_MUL_R_N = 0x0A,
  OP_MUL_R_R = 0x0B,
  OP_DIV_R_N = 0x0C,
  OP_DIV_R_R = 0x0D,
  OP_CMP_R_N = 0x11,
  OP_CMP_R_R = 0x12,
  OP_JMP_N   = 0x14,
  OP_JEQ_N   = 0x18,
  OP_JNE_N   = 0x1A,
  OP_MOV_R_N = 0x35,
  OP_MOV_R_R = 0x36
};

typedef struct {
  uint32_t regs[256];
  uint32_t stack[1024];
  uint32_t sp;
  int32_t cmp_flag; /* 0=equal, >0=greater, <0=less */
} FPVM;

typedef struct {
  uintptr_t *cells;
  size_t len;
  size_t cap;
} CellProgram;

static void cp_push(CellProgram *cp, uintptr_t v) {
  if (cp->len == cp->cap) {
    size_t next_cap = cp->cap ? cp->cap * 2 : 128;
    uintptr_t *new_cells = (uintptr_t *)realloc(cp->cells, next_cap * sizeof(uintptr_t));
    if (!new_cells) {
      fprintf(stderr, "out of memory\n");
      exit(1);
    }
    cp->cells = new_cells;
    cp->cap = next_cap;
  }
  cp->cells[cp->len++] = v;
}

static uint8_t read_u8(const uint8_t *code, size_t *pc, size_t n) {
  if (*pc >= n) {
    fprintf(stderr, "bytecode truncated near pc=%zu\n", *pc);
    exit(1);
  }
  return code[(*pc)++];
}

static uint32_t read_u32(const uint8_t *code, size_t *pc, size_t n) {
  if (*pc + 4 > n) {
    fprintf(stderr, "bytecode truncated near pc=%zu\n", *pc);
    exit(1);
  }
  uint32_t v =
      (uint32_t)code[*pc] |
      ((uint32_t)code[*pc + 1] << 8) |
      ((uint32_t)code[*pc + 2] << 16) |
      ((uint32_t)code[*pc + 3] << 24);
  *pc += 4;
  return v;
}

static size_t insn_size(uint8_t op) {
  switch (op) {
    case OP_HLT:
    case OP_POP:
    case OP_DUP:
      return 1;

    case OP_PUSH_R:
    case OP_POP_R:
      return 2;

    case OP_PUSH_N:
    case OP_JMP_N:
    case OP_JEQ_N:
    case OP_JNE_N:
      return 5;

    case OP_MOV_R_N:
    case OP_ADD_R_N:
    case OP_SUB_R_N:
    case OP_MUL_R_N:
    case OP_DIV_R_N:
    case OP_CMP_R_N:
      return 6;

    case OP_MOV_R_R:
    case OP_ADD_R_R:
    case OP_SUB_R_R:
    case OP_MUL_R_R:
    case OP_DIV_R_R:
    case OP_CMP_R_R:
      return 3;

    default:
      return 0;
  }
}

static CellProgram compile_to_direct_threaded(const uint8_t *code, size_t n, void **dispatch_table) {
  CellProgram cp = {0};

  uint32_t *byte_to_cell = (uint32_t *)malloc((n + 1) * sizeof(uint32_t));
  if (!byte_to_cell) {
    fprintf(stderr, "out of memory\n");
    exit(1);
  }
  for (size_t i = 0; i <= n; i++) byte_to_cell[i] = UINT32_MAX;

  /* Pass 1: map كل bytecode pc إلى cell-index بداية التعليمة */
  size_t pc = 0;
  uint32_t cell_count = 0;
  while (pc < n) {
    uint8_t op = code[pc];
    size_t sz = insn_size(op);
    if (sz == 0 || pc + sz > n) {
      fprintf(stderr, "unsupported/truncated opcode 0x%02X at byte pc=%zu\n", op, pc);
      free(byte_to_cell);
      exit(1);
    }
    byte_to_cell[pc] = cell_count;

    /* handler cell + operand cells */
    switch (op) {
      case OP_HLT:
      case OP_POP:
      case OP_DUP:
        cell_count += 1;
        break;
      case OP_PUSH_R:
      case OP_POP_R:
        cell_count += 2;
        break;
      case OP_PUSH_N:
      case OP_JMP_N:
      case OP_JEQ_N:
      case OP_JNE_N:
        cell_count += 2;
        break;
      case OP_MOV_R_R:
      case OP_ADD_R_R:
      case OP_SUB_R_R:
      case OP_MUL_R_R:
      case OP_DIV_R_R:
      case OP_CMP_R_R:
        cell_count += 3;
        break;
      case OP_MOV_R_N:
      case OP_ADD_R_N:
      case OP_SUB_R_N:
      case OP_MUL_R_N:
      case OP_DIV_R_N:
      case OP_CMP_R_N:
        cell_count += 3;
        break;
      default:
        break;
    }

    pc += sz;
  }

  byte_to_cell[n] = cell_count;

  /* Pass 2: emit direct threaded cells */
  pc = 0;
  while (pc < n) {
    uint8_t op = read_u8(code, &pc, n);
    void *label = dispatch_table[op];
    if (!label) {
      fprintf(stderr, "opcode 0x%02X has no handler\n", op);
      free(byte_to_cell);
      free(cp.cells);
      exit(1);
    }

    cp_push(&cp, (uintptr_t)label);

    switch (op) {
      case OP_HLT:
      case OP_POP:
      case OP_DUP:
        break;

      case OP_PUSH_N:
        cp_push(&cp, (uintptr_t)read_u32(code, &pc, n));
        break;

      case OP_PUSH_R:
      case OP_POP_R:
        cp_push(&cp, (uintptr_t)read_u8(code, &pc, n));
        break;

      case OP_MOV_R_N:
      case OP_ADD_R_N:
      case OP_SUB_R_N:
      case OP_MUL_R_N:
      case OP_DIV_R_N:
      case OP_CMP_R_N:
        cp_push(&cp, (uintptr_t)read_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)read_u32(code, &pc, n));
        break;

      case OP_MOV_R_R:
      case OP_ADD_R_R:
      case OP_SUB_R_R:
      case OP_MUL_R_R:
      case OP_DIV_R_R:
      case OP_CMP_R_R:
        cp_push(&cp, (uintptr_t)read_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)read_u8(code, &pc, n));
        break;

      case OP_JMP_N:
      case OP_JEQ_N:
      case OP_JNE_N: {
        uint32_t byte_target = read_u32(code, &pc, n);
        if (byte_target > n || byte_to_cell[byte_target] == 0xFFFFFFFFu) {
          fprintf(stderr, "invalid jump byte target: %u\n", byte_target);
          free(byte_to_cell);
          free(cp.cells);
          exit(1);
        }
        cp_push(&cp, (uintptr_t)byte_to_cell[byte_target]);
        break;
      }

      default:
        fprintf(stderr, "unsupported opcode during threading: 0x%02X\n", op);
        free(byte_to_cell);
        free(cp.cells);
        exit(1);
    }
  }

  cp_push(&cp, (uintptr_t)dispatch_table[OP_HLT]);
  free(byte_to_cell);
  return cp;
}

static void vm_exec(FPVM *vm, const uint8_t *code, size_t n) {
  void *dispatch_table[256] = {0};
  dispatch_table[OP_HLT] = &&L_HLT;
  dispatch_table[OP_PUSH_N] = &&L_PUSH_N;
  dispatch_table[OP_PUSH_R] = &&L_PUSH_R;
  dispatch_table[OP_POP] = &&L_POP;
  dispatch_table[OP_POP_R] = &&L_POP_R;
  dispatch_table[OP_DUP] = &&L_DUP;
  dispatch_table[OP_MOV_R_N] = &&L_MOV_R_N;
  dispatch_table[OP_MOV_R_R] = &&L_MOV_R_R;
  dispatch_table[OP_ADD_R_N] = &&L_ADD_R_N;
  dispatch_table[OP_ADD_R_R] = &&L_ADD_R_R;
  dispatch_table[OP_SUB_R_N] = &&L_SUB_R_N;
  dispatch_table[OP_SUB_R_R] = &&L_SUB_R_R;
  dispatch_table[OP_MUL_R_N] = &&L_MUL_R_N;
  dispatch_table[OP_MUL_R_R] = &&L_MUL_R_R;
  dispatch_table[OP_DIV_R_N] = &&L_DIV_R_N;
  dispatch_table[OP_DIV_R_R] = &&L_DIV_R_R;
  dispatch_table[OP_CMP_R_N] = &&L_CMP_R_N;
  dispatch_table[OP_CMP_R_R] = &&L_CMP_R_R;
  dispatch_table[OP_JMP_N] = &&L_JMP_N;
  dispatch_table[OP_JEQ_N] = &&L_JEQ_N;
  dispatch_table[OP_JNE_N] = &&L_JNE_N;

  CellProgram cp = compile_to_direct_threaded(code, n, dispatch_table);

  uintptr_t *ip = cp.cells;
#define DISPATCH() goto *(void *)*ip++

  DISPATCH();

L_HLT:
  free(cp.cells);
  return;

L_PUSH_N:
  if (vm->sp >= 1024) { fprintf(stderr, "stack overflow\n"); goto L_STOP; }
  vm->stack[vm->sp++] = (uint32_t)(*ip++);
  DISPATCH();

L_PUSH_R: {
  uint8_t r = (uint8_t)(*ip++);
  if (vm->sp >= 1024) { fprintf(stderr, "stack overflow\n"); goto L_STOP; }
  vm->stack[vm->sp++] = vm->regs[r];
  DISPATCH();
}

L_POP:
  if (vm->sp == 0) { fprintf(stderr, "stack underflow\n"); goto L_STOP; }
  vm->sp--;
  DISPATCH();

L_POP_R: {
  uint8_t r = (uint8_t)(*ip++);
  if (vm->sp == 0) { fprintf(stderr, "stack underflow\n"); goto L_STOP; }
  vm->regs[r] = vm->stack[--vm->sp];
  DISPATCH();
}

L_DUP:
  if (vm->sp == 0 || vm->sp >= 1024) { fprintf(stderr, "stack error\n"); goto L_STOP; }
  vm->stack[vm->sp] = vm->stack[vm->sp - 1];
  vm->sp++;
  DISPATCH();

L_MOV_R_N: {
  uint8_t dst = (uint8_t)(*ip++);
  vm->regs[dst] = (uint32_t)(*ip++);
  DISPATCH();
}

L_MOV_R_R: {
  uint8_t dst = (uint8_t)(*ip++);
  uint8_t src = (uint8_t)(*ip++);
  vm->regs[dst] = vm->regs[src];
  DISPATCH();
}

L_ADD_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  vm->regs[r] += (uint32_t)(*ip++);
  DISPATCH();
}

L_ADD_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  vm->regs[a] += vm->regs[b];
  DISPATCH();
}

L_SUB_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  vm->regs[r] -= (uint32_t)(*ip++);
  DISPATCH();
}

L_SUB_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  vm->regs[a] -= vm->regs[b];
  DISPATCH();
}

L_MUL_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  vm->regs[r] *= (uint32_t)(*ip++);
  DISPATCH();
}

L_MUL_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  vm->regs[a] *= vm->regs[b];
  DISPATCH();
}

L_DIV_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  uint32_t imm = (uint32_t)(*ip++);
  if (imm == 0) { fprintf(stderr, "division by zero\n"); goto L_STOP; }
  vm->regs[r] /= imm;
  DISPATCH();
}

L_DIV_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  if (vm->regs[b] == 0) { fprintf(stderr, "division by zero\n"); goto L_STOP; }
  vm->regs[a] /= vm->regs[b];
  DISPATCH();
}

L_CMP_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  uint32_t imm = (uint32_t)(*ip++);
  vm->cmp_flag = (vm->regs[r] > imm) - (vm->regs[r] < imm);
  DISPATCH();
}

L_CMP_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  vm->cmp_flag = (vm->regs[a] > vm->regs[b]) - (vm->regs[a] < vm->regs[b]);
  DISPATCH();
}

L_JMP_N: {
  uint32_t target_cell = (uint32_t)(*ip++);
  if (target_cell >= cp.len) { fprintf(stderr, "bad jump target cell=%u\n", target_cell); goto L_STOP; }
  ip = cp.cells + target_cell;
  DISPATCH();
}

L_JEQ_N: {
  uint32_t target_cell = (uint32_t)(*ip++);
  if (vm->cmp_flag == 0) {
    if (target_cell >= cp.len) { fprintf(stderr, "bad jump target cell=%u\n", target_cell); goto L_STOP; }
    ip = cp.cells + target_cell;
  }
  DISPATCH();
}

L_JNE_N: {
  uint32_t target_cell = (uint32_t)(*ip++);
  if (vm->cmp_flag != 0) {
    if (target_cell >= cp.len) { fprintf(stderr, "bad jump target cell=%u\n", target_cell); goto L_STOP; }
    ip = cp.cells + target_cell;
  }
  DISPATCH();
}

L_STOP:
  free(cp.cells);
  return;

#undef DISPATCH
}

static void emit_u32(uint8_t *out, size_t *n, uint32_t v) {
  out[(*n)++] = (uint8_t)(v & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 8) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 16) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 24) & 0xFF);
}

int main(void) {
  uint8_t code[256] = {0};
  size_t n = 0;

  code[n++] = OP_MOV_R_N; code[n++] = 0; emit_u32(code, &n, 7);
  code[n++] = OP_MOV_R_N; code[n++] = 1; emit_u32(code, &n, 5);
  code[n++] = OP_ADD_R_R; code[n++] = 0; code[n++] = 1;
  code[n++] = OP_PUSH_R;  code[n++] = 0;
  code[n++] = OP_POP_R;   code[n++] = 2;
  code[n++] = OP_CMP_R_N; code[n++] = 2; emit_u32(code, &n, 12);

  code[n++] = OP_JEQ_N;
  size_t jeq_target_pos = n;
  emit_u32(code, &n, 0); /* patch لاحقاً */

  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 0);
  code[n++] = OP_HLT;

  uint32_t equal_block_pc = (uint32_t)n;
  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 1);
  code[n++] = OP_HLT;

  code[jeq_target_pos + 0] = (uint8_t)(equal_block_pc & 0xFF);
  code[jeq_target_pos + 1] = (uint8_t)((equal_block_pc >> 8) & 0xFF);
  code[jeq_target_pos + 2] = (uint8_t)((equal_block_pc >> 16) & 0xFF);
  code[jeq_target_pos + 3] = (uint8_t)((equal_block_pc >> 24) & 0xFF);

  FPVM vm = {0};
  vm_exec(&vm, code, n);

  printf("r0=%" PRIu32 ", r1=%" PRIu32 ", r2=%" PRIu32 ", r3=%" PRIu32 "\n",
         vm.regs[0], vm.regs[1], vm.regs[2], vm.regs[3]);

  return 0;
}
