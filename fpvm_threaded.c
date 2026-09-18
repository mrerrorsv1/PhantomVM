#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * fpvm_threaded.c
 * C FPVM prototype using:
 * - Computed Goto for execution dispatch
 * - Direct Threaded Code (cell stream of handler labels + operands)
 *
 * Notes:
 * - Keeps the same opcode coverage as constants.js (0x00..0x7D)
 * - This is a single-mode runtime model focused on instruction behavior.
 */

enum {
  OP_HLT      = 0x00,
  OP_PUSH_N   = 0x01,
  OP_PUSH_R   = 0x02,
  OP_POP      = 0x03,
  OP_POP_R    = 0x04,
  OP_DUP      = 0x05,
  OP_ADD_R_N  = 0x06,
  OP_ADD_R_R  = 0x07,
  OP_SUB_R_N  = 0x08,
  OP_SUB_R_R  = 0x09,
  OP_MUL_R_N  = 0x0A,
  OP_MUL_R_R  = 0x0B,
  OP_DIV_R_N  = 0x0C,
  OP_DIV_R_R  = 0x0D,
  OP_MOD_R_N  = 0x0E,
  OP_MOD_R_R  = 0x0F,

  OP_CMP_N_N  = 0x10,
  OP_CMP_R_N  = 0x11,
  OP_CMP_R_R  = 0x12,
  OP_CMP_N_R  = 0x13,

  OP_JMP_N    = 0x14,
  OP_JMP_R    = 0x15,
  OP_CALL_N   = 0x16,
  OP_CALL_R   = 0x17,

  OP_JEQ_N    = 0x18,
  OP_JEQ_R    = 0x19,
  OP_JNE_N    = 0x1A,
  OP_JNE_R    = 0x1B,
  OP_JGT_N    = 0x1C,
  OP_JGT_R    = 0x1D,
  OP_JLT_N    = 0x1E,
  OP_JLT_R    = 0x1F,

  OP_CEQ_N    = 0x20,
  OP_CEQ_R    = 0x21,
  OP_CNE_N    = 0x22,
  OP_CNE_R    = 0x23,
  OP_CGT_N    = 0x24,
  OP_CGT_R    = 0x25,
  OP_CLT_N    = 0x26,
  OP_CLT_R    = 0x27,

  OP_CLC      = 0x28,
  OP_AND_R_N  = 0x29,
  OP_AND_R_R  = 0x2A,
  OP_EOR_R_N  = 0x2B,
  OP_EOR_R_R  = 0x2C,
  OP_XOR_R_N  = 0x2D,
  OP_XOR_R_R  = 0x2E,
  OP_NOT      = 0x2F,

  OP_SYSCALL  = 0x30,
  OP_SYSRET   = 0x31,
  OP_MCC_N    = 0x32,
  OP_MCC_R    = 0x33,
  OP_VCC      = 0x34,

  OP_MOV_R_N  = 0x35,
  OP_MOV_R_R  = 0x36,
  OP_RET      = 0x37,

  OP_COPY_R_R_R = 0x38,
  OP_COPY_R_R_N = 0x39,
  OP_COPY_R_N_R = 0x3A,
  OP_COPY_R_N_N = 0x3B,
  OP_COPY_N_R_R = 0x3C,
  OP_COPY_N_R_N = 0x3D,
  OP_COPY_N_N_R = 0x3E,
  OP_COPY_N_N_N = 0x3F,

  OP_FILL_R_R_R = 0x40,
  OP_FILL_R_R_N = 0x41,
  OP_FILL_R_N_R = 0x42,
  OP_FILL_R_N_N = 0x43,
  OP_FILL_N_R_R = 0x44,
  OP_FILL_N_R_N = 0x45,
  OP_FILL_N_N_R = 0x46,
  OP_FILL_N_N_N = 0x47,

  OP_ADDX4_R_R  = 0x48,
  OP_ADDX4_R_N  = 0x49,
  OP_ADDX4_N_R  = 0x4A,
  OP_ADDX4_N_N  = 0x4B,
  OP_SUBX4_R_R  = 0x4C,
  OP_SUBX4_R_N  = 0x4D,
  OP_SUBX4_N_R  = 0x4E,
  OP_SUBX4_N_N  = 0x4F,

  OP_MAX_R_R    = 0x50,
  OP_MAX_R_N    = 0x51,
  OP_MAX_N_R    = 0x52,
  OP_MAX_N_N    = 0x53,
  OP_MIN_R_R    = 0x54,
  OP_MIN_R_N    = 0x55,
  OP_MIN_N_R    = 0x56,
  OP_MIN_N_N    = 0x57,

  OP_REC_R      = 0x58,
  OP_REC_N      = 0x59,

  OP_LDB_R_R    = 0x60,
  OP_LDB_R_N    = 0x61,
  OP_LDH_R_R    = 0x62,
  OP_LDH_R_N    = 0x63,
  OP_LDW_R_R    = 0x64,
  OP_LDW_R_N    = 0x65,

  OP_STB_R_R    = 0x66,
  OP_STB_R_N    = 0x67,
  OP_STB_N_R    = 0x68,
  OP_STB_N_N    = 0x69,
  OP_STH_R_R    = 0x6A,
  OP_STH_R_N    = 0x6B,
  OP_STH_N_R    = 0x6C,
  OP_STH_N_N    = 0x6D,
  OP_STW_R_R    = 0x6E,
  OP_STW_R_N    = 0x6F,
  OP_STW_N_R    = 0x70,
  OP_STW_N_N    = 0x71,

  OP_SHL_R_N    = 0x72,
  OP_SHL_R_R    = 0x73,
  OP_SHR_R_N    = 0x74,
  OP_SHR_R_R    = 0x75,

  OP_FICO_R_R_R = 0x76,
  OP_FICO_R_R_N = 0x77,
  OP_FICO_R_N_R = 0x78,
  OP_FICO_R_N_N = 0x79,
  OP_FICO_N_R_R = 0x7A,
  OP_FICO_N_R_N = 0x7B,
  OP_FICO_N_N_R = 0x7C,
  OP_FICO_N_N_N = 0x7D
};

#define CMP_EQ_BIT (1u << 1)
#define CMP_GT_BIT (1u << 2)

#define REG_COUNT 256u
#define VALUE_STACK_SIZE 2048u
#define CALL_STACK_SIZE 1024u
#define VM_MEM_SIZE (16u * 1024u * 1024u)

typedef struct {
  uint32_t regs[REG_COUNT];
  uint32_t value_stack[VALUE_STACK_SIZE];
  uint32_t call_stack[CALL_STACK_SIZE];
  uint8_t mem[VM_MEM_SIZE];

  uint32_t sp;
  uint32_t csp;

  uint32_t v_cmp;
  uint32_t v_flag;
  uint32_t v_mes;
  uint32_t v_ret;

  uint32_t clock;
  uint32_t max_clock_break;
} FPVM;

typedef struct {
  uintptr_t *cells;
  size_t len;
  size_t cap;
  uint32_t *byte_to_cell;
  size_t code_len;
} CellProgram;

static void die(const char *msg) {
  fprintf(stderr, "%s\n", msg);
  exit(1);
}

static void cp_push(CellProgram *cp, uintptr_t v) {
  if (cp->len == cp->cap) {
    size_t next_cap = cp->cap ? cp->cap * 2u : 256u;
    uintptr_t *grown = (uintptr_t *)realloc(cp->cells, next_cap * sizeof(uintptr_t));
    if (!grown) die("out of memory");
    cp->cells = grown;
    cp->cap = next_cap;
  }
  cp->cells[cp->len++] = v;
}

