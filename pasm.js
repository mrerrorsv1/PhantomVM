
// ═══════════════════════════════════════════════════════════════════════════
// pasm.js — Phantom Assembler v4 (With skip(n) support)
// النظام الجديد (New System):
//   • كل ملف يعلن اسمه (Module declaration) : .module name
//   • يعلن تضمينات (Includes declaration)   : .includes( "a.asm", "b.asm" )
//   • يعلن نقطة دخول (Entry point)          : .entryPoint labelName
//   • $name  → label (مرجع/علامة)
//   • name   → macro (يُعرَّف بـ .macro / .endmacro)
//   • .const NAME expr    → ثابت رقمي خالص (لا يُوسَّع كـ macro) | Numeric constant
//   • .alias NAME regName → اسم بديل لسجل (مثال: .alias PC v63) | Register alias
//   • دعم skip(n) داخل مصفوفات البيانات لحجز مساحات فارغة (أصفار)
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 1. REGISTER CONSTANTS | ثوابت السجلات
// ───────────────────────────────────────────────────────────────────────────
const R_BASE          = 0            // قاعدة السجلات العامة (General Registers Base)
const V_BASE_IDX      = 192          // v0 → فهرس 192 (Kernel Registers Base Index)
const MAX_R           = 191          // أقصى رقم لسجل عام (Max General Register)
const MAX_V           = 63           // أقصى رقم لسجل نواة (Max Kernel Register)
const KERNEL_REG_BASE = 192          // للتحقق في وقت التشغيل (Runtime Kernel Reg Check)

// ───────────────────────────────────────────────────────────────────────────
// 2. OPCODE DISPATCH TABLE | جدول التعليمات الثنائية (Opcodes)
// Format: [Reg-Reg, Reg-Num, Num-Reg, Num-Num] depending on supported modes
// ───────────────────────────────────────────────────────────────────────────
const OP_TABLE = {
  add:   [0x07, 0x06, null, null],
  sub:   [0x09, 0x08, null, null],
  mul:   [0x0b, 0x0a, null, null],
  div:   [0x0d, 0x0c, null, null],
  mod:   [0x0f, 0x0e, null, null],
  cmp:   [0x12, 0x11, 0x13, 0x10],
  jmp:   [0x15, 0x14, null, null],
  call:  [0x17, 0x16, null, null],
  jeq:   [0x19, 0x18, null, null],
  jne:   [0x1b, 0x1a, null, null],
  jgt:   [0x1d, 0x1c, null, null],
  jlt:   [0x1f, 0x1e, null, null],
  ceq:   [0x21, 0x20, null, null],
  cne:   [0x23, 0x22, null, null],
  cgt:   [0x25, 0x24, null, null],
  clt:   [0x27, 0x26, null, null],
  and:   [0x2a, 0x29, null, null],
  eor:   [0x2c, 0x2b, null, null],
  xor:   [0x2e, 0x2d, null, null],
  mcc:   [0x33, 0x32, null, null],
  mov:   [0x36, 0x35, null, null],
  copy:  [0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f],
  fill:  [0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47],
  addx4: [0x48, 0x49, 0x4a, 0x4b],
  subx4: [0x4c, 0x4d, 0x4e, 0x4f],
  max:   [0x50, 0x51, 0x52, 0x53],
  min:   [0x54, 0x55, 0x56, 0x57],
  rec:   [0x58, 0x59, null, null],
  ldb:   [0x60, 0x61, null, null],
  ldh:   [0x62, 0x63, null, null],
  ldw:   [0x64, 0x65, null, null],
  stb:   [0x66, 0x67, 0x68, 0x69],
  sth:   [0x6a, 0x6b, 0x6c, 0x6d],
  stw:   [0x6e, 0x6f, 0x70, 0x71],
  shl:   [0x73, 0x72, null, null],
  shr:   [0x75, 0x74, null, null],
  fico:  [0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d],
}

// ───────────────────────────────────────────────────────────────────────────
// 3. BINARY UTILITIES | أدوات مساعدة للكتابة الثنائية (Little-Endian)
// ───────────────────────────────────────────────────────────────────────────

/** Write a 32-bit integer to the array | كتابة عدد صحيح 32-بت في المصفوفة */
function write32(arr, value) {
  const v = value >>> 0
  arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff)
}

/** Write a 16-bit integer to the array | كتابة عدد صحيح 16-بت في المصفوفة */
function write16(arr, value) {
  const v = value >>> 0
  arr.push(v & 0xff, (v >> 8) & 0xff)
}

/** Parse literal numbers (hex or decimal) | تحليل الأرقام المباشرة (ست عشري أو عشري) */
function parseNum(s) {
  s = s.trim()
  if (/^0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16)
  if (/^-?\d+$/.test(s))             return parseInt(s, 10)
  return null
}

/** Check if token is a valid register (r0..r191 or v0..v63) | هل التوكن سجل صحيح؟ */
function isReg(s) {
  if (!s) return false
  s = s.trim()
  if (s.length < 2) return false
  const p = s[0].toLowerCase()
  if (p !== 'r' && p !== 'v') return false
  const n = parseInt(s.slice(1), 10)
  if (isNaN(n)) return false
  if (p === 'r') return n >= 0 && n <= MAX_R
  return n >= 0 && n <= MAX_V
}

