// ============================================================================
// FPVM ROM Utilities — (Unpack, Pressure & Binary Serialization)
// ============================================================================

/**
 * 1. UNPACK ROM FUNCTION | دالة تفكيك حزمة الـ ROM
 * Extracts the Kernel and User Programs from the compiled ROM binary buffer.
 * تقوم باستخراج النواة وبرامج المستخدم من الملف الثنائي للـ ROM.
 * * @param {ArrayBuffer} romBuffer - The raw ROM binary data.
 * @returns {Object|boolean} Object containing kernel and programs array, or false.
 */
export function unpack(romBuffer) {
  // Validate input type | التحقق من أن المدخل عبارة عن مصفوفة بايتات خام
  if (!(romBuffer instanceof ArrayBuffer)) {
    return false
  }
  
  const revrom = new Uint8Array(romBuffer)
  const len = revrom.length
  
  // Read first 4 bytes to get Kernel size | قراءة أول 4 بايتات لمعرفة حجم النواة
  let current = g32(0, revrom)
  let offs = 0
  
  // Extract Kernel bytes | استخراج بايتات النواة
  const kernel = revrom.slice(4, current += 4)
  const programes = []
  
  // Loop to extract user programs dynamically | حلقة تكرارية لاستخراج برامج المستخدم ديناميكياً
  while (current < len) {
    offs = current += 4
    current += g32(current - 4, revrom) // Read program length | قراءة طول البرنامج الحالي
    programes.push(
      revrom.slice(offs, current) // Extract program bytes | استخراج بايتات البرنامج
    )
  }
  
  return {
    kernel, 
    programes
  }
}

/**
 * 2. READ 32-BIT INTEGER | دالة قراءة عدد صحيح بـ 32 بت
 * Reads 4 bytes from Uint8Array and converts them into a 32-bit Integer.
 * تقرأ 4 بايتات من الذاكرة وتحولها إلى رقم صحيح 32-بت (تدعم الترتيب الصغير والكبير للبايتات).
 * * @param {number} offset - Memory index to start reading from.
 * @param {Uint8Array} db - The data array buffer.
 * @param {boolean} litterFirst - Endianness indicator (Little-Endian if true).
 */
function g32(offset, db, litterFirst = true) {
  return litterFirst ? (
    db[offset++] |
    (db[offset++] << 8) |
    (db[offset++] << 16) |
    (db[offset++] << 24)
  ) : (
    (db[offset++] << 24) |
    (db[offset++] << 16) |
    (db[offset++] << 8) |
    db[offset++]
  )
}

/**
 * 3. PRESSURE (PACK) FUNCTION | دالة ضغط وتجميع الـ ROM
 * Compiles and packs Kernel, system information, and user programs into a single ROM buffer.
 * تقوم بتجميع وحزم النواة، معلومات النظام، وبرامج المستخدم في ملف ROM ثنائي واحد وموحد.
 * * @param {ArrayBufferLike} kernel - The Kernel binary structure.
 * @param {ArrayBufferLike} information - Meta information / hardware configuration.
 * @param {...ArrayBufferLike[]} programes - Variadic argument of user space programs.
 * @return {ArrayBuffer|boolean} Final compiled ROM as Uint8Array, or false on validation error.
 */
export function pressure(kernel, information, ...programes) {
  // Input validations | التحقق من صحة جميع المدخلات
  if (!((kernel?.buffer) instanceof ArrayBuffer)) return false
  if (!((information?.buffer) instanceof ArrayBuffer)) return false
  for (let u8 of programes) {
    if (!((u8?.buffer) instanceof ArrayBuffer)) return false
  }
  
  // Calculate total payload size | حساب الحجم الإجمالي للبيانات الممررة
  const totale = (
    kernel.byteLength +
    information.byteLength +
    programes.reduce((sum, u8) => u8.byteLength + sum, 0)
  )
  
  // Dynamic header calculation (4 bytes for kernel length + 4 bytes per program)
  // حساب حجم الترويسة (4 بايت لحجم النواة + 4 بايت لكل برنامج مستخدم)
  const headers = 4 + programes.length * 4
  
  // Allocate final buffer | تخصيص مصفوفة الحجم النهائي للـ ROM
  const result = new Uint8Array(totale + headers)
  
  let offset = 4
  // Inject combined length of kernel and info into first header | حقن طول النواة والمعلومات في الترويسة الأولى
  s32(0, kernel.byteLength + information.byteLength, result, true)
  
  // Set Kernel & Info data inside buffer | نسخ بيانات النواة والمعلومات داخل المصفوفة الكلية
  result.set(kernel, offset)
  result.set(new Uint8Array(information.buffer), offset + kernel.byteLength)
  offset += information.byteLength + kernel.byteLength
  
  // Inject and serialize each program with its prepended length header
  // حزم وتسلسل كل برنامج مستخدم مع ترويسة تسبقه تحدد طوله بالبايت
  for (let u8 of programes) {
    s32(offset, u8.byteLength, result, true)
    result.set(u8, offset += 4)
    offset += u8.byteLength
  }
  
  return result
}

/**
 * 4. WRITE 32-BIT INTEGER | دالة كتابة عدد صحيح بـ 32 بت
 * Splits a 32-bit integer into 4 bytes and writes them into a Uint8Array buffer.
 * تفكك رقماً صحيحاً 32-بت إلى 4 بايتات وتخزنها في الذاكرة (تدعم الترتيب الصغير والكبير للبايتات).
 * * @param {number} offset - Memory index to write into.
 * @param {number} value - Integer value to serialize.
 * @param {Uint8Array} u8 - Target storage buffer.
 * @param {boolean} litterFirst - Endianness indicator (Little-Endian if true).
 */
function s32(offset, value, u8, litterFirst = true) {
  if (litterFirst) {
    u8[offset++] = value & 0xff
    u8[offset++] = (value >> 8) & 0xff
    u8[offset++] = (value >> 16) & 0xff
    u8[offset]   = (value >> 24) & 0xff
  } else {
    u8[offset++] = (value >> 24) & 0xff
    u8[offset++] = (value >> 16) & 0xff
    u8[offset++] = (value >> 8) & 0xff
    u8[offset]   = value & 0xff
  }
}