static uint8_t rd_u8(const uint8_t *code, size_t *pc, size_t n) {
  if (*pc >= n) die("bytecode truncated (u8)");
  return code[(*pc)++];
}

static uint32_t rd_u32(const uint8_t *code, size_t *pc, size_t n) {
  if (*pc + 4 > n) die("bytecode truncated (u32)");
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
    case OP_SYSRET:
    case OP_RET:
      return 1;

    case OP_PUSH_R:
    case OP_POP_R:
    case OP_JMP_R:
    case OP_CALL_R:
    case OP_JEQ_R:
    case OP_JNE_R:
    case OP_JGT_R:
    case OP_JLT_R:
    case OP_CEQ_R:
    case OP_CNE_R:
    case OP_CGT_R:
    case OP_CLT_R:
    case OP_MCC_R:
    case OP_VCC:
    case OP_NOT:
    case OP_REC_R:
    case OP_CLC:
      return 2;

    case OP_PUSH_N:
    case OP_JMP_N:
    case OP_CALL_N:
    case OP_JEQ_N:
    case OP_JNE_N:
    case OP_JGT_N:
    case OP_JLT_N:
    case OP_CEQ_N:
    case OP_CNE_N:
    case OP_CGT_N:
    case OP_CLT_N:
    case OP_SYSCALL:
    case OP_MCC_N:
    case OP_REC_N:
      return 5;

    case OP_MOV_R_R:
    case OP_ADD_R_R:
    case OP_SUB_R_R:
    case OP_MUL_R_R:
    case OP_DIV_R_R:
    case OP_MOD_R_R:
    case OP_CMP_R_R:
    case OP_AND_R_R:
    case OP_EOR_R_R:
    case OP_XOR_R_R:
    case OP_SHL_R_R:
    case OP_SHR_R_R:
    case OP_ADDX4_R_R:
    case OP_SUBX4_R_R:
    case OP_MAX_R_R:
    case OP_MIN_R_R:
    case OP_LDB_R_R:
    case OP_LDH_R_R:
    case OP_LDW_R_R:
    case OP_STB_R_R:
    case OP_STH_R_R:
    case OP_STW_R_R:
      return 3;

    case OP_MOV_R_N:
    case OP_ADD_R_N:
    case OP_SUB_R_N:
    case OP_MUL_R_N:
    case OP_DIV_R_N:
    case OP_MOD_R_N:
    case OP_CMP_R_N:
    case OP_CMP_N_R:
    case OP_AND_R_N:
    case OP_EOR_R_N:
    case OP_XOR_R_N:
    case OP_SHL_R_N:
    case OP_SHR_R_N:
    case OP_ADDX4_R_N:
    case OP_SUBX4_R_N:
    case OP_ADDX4_N_R:
    case OP_SUBX4_N_R:
    case OP_MAX_R_N:
    case OP_MIN_R_N:
    case OP_MAX_N_R:
    case OP_MIN_N_R:
    case OP_LDB_R_N:
    case OP_LDH_R_N:
    case OP_LDW_R_N:
    case OP_STB_R_N:
    case OP_STB_N_R:
    case OP_STH_R_N:
    case OP_STH_N_R:
    case OP_STW_R_N:
    case OP_STW_N_R:
      return 6;

    case OP_CMP_N_N:
    case OP_ADDX4_N_N:
    case OP_SUBX4_N_N:
    case OP_MAX_N_N:
    case OP_MIN_N_N:
    case OP_STB_N_N:
    case OP_STH_N_N:
    case OP_STW_N_N:
      return 9;

    case OP_COPY_R_R_R:
    case OP_FILL_R_R_R:
    case OP_FICO_R_R_R:
      return 4;

    case OP_COPY_R_R_N:
    case OP_COPY_R_N_R:
    case OP_COPY_N_R_R:
    case OP_FILL_R_R_N:
    case OP_FILL_R_N_R:
    case OP_FILL_N_R_R:
    case OP_FICO_R_R_N:
    case OP_FICO_R_N_R:
    case OP_FICO_N_R_R:
      return 7;

    case OP_COPY_R_N_N:
    case OP_COPY_N_R_N:
    case OP_COPY_N_N_R:
    case OP_FILL_R_N_N:
    case OP_FILL_N_R_N:
    case OP_FILL_N_N_R:
    case OP_FICO_R_N_N:
    case OP_FICO_N_R_N:
    case OP_FICO_N_N_R:
      return 10;

    case OP_COPY_N_N_N:
    case OP_FILL_N_N_N:
    case OP_FICO_N_N_N:
      return 13;

    default:
      return 0;
  }
}

static size_t operand_cells_count(uint8_t op) {
  switch (op) {
    case OP_HLT:
    case OP_POP:
    case OP_DUP:
    case OP_SYSRET:
    case OP_RET:
      return 0;

    case OP_PUSH_R:
    case OP_POP_R:
    case OP_JMP_R:
    case OP_CALL_R:
    case OP_JEQ_R:
    case OP_JNE_R:
    case OP_JGT_R:
    case OP_JLT_R:
    case OP_CEQ_R:
    case OP_CNE_R:
    case OP_CGT_R:
    case OP_CLT_R:
    case OP_MCC_R:
    case OP_VCC:
    case OP_NOT:
    case OP_REC_R:
    case OP_CLC:
    case OP_PUSH_N:
    case OP_JMP_N:
    case OP_CALL_N:
    case OP_JEQ_N:
    case OP_JNE_N:
    case OP_JGT_N:
    case OP_JLT_N:
    case OP_CEQ_N:
    case OP_CNE_N:
    case OP_CGT_N:
    case OP_CLT_N:
    case OP_SYSCALL:
    case OP_MCC_N:
    case OP_REC_N:
      return 1;

    case OP_MOV_R_R:
    case OP_ADD_R_R:
    case OP_SUB_R_R:
    case OP_MUL_R_R:
    case OP_DIV_R_R:
    case OP_MOD_R_R:
    case OP_CMP_R_R:
    case OP_AND_R_R:
    case OP_EOR_R_R:
    case OP_XOR_R_R:
    case OP_SHL_R_R:
    case OP_SHR_R_R:
    case OP_ADDX4_R_R:
    case OP_SUBX4_R_R:
    case OP_MAX_R_R:
    case OP_MIN_R_R:
    case OP_LDB_R_R:
    case OP_LDH_R_R:
    case OP_LDW_R_R:
    case OP_STB_R_R:
    case OP_STH_R_R:
    case OP_STW_R_R:
    case OP_MOV_R_N:
    case OP_ADD_R_N:
    case OP_SUB_R_N:
    case OP_MUL_R_N:
    case OP_DIV_R_N:
    case OP_MOD_R_N:
    case OP_CMP_R_N:
    case OP_CMP_N_R:
    case OP_AND_R_N:
    case OP_EOR_R_N:
    case OP_XOR_R_N:
    case OP_SHL_R_N:
    case OP_SHR_R_N:
    case OP_ADDX4_R_N:
    case OP_SUBX4_R_N:
    case OP_ADDX4_N_R:
    case OP_SUBX4_N_R:
    case OP_MAX_R_N:
    case OP_MIN_R_N:
    case OP_MAX_N_R:
    case OP_MIN_N_R:
    case OP_LDB_R_N:
    case OP_LDH_R_N:
    case OP_LDW_R_N:
    case OP_STB_R_N:
    case OP_STB_N_R:
    case OP_STH_R_N:
    case OP_STH_N_R:
    case OP_STW_R_N:
    case OP_STW_N_R:
    case OP_CMP_N_N:
    case OP_ADDX4_N_N:
    case OP_SUBX4_N_N:
    case OP_MAX_N_N:
    case OP_MIN_N_N:
    case OP_STB_N_N:
    case OP_STH_N_N:
    case OP_STW_N_N:
      return 2;

    case OP_COPY_R_R_R:
    case OP_FILL_R_R_R:
    case OP_FICO_R_R_R:
    case OP_COPY_R_R_N:
    case OP_COPY_R_N_R:
    case OP_COPY_N_R_R:
    case OP_FILL_R_R_N:
    case OP_FILL_R_N_R:
    case OP_FILL_N_R_R:
    case OP_FICO_R_R_N:
    case OP_FICO_R_N_R:
    case OP_FICO_N_R_R:
    case OP_COPY_R_N_N:
    case OP_COPY_N_R_N:
    case OP_COPY_N_N_R:
    case OP_FILL_R_N_N:
    case OP_FILL_N_R_N:
    case OP_FILL_N_N_R:
    case OP_FICO_R_N_N:
    case OP_FICO_N_R_N:
    case OP_FICO_N_N_R:
    case OP_COPY_N_N_N:
    case OP_FILL_N_N_N:
    case OP_FICO_N_N_N:
      return 3;

    default:
      return 0;
  }
}