/** Convert register name to its absolute index | تحويل اسم السجل إلى فهرسه الرقمي المطلق */
function regNum(s) {
  s = s.trim()
  const p = s[0].toLowerCase()
  const n = parseInt(s.slice(1), 10)
  if (p === 'r') {
    if (n < 0 || n > MAX_R) throw new Error(`سجل خارج المدى (Register out of bounds): "${s}"`)
    return R_BASE + n
  }
  if (p === 'v') {
    if (n < 0 || n > MAX_V) throw new Error(`سجل خارج المدى (Register out of bounds): "${s}"`)
    return V_BASE_IDX + n
  }
  throw new Error(`بادئة سجل غير معروفة (Unknown register prefix): "${s}"`)
}

// ───────────────────────────────────────────────────────────────────────────
// 4. EXPRESSION EVALUATOR (MATH & LABELS) | تحليل وتقييم التعابير الحسابية والعلامات
// ───────────────────────────────────────────────────────────────────────────

/**
 * Tokenize math expressions into logic blocks.
 * يقسم التعبير الرياضي إلى قائمة عناصر (أرقام، علامات، عمليات، أقواس).
 */
function tokenizeExpr(expr) {
  const tokens = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ' || c === '\t') { i++; continue }
    if (c === '(') { tokens.push({ t: 'lparen' }); i++; continue }
    if (c === ')') { tokens.push({ t: 'rparen' }); i++; continue }
    if ('+-*/%'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue }
    
    // Hex number | رقم ست عشري
    if (c === '0' && expr[i+1] && expr[i+1].toLowerCase() === 'x') {
      let j = i + 2
      while (j < expr.length && /[0-9a-fA-F]/.test(expr[j])) j++
      tokens.push({ t: 'num', v: parseInt(expr.slice(i, j), 16) })
      i = j; continue
    }
    
    // Decimal number (handles unary minus) | رقم عشري (مع دعم السالب)
    if (/[0-9]/.test(c) || (c === '-' && tokens.length === 0)) {
      let j = i + 1
      while (j < expr.length && /[0-9]/.test(expr[j])) j++
      tokens.push({ t: 'num', v: parseInt(expr.slice(i, j), 10) })
      i = j; continue
    }
    
    // Label parsing (starts with $ or letter) | تحليل العلامات (تبدأ بـ $ أو حرف)
    if (c === '$' || /[a-zA-Z_]/.test(c)) {
      let j = i + 1
      while (j < expr.length && /[a-zA-Z0-9_$]/.test(expr[j])) j++
      tokens.push({ t: 'label', v: expr.slice(i, j) })
      i = j; continue
    }
    throw new Error(`محرف غير متوقع في التعبير (Unexpected character in expression): "${c}" in "${expr}"`)
  }
  return tokens
}

/**
 * Recursive-descent parser to evaluate math expressions.
 * مُحلل رياضي تراجعي لتقييم التعابير (دعم الأقواس والعمليات الحسابية).
 */
