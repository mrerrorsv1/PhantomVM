/**
 * ============================================================================
 * PhantomVM-C — Constants, Instructions & Register Definitions
 * ترجمة C لآلة Phantom الافتراضية
 * ============================================================================
 */

#ifndef PHANTOMVM_CONSTANTS_H
#define PHANTOMVM_CONSTANTS_H

#include <stdint.h>
#include <stddef.h>

/* ============================================================================
 * 1. BASIC STACK & DATA INSTRUCTIONS
 * ============================================================================
 */
#define HTL      0x00  /* Halt the machine */
#define PUSH_N   0x01  /* Push Number to stack */
#define PUSH_R   0x02  /* Push Register to stack */
#define POP      0x03  /* Pop from stack */
#define POP_R    0x04  /* Pop into Register */
#define DUP      0x05  /* Duplicate top of stack */

/* ============================================================================
 * 2. ARITHMETIC INSTRUCTIONS
 * ============================================================================
 */
#define ADD_R_N  0x06  /* Add Number to Register */
#define ADD_R_R  0x07  /* Add Register to Register */
#define SUB_R_N  0x08  /* Subtract Number from Register */
#define SUB_R_R  0x09  /* Subtract Register from Register */
#define MUL_R_N  0x0A  /* Multiply Register by Number */
#define MUL_R_R  0x0B  /* Multiply Register by Register */
#define DIV_R_N  0x0C  /* Divide Register by Number */
#define DIV_R_R  0x0D  /* Divide Register by Register */
#define MOD_R_N  0x0E  /* Modulo Register by Number */
#define MOD_R_R  0x0F  /* Modulo Register by Register */

/* ============================================================================
 * 3. COMPARISON INSTRUCTIONS
 * ============================================================================
 */
#define CMP_N_N  0x10  /* Compare Number with Number */
#define CMP_R_N  0x11  /* Compare Register with Number */
#define CMP_R_R  0x12  /* Compare Register with Register */
#define CMP_N_R  0x13  /* Compare Number with Register */

/* ============================================================================
 * 4. JUMP & CALL INSTRUCTIONS
 * ============================================================================
 */
#define JMP_N    0x14  /* Jump to Address (Immediate) */
#define JMP_R    0x15  /* Jump to Address (Register) */
#define CALL_N   0x16  /* Call function (Immediate Address) */
#define CALL_R   0x17  /* Call function (Register Address) */

/* ============================================================================
 * 5. CONDITIONAL JUMPS
 * ============================================================================
 */
#define JEQ_N    0x18  /* Jump if Equal (Immediate) */
#define JEQ_R    0x19  /* Jump if Equal (Register) */
#define JNE_N    0x1A  /* Jump if Not Equal (Immediate) */
#define JNE_R    0x1B  /* Jump if Not Equal (Register) */
#define JGT_N    0x1C  /* Jump if Greater Than (Immediate) */
#define JGT_R    0x1D  /* Jump if Greater Than (Register) */
#define JLT_N    0x1E  /* Jump if Less Than (Immediate) */
#define JLT_R    0x1F  /* Jump if Less Than (Register) */

/* ============================================================================
 * 6. CONDITIONAL SETS
 * ============================================================================
 */
#define CEQ_N    0x20  /* Set if Equal (Number) */
#define CEQ_R    0x21  /* Set if Equal (Register) */
#define CNE_N    0x22  /* Set if Not Equal (Number) */
#define CNE_R    0x23  /* Set if Not Equal (Register) */
#define CGT_N    0x24  /* Set if Greater Than (Number) */
#define CGT_R    0x25  /* Set if Greater Than (Register) */
#define CLT_N    0x26  /* Set if Less Than (Number) */
#define CLT_R    0x27  /* Set if Less Than (Register) */

/* ============================================================================
 * 7. LOGICAL & BITWISE INSTRUCTIONS
 * ============================================================================
 */
#define CLC      0x28  /* Clear Condition Flag */
#define AND_R_N  0x29  /* Bitwise AND Register with Number */
#define AND_R_R  0x2A  /* Bitwise AND Register with Register */
#define EOR_R_N  0x2B  /* Bitwise OR with Number */
#define EOR_R_R  0x2C  /* Bitwise OR with Register */
#define XOR_R_N  0x2D  /* Bitwise XOR with Number */
#define XOR_R_R  0x2E  /* Bitwise XOR with Register */
#define NOT      0x2F  /* Bitwise NOT Register */

/* ============================================================================
 * 8. SYSTEM & SPECIAL CONTROLS
 * ============================================================================
 */
#define SYSCALL  0x30  /* System Call */
#define SYSRET   0x31  /* System Return */
#define MCC_N    0x32  /* Max Clock Counter (Immediate) */
#define MCC_R    0x33  /* Max Clock Counter (Register) */
#define VCC      0x34  /* Clock Remaining Counter */
#define MOV_R_N  0x35  /* Move Number into Register */
#define MOV_R_R  0x36  /* Move Register into Register */
#define RET      0x37  /* Return from function */

/* ============================================================================
 * 9. MEMORY BLOCK OPERATIONS (COPY & FILL)
 * ============================================================================
 */