static CellProgram compile_to_direct_threaded(const uint8_t *code, size_t n, void **dispatch_table) {
  CellProgram cp = {0};
  cp.code_len = n;

  cp.byte_to_cell = (uint32_t *)malloc((n + 1u) * sizeof(uint32_t));
  if (!cp.byte_to_cell) die("out of memory");
  for (size_t i = 0; i <= n; i++) cp.byte_to_cell[i] = UINT32_MAX;

  size_t pc = 0;
  uint32_t cell_cursor = 0;
  while (pc < n) {
    uint8_t op = code[pc];
    size_t sz = insn_size(op);
    if (sz == 0 || pc + sz > n) {
      fprintf(stderr, "unsupported/truncated opcode 0x%02X at byte pc=%zu\n", op, pc);
      free(cp.byte_to_cell);
      exit(1);
    }
    cp.byte_to_cell[pc] = cell_cursor;
    cell_cursor += 1u + (uint32_t)operand_cells_count(op);
    pc += sz;
  }
  cp.byte_to_cell[n] = cell_cursor;

  pc = 0;
  while (pc < n) {
    uint8_t op = rd_u8(code, &pc, n);
    void *label = dispatch_table[op];
    if (!label) {
      fprintf(stderr, "opcode 0x%02X has no handler\n", op);
      free(cp.byte_to_cell);
      free(cp.cells);
      exit(1);
    }

    cp_push(&cp, (uintptr_t)label);

    switch (op) {
      case OP_HLT:
      case OP_POP:
      case OP_DUP:
      case OP_SYSRET:
      case OP_RET:
        break;

      case OP_PUSH_R:
      case OP_POP_R:
      case OP_JMP_R:
      case OP_CALL_R:
      case OP_JEQ_R:
      case OP_JNE_R:
      case OP_JGT_R:
      case OP_JLT_R:
      case OP_CEQ_R:
      case OP_CNE_R:
      case OP_CGT_R:
      case OP_CLT_R:
      case OP_MCC_R:
      case OP_VCC:
      case OP_NOT:
      case OP_REC_R:
      case OP_CLC:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_PUSH_N:
      case OP_SYSCALL:
      case OP_MCC_N:
      case OP_REC_N:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_JMP_N:
      case OP_CALL_N:
      case OP_JEQ_N:
      case OP_JNE_N:
      case OP_JGT_N:
      case OP_JLT_N:
      case OP_CEQ_N:
      case OP_CNE_N:
      case OP_CGT_N:
      case OP_CLT_N: {
        uint32_t byte_target = rd_u32(code, &pc, n);
        if (byte_target > n || cp.byte_to_cell[byte_target] == UINT32_MAX) {
          fprintf(stderr, "invalid bytecode jump/call target: %u\n", byte_target);
          free(cp.byte_to_cell);
          free(cp.cells);
          exit(1);
        }
        cp_push(&cp, (uintptr_t)cp.byte_to_cell[byte_target]);
        break;
      }

      case OP_MOV_R_R:
      case OP_ADD_R_R:
      case OP_SUB_R_R:
      case OP_MUL_R_R:
      case OP_DIV_R_R:
      case OP_MOD_R_R:
      case OP_CMP_R_R:
      case OP_AND_R_R:
      case OP_EOR_R_R:
      case OP_XOR_R_R:
      case OP_SHL_R_R:
      case OP_SHR_R_R:
      case OP_ADDX4_R_R:
      case OP_SUBX4_R_R:
      case OP_MAX_R_R:
      case OP_MIN_R_R:
      case OP_LDB_R_R:
      case OP_LDH_R_R:
      case OP_LDW_R_R:
      case OP_STB_R_R:
      case OP_STH_R_R:
      case OP_STW_R_R:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_MOV_R_N:
      case OP_ADD_R_N:
      case OP_SUB_R_N:
      case OP_MUL_R_N:
      case OP_DIV_R_N:
      case OP_MOD_R_N:
      case OP_CMP_R_N:
      case OP_CMP_N_R:
      case OP_AND_R_N:
      case OP_EOR_R_N:
      case OP_XOR_R_N:
      case OP_SHL_R_N:
      case OP_SHR_R_N:
      case OP_ADDX4_R_N:
      case OP_SUBX4_R_N:
      case OP_ADDX4_N_R:
      case OP_SUBX4_N_R:
      case OP_MAX_R_N:
      case OP_MIN_R_N:
      case OP_MAX_N_R:
      case OP_MIN_N_R:
      case OP_LDB_R_N:
      case OP_LDH_R_N:
      case OP_LDW_R_N:
      case OP_STB_R_N:
      case OP_STB_N_R:
      case OP_STH_R_N:
      case OP_STH_N_R:
      case OP_STW_R_N:
      case OP_STW_N_R:
        if (op == OP_CMP_N_R || op == OP_ADDX4_N_R || op == OP_SUBX4_N_R ||
            op == OP_MAX_N_R || op == OP_MIN_N_R ||
            op == OP_STB_N_R || op == OP_STH_N_R || op == OP_STW_N_R) {
          cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
          cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        } else {
          cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
          cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        }
        break;

      case OP_CMP_N_N:
      case OP_ADDX4_N_N:
      case OP_SUBX4_N_N:
      case OP_MAX_N_N:
      case OP_MIN_N_N:
      case OP_STB_N_N:
      case OP_STH_N_N:
      case OP_STW_N_N:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_COPY_R_R_R:
      case OP_FILL_R_R_R:
      case OP_FICO_R_R_R:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_COPY_R_R_N:
      case OP_FILL_R_R_N:
      case OP_FICO_R_R_N:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_COPY_R_N_R:
      case OP_FILL_R_N_R:
      case OP_FICO_R_N_R:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_COPY_R_N_N:
      case OP_FILL_R_N_N:
      case OP_FICO_R_N_N:
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_COPY_N_R_R:
      case OP_FILL_N_R_R:
      case OP_FICO_N_R_R:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_COPY_N_R_N:
      case OP_FILL_N_R_N:
      case OP_FICO_N_R_N:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      case OP_COPY_N_N_R:
      case OP_FILL_N_N_R:
      case OP_FICO_N_N_R:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u8(code, &pc, n));
        break;

      case OP_COPY_N_N_N:
      case OP_FILL_N_N_N:
      case OP_FICO_N_N_N:
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        cp_push(&cp, (uintptr_t)rd_u32(code, &pc, n));
        break;

      default:
        fprintf(stderr, "unsupported opcode in pass2: 0x%02X\n", op);
        free(cp.byte_to_cell);
        free(cp.cells);
        exit(1);
    }
  }

  cp_push(&cp, (uintptr_t)dispatch_table[OP_HLT]);
  return cp;
}