function evalExpr(expr, labels) {
  expr = expr.trim()
  if (!expr) return null
  let tokens
  try { tokens = tokenizeExpr(expr) }
  catch { return null }
  let pos = 0

  function peek()    { return tokens[pos] }
  function consume() { return tokens[pos++] }

  function parsePrimary() {
    const tok = peek()
    if (!tok) throw new Error(`تعبير منقوص (Incomplete expression): "${expr}"`)
    if (tok.t === 'lparen') {
      consume()
      const v = parseAddSub()
      if (!peek() || peek().t !== 'rparen')
        throw new Error(`قوس إغلاق مفقود (Missing closing parenthesis): "${expr}"`)
      consume()
      return v
    }
    if (tok.t === 'num')   { consume(); return tok.v >>> 0 }
    if (tok.t === 'label') {
      consume()
      const name = tok.v
      if (labels && Object.prototype.hasOwnProperty.call(labels, name))
        return labels[name] >>> 0
      throw new Error(`label غير معرّف (Undefined label): "${name}"`)
    }
    // Unary minus | علامة السالب الفردية
    if (tok.t === 'op' && tok.v === '-') {
      consume()
      return (-(parsePrimary())) >>> 0
    }
    throw new Error(`token غير متوقع (Unexpected token): ${JSON.stringify(tok)} in "${expr}"`)
  }

  function parseMulDiv() {
    let left = parsePrimary()
    while (peek() && peek().t === 'op' && '*/%'.includes(peek().v)) {
      const op = consume().v
      const right = parsePrimary()
      if (op === '*') left = Math.imul(left, right) >>> 0
      else if (op === '/') {
        if (right === 0) throw new Error('قسمة على صفر في التعبير (Division by zero in expression)')
        left = ((left | 0) / (right | 0)) >>> 0
      }
      else left = ((left | 0) % (right | 0)) >>> 0
    }
    return left
  }

  function parseAddSub() {
    let left = parseMulDiv()
    while (peek() && peek().t === 'op' && '+-'.includes(peek().v)) {
      const op = consume().v
      const right = parseMulDiv()
      left = op === '+' ? (left + right) >>> 0 : (left - right) >>> 0
    }
    return left
  }

  try {
    const result = parseAddSub()
    if (pos !== tokens.length)
      throw new Error(`جزء غير محلَّل في التعبير (Unparsed part of expression): "${expr}"`)
    return result
  } catch (e) {
    if (e.message.includes('غير معرّف')) throw e   // Forward reference -> Let it bubble up
    return null
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 5. INSTRUCTION PARSING & SIZING (PASS 1 HELPERS) | تحليل وتقدير حجم التعليمات
// ───────────────────────────────────────────────────────────────────────────

/** Split an assembly line into [mnemonic, arg1, arg2...] | تقسيم سطر الأسمبلي */
function tokenizeLine(line) {
  const ci = line.indexOf(';') // Remove comments | إزالة التعليقات
  if (ci !== -1) line = line.slice(0, ci)
  line = line.trim()
  if (!line) return []
  
  const si = line.search(/[\s,]/)
  if (si === -1) return [line]
  const mnemonic = line.slice(0, si)
  const args     = line.slice(si).split(/[\s,]+/).filter(Boolean)
  return [mnemonic, ...args]
}

/** * Estimate byte size of a single instruction (Pass 1).
 * تقدير حجم التعليمة الواحدة بالبايت لحساب العناوين في المرور الأول.
 */
function estimateSize(line, aliases = {}) {
  const tokens = tokenizeLine(line)
  if (!tokens.length) return 0
  const op  = tokens[0].toLowerCase()
  const args = tokens.slice(1)
  
  // Resolve alias then check if Register | استبدال الأسماء البديلة وفحص السجل
  const R = (i) => {
    const t = args[i] ?? ''
    return isReg(aliases[t] ?? t)
  }

  switch (op) {
    case 'hlt': case 'ret': case 'dup': case 'pop':
    case 'sysret': case 'vcc': case 'clc': return 1

    case 'not':
    case 'rec': case 'mcc':
    case 'jmp': case 'call':
    case 'jeq': case 'jne': case 'jgt': case 'jlt':
    case 'ceq': case 'cne': case 'cgt': case 'clt':
      return R(0) ? 2 : 5

    case 'syscall': return 5
    case 'push':    return R(0) ? 2 : 5
    case 'pop_r':   return 2

    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'and': case 'eor': case 'xor': case 'mov':
    case 'ldb': case 'ldh': case 'ldw':
    case 'shr': case 'shl':
      return (R(0) && R(1)) ? 3 : 6

    case 'stb': case 'sth': case 'stw':
    case 'cmp': {
      const [s0, s1] = [R(0), R(1)]
      return (s0 && s1) ? 3 : (s0 || s1) ? 6 : 9
    }

    case 'copy': case 'fill': case 'fico': {
      let s = 1
      s += R(0) ? 1 : 4; s += R(1) ? 1 : 4; s += R(2) ? 1 : 4
      return s
    }

    case 'addx4': case 'subx4': case 'max': case 'min': {
      let s = 1
      s += R(0) ? 1 : 4; s += R(1) ? 1 : 4
      return s
    }

    default: return 1
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6. FORWARD REFERENCES (PATCHING) | ترقيع العناوين المؤجلة (المرجعيات المستقبلية)
// ───────────────────────────────────────────────────────────────────────────

/** Apply unresolved labels to the generated binary | تطبيق العناوين المؤجلة على البايتات */
function applyPatches(bytes, patches, labels) {
  for (const { offset, expr } of patches) {
    let val
    try { val = evalExpr(expr, labels) }
    catch (e) { throw new Error(`label غير معرّف (Undefined label): "${expr}" — ${e.message}`) }
    
    if (val === null) throw new Error(`label غير معرّف (Undefined label): "${expr}"`)
    const v = val >>> 0
    bytes[offset]     =  v        & 0xff
    bytes[offset + 1] = (v >>  8) & 0xff
    bytes[offset + 2] = (v >> 16) & 0xff
    bytes[offset + 3] = (v >> 24) & 0xff
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 7. BYTE EMISSION (PASS 2) | التوليد الثنائي للتعليمات (المرور الثاني)
// ───────────────────────────────────────────────────────────────────────────

/** Generate binary opcodes and operands for one instruction | توليد بايتات لتعليمة واحدة */
function emitInstruction(line, bytes, aliases, labels, patches) {
  const tokens = tokenizeLine(line)
  if (!tokens.length) return
  const op   = tokens[0].toLowerCase()
  const args  = tokens.slice(1)

  /** Emit a 32-bit immediate or queue a patch | إصدار قيمة مباشرة 32-بت أو تسجيلها كترقيع */
  function emitN(token) {
    token = token.trim()
    let val
    try { val = evalExpr(token, labels) }
    catch { val = null }
    if (val !== null) { write32(bytes, val); return }
    patches.push({ offset: bytes.length, expr: token })
    write32(bytes, 0)
  }

  /** Parse operand type (Register or Number/ForwardRef) | تحليل نوع المعامل */
  function getOp(token) {
    if (!token) throw new Error(`${op}: معامل مفقود (Missing operand)`)
    token = token.trim()
    // Resolve alias first | حل الأسماء البديلة أولاً
    const resolved = aliases[token] ?? token
    if (isReg(resolved)) return { type: 'R', value: regNum(resolved) }
    let val
    try { val = evalExpr(token, labels) }
    catch { val = null }
    if (val !== null) return { type: 'N', value: val }
    return { type: 'N', value: 0, fwd: true, expr: token }
  }

  /** Write operand to binary | كتابة المعامل للذاكرة الثنائية */
  function emitOp(x) {
    if (x.type === 'R') { bytes.push(x.value); return }
    if (x.fwd) { patches.push({ offset: bytes.length, expr: x.expr }); write32(bytes, 0) }
    else write32(bytes, x.value)
  }

  // Operation specific code generation | التوليد المخصص لكل عملية
  switch (op) {
    case 'hlt':    bytes.push(0x00); return
    case 'pop':    bytes.push(0x03); return
    case 'dup':    bytes.push(0x05); return
    case 'clc':    bytes.push(0x28); return
    case 'sysret': bytes.push(0x31); return
    case 'vcc':    bytes.push(0x34); return
    case 'ret':    bytes.push(0x37); return

    case 'push': {
      const a = getOp(args[0])
      if (a.type === 'R') bytes.push(0x02, a.value)
      else { bytes.push(0x01); emitOp(a) }
      return
    }

    case 'pop_r': {
      const a = getOp(args[0])
      if (a.type !== 'R') throw new Error('pop_r: يتطلب سجلاً (Requires a register)')
      bytes.push(0x04, a.value); return
    }

    case 'not': {
      const a = getOp(args[0])
      if (a.type !== 'R') throw new Error('not: يتطلب سجلاً (Requires a register)')
      bytes.push(0x2f, a.value); return
    }

    case 'syscall': {
      bytes.push(0x30); emitN(args[0] ?? '0'); return
    }

    case 'rec': case 'mcc':
    case 'jmp': case 'call':
    case 'jeq': case 'jne': case 'jgt': case 'jlt':
    case 'ceq': case 'cne': case 'cgt': case 'clt': {
      const table = OP_TABLE[op]
      const a = getOp(args[0])
      if (a.type === 'R') bytes.push(table[0], a.value)
      else { bytes.push(table[1]); emitOp(a) }
      return
    }

    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'and': case 'eor': case 'xor': case 'mov':
    case 'shl': case 'shr': {
      const table = OP_TABLE[op]
      const a = getOp(args[0]), b = getOp(args[1])
      if (a.type !== 'R') throw new Error(`${op}: المعامل الأول يجب أن يكون سجلاً (First operand must be register)`)
      if (b.type === 'R') bytes.push(table[0], a.value, b.value)
      else { bytes.push(table[1], a.value); emitOp(b) }
      return
    }

    case 'cmp': {
      const table = OP_TABLE['cmp']
      const a = getOp(args[0]), b = getOp(args[1])
      if      (a.type==='R' && b.type==='R') bytes.push(table[0], a.value, b.value)
      else if (a.type==='R' && b.type==='N') { bytes.push(table[1], a.value); emitOp(b) }
      else if (a.type==='N' && b.type==='R') { bytes.push(table[2]); emitOp(a); bytes.push(b.value) }
      else                                   { bytes.push(table[3]); emitOp(a); emitOp(b) }
      return
    }

    case 'ldb': case 'ldh': case 'ldw': {
      const table = OP_TABLE[op]
      const dst = getOp(args[0]), src = getOp(args[1])
      if (dst.type !== 'R') throw new Error(`${op}: الوجهة يجب أن تكون سجلاً (Destination must be register)`)
      if (src.type === 'R') bytes.push(table[0], dst.value, src.value)
      else { bytes.push(table[1], dst.value); emitOp(src) }
      return
    }

    case 'stb': case 'sth': case 'stw': {
      const table = OP_TABLE[op]
      const src = getOp(args[0]), addr = getOp(args[1])
      if      (src.type==='R' && addr.type==='R') bytes.push(table[0], src.value, addr.value)
      else if (src.type==='R' && addr.type==='N') { bytes.push(table[1], src.value); emitOp(addr) }
      else if (src.type==='N' && addr.type==='R') { bytes.push(table[2]); emitOp(src); bytes.push(addr.value) }
      else                                         { bytes.push(table[3]); emitOp(src); emitOp(addr) }
      return
    }

    case 'copy': case 'fill': case 'fico': {
      const table = OP_TABLE[op]
      const a = getOp(args[0]), b = getOp(args[1]), c = getOp(args[2])
      const idx = (a.type==='N'?4:0) | (b.type==='N'?2:0) | (c.type==='N'?1:0)
      bytes.push(table[idx]); emitOp(a); emitOp(b); emitOp(c)
      return
    }

    case 'addx4': case 'subx4': case 'max': case 'min': {
      const table = OP_TABLE[op]
      const a = getOp(args[0]), b = getOp(args[1])
      const idx = (a.type==='N'?2:0) | (b.type==='N'?1:0)
      bytes.push(table[idx]); emitOp(a); emitOp(b)
      return
    }

    default:
      throw new Error(`تعليمة غير معروفة (Unknown Instruction): "${op}"`)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 8. MACRO SYSTEM | نظام وتوسيع الماكرو
// .macro NAME(p1, p2, ...)
//   ... body ...
// .endmacro
// ───────────────────────────────────────────────────────────────────────────

let macroCounter = 0 // لضمان فرادة العلامات الداخلية (Unique internal labels)

/** Expand a macro call inline | توسيع الماكرو في مكان استدعائه */
function expandMacro(macro, callArgs) {
  const id = macroCounter++
  return macro.lines.map(line => {
    // 1. استبدال المعاملات بالقيم الفعلية (Substitute parameters token-by-token)
    let out = substituteParams(line, macro.params, callArgs)
    // 2. إعادة تسمية العلامات الداخلية (Rename local labels uniquely)
    for (const lbl of macro.localLabels) {
      out = renameLabel(out, lbl, `${lbl}__m${id}`)
    }
    return out
  })
}

/** Substitute macro arguments into lines | استبدال متغيرات الماكرو بقيمها الممررة */
function substituteParams(line, params, values) {
  if (!params.length) return line
  const ci = line.indexOf(';')
  const code    = ci !== -1 ? line.slice(0, ci) : line
  const comment = ci !== -1 ? line.slice(ci)    : ''
  
  const result = code.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match) => {
    const idx = params.indexOf(match)
    return idx !== -1 ? (values[idx] ?? match) : match
  })
  return result + comment
}

/** Rename internal labels safely | إعادة تسمية آمنة للعلامات الداخلية داخل الماكرو */
function renameLabel(line, oldName, newName) {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return line.replace(new RegExp(`(?<![a-zA-Z0-9_$])${escaped}(?![a-zA-Z0-9_$])`, 'g'), newName)
}

// ───────────────────────────────────────────────────────────────────────────
// 9. LINE PARSER & CLASSIFIER | مُصنِّف ومعالج الأسطر الأساسي
// ───────────────────────────────────────────────────────────────────────────

/** Parses a raw ASM line into categorized objects | تصنيف كل سطر أسمبلي لنوعه البرمجي */
function classifyLine(raw) {
  let t = raw.trim()
  const ci = t.indexOf(';')
  if (ci !== -1) t = t.slice(0, ci).trim()
  if (!t) return { kind: 'empty' }

  // Directives | موجهات المجمع (أسماء، ثوابت، وتضمين)
  if (t.startsWith('.module '))     return { kind: 'directive_module',  name: t.slice(8).trim() }
  if (t.startsWith('.entryPoint ')) return { kind: 'directive_entry',   name: t.slice(12).trim() }
  if (t.startsWith('.includes('))   return { kind: 'directive_includes', text: t }
  
  // Constants definition | تعريف الثوابت
  if (t.startsWith('.const ')) {
    const m = t.match(/^\.const\s+(\w+)\s+(.+)$/)
    if (!m) throw new Error(`صيغة .const خاطئة (Invalid .const syntax): "${t}"`)
    return { kind: 'const', name: m[1], expr: m[2].trim() }
  }
  
  // Register aliases | الأسماء البديلة للسجلات
  if (t.startsWith('.alias ')) {
    const m = t.match(/^\.alias\s+(\w+)\s+(\w+)$/)
    if (!m) throw new Error(`صيغة .alias خاطئة (Invalid .alias syntax): "${t}"`)
    if (!isReg(m[2])) throw new Error(`.alias "${m[1]}": "${m[2]}" ليس سجلاً صالحاً (Not a valid register)`)
    return { kind: 'alias', name: m[1], reg: m[2] }
  }
  
  // Macro definition boundary | حدود تعريف الماكرو
  if (t === '.macro' || t.startsWith('.macro ')) {
    const m = t.match(/^\.macro\s+(\w+)(?:\(([^)]*)\))?$/)
    if (!m) throw new Error(`صيغة macro خاطئة (Invalid macro syntax): "${t}"`)
    const params = m[2] ? m[2].split(',').map(s => s.trim()).filter(Boolean) : []
    return { kind: 'macro_start', name: m[1], params }
  }
  if (t === '.endmacro') return { kind: 'macro_end' }

  // Raw data arrays | بيانات ذاكرة مباشرة
  if (t.startsWith('.db(')) return { kind: 'db', text: t }
  if (t.startsWith('.dh(')) return { kind: 'dh', text: t }
  if (t.startsWith('.dw(')) return { kind: 'dw', text: t }

  // Label detection | كشف العلامات (مؤشرات العناوين)
  const labelMatch = t.match(/^(\$\w+|\w+):(?:\s+(.+))?$/)
  if (labelMatch) {
    const name = labelMatch[1]
    const rest = labelMatch[2]?.trim() ?? null
    return rest
      ? { kind: 'label_inline', name, rest } // Label + Instruction on same line | علامة وتعليمة بنسق واحد
      : { kind: 'label',        name }       // Just Label | علامة فقط
  }

  // Normal instruction or Macro invocation | تعليمة عادية أو استدعاء لـ ماكرو
  return { kind: 'instr', text: t }
}

// ───────────────────────────────────────────────────────────────────────────
// 10. METADATA PARSER | استخراج بيانات الرأس من الملف الرئيسي
// ───────────────────────────────────────────────────────────────────────────

function parseHeader(lines) {
  let moduleName = null
  let entryPoint = null
  const includes = []

  for (const raw of lines) {
    const cl = classifyLine(raw)
    if (cl.kind === 'directive_module') {
      if (moduleName !== null) throw new Error(`تكرار .module في نفس الملف (Duplicate .module)`)
      moduleName = cl.name
    } else if (cl.kind === 'directive_entry') {
      if (entryPoint !== null) throw new Error(`تكرار .entryPoint في نفس الملف (Duplicate .entryPoint)`)
      entryPoint = cl.name
    } else if (cl.kind === 'directive_includes') {
      const inner = cl.text.slice(cl.text.indexOf('(') + 1, cl.text.lastIndexOf(')'))
      const paths = inner.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
      for (const p of paths) {
        if (includes.includes(p)) throw new Error(`include مكرر (Duplicate include): "${p}"`)
        includes.push(p)
      }
    }
  }

  return { moduleName, entryPoint, includes }
}

// ───────────────────────────────────────────────────────────────────────────
// 11. PREPROCESSOR (MACRO EVALUATION) | المُعالج المسبق لجمع وتوسيع الماكرو
// ───────────────────────────────────────────────────────────────────────────

function preprocessMacros(lines) {
  const macros = {}  
  const stripped = []
  let inMacro    = null   

  // Pass A: Collect Macro definitions | جمع تعريفات الماكرو
  for (const raw of lines) {
    let cl
    try { cl = classifyLine(raw) }
    catch (e) { throw new Error(`خطأ تحليل (Parse error): ${e.message} in: "${raw}"`) }

    if (cl.kind === 'macro_start') {
      if (inMacro) throw new Error(`.macro متداخل (Nested .macro): "${cl.name}" inside "${inMacro.name}"`)
      inMacro = { name: cl.name, params: cl.params, body: [] }
      continue
    }
    if (cl.kind === 'macro_end') {
      if (!inMacro) throw new Error(`.endmacro بدون .macro (Orphaned .endmacro)`)
      
      const localLabels = new Set()
      for (const line of inMacro.body) {
        const lm = line.trim().match(/^(\w+):/)
        if (lm) localLabels.add(lm[1])
      }
      macros[inMacro.name] = { params: inMacro.params, lines: inMacro.body, localLabels }
      inMacro = null
      continue
    }
    if (inMacro) {
      inMacro.body.push(raw)
    } else {
      stripped.push(raw)
    }
  }
  if (inMacro) throw new Error(`.macro "${inMacro.name}" لم يُغلق بـ .endmacro (Unclosed macro)`)

  // Pass B: Expand Macro invocations | توسيع وبسط استدعاءات الماكرو
  const output = []
  for (const raw of stripped) {
    const ci = raw.indexOf(';')
    const t  = (ci !== -1 ? raw.slice(0, ci) : raw).trim()

    // Match Macro call: NAME or NAME(arg1, arg2)
    const callMatch = t.match(/^(\w+)(?:\(([^)]*)\))?$/)
    if (callMatch && macros[callMatch[1]]) {
      const macro    = macros[callMatch[1]]
      const callArgs = callMatch[2] ? callMatch[2].split(',').map(s => s.trim()) : []
      if (callArgs.length !== macro.params.length)
        throw new Error(`macro "${callMatch[1]}": يتوقع ${macro.params.length} معاملات، أُعطي ${callArgs.length}`)
      for (const l of expandMacro(macro, callArgs)) output.push(l)
      continue
    }

    // Match Label + Macro call: $label: MACRONAME(args)
    const labelCallMatch = t.match(/^(\$?\w+):\s+(\w+)(?:\(([^)]*)\))?$/)
    if (labelCallMatch && macros[labelCallMatch[2]]) {
      const macro    = macros[labelCallMatch[2]]
      const callArgs = labelCallMatch[3] ? labelCallMatch[3].split(',').map(s => s.trim()) : []
      const expanded = expandMacro(macro, callArgs)
      output.push(`${labelCallMatch[1]}: ${expanded[0]}`)
      for (let i = 1; i < expanded.length; i++) output.push(expanded[i])
      continue
    }

    output.push(raw)
  }

  return output
}

// ───────────────────────────────────────────────────────────────────────────
// 12. FILE LOADING ABSTRACTION | نظام تحميل وتضمين الملفات الخارجي
// ───────────────────────────────────────────────────────────────────────────

/** Detect JS execution environment (Node vs Browser) | اكتشاف بيئة التشغيل */
const ENV = (() => {
  if (typeof process !== 'undefined' && process.versions?.node) return 'node'
  if (typeof window !== 'undefined')                             return 'browser'
  return 'unknown'
})()

/** Load text file content across environments | تحميل محتوى الملف كنص */
async function loadFile(path, base) {
  if (ENV === 'browser') {
    const url = new URL(path, base).href
    const res = await fetch(url)
    if (!res.ok) throw new Error(`فشل تحميل (Failed to load) "${path}": ${res.status} ${res.statusText}`)
    return res.text()
  }

  if (ENV === 'node') {
    const { readFile }  = await import('node:fs/promises')
    const nodePath      = await import('node:path')
    const dir      = nodePath.dirname(base)
    const fullPath = nodePath.resolve(dir, path)
    return readFile(fullPath, 'utf8')
  }

  throw new Error(`بيئة غير مدعومة (Unsupported environment): "${ENV}"`)
}

/** Fetch external included files and merge them | تحميل الملفات المدمجة عبر .includes وضمها */
async function mergeSources(mainSource, base) {
  const mainLines    = mainSource.split('\n')
  const { includes } = parseHeader(mainLines)

  const loaded = {}
  await Promise.all(includes.map(async path => {
    loaded[path] = await loadFile(path, base)
  }))

  // Prevent nested includes | منع التضمين المتداخل (ملف يتضمن ملف آخر)
  for (const path of includes) {
    const { includes: subInc } = parseHeader(loaded[path].split('\n'))
    if (subInc.length > 0)
      throw new Error(`"${path}": الملفات المضمَّنة لا يمكنها استخدام .includes (Included files cannot use .includes)`)
  }

  const allLines = []
  for (const path of includes) {
    allLines.push(`; ── بداية (Start of) ${path} ──`)
    for (const line of loaded[path].split('\n')) allLines.push(line)
    allLines.push(`; ── نهاية (End of) ${path} ──`)
  }
  allLines.push(`; ── بداية الملف الرئيسي (Start of Main File) ──`)
  for (const line of mainLines) allLines.push(line)

  return allLines
}

// ───────────────────────────────────────────────────────────────────────────
// 13. ASSEMBLER PASS 1: SYMBOL RESOLUTION | المرور الأول: جمع العناوين والثوابت
// ───────────────────────────────────────────────────────────────────────────

function pass1(lines, labels, consts, aliases, hasEntry) {
  // Step A: Collect Aliases | جمع البدائل
  for (const raw of lines) {
    let cl
    try { cl = classifyLine(raw) } catch (e) { throw new Error(`Pass1: ${e.message}`) }
    if (cl.kind === 'alias') {
      if (Object.prototype.hasOwnProperty.call(aliases, cl.name))
        throw new Error(`.alias مكرر (Duplicate alias): "${cl.name}"`)
      aliases[cl.name] = cl.reg   
    }
  }

  // Step B: Collect Constants | جمع الثوابت
  const pendingConsts = []
  for (const raw of lines) {
    let cl
    try { cl = classifyLine(raw) } catch (e) { throw new Error(`Pass1: ${e.message}`) }
    if (cl.kind === 'const') {
      if (Object.prototype.hasOwnProperty.call(consts, cl.name))
        throw new Error(`.const مكرر (Duplicate const): "${cl.name}"`)
      pendingConsts.push({ name: cl.name, expr: cl.expr })
      consts[cl.name] = undefined   
    }
  }

  // Evaluate constants sequentially | حل وتطبيق الثوابت بالتسلسل
  for (const { name, expr } of pendingConsts) {
    const val = evalExpr(expr, consts)
    if (val === null) throw new Error(`.const "${name}": تعذّر حل التعبير (Failed to evaluate) "${expr}"`)
    consts[name] = val
  }

  // Step C: Calculate program counter (PC) offsets & map labels | جمع عناوين العلامات بالنسبة للذاكرة
  const allLabels = Object.assign({}, consts)
  
  // Reserve 5 bytes for Entry Point JMP if exists | حجز 5 بايت لقفزة البداية في حال وجود نقطة دخول
  let pc = hasEntry ? 5 : 0 
  
  for (const raw of lines) {
    let cl
    try { cl = classifyLine(raw) }
    catch (e) { throw new Error(`Pass1: ${e.message}`) }

    switch (cl.kind) {
      case 'label': {
        if (Object.prototype.hasOwnProperty.call(labels, cl.name))
          throw new Error(`label مكرر (Duplicate label): "${cl.name}"`)
        labels[cl.name] = pc
        allLabels[cl.name] = pc
        break
      }
      case 'label_inline': {
        if (Object.prototype.hasOwnProperty.call(labels, cl.name))
          throw new Error(`label مكرر (Duplicate label): "${cl.name}"`)
        labels[cl.name] = pc
        allLabels[cl.name] = pc
        pc += estimateSize(cl.rest, aliases)
        break
      }
      case 'db': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allLabels)
            if (n === null) throw new Error(`.db: حجم skip يجب أن يكون معرفاً مسبقاً (Must be previously defined): "${t}"`)
            pc += n
          } else {
            pc += 1
          }
        }
        break
      }
      case 'dh': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allLabels)
            if (n === null) throw new Error(`.dh: حجم skip يجب أن يكون معرفاً مسبقاً (Must be previously defined): "${t}"`)
            pc += n * 2
          } else {
            pc += 2
          }
        }
        break
      }
      case 'dw': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allLabels)
            if (n === null) throw new Error(`.dw: حجم skip يجب أن يكون معرفاً مسبقاً (Must be previously defined): "${t}"`)
            pc += n * 4
          } else {
            pc += 4
          }
        }
        break
      }
      case 'instr': {
        pc += estimateSize(cl.text, aliases)
        break
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 14. ASSEMBLER PASS 2: BINARY GENERATION | المرور الثاني: التوليد النهائي للشيفرة الثنائية
// ───────────────────────────────────────────────────────────────────────────

function pass2(lines, bytes, allSymbols, aliases, patches) {
  for (const raw of lines) {
    let cl
    try { cl = classifyLine(raw) }
    catch (e) { throw new Error(`Pass2: ${e.message}`) }

    switch (cl.kind) {
      case 'empty':
      case 'label':
      case 'const':
      case 'alias':
      case 'directive_module':
      case 'directive_entry':
      case 'directive_includes':
        break // Ignored (handled in Pass 1 or Header extraction)

      case 'label_inline':
        emitInstruction(cl.rest, bytes, aliases, allSymbols, patches)
        break

      case 'db': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allSymbols)
            if (n === null) throw new Error(`.db: تعذّر حساب قيمة skip في "${t}"`)
            for (let i = 0; i < n; i++) bytes.push(0) // إدراج بايت صفري
          } else {
            const v = evalExpr(t, allSymbols)
            if (v === null) throw new Error(`.db: تعذّر تحليل (Failed to evaluate) "${t}"`)
            bytes.push(v & 0xff)
          }
        }
        break
      }
      case 'dh': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allSymbols)
            if (n === null) throw new Error(`.dh: تعذّر حساب قيمة skip في "${t}"`)
            for (let i = 0; i < n; i++) write16(bytes, 0) // إدراج 2 بايت أصفار
          } else {
            const v = evalExpr(t, allSymbols)
            if (v === null) throw new Error(`.dh: تعذّر تحليل (Failed to evaluate) "${t}"`)
            write16(bytes, v)
          }
        }
        break
      }
      case 'dw': {
        const inner = cl.text.slice(4, cl.text.lastIndexOf(')'))
        for (const tok of inner.split(',')) {
          const t = tok.trim()
          if (!t) continue
          const skipMatch = t.match(/^skip\((.+)\)$/i)
          if (skipMatch) {
            const n = evalExpr(skipMatch[1], allSymbols)
            if (n === null) throw new Error(`.dw: تعذّر حساب قيمة skip في "${t}"`)
            for (let i = 0; i < n; i++) write32(bytes, 0) // إدراج 4 بايت أصفار
          } else {
            const v = evalExpr(t, allSymbols)
            if (v === null) throw new Error(`.dw: تعذّر تحليل (Failed to evaluate) "${t}"`)
            write32(bytes, v)
          }
        }
        break
      }

      case 'instr':
        emitInstruction(cl.text, bytes, aliases, allSymbols, patches)
        break
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 15. MAIN ASSEMBLE FUNCTION (ENTRY) | الدالة الرئيسية للمُجمّع
// ───────────────────────────────────────────────────────────────────────────