#define copy_r_r_r  0x38
#define copy_r_r_n  0x39
#define copy_r_n_r  0x3A
#define copy_r_n_n  0x3B
#define copy_n_r_r  0x3C
#define copy_n_r_n  0x3D
#define copy_n_n_r  0x3E
#define copy_n_n_n  0x3F

#define fill_r_r_r  0x40
#define fill_r_r_n  0x41
#define fill_r_n_r  0x42
#define fill_r_n_n  0x43
#define fill_n_r_r  0x44
#define fill_n_r_n  0x45
#define fill_n_n_r  0x46
#define fill_n_n_n  0x47

/* ============================================================================
 * 10. SIMD (VECTORIAL) OPERATIONS
 * ============================================================================
 */
#define addx4_r_r  0x48
#define addx4_r_n  0x49
#define addx4_n_r  0x4A
#define addx4_n_n  0x4B

#define subx4_r_r  0x4C
#define subx4_r_n  0x4D
#define subx4_n_r  0x4E
#define subx4_n_n  0x4F

#define max_r_r  0x50
#define max_r_n  0x51
#define max_n_r  0x52
#define max_n_n  0x53

#define min_r_r  0x54
#define min_r_n  0x55
#define min_n_r  0x56
#define min_n_n  0x57

/* ============================================================================
 * 11. QUICK OPERATIONS & MEMORY LOAD/STORE
 * ============================================================================
 */
#define rec_r    0x58
#define rec_n    0x59

#define ldb_r_r  0x60  /* Load Byte (Register Address) */
#define ldb_r_n  0x61  /* Load Byte (Immediate Address) */
#define ldh_r_r  0x62  /* Load Half-word (Register Address) */
#define ldh_r_n  0x63  /* Load Half-word (Immediate Address) */
#define ldw_r_r  0x64  /* Load Word (Register Address) */
#define ldw_r_n  0x65  /* Load Word (Immediate Address) */

#define stb_r_r  0x66
#define stb_r_n  0x67
#define stb_n_r  0x68
#define stb_n_n  0x69

#define sth_r_r  0x6A
#define sth_r_n  0x6B
#define sth_n_r  0x6C
#define sth_n_n  0x6D

#define stw_r_r  0x6E
#define stw_r_n  0x6F
#define stw_n_r  0x70
#define stw_n_n  0x71

#define SHL_R_N  0x72
#define SHL_R_R  0x73
#define SHR_R_N  0x74
#define SHR_R_R  0x75

#define fico_r_r_r  0x76
#define fico_r_r_n  0x77
#define fico_r_n_r  0x78
#define fico_r_n_n  0x79
#define fico_n_r_r  0x7A
#define fico_n_r_n  0x7B
#define fico_n_n_r  0x7C
#define fico_n_n_n  0x7D

/* ============================================================================
 * 12. EXCEPTIONS, INTERRUPTS & ERRORS
 * ============================================================================
 */
#define DIV_ZERO        0
#define OVER_STACK_V    1
#define OVER_STACK_C    2
#define OVER_MEM        3
#define BAD_OP          4
#define OP_REC          5
#define JMP_OUT         6
#define INPUT           7
#define NEW_FRAME       8
#define OUTPUT          9
#define TIME_CLIK       10
#define END_TIME        11
#define OVER_R_V        12
#define OVER_R_C        13
#define PRIVE           15

/* ============================================================================
 * 13. REGISTERS CONFIGURATION
 * ============================================================================
 */
#define COUNTER_REGISTER_V  64
#define COUNTER_REGISTER_R  192
#define MAX_REGISTERS       256

/* Kernel Registers (V) */
#define V_PC                255
#define VSP                 254
#define VLSP                253
#define VPSP                252
#define VCP                 251
#define VLCP                250
#define VPCP                249
#define V_FLAG              248
#define V_RET               247
#define V_MES               246
#define V_ABF               245
#define V_MAX_CLOCK_BREAK   244
#define CLOCK               243
#define V_CMP               242
#define V_IDXINP            241
#define V_VALINP            240
#define V_BASE              239
#define V_CLOCK_COUNTER     238
#define V_DIRECTING_PROVINCE 237
#define V_SBF               236
#define V_BFC               235

/* ============================================================================
 * 14. MEMORY LAYOUT
 * ============================================================================
 */
#define KERNEL_SIZE     (2 * 1024 * 1024)      /* 2MB - Kernel Memory */
#define RAM_SIZE        (12 * 1024 * 1024)     /* 12MB - User RAM */
#define PROGRAM_SIZE    3072                   /* 3KB - User Program Space */
#define USER_SPACE_BASE KERNEL_SIZE
#define REGISTERS_SIZE  1024

#define SIZE_TOTALE     (KERNEL_SIZE + RAM_SIZE + REGISTERS_SIZE)

/* ============================================================================
 * 15. FLAG BITS
 * ============================================================================
 */
#define FLAG_CARRY      (1U << 0)
#define FLAG_BORROW     (1U << 1)
#define FLAG_GREATER    (1U << 2)
#define FLAG_EQUAL      (1U << 1)

#endif /* PHANTOMVM_CONSTANTS_H */