static inline bool mem_ok(uint32_t addr, uint32_t len) {
  return addr <= VM_MEM_SIZE && len <= VM_MEM_SIZE - addr;
}

static inline uint32_t mem_load32(const FPVM *vm, uint32_t addr) {
  return (uint32_t)vm->mem[addr] |
         ((uint32_t)vm->mem[addr + 1] << 8) |
         ((uint32_t)vm->mem[addr + 2] << 16) |
         ((uint32_t)vm->mem[addr + 3] << 24);
}

static inline uint16_t mem_load16(const FPVM *vm, uint32_t addr) {
  return (uint16_t)((uint16_t)vm->mem[addr] | ((uint16_t)vm->mem[addr + 1] << 8));
}

static inline void mem_store32(FPVM *vm, uint32_t addr, uint32_t v) {
  vm->mem[addr] = (uint8_t)(v & 0xFF);
  vm->mem[addr + 1] = (uint8_t)((v >> 8) & 0xFF);
  vm->mem[addr + 2] = (uint8_t)((v >> 16) & 0xFF);
  vm->mem[addr + 3] = (uint8_t)((v >> 24) & 0xFF);
}

static inline void mem_store16(FPVM *vm, uint32_t addr, uint16_t v) {
  vm->mem[addr] = (uint8_t)(v & 0xFF);
  vm->mem[addr + 1] = (uint8_t)((v >> 8) & 0xFF);
}

static inline bool cond_eq(uint32_t v_cmp) { return (v_cmp & CMP_EQ_BIT) != 0; }
static inline bool cond_ne(uint32_t v_cmp) { return (v_cmp & CMP_EQ_BIT) == 0; }
static inline bool cond_gt(uint32_t v_cmp) { return (v_cmp & CMP_GT_BIT) != 0; }
static inline bool cond_lt(uint32_t v_cmp) { return (v_cmp & (CMP_EQ_BIT | CMP_GT_BIT)) == 0; }

static inline bool jump_to_cell(uintptr_t **ip, const CellProgram *cp, uint32_t cell) {
  if (cell >= cp->len) return false;
  *ip = cp->cells + cell;
  return true;
}

static inline bool jump_byte_to_cell(uintptr_t **ip, const CellProgram *cp, uint32_t byte_pc) {
  if (byte_pc > cp->code_len) return false;
  uint32_t cell = cp->byte_to_cell[byte_pc];
  if (cell == UINT32_MAX || cell >= cp->len) return false;
  *ip = cp->cells + cell;
  return true;
}

static inline bool call_cell(FPVM *vm, uintptr_t **ip, const CellProgram *cp, uint32_t target_cell) {
  if (vm->csp >= CALL_STACK_SIZE) return false;
  vm->call_stack[vm->csp++] = (uint32_t)(*ip - cp->cells);
  return jump_to_cell(ip, cp, target_cell);
}

static inline bool call_byte(FPVM *vm, uintptr_t **ip, const CellProgram *cp, uint32_t target_byte_pc) {
  if (vm->csp >= CALL_STACK_SIZE) return false;
  vm->call_stack[vm->csp++] = (uint32_t)(*ip - cp->cells);
  return jump_byte_to_cell(ip, cp, target_byte_pc);
}

static inline bool ret_from_call(FPVM *vm, uintptr_t **ip, const CellProgram *cp) {
  if (vm->csp == 0) return false;
  uint32_t ret_cell = vm->call_stack[--vm->csp];
  return jump_to_cell(ip, cp, ret_cell);
}

static inline void set_cmp(FPVM *vm, uint32_t a, uint32_t b) {
  vm->v_cmp = (a == b ? CMP_EQ_BIT : 0u) | (a > b ? CMP_GT_BIT : 0u);
}

static inline bool copy_bytes(FPVM *vm, uint32_t dst, uint32_t src, uint32_t len) {
  if (len == 0) return true;
  if (!mem_ok(dst, len) || !mem_ok(src, len)) return false;
  memmove(vm->mem + dst, vm->mem + src, len);
  return true;
}

static inline bool fill_words(FPVM *vm, uint32_t addr, uint32_t value, uint32_t len) {
  if (len == 0) return true;
  if (!mem_ok(addr, len)) return false;
  for (uint32_t i = 0; i < len; i += 4) {
    if (addr + i + 4 > VM_MEM_SIZE) return false;
    mem_store32(vm, addr + i, value);
  }
  return true;
}

static inline bool simd4_bin(FPVM *vm, uint32_t a_addr, uint32_t b_addr, bool add_mode) {
  if (!mem_ok(a_addr, 16) || !mem_ok(b_addr, 16)) return false;
  for (uint32_t i = 0; i < 4; i++) {
    uint32_t off = i * 4;
    uint32_t va = mem_load32(vm, a_addr + off);
    uint32_t vb = mem_load32(vm, b_addr + off);
    uint32_t r = add_mode ? (va + vb) : (va - vb);
    mem_store32(vm, a_addr + off, r);
  }
  return true;
}