/**
 * Assembles ASM source code into a binary array suitable for the VM.
 * تقوم بتجميع الشيفرة المصدرية (أسمبلي) لملف ثنائي قابل للتشغيل في الآلة الظاهرية.
 * * @param {string} mainSource — نص الملف الرئيسي
 * @param {string} base       — المسار الأساسي (URL في المتصفح أو مسار المجلد في Node)
 * @returns {Promise<Object>} — مخرجات عملية التجميع (Binary, labels, etc.)
 */
export async function assemble(mainSource, base) {
  macroCounter = 0

  // 1. Extract metadata (module, entry, includes) | استخراج بيانات الرأس
  const mainLines = mainSource.split('\n')
  const { moduleName, entryPoint } = parseHeader(mainLines)

  // 2. Load includes and merge source strings | تحميل التضمينات ودمج الشيفرة
  const merged = await mergeSources(mainSource, base)

  // 3. Preprocess and expand macros | ما قبل المعالجة (توسيع الماكرو)
  const processed = preprocessMacros(merged)

  // 4. Pass 1: Resolve Labels, Constants, and Aliases | تحديد العناوين والثوابت
  const labels  = {}
  const consts  = {}
  const aliases = {}
  pass1(processed, labels, consts, aliases, entryPoint !== null)

  const allSymbols = Object.assign({}, consts, labels)

  // 5. Validate entryPoint existence | التأكد من صحة وجود نقطة الدخول (إن طلبت)
  if (entryPoint !== null && !Object.prototype.hasOwnProperty.call(allSymbols, entryPoint))
    throw new Error(`.entryPoint "${entryPoint}" غير معرّف في الكود (Undefined entry point)`)

  const bytes   = []
  const patches = []

  // 6. Inject Entry Point JUMP Instruction (If defined) | حقن قفزة نقطة الدخول في الذاكرة (إن طلبت)
  if (entryPoint !== null) {
    const epAddr = allSymbols[entryPoint]
    if (epAddr !== undefined) {
      // 0x14 = jmp_n (Jump to immediate address)
      bytes.push(0x14)
      write32(bytes, epAddr)
    } else {
      // Unresolved forward reference for Entry | قفزة لم يتم معرفة مكانها بعد (Patching)
      bytes.push(0x14)
      patches.push({ offset: bytes.length, expr: entryPoint })
      write32(bytes, 0)
    }
  }

  // 7. Pass 2: Binary Code Generation | التوليد الثنائي
  pass2(processed, bytes, allSymbols, aliases, patches)

  // 8. Apply Forward Reference Patches | ترقيع العناوين المجهولة (القفزات المسبقة)
  applyPatches(bytes, patches, allSymbols)

  return {
    binary:     new Uint8Array(bytes),
    labels,
    consts,
    aliases,
    moduleName,
    entryPoint: entryPoint !== null ? allSymbols[entryPoint] : null,
  }
}

