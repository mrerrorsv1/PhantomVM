#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * fpvm_threaded.c
 * نسخة C مبسطة من مفسر PhantomVM باستخدام:
 * 1) Computed Goto (بدون switch-case في حلقة التنفيذ)
 * 2) Direct Threaded Code (جدول عناوين handlers داخل stream)
 *
 * ملاحظة: يعتمد على امتداد GNU C (labels as values).
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
  int32_t cmp_flag; /* 0 = equal, >0 = greater, <0 = less */
} FPVM;

typedef struct {
  uintptr_t *cells;
  size_t len;
  size_t cap;
} ThreadedProgram;

static uint32_t rd_u32(const uint8_t *code, size_t *pc, size_t n) {
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

static uint8_t rd_u8(const uint8_t *code, size_t *pc, size_t n) {
  if (*pc >= n) {
    fprintf(stderr, "bytecode truncated near pc=%zu\n", *pc);
    exit(1);
  }
  return code[(*pc)++];
}

static void tp_push(ThreadedProgram *tp, uintptr_t cell) {
  if (tp->len == tp->cap) {
    size_t next = tp->cap ? tp->cap * 2 : 128;
    uintptr_t *grown = (uintptr_t *)realloc(tp->cells, next * sizeof(uintptr_t));
    if (!grown) {
      fprintf(stderr, "out of memory\n");
      exit(1);
    }
    tp->cells = grown;
    tp->cap = next;
  }
  tp->cells[tp->len++] = cell;
}

static ThreadedProgram thread_bytecode(const uint8_t *code, size_t n) {
  ThreadedProgram tp = {0};
  size_t pc = 0;

#define LABEL(l) ((uintptr_t)&&l)

  while (pc < n) {
    uint8_t op = rd_u8(code, &pc, n);
    switch (op) {
      case OP_HLT:
        tp_push(&tp, LABEL(L_HLT));
        break;

      case OP_PUSH_N:
        tp_push(&tp, LABEL(L_PUSH_N));
        tp_push(&tp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_PUSH_R:
        tp_push(&tp, LABEL(L_PUSH_R));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_POP:
        tp_push(&tp, LABEL(L_POP));
        break;

      case OP_POP_R:
        tp_push(&tp, LABEL(L_POP_R));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_DUP:
        tp_push(&tp, LABEL(L_DUP));
        break;

      case OP_MOV_R_N:
        tp_push(&tp, LABEL(L_MOV_R_N));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        tp_push(&tp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_MOV_R_R:
        tp_push(&tp, LABEL(L_MOV_R_R));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_ADD_R_N:
      case OP_SUB_R_N:
      case OP_MUL_R_N:
      case OP_DIV_R_N:
      case OP_CMP_R_N:
        tp_push(&tp, op == OP_ADD_R_N ? LABEL(L_ADD_R_N)
                      : op == OP_SUB_R_N ? LABEL(L_SUB_R_N)
                      : op == OP_MUL_R_N ? LABEL(L_MUL_R_N)
                      : op == OP_DIV_R_N ? LABEL(L_DIV_R_N)
                                          : LABEL(L_CMP_R_N));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        tp_push(&tp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_ADD_R_R:
      case OP_SUB_R_R:
      case OP_MUL_R_R:
      case OP_DIV_R_R:
      case OP_CMP_R_R:
        tp_push(&tp, op == OP_ADD_R_R ? LABEL(L_ADD_R_R)
                      : op == OP_SUB_R_R ? LABEL(L_SUB_R_R)
                      : op == OP_MUL_R_R ? LABEL(L_MUL_R_R)
                      : op == OP_DIV_R_R ? LABEL(L_DIV_R_R)
                                          : LABEL(L_CMP_R_R));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        tp_push(&tp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_JMP_N:
      case OP_JEQ_N:
      case OP_JNE_N:
        tp_push(&tp, op == OP_JMP_N ? LABEL(L_JMP_N)
                      : op == OP_JEQ_N ? LABEL(L_JEQ_N)
                                       : LABEL(L_JNE_N));
        tp_push(&tp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      default:
        fprintf(stderr, "unsupported opcode 0x%02X at byte pc=%zu\n", op, pc - 1);
        free(tp.cells);
        exit(1);
    }
  }

  /* sentinel: إذا وصلنا نهاية stream بلا HLT نوقف التنفيذ */
  tp_push(&tp, LABEL(L_HLT));
  return tp;

  /* Labels موجودة فقط لأخذ عناوينها أثناء threading */
L_HLT:; L_PUSH_N:; L_PUSH_R:; L_POP:; L_POP_R:; L_DUP:;
L_MOV_R_N:; L_MOV_R_R:;
L_ADD_R_N:; L_ADD_R_R:; L_SUB_R_N:; L_SUB_R_R:;
L_MUL_R_N:; L_MUL_R_R:; L_DIV_R_N:; L_DIV_R_R:;
L_CMP_R_N:; L_CMP_R_R:;
L_JMP_N:; L_JEQ_N:; L_JNE_N:;
#undef LABEL
}

static void vm_exec(FPVM *vm, ThreadedProgram *tp) {
  uintptr_t *ip = tp->cells;
#define DISPATCH() goto **(void **)ip++

  DISPATCH();

L_HLT:
  return;

L_PUSH_N: {
  if (vm->sp >= 1024) { fprintf(stderr, "stack overflow\n"); return; }
  vm->stack[vm->sp++] = (uint32_t)(*ip++);
  DISPATCH();
}

L_PUSH_R: {
  uint8_t r = (uint8_t)(*ip++);
  if (vm->sp >= 1024) { fprintf(stderr, "stack overflow\n"); return; }
  vm->stack[vm->sp++] = vm->regs[r];
  DISPATCH();
}

L_POP: {
  if (vm->sp == 0) { fprintf(stderr, "stack underflow\n"); return; }
  vm->sp--;
  DISPATCH();
}

L_POP_R: {
  uint8_t r = (uint8_t)(*ip++);
  if (vm->sp == 0) { fprintf(stderr, "stack underflow\n"); return; }
  vm->regs[r] = vm->stack[--vm->sp];
  DISPATCH();
}

L_DUP: {
  if (vm->sp == 0 || vm->sp >= 1024) { fprintf(stderr, "stack error\n"); return; }
  vm->stack[vm->sp] = vm->stack[vm->sp - 1];
  vm->sp++;
  DISPATCH();
}

L_MOV_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  vm->regs[r] = (uint32_t)(*ip++);
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
  if (imm == 0) { fprintf(stderr, "division by zero\n"); return; }
  vm->regs[r] /= imm;
  DISPATCH();
}

L_DIV_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  uint32_t d = vm->regs[b];
  if (d == 0) { fprintf(stderr, "division by zero\n"); return; }
  vm->regs[a] /= d;
  DISPATCH();
}

L_CMP_R_N: {
  uint8_t r = (uint8_t)(*ip++);
  uint32_t v = (uint32_t)(*ip++);
  vm->cmp_flag = (vm->regs[r] > v) - (vm->regs[r] < v);
  DISPATCH();
}

L_CMP_R_R: {
  uint8_t a = (uint8_t)(*ip++);
  uint8_t b = (uint8_t)(*ip++);
  vm->cmp_flag = (vm->regs[a] > vm->regs[b]) - (vm->regs[a] < vm->regs[b]);
  DISPATCH();
}

L_JMP_N: {
  uint32_t target = (uint32_t)(*ip++);
  if (target >= tp->len) { fprintf(stderr, "bad jump target: %u\n", target); return; }
  ip = tp->cells + target;
  DISPATCH();
}

L_JEQ_N: {
  uint32_t target = (uint32_t)(*ip++);
  if (vm->cmp_flag == 0) {
    if (target >= tp->len) { fprintf(stderr, "bad jump target: %u\n", target); return; }
    ip = tp->cells + target;
  }
  DISPATCH();
}

L_JNE_N: {
  uint32_t target = (uint32_t)(*ip++);
  if (vm->cmp_flag != 0) {
    if (target >= tp->len) { fprintf(stderr, "bad jump target: %u\n", target); return; }
    ip = tp->cells + target;
  }
  DISPATCH();
}

#undef DISPATCH
}

static void emit_u32(uint8_t *out, size_t *n, uint32_t v) {
  out[(*n)++] = (uint8_t)(v & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 8) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 16) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 24) & 0xFF);
}

/*
 * Demo bytecode:
 * r0 = 7
 * r1 = 5
 * r0 = r0 + r1
 * push r0; pop r2
 * cmp r2, 12
 * jeq -> set r3 = 1
 * hlt
 */
int main(void) {
  uint8_t code[256] = {0};
  size_t n = 0;

  code[n++] = OP_MOV_R_N; code[n++] = 0; emit_u32(code, &n, 7);
  code[n++] = OP_MOV_R_N; code[n++] = 1; emit_u32(code, &n, 5);
  code[n++] = OP_ADD_R_R; code[n++] = 0; code[n++] = 1;
  code[n++] = OP_PUSH_R;  code[n++] = 0;
  code[n++] = OP_POP_R;   code[n++] = 2;
  code[n++] = OP_CMP_R_N; code[n++] = 2; emit_u32(code, &n, 12);

  /* placeholder jump target in threaded-cell units */
  code[n++] = OP_JEQ_N;
  size_t jeq_imm_pos = n;
  emit_u32(code, &n, 0);

  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 0);
  code[n++] = OP_HLT;

  /* target block */
  size_t equal_block_byte_pos = n;
  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 1);
  code[n++] = OP_HLT;

  ThreadedProgram tp = thread_bytecode(code, n);

  /*
   * نحسب target بصيغة cell-index داخل stream المبني (Direct Threaded Code).
   * نبني prefix قبل equal-block لاستخراج عدد الخلايا.
   */
  ThreadedProgram prefix = thread_bytecode(code, equal_block_byte_pos);
  uint32_t cell_target = (uint32_t)(prefix.len - 1); /* -1 لأن thread_bytecode يضيف sentinel HLT */
  free(prefix.cells);

  /* write jump cell target back into bytecode then rebuild */
  code[jeq_imm_pos + 0] = (uint8_t)(cell_target & 0xFF);
  code[jeq_imm_pos + 1] = (uint8_t)((cell_target >> 8) & 0xFF);
  code[jeq_imm_pos + 2] = (uint8_t)((cell_target >> 16) & 0xFF);
  code[jeq_imm_pos + 3] = (uint8_t)((cell_target >> 24) & 0xFF);

  free(tp.cells);
  tp = thread_bytecode(code, n);

  FPVM vm = {0};
  vm_exec(&vm, &tp);

  printf("r0=%" PRIu32 ", r1=%" PRIu32 ", r2=%" PRIu32 ", r3=%" PRIu32 "\n",
         vm.regs[0], vm.regs[1], vm.regs[2], vm.regs[3]);

  free(tp.cells);
  return 0;
}