static bool vm_exec(FPVM *vm, const uint8_t *code, size_t n) {
  void *dispatch[256] = {0};

#define MAP(op, label) dispatch[(op)] = &&label
  MAP(OP_HLT, L_HLT);
  MAP(OP_PUSH_N, L_PUSH_N);   MAP(OP_PUSH_R, L_PUSH_R);   MAP(OP_POP, L_POP);         MAP(OP_POP_R, L_POP_R);
  MAP(OP_DUP, L_DUP);
  MAP(OP_ADD_R_N, L_ADD_R_N); MAP(OP_ADD_R_R, L_ADD_R_R); MAP(OP_SUB_R_N, L_SUB_R_N); MAP(OP_SUB_R_R, L_SUB_R_R);
  MAP(OP_MUL_R_N, L_MUL_R_N); MAP(OP_MUL_R_R, L_MUL_R_R); MAP(OP_DIV_R_N, L_DIV_R_N); MAP(OP_DIV_R_R, L_DIV_R_R);
  MAP(OP_MOD_R_N, L_MOD_R_N); MAP(OP_MOD_R_R, L_MOD_R_R);

  MAP(OP_CMP_N_N, L_CMP_N_N); MAP(OP_CMP_R_N, L_CMP_R_N); MAP(OP_CMP_R_R, L_CMP_R_R); MAP(OP_CMP_N_R, L_CMP_N_R);

  MAP(OP_JMP_N, L_JMP_N); MAP(OP_JMP_R, L_JMP_R); MAP(OP_CALL_N, L_CALL_N); MAP(OP_CALL_R, L_CALL_R);
  MAP(OP_JEQ_N, L_JEQ_N); MAP(OP_JEQ_R, L_JEQ_R); MAP(OP_JNE_N, L_JNE_N);  MAP(OP_JNE_R, L_JNE_R);
  MAP(OP_JGT_N, L_JGT_N); MAP(OP_JGT_R, L_JGT_R); MAP(OP_JLT_N, L_JLT_N);  MAP(OP_JLT_R, L_JLT_R);

  MAP(OP_CEQ_N, L_CEQ_N); MAP(OP_CEQ_R, L_CEQ_R); MAP(OP_CNE_N, L_CNE_N); MAP(OP_CNE_R, L_CNE_R);
  MAP(OP_CGT_N, L_CGT_N); MAP(OP_CGT_R, L_CGT_R); MAP(OP_CLT_N, L_CLT_N); MAP(OP_CLT_R, L_CLT_R);

  MAP(OP_CLC, L_CLC); MAP(OP_AND_R_N, L_AND_R_N); MAP(OP_AND_R_R, L_AND_R_R); MAP(OP_EOR_R_N, L_EOR_R_N);
  MAP(OP_EOR_R_R, L_EOR_R_R); MAP(OP_XOR_R_N, L_XOR_R_N); MAP(OP_XOR_R_R, L_XOR_R_R); MAP(OP_NOT, L_NOT);

  MAP(OP_SYSCALL, L_SYSCALL); MAP(OP_SYSRET, L_SYSRET); MAP(OP_MCC_N, L_MCC_N); MAP(OP_MCC_R, L_MCC_R);
  MAP(OP_VCC, L_VCC); MAP(OP_MOV_R_N, L_MOV_R_N); MAP(OP_MOV_R_R, L_MOV_R_R); MAP(OP_RET, L_RET);

  MAP(OP_COPY_R_R_R, L_COPY_R_R_R); MAP(OP_COPY_R_R_N, L_COPY_R_R_N); MAP(OP_COPY_R_N_R, L_COPY_R_N_R); MAP(OP_COPY_R_N_N, L_COPY_R_N_N);
  MAP(OP_COPY_N_R_R, L_COPY_N_R_R); MAP(OP_COPY_N_R_N, L_COPY_N_R_N); MAP(OP_COPY_N_N_R, L_COPY_N_N_R); MAP(OP_COPY_N_N_N, L_COPY_N_N_N);

  MAP(OP_FILL_R_R_R, L_FILL_R_R_R); MAP(OP_FILL_R_R_N, L_FILL_R_R_N); MAP(OP_FILL_R_N_R, L_FILL_R_N_R); MAP(OP_FILL_R_N_N, L_FILL_R_N_N);
  MAP(OP_FILL_N_R_R, L_FILL_N_R_R); MAP(OP_FILL_N_R_N, L_FILL_N_R_N); MAP(OP_FILL_N_N_R, L_FILL_N_N_R); MAP(OP_FILL_N_N_N, L_FILL_N_N_N);

  MAP(OP_ADDX4_R_R, L_ADDX4_R_R); MAP(OP_ADDX4_R_N, L_ADDX4_R_N); MAP(OP_ADDX4_N_R, L_ADDX4_N_R); MAP(OP_ADDX4_N_N, L_ADDX4_N_N);
  MAP(OP_SUBX4_R_R, L_SUBX4_R_R); MAP(OP_SUBX4_R_N, L_SUBX4_R_N); MAP(OP_SUBX4_N_R, L_SUBX4_N_R); MAP(OP_SUBX4_N_N, L_SUBX4_N_N);

  MAP(OP_MAX_R_R, L_MAX_R_R); MAP(OP_MAX_R_N, L_MAX_R_N); MAP(OP_MAX_N_R, L_MAX_N_R); MAP(OP_MAX_N_N, L_MAX_N_N);
  MAP(OP_MIN_R_R, L_MIN_R_R); MAP(OP_MIN_R_N, L_MIN_R_N); MAP(OP_MIN_N_R, L_MIN_N_R); MAP(OP_MIN_N_N, L_MIN_N_N);

  MAP(OP_REC_R, L_REC_R); MAP(OP_REC_N, L_REC_N);

  MAP(OP_LDB_R_R, L_LDB_R_R); MAP(OP_LDB_R_N, L_LDB_R_N); MAP(OP_LDH_R_R, L_LDH_R_R); MAP(OP_LDH_R_N, L_LDH_R_N);
  MAP(OP_LDW_R_R, L_LDW_R_R); MAP(OP_LDW_R_N, L_LDW_R_N);

  MAP(OP_STB_R_R, L_STB_R_R); MAP(OP_STB_R_N, L_STB_R_N); MAP(OP_STB_N_R, L_STB_N_R); MAP(OP_STB_N_N, L_STB_N_N);
  MAP(OP_STH_R_R, L_STH_R_R); MAP(OP_STH_R_N, L_STH_R_N); MAP(OP_STH_N_R, L_STH_N_R); MAP(OP_STH_N_N, L_STH_N_N);
  MAP(OP_STW_R_R, L_STW_R_R); MAP(OP_STW_R_N, L_STW_R_N); MAP(OP_STW_N_R, L_STW_N_R); MAP(OP_STW_N_N, L_STW_N_N);

  MAP(OP_SHL_R_N, L_SHL_R_N); MAP(OP_SHL_R_R, L_SHL_R_R); MAP(OP_SHR_R_N, L_SHR_R_N); MAP(OP_SHR_R_R, L_SHR_R_R);

  MAP(OP_FICO_R_R_R, L_FICO_R_R_R); MAP(OP_FICO_R_R_N, L_FICO_R_R_N); MAP(OP_FICO_R_N_R, L_FICO_R_N_R); MAP(OP_FICO_R_N_N, L_FICO_R_N_N);
  MAP(OP_FICO_N_R_R, L_FICO_N_R_R); MAP(OP_FICO_N_R_N, L_FICO_N_R_N); MAP(OP_FICO_N_N_R, L_FICO_N_N_R); MAP(OP_FICO_N_N_N, L_FICO_N_N_N);
#undef MAP

  CellProgram cp = compile_to_direct_threaded(code, n, dispatch);

  uintptr_t *ip = cp.cells;
  bool ok = true;

#define TICK() (vm->clock++)
#define FAIL(msg) do { fprintf(stderr, "%s\n", (msg)); ok = false; goto L_DONE; } while (0)
#define DISPATCH() goto *(void *)*ip++

  DISPATCH();

L_HLT:
  goto L_DONE;

L_PUSH_N:
  TICK();
  if (vm->sp >= VALUE_STACK_SIZE) FAIL("stack overflow");
  vm->value_stack[vm->sp++] = (uint32_t)(*ip++);
  DISPATCH();

L_PUSH_R:
  TICK();
  if (vm->sp >= VALUE_STACK_SIZE) FAIL("stack overflow");
  vm->value_stack[vm->sp++] = vm->regs[(uint8_t)(*ip++)];
  DISPATCH();

L_POP:
  TICK();
  if (vm->sp == 0) FAIL("stack underflow");
  vm->sp--;
  DISPATCH();

L_POP_R:
  TICK();
  if (vm->sp == 0) FAIL("stack underflow");
  vm->regs[(uint8_t)(*ip++)] = vm->value_stack[--vm->sp];
  DISPATCH();

L_DUP:
  TICK();
  if (vm->sp == 0 || vm->sp >= VALUE_STACK_SIZE) FAIL("stack error");
  vm->value_stack[vm->sp] = vm->value_stack[vm->sp - 1];
  vm->sp++;
  DISPATCH();

L_MOV_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r]=(uint32_t)(*ip++); DISPATCH(); }
L_MOV_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a]=vm->regs[b]; DISPATCH(); }

L_ADD_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r]+= (uint32_t)(*ip++); DISPATCH(); }
L_ADD_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a]+=vm->regs[b]; DISPATCH(); }
L_SUB_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r]-= (uint32_t)(*ip++); DISPATCH(); }
L_SUB_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a]-=vm->regs[b]; DISPATCH(); }
L_MUL_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r]*= (uint32_t)(*ip++); DISPATCH(); }
L_MUL_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a]*=vm->regs[b]; DISPATCH(); }

