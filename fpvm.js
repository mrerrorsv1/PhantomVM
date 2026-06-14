// ═══════════════════════════════════════════════════════════════════════════
// pvm.js — Phantom Virtual Machine  (Dispatch Table Edition)
// نفس المنطق بالضبط — فقط switch ضخم → مصفوفة دوال صغيرة
// V8 يحسّن كل handler منفردة بدلاً من رفع الراية أمام الدالة العملاقة
// ═══════════════════════════════════════════════════════════════════════════

import { unpack } from './utils.js'

import {
  KERNEL_SIZE, RAM_SIZE, REGISTERS, SIZE_TOTALE,

  DIV_ZERO, OVER_STACK_V, OVER_STACK_C, OVER_MEM,
  BAD_OP,   OP_REC,       JMP_OUT,      INPUT,
  NEW_FRAME, OUTPUT,      TIME_CLIK,    END_TIME,
  OVER_R_V,  OVER_R_C,   PRIVE,

  COUNTER_REGISTER_V,
  COUNTER_REGISTER_R,

  V_PC, VSP, VLSP, VPSP, VCP, VLCP, VPCP,
  V_FLAG, V_RET, V_MES, V_ABF, V_SBF,
  V_MAX_CLOCK_BREAK, CLOCK, V_CMP, V_BASE,
  V_VALINP, V_IDXINP, V_CLOCK_COUNTER,
  V_DIRECTING_PROVINCE,

  FLi,

  HTL,
  PUSH_N, PUSH_R,
  POP,    POP_R,
  DUP,
  ADD_R_N, ADD_R_R,
  SUB_R_N, SUB_R_R,
  MUL_R_N, MUL_R_R,
  DIV_R_N, DIV_R_R,
  SHL_R_N, SHL_R_R,
  SHR_R_N, SHR_R_R,
  MOD_R_N, MOD_R_R,
  CMP_N_N, CMP_R_N, CMP_R_R, CMP_N_R,
  JMP_N,   JMP_R,
  CALL_N,  CALL_R,
  JEQ_N,   JEQ_R,
  JNE_N,   JNE_R,
  JGT_N,   JGT_R,
  JLT_N,   JLT_R,
  CEQ_N,   CEQ_R,
  CNE_N,   CNE_R,
  CGT_N,   CGT_R,
  CLT_N,   CLT_R,
  CLC,
  AND_R_N, AND_R_R,
  EOR_R_N, EOR_R_R,
  XOR_R_N, XOR_R_R,
  NOT,
  SYSCALL, SYSRET,
  MCC_N,   MCC_R,
  VCC,
  MOV_R_N, MOV_R_R,
  RET,
  copy_r_r_r, copy_r_r_n, copy_r_n_r, copy_r_n_n,
  copy_n_r_r, copy_n_r_n, copy_n_n_r, copy_n_n_n,
  fill_r_r_r, fill_r_r_n, fill_r_n_r, fill_r_n_n,
  fill_n_r_r, fill_n_r_n, fill_n_n_r, fill_n_n_n,
  fico_r_r_r, fico_r_r_n, fico_r_n_r, fico_r_n_n,
  fico_n_r_r, fico_n_r_n, fico_n_n_r, fico_n_n_n,
  addx4_r_r,  addx4_r_n,  addx4_n_r,  addx4_n_n,
  subx4_r_r,  subx4_r_n,  subx4_n_r,  subx4_n_n,
  max_r_r, max_r_n, max_n_r, max_n_n,
  min_r_r, min_r_n, min_n_r, min_n_n,
  rec_r,   rec_n,
  ldb_r_n, ldb_r_r,
  ldh_r_n, ldh_r_r,
  ldw_r_n, ldw_r_r,
  stb_r_n, stb_r_r, stb_n_r, stb_n_n,
  sth_r_n, sth_r_r, sth_n_r, sth_n_n,
  stw_r_n, stw_r_r, stw_n_r, stw_n_n
} from './constants.js'

const PROGRAM_SIZE    = 3072
const USER_SPACE_BASE = KERNEL_SIZE
const KERNEL_REG_BASE = COUNTER_REGISTER_R  // = 192 (لكن في constants = 192 فعلاً)

// ─────────────────────────────────────────────────────────────────────────────