L_DIV_R_N: {
  TICK(); uint8_t r=(uint8_t)(*ip++); uint32_t d=(uint32_t)(*ip++);
  if (d==0) FAIL("division by zero");
  vm->regs[r]/=d; DISPATCH();
}
L_DIV_R_R: {
  TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); uint32_t d=vm->regs[b];
  if (d==0) FAIL("division by zero");
  vm->regs[a]/=d; DISPATCH();
}
L_MOD_R_N: {
  TICK(); uint8_t r=(uint8_t)(*ip++); uint32_t d=(uint32_t)(*ip++);
  if (d==0) FAIL("mod by zero");
  vm->regs[r]%=d; DISPATCH();
}
L_MOD_R_R: {
  TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); uint32_t d=vm->regs[b];
  if (d==0) FAIL("mod by zero");
  vm->regs[a]%=d; DISPATCH();
}

L_CMP_N_N: { TICK(); uint32_t a=(uint32_t)(*ip++), b=(uint32_t)(*ip++); set_cmp(vm,a,b); DISPATCH(); }
L_CMP_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); uint32_t b=(uint32_t)(*ip++); set_cmp(vm,vm->regs[r],b); DISPATCH(); }
L_CMP_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); set_cmp(vm,vm->regs[a],vm->regs[b]); DISPATCH(); }
L_CMP_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++); uint8_t b=(uint8_t)(*ip++); set_cmp(vm,a,vm->regs[b]); DISPATCH(); }

L_JMP_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(!jump_to_cell(&ip,&cp,c)) FAIL("bad jump target"); DISPATCH(); }
L_JMP_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(!jump_byte_to_cell(&ip,&cp,vm->regs[r])) FAIL("bad jump byte target"); DISPATCH(); }
L_CALL_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(!call_cell(vm,&ip,&cp,c)) FAIL("call failure"); DISPATCH(); }
L_CALL_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(!call_byte(vm,&ip,&cp,vm->regs[r])) FAIL("call failure"); DISPATCH(); }
L_RET:    { TICK(); if(!ret_from_call(vm,&ip,&cp)) FAIL("call stack underflow"); DISPATCH(); }

L_JEQ_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_eq(vm->v_cmp)&&!jump_to_cell(&ip,&cp,c)) FAIL("bad JEQ target"); DISPATCH(); }
L_JNE_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_ne(vm->v_cmp)&&!jump_to_cell(&ip,&cp,c)) FAIL("bad JNE target"); DISPATCH(); }
L_JGT_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_gt(vm->v_cmp)&&!jump_to_cell(&ip,&cp,c)) FAIL("bad JGT target"); DISPATCH(); }
L_JLT_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_lt(vm->v_cmp)&&!jump_to_cell(&ip,&cp,c)) FAIL("bad JLT target"); DISPATCH(); }

L_JEQ_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_eq(vm->v_cmp)&&!jump_byte_to_cell(&ip,&cp,vm->regs[r])) FAIL("bad JEQ reg target"); DISPATCH(); }
L_JNE_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_ne(vm->v_cmp)&&!jump_byte_to_cell(&ip,&cp,vm->regs[r])) FAIL("bad JNE reg target"); DISPATCH(); }
L_JGT_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_gt(vm->v_cmp)&&!jump_byte_to_cell(&ip,&cp,vm->regs[r])) FAIL("bad JGT reg target"); DISPATCH(); }
L_JLT_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_lt(vm->v_cmp)&&!jump_byte_to_cell(&ip,&cp,vm->regs[r])) FAIL("bad JLT reg target"); DISPATCH(); }

L_CEQ_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_eq(vm->v_cmp)&&!call_cell(vm,&ip,&cp,c)) FAIL("bad CEQ call"); DISPATCH(); }
L_CNE_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_ne(vm->v_cmp)&&!call_cell(vm,&ip,&cp,c)) FAIL("bad CNE call"); DISPATCH(); }
L_CGT_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_gt(vm->v_cmp)&&!call_cell(vm,&ip,&cp,c)) FAIL("bad CGT call"); DISPATCH(); }
L_CLT_N: { TICK(); uint32_t c=(uint32_t)(*ip++); if(cond_lt(vm->v_cmp)&&!call_cell(vm,&ip,&cp,c)) FAIL("bad CLT call"); DISPATCH(); }

L_CEQ_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_eq(vm->v_cmp)&&!call_byte(vm,&ip,&cp,vm->regs[r])) FAIL("bad CEQ reg call"); DISPATCH(); }
L_CNE_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_ne(vm->v_cmp)&&!call_byte(vm,&ip,&cp,vm->regs[r])) FAIL("bad CNE reg call"); DISPATCH(); }
L_CGT_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_gt(vm->v_cmp)&&!call_byte(vm,&ip,&cp,vm->regs[r])) FAIL("bad CGT reg call"); DISPATCH(); }
L_CLT_R: { TICK(); uint8_t r=(uint8_t)(*ip++); if(cond_lt(vm->v_cmp)&&!call_byte(vm,&ip,&cp,vm->regs[r])) FAIL("bad CLT reg call"); DISPATCH(); }

L_CLC: {
  TICK();
  uint8_t bit = (uint8_t)(*ip++) & 31u;
  vm->v_flag &= ~(1u << bit);
  DISPATCH();
}

L_AND_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r] &= (uint32_t)(*ip++); DISPATCH(); }
L_AND_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a] &= vm->regs[b]; DISPATCH(); }
L_EOR_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r] |= (uint32_t)(*ip++); DISPATCH(); }
L_EOR_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a] |= vm->regs[b]; DISPATCH(); }
L_XOR_R_N: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r] ^= (uint32_t)(*ip++); DISPATCH(); }
L_XOR_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); vm->regs[a] ^= vm->regs[b]; DISPATCH(); }
L_NOT:     { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r] = ~vm->regs[r]; DISPATCH(); }

L_SYSCALL: { TICK(); vm->v_ret = (uint32_t)(ip - cp.cells); vm->v_mes = (uint32_t)(*ip++); DISPATCH(); }
L_SYSRET:  { TICK(); DISPATCH(); }
L_MCC_N:   { TICK(); vm->max_clock_break = (uint32_t)(*ip++); DISPATCH(); }
L_MCC_R:   { TICK(); vm->max_clock_break = vm->regs[(uint8_t)(*ip++)]; DISPATCH(); }
L_VCC:     { TICK(); uint8_t r=(uint8_t)(*ip++); vm->regs[r] = vm->max_clock_break - vm->clock; DISPATCH(); }

L_COPY_R_R_R: { TICK(); uint32_t d=vm->regs[(uint8_t)(*ip++)], s=vm->regs[(uint8_t)(*ip++)], l=vm->regs[(uint8_t)(*ip++)]; if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_R_R_N: { TICK(); uint32_t d=vm->regs[(uint8_t)(*ip++)], s=vm->regs[(uint8_t)(*ip++)], l=(uint32_t)(*ip++); if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_R_N_R: { TICK(); uint32_t d=vm->regs[(uint8_t)(*ip++)], s=(uint32_t)(*ip++), l=vm->regs[(uint8_t)(*ip++)]; if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_R_N_N: { TICK(); uint32_t d=vm->regs[(uint8_t)(*ip++)], s=(uint32_t)(*ip++), l=(uint32_t)(*ip++); if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_N_R_R: { TICK(); uint32_t d=(uint32_t)(*ip++), s=vm->regs[(uint8_t)(*ip++)], l=vm->regs[(uint8_t)(*ip++)]; if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_N_R_N: { TICK(); uint32_t d=(uint32_t)(*ip++), s=vm->regs[(uint8_t)(*ip++)], l=(uint32_t)(*ip++); if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_N_N_R: { TICK(); uint32_t d=(uint32_t)(*ip++), s=(uint32_t)(*ip++), l=vm->regs[(uint8_t)(*ip++)]; if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }
L_COPY_N_N_N: { TICK(); uint32_t d=(uint32_t)(*ip++), s=(uint32_t)(*ip++), l=(uint32_t)(*ip++); if(!copy_bytes(vm,d,s,l)) FAIL("copy range"); DISPATCH(); }

L_FILL_R_R_R: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], v=vm->regs[(uint8_t)(*ip++)], l=vm->regs[(uint8_t)(*ip++)]; if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_R_R_N: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], v=vm->regs[(uint8_t)(*ip++)], l=(uint32_t)(*ip++); if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_R_N_R: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], v=(uint32_t)(*ip++), l=vm->regs[(uint8_t)(*ip++)]; if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_R_N_N: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], v=(uint32_t)(*ip++), l=(uint32_t)(*ip++); if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_N_R_R: { TICK(); uint32_t a=(uint32_t)(*ip++), v=vm->regs[(uint8_t)(*ip++)], l=vm->regs[(uint8_t)(*ip++)]; if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_N_R_N: { TICK(); uint32_t a=(uint32_t)(*ip++), v=vm->regs[(uint8_t)(*ip++)], l=(uint32_t)(*ip++); if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_N_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++), v=(uint32_t)(*ip++), l=vm->regs[(uint8_t)(*ip++)]; if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }
L_FILL_N_N_N: { TICK(); uint32_t a=(uint32_t)(*ip++), v=(uint32_t)(*ip++), l=(uint32_t)(*ip++); if(!fill_words(vm,a,v,l)) FAIL("fill range"); DISPATCH(); }

L_FICO_R_R_R: goto L_FILL_R_R_R;
L_FICO_R_R_N: goto L_FILL_R_R_N;
L_FICO_R_N_R: goto L_FILL_R_N_R;
L_FICO_R_N_N: goto L_FILL_R_N_N;
L_FICO_N_R_R: goto L_FILL_N_R_R;
L_FICO_N_R_N: goto L_FILL_N_R_N;
L_FICO_N_N_R: goto L_FILL_N_N_R;
L_FICO_N_N_N: goto L_FILL_N_N_N;

L_ADDX4_R_R: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], b=vm->regs[(uint8_t)(*ip++)]; if(!simd4_bin(vm,a,b,true)) FAIL("addx4 range"); DISPATCH(); }
L_ADDX4_R_N: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], b=(uint32_t)(*ip++); if(!simd4_bin(vm,a,b,true)) FAIL("addx4 range"); DISPATCH(); }
L_ADDX4_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++), b=vm->regs[(uint8_t)(*ip++)]; if(!simd4_bin(vm,a,b,true)) FAIL("addx4 range"); DISPATCH(); }
L_ADDX4_N_N: { TICK(); uint32_t a=(uint32_t)(*ip++), b=(uint32_t)(*ip++); if(!simd4_bin(vm,a,b,true)) FAIL("addx4 range"); DISPATCH(); }

L_SUBX4_R_R: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], b=vm->regs[(uint8_t)(*ip++)]; if(!simd4_bin(vm,a,b,false)) FAIL("subx4 range"); DISPATCH(); }
L_SUBX4_R_N: { TICK(); uint32_t a=vm->regs[(uint8_t)(*ip++)], b=(uint32_t)(*ip++); if(!simd4_bin(vm,a,b,false)) FAIL("subx4 range"); DISPATCH(); }
L_SUBX4_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++), b=vm->regs[(uint8_t)(*ip++)]; if(!simd4_bin(vm,a,b,false)) FAIL("subx4 range"); DISPATCH(); }
L_SUBX4_N_N: { TICK(); uint32_t a=(uint32_t)(*ip++), b=(uint32_t)(*ip++); if(!simd4_bin(vm,a,b,false)) FAIL("subx4 range"); DISPATCH(); }

L_MAX_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); if(vm->regs[b]>vm->regs[a]) vm->regs[a]=vm->regs[b]; DISPATCH(); }
L_MAX_R_N: { TICK(); uint8_t a=(uint8_t)(*ip++); uint32_t b=(uint32_t)(*ip++); if(b>vm->regs[a]) vm->regs[a]=b; DISPATCH(); }
L_MAX_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++); uint8_t b=(uint8_t)(*ip++); if(a>vm->regs[b]) vm->regs[b]=a; DISPATCH(); }
L_MAX_N_N: { TICK(); (void)*ip++; (void)*ip++; DISPATCH(); }

L_MIN_R_R: { TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); if(vm->regs[b]<vm->regs[a]) vm->regs[a]=vm->regs[b]; DISPATCH(); }
L_MIN_R_N: { TICK(); uint8_t a=(uint8_t)(*ip++); uint32_t b=(uint32_t)(*ip++); if(b<vm->regs[a]) vm->regs[a]=b; DISPATCH(); }
L_MIN_N_R: { TICK(); uint32_t a=(uint32_t)(*ip++); uint8_t b=(uint8_t)(*ip++); if(a<vm->regs[b]) vm->regs[b]=a; DISPATCH(); }
L_MIN_N_N: { TICK(); (void)*ip++; (void)*ip++; DISPATCH(); }

L_REC_R: { TICK(); uint8_t r=(uint8_t)(*ip++); vm->v_ret=(uint32_t)(ip-cp.cells); vm->v_mes=vm->regs[r]; DISPATCH(); }
L_REC_N: { TICK(); vm->v_ret=(uint32_t)(ip-cp.cells); vm->v_mes=(uint32_t)(*ip++); DISPATCH(); }

L_LDB_R_R: { TICK(); uint8_t d=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,1)) FAIL("ldb range"); vm->regs[d]=vm->mem[addr]; DISPATCH(); }
L_LDB_R_N: { TICK(); uint8_t d=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,1)) FAIL("ldb range"); vm->regs[d]=vm->mem[addr]; DISPATCH(); }
L_LDH_R_R: { TICK(); uint8_t d=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,2)) FAIL("ldh range"); vm->regs[d]=mem_load16(vm,addr); DISPATCH(); }
L_LDH_R_N: { TICK(); uint8_t d=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,2)) FAIL("ldh range"); vm->regs[d]=mem_load16(vm,addr); DISPATCH(); }
L_LDW_R_R: { TICK(); uint8_t d=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,4)) FAIL("ldw range"); vm->regs[d]=mem_load32(vm,addr); DISPATCH(); }
L_LDW_R_N: { TICK(); uint8_t d=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,4)) FAIL("ldw range"); vm->regs[d]=mem_load32(vm,addr); DISPATCH(); }

L_STB_R_R: { TICK(); uint8_t s=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,1)) FAIL("stb range"); vm->mem[addr]=(uint8_t)(vm->regs[s]&0xFF); DISPATCH(); }
L_STB_R_N: { TICK(); uint8_t s=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,1)) FAIL("stb range"); vm->mem[addr]=(uint8_t)(vm->regs[s]&0xFF); DISPATCH(); }
L_STB_N_R: { TICK(); uint32_t v=(uint32_t)(*ip++); uint8_t a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,1)) FAIL("stb range"); vm->mem[addr]=(uint8_t)(v&0xFF); DISPATCH(); }
L_STB_N_N: { TICK(); uint32_t v=(uint32_t)(*ip++), addr=(uint32_t)(*ip++); if(!mem_ok(addr,1)) FAIL("stb range"); vm->mem[addr]=(uint8_t)(v&0xFF); DISPATCH(); }

L_STH_R_R: { TICK(); uint8_t s=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,2)) FAIL("sth range"); mem_store16(vm,addr,(uint16_t)vm->regs[s]); DISPATCH(); }
L_STH_R_N: { TICK(); uint8_t s=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,2)) FAIL("sth range"); mem_store16(vm,addr,(uint16_t)vm->regs[s]); DISPATCH(); }
L_STH_N_R: { TICK(); uint32_t v=(uint32_t)(*ip++); uint8_t a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,2)) FAIL("sth range"); mem_store16(vm,addr,(uint16_t)v); DISPATCH(); }
L_STH_N_N: { TICK(); uint32_t v=(uint32_t)(*ip++), addr=(uint32_t)(*ip++); if(!mem_ok(addr,2)) FAIL("sth range"); mem_store16(vm,addr,(uint16_t)v); DISPATCH(); }