export function makeCPU(ROM) {

  const unpacked = unpack(ROM)
  if (!unpacked) throw new Error('[PVM] فشل فك حزمة ROM — تنسيق غير صحيح')

  const { kernel, programes } = unpacked

  const MEM = new Uint8Array(KERNEL_SIZE + RAM_SIZE)
  const U32 = new Uint32Array(MEM.buffer)
  const REG = new Uint32Array(new ArrayBuffer(REGISTERS))

  if (kernel.byteLength > KERNEL_SIZE)
    throw new Error('[PVM] حجم النواة يتجاوز 2MB')

  MEM.set(kernel, 0)

  for (let p = 0; p < programes.length; p++) {
    const prog = programes[p]
    if (prog.byteLength > PROGRAM_SIZE)
      throw new Error(`[PVM] البرنامج ${p} يتجاوز حد 3KB`)
    const dst = USER_SPACE_BASE + p * PROGRAM_SIZE
    if (dst + PROGRAM_SIZE > MEM.length)
      throw new Error(`[PVM] لا مساحة كافية لتحميل البرنامج ${p}`)
    MEM.set(prog, dst)
  }

  REG[V_PC]              = 0
  REG[VSP]               = 0
  REG[VLSP]              = 0
  REG[VPSP]              = 0
  REG[VCP]               = 0
  REG[VLCP]              = 0
  REG[VPCP]              = 0
  REG[V_FLAG]            = 0
  REG[V_RET]             = 0
  REG[V_MES]             = 0
  REG[V_ABF]             = 0
  REG[V_SBF]             = 0
  REG[V_MAX_CLOCK_BREAK] = 10000
  let maxBreak = 10000
  REG[CLOCK]             = 0
  REG[V_CMP]             = 0

  let KERNEL_MODE = true
  REG[V_BASE]     = USER_SPACE_BASE

  // متغيرات عمل مشتركة بين جميع الـ handlers — closure واحدة
  let operandA = 0
  let operandB = 0
  let operandC = 0
  let absAddr  = 0
  let tmp      = 0
  let tmp2     = 0
  let i        = 0
  let j        = 0
  let a        = 0, b = a, c = b;

  // DISPATCH TABLE — 256 خانة، كل handler دالة مستقلة صغيرة
  // V8 يُحسّن كل واحدة على حدة → ربح كبير في الأداء
  // ═════════════════════════════════════════════════════════════════════════

  const DISPATCH = new Array(256).fill(null)

  // ─── HTL (0x00) ───────────────────────────────────────────────────────────
  DISPATCH[HTL] = function h_HTL() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    REG[V_PC]  = REG[V_DIRECTING_PROVINCE]
    REG[V_MES] = 0
    REG[V_CLOCK_COUNTER] = 0
    return true   // إشارة للحلقة الخارجية بالتوقف
  }


  // ─── PUSH_N (0x01) ────────────────────────────────────────────────────────
  DISPATCH[PUSH_N] = function h_PUSH_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES]=OVER_STACK_V; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      if (absAddr + 3 >= KERNEL_SIZE + RAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      MEM[absAddr]   =  operandA        & 0xFF
      MEM[absAddr+1] = (operandA >>  8) & 0xFF
      MEM[absAddr+2] = (operandA >> 16) & 0xFF
      MEM[absAddr+3] = (operandA >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES] = OVER_STACK_V; return }
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      MEM[absAddr]   =  operandA        & 0xFF
      MEM[absAddr+1] = (operandA >>  8) & 0xFF
      MEM[absAddr+2] = (operandA >> 16) & 0xFF
      MEM[absAddr+3] = (operandA >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    }
  }

  // ─── PUSH_R (0x02) ────────────────────────────────────────────────────────
  DISPATCH[PUSH_R] = function h_PUSH_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES]=OVER_STACK_V; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp     = REG[operandA]
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      MEM[absAddr]   =  tmp        & 0xFF
      MEM[absAddr+1] = (tmp >>  8) & 0xFF
      MEM[absAddr+2] = (tmp >> 16) & 0xFF
      MEM[absAddr+3] = (tmp >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    } else {
      operandA = MEM[REG[V_PC]]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES] = OVER_STACK_V; return }
      tmp     = REG[operandA]
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      MEM[absAddr]   =  tmp        & 0xFF
      MEM[absAddr+1] = (tmp >>  8) & 0xFF
      MEM[absAddr+2] = (tmp >> 16) & 0xFF
      MEM[absAddr+3] = (tmp >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    }
  }

  // ─── POP (0x03) ───────────────────────────────────────────────────────────
  DISPATCH[POP] = function h_POP() {
    if (!KERNEL_MODE) {
      if (REG[VSP] === 0) { REG[V_MES]=OVER_STACK_C; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[VSP] = (REG[VSP] - 1) >>> 0
    } else {
      if (REG[VSP] === 0) { REG[V_MES] = OVER_STACK_C; return }
      REG[VSP] = (REG[VSP] - 1) >>> 0
    }
  }

  // ─── POP_R (0x04) ─────────────────────────────────────────────────────────
  DISPATCH[POP_R] = function h_POP_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[VSP] === 0) { REG[V_MES]=OVER_STACK_C; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[VSP] = (REG[VSP] - 1) >>> 0
      absAddr  = REG[VPSP] + (REG[VSP] << 2)
      REG[operandA] = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
    } else {
      operandA = MEM[REG[V_PC]]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (REG[VSP] === 0) { REG[V_MES] = OVER_STACK_C; return }
      REG[VSP] = (REG[VSP] - 1) >>> 0
      absAddr  = REG[VPSP] + (REG[VSP] << 2)
      REG[operandA] = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
    }
  }

  // ─── DUP (0x05) ───────────────────────────────────────────────────────────
  DISPATCH[DUP] = function h_DUP() {
    if (!KERNEL_MODE) {
      if (REG[VSP] === 0) { REG[V_MES]=OVER_STACK_C; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES]=OVER_STACK_V; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr = REG[VPSP] + ((REG[VSP] - 1) << 2)
      tmp = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      MEM[absAddr]   =  tmp        & 0xFF
      MEM[absAddr+1] = (tmp >>  8) & 0xFF
      MEM[absAddr+2] = (tmp >> 16) & 0xFF
      MEM[absAddr+3] = (tmp >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    } else {
      if (REG[VSP] === 0) { REG[V_MES] = OVER_STACK_C; return }
      if (REG[VSP] >= REG[VLSP]) { REG[V_MES] = OVER_STACK_V; return }
      absAddr = REG[VPSP] + ((REG[VSP] - 1) << 2)
      tmp = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      absAddr = REG[VPSP] + (REG[VSP] << 2)
      MEM[absAddr]   =  tmp        & 0xFF
      MEM[absAddr+1] = (tmp >>  8) & 0xFF
      MEM[absAddr+2] = (tmp >> 16) & 0xFF
      MEM[absAddr+3] = (tmp >> 24) & 0xFF
      REG[VSP] = (REG[VSP] + 1) >>> 0
    }
  }

  // ─── ADD_R_N (0x06) ───────────────────────────────────────────────────────
  DISPATCH[ADD_R_N] = function h_ADD_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] + operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = (REG[operandA] + operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }

  // ─── ADD_R_R (0x07) ───────────────────────────────────────────────────────
  DISPATCH[ADD_R_R] = function h_ADD_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] + REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = (REG[operandA] + REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }

  // ─── SUB_R_N (0x08) ───────────────────────────────────────────────────────
  DISPATCH[SUB_R_N] = function h_SUB_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] - operandB) >>> 0
      REG[V_FLAG] = tmp > REG[operandA] ? (REG[V_FLAG] | FLi[1]) : (REG[V_FLAG] & ~FLi[1])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = (REG[operandA] - operandB) >>> 0
      REG[V_FLAG] = tmp > REG[operandA] ? (REG[V_FLAG] | FLi[1]) : (REG[V_FLAG] & ~FLi[1])
      REG[operandA] = tmp
    }
  }

  // ─── SUB_R_R (0x09) ───────────────────────────────────────────────────────
  DISPATCH[SUB_R_R] = function h_SUB_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] - REG[operandB]) >>> 0
      REG[V_FLAG] = tmp > REG[operandA] ? (REG[V_FLAG] | FLi[1]) : (REG[V_FLAG] & ~FLi[1])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = (REG[operandA] - REG[operandB]) >>> 0
      REG[V_FLAG] = tmp > REG[operandA] ? (REG[V_FLAG] | FLi[1]) : (REG[V_FLAG] & ~FLi[1])
      REG[operandA] = tmp
    }
  }

  // ─── MUL_R_N (0x0A) ───────────────────────────────────────────────────────
  DISPATCH[MUL_R_N] = function h_MUL_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = Math.imul(REG[operandA], operandB) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = Math.imul(REG[operandA], operandB) >>> 0
    }
  }

  // ─── MUL_R_R (0x0B) ───────────────────────────────────────────────────────
  DISPATCH[MUL_R_R] = function h_MUL_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = Math.imul(REG[operandA], REG[operandB]) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = Math.imul(REG[operandA], REG[operandB]) >>> 0
    }
  }

  // ─── DIV_R_N (0x0C) ───────────────────────────────────────────────────────
  DISPATCH[DIV_R_N] = function h_DIV_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB === 0) { REG[V_MES]=DIV_ZERO; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = ((REG[operandA] / operandB) | 0) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB === 0) { REG[V_MES] = DIV_ZERO; return }
      REG[operandA] = ((REG[operandA] / operandB) | 0) >>> 0
    }
  }

  // ─── DIV_R_R (0x0D) ───────────────────────────────────────────────────────
  DISPATCH[DIV_R_R] = function h_DIV_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandB] === 0) { REG[V_MES]=DIV_ZERO; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = ((REG[operandA] / REG[operandB]) | 0) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (REG[operandB] === 0) { REG[V_MES] = DIV_ZERO; return }
      REG[operandA] = ((REG[operandA] / REG[operandB]) | 0) >>> 0
    }
  }

  // ─── MOD_R_N (0x0E) ───────────────────────────────────────────────────────
  DISPATCH[MOD_R_N] = function h_MOD_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB === 0) { REG[V_MES]=DIV_ZERO; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] % operandB) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB === 0) { REG[V_MES] = DIV_ZERO; return }
      REG[operandA] = (REG[operandA] % operandB) >>> 0
    }
  }

  // ─── MOD_R_R (0x0F) ───────────────────────────────────────────────────────
  DISPATCH[MOD_R_R] = function h_MOD_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandB] === 0) { REG[V_MES]=DIV_ZERO; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] % REG[operandB]) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (REG[operandB] === 0) { REG[V_MES] = DIV_ZERO; return }
      REG[operandA] = (REG[operandA] % REG[operandB]) >>> 0
    }
  }

  // ─── CMP_N_N (0x10) ───────────────────────────────────────────────────────
  DISPATCH[CMP_N_N] = function h_CMP_N_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 7 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
    }
    REG[V_CMP] = (operandA === operandB ? FLi[1] : 0) | (operandA > operandB ? FLi[2] : 0)
  }

  // ─── CMP_R_N (0x11) ───────────────────────────────────────────────────────
  DISPATCH[CMP_R_N] = function h_CMP_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
    }
    REG[V_CMP] = (REG[operandA] === operandB ? FLi[1] : 0) | (REG[operandA] > operandB ? FLi[2] : 0)
  }

  // ─── CMP_R_R (0x12) ───────────────────────────────────────────────────────
  DISPATCH[CMP_R_R] = function h_CMP_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
    }
    REG[V_CMP] = (REG[operandA] === REG[operandB] ? FLi[1] : 0) | (REG[operandA] > REG[operandB] ? FLi[2] : 0)
  }

  // ─── CMP_N_R (0x13) ───────────────────────────────────────────────────────
  DISPATCH[CMP_N_R] = function h_CMP_N_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
    }
    REG[V_CMP] = (operandA === REG[operandB] ? FLi[1] : 0) | (operandA > REG[operandB] ? FLi[2] : 0)
  }

  // ─── JMP_N (0x14) ─────────────────────────────────────────────────────────
  DISPATCH[JMP_N] = function h_JMP_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      if (operandA >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_PC] = operandA
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      if (operandA >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_PC] = operandA
    }
  }

  // ─── JMP_R (0x15) ─────────────────────────────────────────────────────────
  DISPATCH[JMP_R] = function h_JMP_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandA] >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_PC] = REG[operandA]
    } else {
      operandA = MEM[REG[V_PC]]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (REG[operandA] >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_PC] = REG[operandA]
    }
  }

  // ─── مساعد: push call stack ───────────────────────────────────────────────
  function pushCallStack(retAddr, limit) {
    if (REG[VCP] >= REG[VLCP]) { REG[V_MES]=OVER_STACK_C; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return false }
    absAddr = REG[VPCP] + (REG[VCP] << 2)
    MEM[absAddr]   =  retAddr        & 0xFF
    MEM[absAddr+1] = (retAddr >>  8) & 0xFF
    MEM[absAddr+2] = (retAddr >> 16) & 0xFF
    MEM[absAddr+3] = (retAddr >> 24) & 0xFF
    REG[VCP] = (REG[VCP] + 1) >>> 0
    return true
  }

  // ─── CALL_N (0x16) ────────────────────────────────────────────────────────
  DISPATCH[CALL_N] = function h_CALL_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      if (operandA >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (!pushCallStack(REG[V_PC])) return
      REG[V_PC] = operandA
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      if (operandA >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[VCP] >= REG[VLCP]) { REG[V_MES] = OVER_STACK_C; return }
      absAddr = REG[VPCP] + (REG[VCP] << 2)
      tmp = REG[V_PC]
      MEM[absAddr]   =  tmp        & 0xFF; MEM[absAddr+1] = (tmp>>8)&0xFF
      MEM[absAddr+2] = (tmp>>16)&0xFF;     MEM[absAddr+3] = (tmp>>24)&0xFF
      REG[VCP] = (REG[VCP] + 1) >>> 0
      REG[V_PC] = operandA
    }
  }

  // ─── CALL_R (0x17) ────────────────────────────────────────────────────────
  DISPATCH[CALL_R] = function h_CALL_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandA] >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (!pushCallStack(REG[V_PC])) return
      REG[V_PC] = REG[operandA]
    } else {
      operandA = MEM[REG[V_PC]]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (REG[operandA] >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[VCP] >= REG[VLCP]) { REG[V_MES] = OVER_STACK_C; return }
      absAddr = REG[VPCP] + (REG[VCP] << 2)
      tmp = REG[V_PC]
      MEM[absAddr]   =  tmp        & 0xFF; MEM[absAddr+1] = (tmp>>8)&0xFF
      MEM[absAddr+2] = (tmp>>16)&0xFF;     MEM[absAddr+3] = (tmp>>24)&0xFF
      REG[VCP] = (REG[VCP] + 1) >>> 0
      REG[V_PC] = REG[operandA]
    }
  }

  // ─── مساعد: conditional jump ──────────────────────────────────────────────
  // cond: دالة تعيد true عند تحقق الشرط
  function makeJEQ_N(cond) {
    return function() {
      if (!KERNEL_MODE) {
        if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        absAddr  = REG[V_BASE] + REG[V_PC]
        operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
        REG[V_PC] = (REG[V_PC] + 4) >>> 0
        if (cond()) {
          if (operandA >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          REG[V_PC] = operandA
        }
      } else {
        absAddr  = REG[V_PC]
        operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
        REG[V_PC] = (REG[V_PC] + 4) >>> 0
        if (cond()) {
          if (operandA >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          REG[V_PC] = operandA
        }
      }
    }
  }

  function makeJEQ_R(cond) {
    return function() {
      if (!KERNEL_MODE) {
        if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        absAddr  = REG[V_BASE] + REG[V_PC]
        operandA = MEM[absAddr]
        REG[V_PC] = (REG[V_PC] + 1) >>> 0
        if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        if (cond()) {
          if (REG[operandA] >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          REG[V_PC] = REG[operandA]
        }
      } else {
        operandA = MEM[REG[V_PC]]
        REG[V_PC] = (REG[V_PC] + 1) >>> 0
        if (cond()) {
          if (REG[operandA] >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          REG[V_PC] = REG[operandA]
        }
      }
    }
  }

  const isEQ  = () => !!(REG[V_CMP] & FLi[1])
  const isNE  = () => !(REG[V_CMP] & FLi[1])
  const isGT  = () => !!(REG[V_CMP] & FLi[2])
  const isLT  = () => !(REG[V_CMP] & (FLi[1] | FLi[2]))

  DISPATCH[JEQ_N] = makeJEQ_N(isEQ)
  DISPATCH[JEQ_R] = makeJEQ_R(isEQ)
  DISPATCH[JNE_N] = makeJEQ_N(isNE)
  DISPATCH[JNE_R] = makeJEQ_R(isNE)
  DISPATCH[JGT_N] = makeJEQ_N(isGT)
  DISPATCH[JGT_R] = makeJEQ_R(isGT)
  DISPATCH[JLT_N] = makeJEQ_N(isLT)
  DISPATCH[JLT_R] = makeJEQ_R(isLT)

  // ─── مساعد: conditional call (CEQ/CNE/CGT/CLT) ───────────────────────────
  function makeCEQ_N(cond) {
    return function() {
      if (!KERNEL_MODE) {
        if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        absAddr  = REG[V_BASE] + REG[V_PC]
        operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
        REG[V_PC] = (REG[V_PC] + 4) >>> 0
        if (cond()) {
          if (operandA >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          if (!pushCallStack(REG[V_PC])) return
          REG[V_PC] = operandA
        }
      } else {
        absAddr  = REG[V_PC]
        operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
        REG[V_PC] = (REG[V_PC] + 4) >>> 0
        if (cond()) {
          if (operandA >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          if (REG[VCP] >= REG[VLCP]) { REG[V_MES] = OVER_STACK_C; return }
          absAddr = REG[VPCP] + (REG[VCP] << 2)
          tmp = REG[V_PC]
          MEM[absAddr]   =  tmp        & 0xFF; MEM[absAddr+1] = (tmp>>8)&0xFF
          MEM[absAddr+2] = (tmp>>16)&0xFF;     MEM[absAddr+3] = (tmp>>24)&0xFF
          REG[VCP] = (REG[VCP] + 1) >>> 0
          REG[V_PC] = operandA
        }
      }
    }
  }

  function makeCEQ_R(cond) {
    return function() {
      if (!KERNEL_MODE) {
        if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        absAddr  = REG[V_BASE] + REG[V_PC]
        operandA = MEM[absAddr]
        REG[V_PC] = (REG[V_PC] + 1) >>> 0
        if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
        if (cond()) {
          if (REG[operandA] >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          if (!pushCallStack(REG[V_PC])) return
          REG[V_PC] = REG[operandA]
        }
      } else {
        operandA = MEM[REG[V_PC]]
        REG[V_PC] = (REG[V_PC] + 1) >>> 0
        if (cond()) {
          if (REG[operandA] >= KERNEL_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          if (REG[VCP] >= REG[VLCP]) { REG[V_MES] = OVER_STACK_C; return }
          absAddr = REG[VPCP] + (REG[VCP] << 2)
          tmp = REG[V_PC]
          MEM[absAddr]   =  tmp        & 0xFF; MEM[absAddr+1] = (tmp>>8)&0xFF
          MEM[absAddr+2] = (tmp>>16)&0xFF;     MEM[absAddr+3] = (tmp>>24)&0xFF
          REG[VCP] = (REG[VCP] + 1) >>> 0
          REG[V_PC] = REG[operandA]
        }
      }
    }
  }

  DISPATCH[CEQ_N] = makeCEQ_N(isEQ)
  DISPATCH[CEQ_R] = makeCEQ_R(isEQ)
  DISPATCH[CNE_N] = makeCEQ_N(isNE)
  DISPATCH[CNE_R] = makeCEQ_R(isNE)
  DISPATCH[CGT_N] = makeCEQ_N(isGT)
  DISPATCH[CGT_R] = makeCEQ_R(isGT)
  DISPATCH[CLT_N] = makeCEQ_N(isLT)
  DISPATCH[CLT_R] = makeCEQ_R(isLT)

  // ─── CLC (0x28) ───────────────────────────────────────────────────────────
  DISPATCH[CLC] = function h_CLC() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    operandA   = MEM[REG[V_PC]]
    REG[V_PC]  = (REG[V_PC] + 1) >>> 0
    REG[V_FLAG] = REG[V_FLAG] & ~FLi[operandA & 0x1F]
  }

  // ─── AND_R_N (0x29) ───────────────────────────────────────────────────────
  DISPATCH[AND_R_N] = function h_AND_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] & operandB) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = (REG[operandA] & operandB) >>> 0
    }
  }

  // ─── AND_R_R (0x2A) ───────────────────────────────────────────────────────
  DISPATCH[AND_R_R] = function h_AND_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] & REG[operandB]) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = (REG[operandA] & REG[operandB]) >>> 0
    }
  }

  // ─── EOR_R_N (0x2B) — OR ──────────────────────────────────────────────────
  DISPATCH[EOR_R_N] = function h_EOR_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] | operandB) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = (REG[operandA] | operandB) >>> 0
    }
  }

  // ─── EOR_R_R (0x2C) ───────────────────────────────────────────────────────
  DISPATCH[EOR_R_R] = function h_EOR_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] | REG[operandB]) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = (REG[operandA] | REG[operandB]) >>> 0
    }
  }

  // ─── XOR_R_N (0x2D) ───────────────────────────────────────────────────────
  DISPATCH[XOR_R_N] = function h_XOR_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] ^ operandB) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = (REG[operandA] ^ operandB) >>> 0
    }
  }

  // ─── XOR_R_R (0x2E) ───────────────────────────────────────────────────────
  DISPATCH[XOR_R_R] = function h_XOR_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (REG[operandA] ^ REG[operandB]) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = (REG[operandA] ^ REG[operandB]) >>> 0
    }
  }

  // ─── NOT (0x2F) ───────────────────────────────────────────────────────────
  DISPATCH[NOT] = function h_NOT() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = (~REG[operandA]) >>> 0
    } else {
      operandA  = MEM[REG[V_PC]]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      REG[operandA] = (~REG[operandA]) >>> 0
    }
  }

  // ─── SYSCALL (0x30) ───────────────────────────────────────────────────────
  DISPATCH[SYSCALL] = function h_SYSCALL() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      REG[V_RET]  = REG[V_PC]
      REG[V_MES]  = operandA
      KERNEL_MODE = true
      REG[V_PC]   = REG[V_DIRECTING_PROVINCE]
    } else {
      REG[V_MES] = BAD_OP
    }
  }

  // ─── SYSRET (0x31) ────────────────────────────────────────────────────────
  DISPATCH[SYSRET] = function h_SYSRET() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    KERNEL_MODE = false
    REG[V_PC]   = REG[V_RET]
  }

  // ─── MCC_N (0x32) ─────────────────────────────────────────────────────────
  DISPATCH[MCC_N] = function h_MCC_N() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    absAddr  = REG[V_PC]
    operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
    REG[V_PC] = (REG[V_PC] + 4) >>> 0
    REG[V_MAX_CLOCK_BREAK] = operandA
    maxBreak = operandA
  }

  // ─── MCC_R (0x33) ─────────────────────────────────────────────────────────
  DISPATCH[MCC_R] = function h_MCC_R() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    operandA  = MEM[REG[V_PC]]
    REG[V_PC] = (REG[V_PC] + 1) >>> 0
    REG[V_MAX_CLOCK_BREAK] = REG[operandA]
    maxBreak = REG[operandA]
  }

  // ─── VCC (0x34) ───────────────────────────────────────────────────────────
  DISPATCH[VCC] = function h_VCC() {
    if (!KERNEL_MODE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
    operandA  = MEM[REG[V_PC]]
    REG[V_PC] = (REG[V_PC] + 1) >>> 0
    REG[operandA] = (REG[V_MAX_CLOCK_BREAK] - REG[CLOCK]) >>> 0
  }

  // ─── MOV_R_N (0x35) ───────────────────────────────────────────────────────
  DISPATCH[MOV_R_N] = function h_MOV_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = operandB
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = operandB
    }
  }

  // ─── MOV_R_R (0x36) ───────────────────────────────────────────────────────
  DISPATCH[MOV_R_R] = function h_MOV_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = REG[operandB]
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = REG[operandB]
    }
  }

  // ─── RET (0x37) ───────────────────────────────────────────────────────────
  DISPATCH[RET] = function h_RET() {
    if (!KERNEL_MODE) {
      if (REG[VCP] === 0) { REG[V_MES]=OVER_STACK_C; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[VCP] = (REG[VCP] - 1) >>> 0
      absAddr  = REG[VPCP] + (REG[VCP] << 2)
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      if (operandA >= PROGRAM_SIZE) { REG[V_MES]=JMP_OUT; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_PC] = operandA
    } else {
      if (REG[VCP] === 0) { REG[V_MES] = OVER_STACK_C; return }
      REG[VCP] = (REG[VCP] - 1) >>> 0
      absAddr  = REG[VPCP] + (REG[VCP] << 2)
      REG[V_PC] = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // copy (0x38..0x3F) — نسخ كتلة ذاكرة
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[copy_r_r_r] = function h_copy_rrr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]; tmp2 = REG[operandB]; i = REG[operandC]
      if (tmp + i > PROGRAM_SIZE || tmp2 + i > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < REG[operandC]; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = REG[operandC]-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      tmp = REG[operandA]; tmp2 = REG[operandB]
      for (i = 0; i < REG[operandC]; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_r_r_n] = function h_copy_rrn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]; tmp2 = REG[operandB]
      if (tmp + operandC > PROGRAM_SIZE || tmp2 + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < operandC; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = operandC-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]; tmp2 = REG[operandB]
      for (i = 0; i < operandC; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_r_n_r] = function h_copy_rnr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]; tmp2 = operandB
      if (tmp + REG[operandC] > PROGRAM_SIZE || tmp2 + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < REG[operandC]; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = REG[operandC]-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]; tmp2 = operandB
      for (i = 0; i < REG[operandC]; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_r_n_n] = function h_copy_rnn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]; tmp2 = operandB
      if (tmp + operandC > PROGRAM_SIZE || tmp2 + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < operandC; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = operandC-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = REG[operandA]; tmp2 = operandB
      for (i = 0; i < operandC; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_n_r_r] = function h_copy_nrr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA; tmp2 = REG[operandB]
      if (tmp + REG[operandC] > PROGRAM_SIZE || tmp2 + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < REG[operandC]; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = REG[operandC]-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = operandA; tmp2 = REG[operandB]
      for (i = 0; i < REG[operandC]; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_n_r_n] = function h_copy_nrn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA; tmp2 = REG[operandB]
      if (tmp + operandC > PROGRAM_SIZE || tmp2 + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < operandC; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = operandC-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA; tmp2 = REG[operandB]
      for (i = 0; i < operandC; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_n_n_r] = function h_copy_nnr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 8 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA; tmp2 = operandB
      if (tmp + REG[operandC] > PROGRAM_SIZE || tmp2 + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < REG[operandC]; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = REG[operandC]-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA; tmp2 = operandB
      for (i = 0; i < REG[operandC]; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  DISPATCH[copy_n_n_n] = function h_copy_nnn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 11 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA; tmp2 = operandB
      if (tmp + operandC > PROGRAM_SIZE || tmp2 + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (tmp <= tmp2) { for (i = 0; i < operandC; i++) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
      else             { for (i = operandC-1; i >= 0; i--) MEM[REG[V_BASE]+tmp+i] = MEM[REG[V_BASE]+tmp2+i] }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA; tmp2 = operandB
      for (i = 0; i < operandC; i++) MEM[tmp+i] = MEM[tmp2+i]
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // fill (0x40..0x47) — ملء كتلة بقيمة ثابتة
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[fill_r_r_r] = function h_fill_rrr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(a+i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(tmp+i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fill_r_r_n] = function h_fill_rrn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fill_r_n_r] = function h_fill_rnr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fill_r_n_n] = function h_fill_rnn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fill_n_r_r] = function h_fill_nrr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fill_n_r_n] = function h_fill_nrn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fill_n_n_r] = function h_fill_nnr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 8 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fill_n_n_n] = function h_fill_nnn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 11 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(tmp+i) >> 2] = operandB
      }
    }
  }



  DISPATCH[fico_r_r_r] = function h_fico_r_r_r() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(a+i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]; operandC = MEM[absAddr+2]
      REG[V_PC] = (REG[V_PC] + 3) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(tmp+i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fico_r_r_n] = function h_fico_r_r_n() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      operandC = (MEM[absAddr+2]|(MEM[absAddr+3]<<8)|(MEM[absAddr+4]<<16)|(MEM[absAddr+5]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i+=4) {
        U32[(tmp+i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fico_r_n_r] = function h_fico_r_n_r() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fico_r_n_n] = function h_fico_r_n_n() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandA]
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = REG[operandA]
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fico_n_r_r] = function h_fico_n_r_r() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 6 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      if (operandB >= KERNEL_REG_BASE || operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]; operandC = MEM[absAddr+5]
      REG[V_PC] = (REG[V_PC] + 6) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fico_n_r_n] = function h_fico_n_r_n() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 9 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = REG[operandB]
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      operandC = (MEM[absAddr+5]|(MEM[absAddr+6]<<8)|(MEM[absAddr+7]<<16)|(MEM[absAddr+8]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = REG[operandB]
      }
    }
  }

  DISPATCH[fico_n_n_r] = function h_fico_n_n_r() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 8 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      if (operandC >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = operandA
      if (tmp + REG[operandC] > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      operandC = MEM[absAddr+8]
      REG[V_PC] = (REG[V_PC] + 9) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }

  DISPATCH[fico_n_n_n] = function h_fico_n_n_n() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 11 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA
      if (tmp + operandC > PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      a = (REG[V_BASE] + tmp)
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(a + i) >> 2] = operandB
      }
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8) |(MEM[absAddr+2]<<16) |(MEM[absAddr+3]<<24)) >>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8) |(MEM[absAddr+6]<<16) |(MEM[absAddr+7]<<24)) >>>0
      operandC = (MEM[absAddr+8]|(MEM[absAddr+9]<<8) |(MEM[absAddr+10]<<16)|(MEM[absAddr+11]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 12) >>> 0
      tmp = operandA
      for (i = 0; i < REG[operandC]; i += 4) {
        U32[(tmp + i) >> 2] = operandB
      }
    }
  }
  
    // ─── SHL_R_N (0x72) ───────────────────────────────────────────────────────
  DISPATCH[SHL_R_N] = function h_SHL_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] << operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = (REG[operandA] << operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }

  // ─── SHL_R_R (0x73) ───────────────────────────────────────────────────────
  DISPATCH[SHL_R_R] = function h_SHL_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] << REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = (REG[operandA] << REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }
  
    // ─── SHL_R_N (0x74) ───────────────────────────────────────────────────────
  DISPATCH[SHR_R_N] = function h_SHR_R_N() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] >> operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = (REG[operandA] >> operandB) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }

  // ─── SHL_R_R (0x75) ───────────────────────────────────────────────────────
  DISPATCH[SHR_R_R] = function h_SHR_R_R() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = (REG[operandA] >> REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = (REG[operandA] >> REG[operandB]) >>> 0
      REG[V_FLAG] = tmp < REG[operandA] ? (REG[V_FLAG] | FLi[0]) : (REG[V_FLAG] & ~FLi[0])
      REG[operandA] = tmp
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SIMD addx4 / subx4 (0x48..0x4F)
  // ═════════════════════════════════════════════════════════════════════════

  function simd4(op) {
    // op: (va, vb) => result  —  يُولَّد inline
    return {
      rr(a, b) { // [REG[a]] op [REG[b]] → [REG[a]]
        if (!KERNEL_MODE) {
          if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          absAddr  = REG[V_BASE] + REG[V_PC]
          operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
          REG[V_PC] = (REG[V_PC] + 2) >>> 0
          if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          tmp = REG[operandA]; tmp2 = REG[operandB]
          if (tmp + 15 >= PROGRAM_SIZE || tmp2 + 15 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[REG[V_BASE]+tmp+off]|(MEM[REG[V_BASE]+tmp+off+1]<<8)|(MEM[REG[V_BASE]+tmp+off+2]<<16)|(MEM[REG[V_BASE]+tmp+off+3]<<24))>>>0
            const vb = (MEM[REG[V_BASE]+tmp2+off]|(MEM[REG[V_BASE]+tmp2+off+1]<<8)|(MEM[REG[V_BASE]+tmp2+off+2]<<16)|(MEM[REG[V_BASE]+tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[REG[V_BASE]+tmp+off]=res&0xFF; MEM[REG[V_BASE]+tmp+off+1]=(res>>8)&0xFF; MEM[REG[V_BASE]+tmp+off+2]=(res>>16)&0xFF; MEM[REG[V_BASE]+tmp+off+3]=(res>>24)&0xFF
          }
        } else {
          absAddr  = REG[V_PC]
          operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
          REG[V_PC] = (REG[V_PC] + 2) >>> 0
          tmp = REG[operandA]; tmp2 = REG[operandB]
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[tmp+off]|(MEM[tmp+off+1]<<8)|(MEM[tmp+off+2]<<16)|(MEM[tmp+off+3]<<24))>>>0
            const vb = (MEM[tmp2+off]|(MEM[tmp2+off+1]<<8)|(MEM[tmp2+off+2]<<16)|(MEM[tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[tmp+off]=res&0xFF; MEM[tmp+off+1]=(res>>8)&0xFF; MEM[tmp+off+2]=(res>>16)&0xFF; MEM[tmp+off+3]=(res>>24)&0xFF
          }
        }
      },
      rn() {
        if (!KERNEL_MODE) {
          if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          absAddr  = REG[V_BASE] + REG[V_PC]
          operandA = MEM[absAddr]
          operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
          REG[V_PC] = (REG[V_PC] + 5) >>> 0
          if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          tmp = REG[operandA]; tmp2 = operandB
          if (tmp + 15 >= PROGRAM_SIZE || tmp2 + 15 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[REG[V_BASE]+tmp+off]|(MEM[REG[V_BASE]+tmp+off+1]<<8)|(MEM[REG[V_BASE]+tmp+off+2]<<16)|(MEM[REG[V_BASE]+tmp+off+3]<<24))>>>0
            const vb = (MEM[REG[V_BASE]+tmp2+off]|(MEM[REG[V_BASE]+tmp2+off+1]<<8)|(MEM[REG[V_BASE]+tmp2+off+2]<<16)|(MEM[REG[V_BASE]+tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[REG[V_BASE]+tmp+off]=res&0xFF; MEM[REG[V_BASE]+tmp+off+1]=(res>>8)&0xFF; MEM[REG[V_BASE]+tmp+off+2]=(res>>16)&0xFF; MEM[REG[V_BASE]+tmp+off+3]=(res>>24)&0xFF
          }
        } else {
          absAddr  = REG[V_PC]
          operandA = MEM[absAddr]
          operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
          REG[V_PC] = (REG[V_PC] + 5) >>> 0
          tmp = REG[operandA]; tmp2 = operandB
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[tmp+off]|(MEM[tmp+off+1]<<8)|(MEM[tmp+off+2]<<16)|(MEM[tmp+off+3]<<24))>>>0
            const vb = (MEM[tmp2+off]|(MEM[tmp2+off+1]<<8)|(MEM[tmp2+off+2]<<16)|(MEM[tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[tmp+off]=res&0xFF; MEM[tmp+off+1]=(res>>8)&0xFF; MEM[tmp+off+2]=(res>>16)&0xFF; MEM[tmp+off+3]=(res>>24)&0xFF
          }
        }
      },
      nr() {
        if (!KERNEL_MODE) {
          if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          absAddr  = REG[V_BASE] + REG[V_PC]
          operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
          operandB = MEM[absAddr+4]
          REG[V_PC] = (REG[V_PC] + 5) >>> 0
          if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          tmp = operandA; tmp2 = REG[operandB]
          if (tmp + 15 >= PROGRAM_SIZE || tmp2 + 15 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[REG[V_BASE]+tmp+off]|(MEM[REG[V_BASE]+tmp+off+1]<<8)|(MEM[REG[V_BASE]+tmp+off+2]<<16)|(MEM[REG[V_BASE]+tmp+off+3]<<24))>>>0
            const vb = (MEM[REG[V_BASE]+tmp2+off]|(MEM[REG[V_BASE]+tmp2+off+1]<<8)|(MEM[REG[V_BASE]+tmp2+off+2]<<16)|(MEM[REG[V_BASE]+tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[REG[V_BASE]+tmp+off]=res&0xFF; MEM[REG[V_BASE]+tmp+off+1]=(res>>8)&0xFF; MEM[REG[V_BASE]+tmp+off+2]=(res>>16)&0xFF; MEM[REG[V_BASE]+tmp+off+3]=(res>>24)&0xFF
          }
        } else {
          absAddr  = REG[V_PC]
          operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
          operandB = MEM[absAddr+4]
          REG[V_PC] = (REG[V_PC] + 5) >>> 0
          tmp = operandA; tmp2 = REG[operandB]
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[tmp+off]|(MEM[tmp+off+1]<<8)|(MEM[tmp+off+2]<<16)|(MEM[tmp+off+3]<<24))>>>0
            const vb = (MEM[tmp2+off]|(MEM[tmp2+off+1]<<8)|(MEM[tmp2+off+2]<<16)|(MEM[tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[tmp+off]=res&0xFF; MEM[tmp+off+1]=(res>>8)&0xFF; MEM[tmp+off+2]=(res>>16)&0xFF; MEM[tmp+off+3]=(res>>24)&0xFF
          }
        }
      },
      nn() {
        if (!KERNEL_MODE) {
          if (REG[V_PC] + 7 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          absAddr  = REG[V_BASE] + REG[V_PC]
          operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
          operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
          REG[V_PC] = (REG[V_PC] + 8) >>> 0
          tmp = operandA; tmp2 = operandB
          if (tmp + 15 >= PROGRAM_SIZE || tmp2 + 15 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[REG[V_BASE]+tmp+off]|(MEM[REG[V_BASE]+tmp+off+1]<<8)|(MEM[REG[V_BASE]+tmp+off+2]<<16)|(MEM[REG[V_BASE]+tmp+off+3]<<24))>>>0
            const vb = (MEM[REG[V_BASE]+tmp2+off]|(MEM[REG[V_BASE]+tmp2+off+1]<<8)|(MEM[REG[V_BASE]+tmp2+off+2]<<16)|(MEM[REG[V_BASE]+tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[REG[V_BASE]+tmp+off]=res&0xFF; MEM[REG[V_BASE]+tmp+off+1]=(res>>8)&0xFF; MEM[REG[V_BASE]+tmp+off+2]=(res>>16)&0xFF; MEM[REG[V_BASE]+tmp+off+3]=(res>>24)&0xFF
          }
        } else {
          absAddr  = REG[V_PC]
          operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
          operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
          REG[V_PC] = (REG[V_PC] + 8) >>> 0
          tmp = operandA; tmp2 = operandB
          for (i = 0; i < 4; i++) {
            const off = i*4
            const va = (MEM[tmp+off]|(MEM[tmp+off+1]<<8)|(MEM[tmp+off+2]<<16)|(MEM[tmp+off+3]<<24))>>>0
            const vb = (MEM[tmp2+off]|(MEM[tmp2+off+1]<<8)|(MEM[tmp2+off+2]<<16)|(MEM[tmp2+off+3]<<24))>>>0
            const res = op(va, vb)
            MEM[tmp+off]=res&0xFF; MEM[tmp+off+1]=(res>>8)&0xFF; MEM[tmp+off+2]=(res>>16)&0xFF; MEM[tmp+off+3]=(res>>24)&0xFF
          }
        }
      }
    }
  }

  const addOps = simd4((a, b) => (a + b) >>> 0)
  const subOps = simd4((a, b) => (a - b) >>> 0)

  DISPATCH[addx4_r_r] = function() { addOps.rr() }
  DISPATCH[addx4_r_n] = function() { addOps.rn() }
  DISPATCH[addx4_n_r] = function() { addOps.nr() }
  DISPATCH[addx4_n_n] = function() { addOps.nn() }
  DISPATCH[subx4_r_r] = function() { subOps.rr() }
  DISPATCH[subx4_r_n] = function() { subOps.rn() }
  DISPATCH[subx4_n_r] = function() { subOps.nr() }
  DISPATCH[subx4_n_n] = function() { subOps.nn() }

  // ═════════════════════════════════════════════════════════════════════════
  // max / min (0x50..0x57)
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[max_r_r] = function h_max_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandB] > REG[operandA]) REG[operandA] = REG[operandB]
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (REG[operandB] > REG[operandA]) REG[operandA] = REG[operandB]
    }
  }

  DISPATCH[max_r_n] = function h_max_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB > REG[operandA]) REG[operandA] = operandB
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB > REG[operandA]) REG[operandA] = operandB
    }
  }

  DISPATCH[max_n_r] = function h_max_nr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandA > REG[operandB]) REG[operandB] = operandA
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA > REG[operandB]) REG[operandB] = operandA
    }
  }

  DISPATCH[max_n_n] = function h_max_nn() {
    REG[V_PC] = (REG[V_PC] + 8) >>> 0  // نتيجة تُهمل
  }

  DISPATCH[min_r_r] = function h_min_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (REG[operandB] < REG[operandA]) REG[operandA] = REG[operandB]
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (REG[operandB] < REG[operandA]) REG[operandA] = REG[operandB]
    }
  }

  DISPATCH[min_r_n] = function h_min_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB < REG[operandA]) REG[operandA] = operandB
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB < REG[operandA]) REG[operandA] = operandB
    }
  }

  DISPATCH[min_n_r] = function h_min_nr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandA < REG[operandB]) REG[operandB] = operandA
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA < REG[operandB]) REG[operandB] = operandA
    }
  }

  DISPATCH[min_n_n] = function h_min_nn() {
    REG[V_PC] = (REG[V_PC] + 8) >>> 0  // نتيجة تُهمل
  }

  // ═════════════════════════════════════════════════════════════════════════
  // rec (0x58..0x59)
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[rec_r] = function h_rec_r() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      REG[V_PC] = (REG[V_PC] + 1) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[V_RET] = REG[V_PC]
      REG[V_MES] = REG[operandA]
      KERNEL_MODE = true
      REG[V_PC]  = REG[V_DIRECTING_PROVINCE]
    } else {
      REG[V_MES] = BAD_OP
    }
  }

  DISPATCH[rec_n] = function h_rec_n() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 4) >>> 0
      REG[V_RET] = REG[V_PC]
      REG[V_MES] = operandA
      KERNEL_MODE = true
      REG[V_PC]  = REG[V_DIRECTING_PROVINCE]
    } else {
      REG[V_MES] = BAD_OP
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Load (0x60..0x65)  — ldb / ldh / ldw
  // ملاحظة: أكواد constants.js هي المرجع
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[ldb_r_r] = function h_ldb_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = MEM[REG[V_BASE] + tmp]
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      REG[operandA] = MEM[REG[operandB]]
    }
  }

  DISPATCH[ldb_r_n] = function h_ldb_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      REG[operandA] = MEM[REG[V_BASE] + operandB]
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = MEM[operandB]
    }
  }

  DISPATCH[ldh_r_r] = function h_ldh_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp2 = REG[V_BASE] + tmp
      REG[operandA] = (MEM[tmp2] | (MEM[tmp2+1] << 8)) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = REG[operandB]
      REG[operandA] = (MEM[tmp] | (MEM[tmp+1] << 8)) >>> 0
    }
  }

  DISPATCH[ldh_r_n] = function h_ldh_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + operandB
      REG[operandA] = (MEM[tmp] | (MEM[tmp+1] << 8)) >>> 0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = (MEM[operandB] | (MEM[operandB+1] << 8)) >>> 0
    }
  }

  DISPATCH[ldw_r_r] = function h_ldw_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp2 = REG[V_BASE] + tmp
      REG[operandA] = (MEM[tmp2]|(MEM[tmp2+1]<<8)|(MEM[tmp2+2]<<16)|(MEM[tmp2+3]<<24))>>>0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp = REG[operandB]
      REG[operandA] = (MEM[tmp]|(MEM[tmp+1]<<8)|(MEM[tmp+2]<<16)|(MEM[tmp+3]<<24))>>>0
    }
  }

  DISPATCH[ldw_r_n] = function h_ldw_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + operandB
      REG[operandA] = (MEM[tmp]|(MEM[tmp+1]<<8)|(MEM[tmp+2]<<16)|(MEM[tmp+3]<<24))>>>0
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      REG[operandA] = (MEM[operandB]|(MEM[operandB+1]<<8)|(MEM[operandB+2]<<16)|(MEM[operandB+3]<<24))>>>0
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Store (0x66..0x71) — stb / sth / stw
  // ═════════════════════════════════════════════════════════════════════════

  DISPATCH[stb_r_r] = function h_stb_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      MEM[REG[V_BASE] + tmp] = REG[operandA] & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      MEM[REG[operandB]] = REG[operandA] & 0xFF
    }
  }

  DISPATCH[stb_r_n] = function h_stb_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      MEM[REG[V_BASE] + operandB] = REG[operandA] & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      MEM[operandB] = REG[operandA] & 0xFF
    }
  }

  DISPATCH[stb_n_r] = function h_stb_nr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      MEM[REG[V_BASE] + tmp] = operandA & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      MEM[REG[operandB]] = operandA & 0xFF
    }
  }

  DISPATCH[stb_n_n] = function h_stb_nn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 7 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      if (operandB >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      MEM[REG[V_BASE] + operandB] = operandA & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      MEM[operandB] = operandA & 0xFF
    }
  }

  DISPATCH[sth_r_r] = function h_sth_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp2 = REG[operandA]
      tmp  = REG[V_BASE] + tmp
      MEM[tmp]   =  tmp2        & 0xFF
      MEM[tmp+1] = (tmp2 >>  8) & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp  = REG[operandB]; tmp2 = REG[operandA]
      MEM[tmp]   =  tmp2        & 0xFF
      MEM[tmp+1] = (tmp2 >>  8) & 0xFF
    }
  }

  DISPATCH[sth_r_n] = function h_sth_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp  = REG[V_BASE] + operandB
      tmp2 = REG[operandA]
      MEM[tmp]   =  tmp2        & 0xFF
      MEM[tmp+1] = (tmp2 >>  8) & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp2 = REG[operandA]
      MEM[operandB]   =  tmp2        & 0xFF
      MEM[operandB+1] = (tmp2 >>  8) & 0xFF
    }
  }

  DISPATCH[sth_n_r] = function h_sth_nr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + tmp
      MEM[tmp]   =  operandA        & 0xFF
      MEM[tmp+1] = (operandA >>  8) & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = REG[operandB]
      MEM[tmp]   =  operandA        & 0xFF
      MEM[tmp+1] = (operandA >>  8) & 0xFF
    }
  }

  DISPATCH[sth_n_n] = function h_sth_nn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 7 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      if (operandB + 1 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + operandB
      MEM[tmp]   =  operandA        & 0xFF
      MEM[tmp+1] = (operandA >>  8) & 0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      MEM[operandB]   =  operandA        & 0xFF
      MEM[operandB+1] = (operandA >>  8) & 0xFF
    }
  }

  DISPATCH[stw_r_r] = function h_stw_rr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 2 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      if (operandA >= KERNEL_REG_BASE || operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp2 = REG[operandA]
      tmp  = REG[V_BASE] + tmp
      MEM[tmp]   =  tmp2        & 0xFF; MEM[tmp+1] = (tmp2>>8)&0xFF
      MEM[tmp+2] = (tmp2>>16)&0xFF;     MEM[tmp+3] = (tmp2>>24)&0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]; operandB = MEM[absAddr+1]
      REG[V_PC] = (REG[V_PC] + 2) >>> 0
      tmp  = REG[operandB]; tmp2 = REG[operandA]
      MEM[tmp]   =  tmp2        & 0xFF; MEM[tmp+1] = (tmp2>>8)&0xFF
      MEM[tmp+2] = (tmp2>>16)&0xFF;     MEM[tmp+3] = (tmp2>>24)&0xFF
    }
  }

  DISPATCH[stw_r_n] = function h_stw_rn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 5 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandA >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      if (operandB + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp  = REG[V_BASE] + operandB
      tmp2 = REG[operandA]
      MEM[tmp]   =  tmp2        & 0xFF; MEM[tmp+1] = (tmp2>>8)&0xFF
      MEM[tmp+2] = (tmp2>>16)&0xFF;     MEM[tmp+3] = (tmp2>>24)&0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = MEM[absAddr]
      operandB = (MEM[absAddr+1]|(MEM[absAddr+2]<<8)|(MEM[absAddr+3]<<16)|(MEM[absAddr+4]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp2 = REG[operandA]
      MEM[operandB]   =  tmp2        & 0xFF; MEM[operandB+1] = (tmp2>>8)&0xFF
      MEM[operandB+2] = (tmp2>>16)&0xFF;     MEM[operandB+3] = (tmp2>>24)&0xFF
    }
  }

  DISPATCH[stw_n_r] = function h_stw_nr() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 4 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      if (operandB >= KERNEL_REG_BASE) { REG[V_MES]=PRIVE; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[operandB]
      if (tmp + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + tmp
      MEM[tmp]   =  operandA        & 0xFF; MEM[tmp+1] = (operandA>>8)&0xFF
      MEM[tmp+2] = (operandA>>16)&0xFF;     MEM[tmp+3] = (operandA>>24)&0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]|(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = MEM[absAddr+4]
      REG[V_PC] = (REG[V_PC] + 5) >>> 0
      tmp = REG[operandB]
      MEM[tmp]   =  operandA        & 0xFF; MEM[tmp+1] = (operandA>>8)&0xFF
      MEM[tmp+2] = (operandA>>16)&0xFF;     MEM[tmp+3] = (operandA>>24)&0xFF
    }
  }

  DISPATCH[stw_n_n] = function h_stw_nn() {
    if (!KERNEL_MODE) {
      if (REG[V_PC] + 7 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      absAddr  = REG[V_BASE] + REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      if (operandB + 3 >= PROGRAM_SIZE) { REG[V_MES]=OVER_MEM; REG[V_RET]=REG[V_PC]; KERNEL_MODE=true; REG[V_PC]=REG[V_DIRECTING_PROVINCE]; return }
      tmp = REG[V_BASE] + operandB
      MEM[tmp]   =  operandA        & 0xFF; MEM[tmp+1] = (operandA>>8)&0xFF
      MEM[tmp+2] = (operandA>>16)&0xFF;     MEM[tmp+3] = (operandA>>24)&0xFF
    } else {
      absAddr  = REG[V_PC]
      operandA = (MEM[absAddr]  |(MEM[absAddr+1]<<8)|(MEM[absAddr+2]<<16)|(MEM[absAddr+3]<<24))>>>0
      operandB = (MEM[absAddr+4]|(MEM[absAddr+5]<<8)|(MEM[absAddr+6]<<16)|(MEM[absAddr+7]<<24))>>>0
      REG[V_PC] = (REG[V_PC] + 8) >>> 0
      MEM[operandB]   =  operandA        & 0xFF; MEM[operandB+1] = (operandA>>8)&0xFF
      MEM[operandB+2] = (operandA>>16)&0xFF;     MEM[operandB+3] = (operandA>>24)&0xFF
    }
  }


  // ═════════════════════════════════════════════════════════════════════════
  // حلقة التنفيذ الرئيسية
  // ═════════════════════════════════════════════════════════════════════════

  let target  = 1
  let handler = null

  function startExecution(maxLevelClock) {
    while (true) {

    /*  if (maxLevelClock && REG[CLOCK] >= maxLevelClock * target) {
        target++
        break
      }*/

      // ── نبضة الساعة ───────────────────────────────────────────────────
      REG[CLOCK] = (REG[CLOCK] + 1) >>> 0
      if (!KERNEL_MODE) REG[V_CLOCK_COUNTER] = (REG[V_CLOCK_COUNTER] + 1) >>> 0

      if (!KERNEL_MODE && REG[V_CLOCK_COUNTER] >= maxBreak) {
        REG[V_CLOCK_COUNTER] = 0
        REG[V_MES]  = TIME_CLIK
        REG[V_RET]  = REG[V_PC]
        KERNEL_MODE = true
        REG[V_PC]   = REG[V_DIRECTING_PROVINCE]
        continue
      }

      // ── FETCH ─────────────────────────────────────────────────────────
      let opcode
      if (KERNEL_MODE) {
        opcode     = MEM[REG[V_PC]]
        REG[V_PC]  = (REG[V_PC] + 1) >>> 0
      } else {
        if (REG[V_PC] >= PROGRAM_SIZE) {
          REG[V_MES]  = OVER_MEM
          REG[V_RET]  = REG[V_PC]
          KERNEL_MODE = true
          REG[V_PC]   = REG[V_DIRECTING_PROVINCE]
          continue
        }
        opcode     = MEM[REG[V_BASE] + REG[V_PC]]
        REG[V_PC]  = (REG[V_PC] + 1) >>> 0
      }

      // ── DISPATCH ──────────────────────────────────────────────────────
      handler = DISPATCH[opcode]
      if (handler !== null) {
        if (handler()) break   // HTL أوقف الآلة
      } else {
        REG[V_MES]  = BAD_OP
        REG[V_RET]  = KERNEL_MODE ? REG[V_PC] : (REG[V_BASE] + REG[V_PC])
        KERNEL_MODE = true
        REG[V_PC]   = REG[V_DIRECTING_PROVINCE]
      }

    }
  }

  return {
    startExecution,
    getInformation() { return { REG, MEM } },
    even(numindx, value) {
      REG[V_RET]    = REG[V_PC]
      REG[V_MES]    = INPUT
      REG[V_PC]     = 0
      REG[V_VALINP] = value
      REG[V_IDXINP] = Math.max(0, Math.min(numindx, 1023))  // ✓ إصلاح المنطق المقلوب
      KERNEL_MODE   = true
    }
  }

}