L_STW_R_R: { TICK(); uint8_t s=(uint8_t)(*ip++), a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,4)) FAIL("stw range"); mem_store32(vm,addr,vm->regs[s]); DISPATCH(); }
L_STW_R_N: { TICK(); uint8_t s=(uint8_t)(*ip++); uint32_t addr=(uint32_t)(*ip++); if(!mem_ok(addr,4)) FAIL("stw range"); mem_store32(vm,addr,vm->regs[s]); DISPATCH(); }
L_STW_N_R: { TICK(); uint32_t v=(uint32_t)(*ip++); uint8_t a=(uint8_t)(*ip++); uint32_t addr=vm->regs[a]; if(!mem_ok(addr,4)) FAIL("stw range"); mem_store32(vm,addr,v); DISPATCH(); }
L_STW_N_N: { TICK(); uint32_t v=(uint32_t)(*ip++), addr=(uint32_t)(*ip++); if(!mem_ok(addr,4)) FAIL("stw range"); mem_store32(vm,addr,v); DISPATCH(); }

L_SHL_R_N: {
  TICK(); uint8_t r=(uint8_t)(*ip++); uint32_t nbits=(uint32_t)(*ip++) & 31u;
  uint32_t old=vm->regs[r], now=(old << nbits);
  vm->v_flag = (now < old) ? (vm->v_flag | 1u) : (vm->v_flag & ~1u);
  vm->regs[r]=now; DISPATCH();
}
L_SHL_R_R: {
  TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); uint32_t nbits=vm->regs[b] & 31u;
  uint32_t old=vm->regs[a], now=(old << nbits);
  vm->v_flag = (now < old) ? (vm->v_flag | 1u) : (vm->v_flag & ~1u);
  vm->regs[a]=now; DISPATCH();
}
L_SHR_R_N: {
  TICK(); uint8_t r=(uint8_t)(*ip++); uint32_t nbits=(uint32_t)(*ip++) & 31u;
  uint32_t old=vm->regs[r], now=(old >> nbits);
  vm->v_flag = (now < old) ? (vm->v_flag | 1u) : (vm->v_flag & ~1u);
  vm->regs[r]=now; DISPATCH();
}
L_SHR_R_R: {
  TICK(); uint8_t a=(uint8_t)(*ip++), b=(uint8_t)(*ip++); uint32_t nbits=vm->regs[b] & 31u;
  uint32_t old=vm->regs[a], now=(old >> nbits);
  vm->v_flag = (now < old) ? (vm->v_flag | 1u) : (vm->v_flag & ~1u);
  vm->regs[a]=now; DISPATCH();
}

L_DONE:
  free(cp.cells);
  free(cp.byte_to_cell);
  return ok;

#undef TICK
#undef FAIL
#undef DISPATCH
}

static void emit_u32(uint8_t *out, size_t *n, uint32_t v) {
  out[(*n)++] = (uint8_t)(v & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 8) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 16) & 0xFF);
  out[(*n)++] = (uint8_t)((v >> 24) & 0xFF);
}

int main(void) {
  FPVM *vm = (FPVM *)calloc(1, sizeof(FPVM));
  if (!vm) die("out of memory");
  vm->max_clock_break = 100000;

  /* Basic demo covering arithmetic, stack, compare, conditional jump, memory, simd, and call/ret */
  uint8_t code[512] = {0};
  size_t n = 0;

  /* r0 = 7; r1 = 5; r0 += r1 */
  code[n++] = OP_MOV_R_N; code[n++] = 0; emit_u32(code, &n, 7);
  code[n++] = OP_MOV_R_N; code[n++] = 1; emit_u32(code, &n, 5);
  code[n++] = OP_ADD_R_R; code[n++] = 0; code[n++] = 1;

  /* stack: push r0 -> pop r2 */
  code[n++] = OP_PUSH_R; code[n++] = 0;
  code[n++] = OP_POP_R;  code[n++] = 2;

  /* memory init: stw_n_n 10 -> [0x100], stw_n_n 20 -> [0x104] */
  code[n++] = OP_STW_N_N; emit_u32(code, &n, 10); emit_u32(code, &n, 0x100);
  code[n++] = OP_STW_N_N; emit_u32(code, &n, 20); emit_u32(code, &n, 0x104);

  /* addx4_n_n (first two words meaningful here) */
  code[n++] = OP_ADDX4_N_N; emit_u32(code, &n, 0x100); emit_u32(code, &n, 0x100);

  /* cmp r2,12 ; jeq equal_label */
  code[n++] = OP_CMP_R_N; code[n++] = 2; emit_u32(code, &n, 12);
  code[n++] = OP_JEQ_N;
  size_t jeq_pos = n; emit_u32(code, &n, 0);

  /* false path */
  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 0);
  code[n++] = OP_JMP_N;
  size_t jmp_end_pos = n; emit_u32(code, &n, 0);

  /* equal_label */
  uint32_t equal_pc = (uint32_t)n;
  code[n++] = OP_MOV_R_N; code[n++] = 3; emit_u32(code, &n, 1);

  /* call function at fn_pc */
  code[n++] = OP_CALL_N;
  size_t call_pos = n; emit_u32(code, &n, 0);

  /* end label */
  uint32_t end_pc = (uint32_t)n;
  code[n++] = OP_HLT;

  /* fn_pc: r4 = r0 * 2; ret */
  uint32_t fn_pc = (uint32_t)n;
  code[n++] = OP_MOV_R_R; code[n++] = 4; code[n++] = 0;
  code[n++] = OP_MUL_R_N; code[n++] = 4; emit_u32(code, &n, 2);
  code[n++] = OP_RET;

  /* patch targets as bytecode PCs */
  code[jeq_pos + 0] = (uint8_t)(equal_pc & 0xFF);
  code[jeq_pos + 1] = (uint8_t)((equal_pc >> 8) & 0xFF);
  code[jeq_pos + 2] = (uint8_t)((equal_pc >> 16) & 0xFF);
  code[jeq_pos + 3] = (uint8_t)((equal_pc >> 24) & 0xFF);

  code[jmp_end_pos + 0] = (uint8_t)(end_pc & 0xFF);
  code[jmp_end_pos + 1] = (uint8_t)((end_pc >> 8) & 0xFF);
  code[jmp_end_pos + 2] = (uint8_t)((end_pc >> 16) & 0xFF);
  code[jmp_end_pos + 3] = (uint8_t)((end_pc >> 24) & 0xFF);

  code[call_pos + 0] = (uint8_t)(fn_pc & 0xFF);
  code[call_pos + 1] = (uint8_t)((fn_pc >> 8) & 0xFF);
  code[call_pos + 2] = (uint8_t)((fn_pc >> 16) & 0xFF);
  code[call_pos + 3] = (uint8_t)((fn_pc >> 24) & 0xFF);

  bool ok = vm_exec(vm, code, n);

  printf("ok=%d r0=%" PRIu32 " r1=%" PRIu32 " r2=%" PRIu32 " r3=%" PRIu32 " r4=%" PRIu32 " mem[0x100]=%" PRIu32 "\n",
         ok ? 1 : 0,
         vm->regs[0], vm->regs[1], vm->regs[2], vm->regs[3], vm->regs[4],
         mem_load32(vm, 0x100));

  free(vm);
  return ok ? 0 : 1;
}
