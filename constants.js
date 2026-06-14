// ============================================================================
// FPVM — Phantom Virtual Machine (Constants, Instructions & Registers)
// ============================================================================

// ============================================================================
// 1. BASIC STACK & DATA INSTRUCTIONS | تعليمات المكدس والبيانات الأساسية
// ============================================================================
export const HTL      = 0X00 // Halt the machine | إيقاف الآلة
export const PUSH_N   = 0X01 // Push Number to stack | دفع قيمة عددية للمكدس
export const PUSH_R   = 0X02 // Push Register to stack | دفع قيمة سجل للمكدس
export const POP      = 0X03 // Pop from stack | سحب قيمة من المكدس
export const POP_R    = 0X04 // Pop into Register | سحب قيمة وتخزينها في سجل
export const DUP      = 0X05 // Duplicate top of stack | تكرار القيمة الأعلى في المكدس

// ============================================================================
// 2. ARITHMETIC INSTRUCTIONS | التعليمات الحسابية
// ============================================================================
export const ADD_R_N  = 0X06 // Add Number to Register | إضافة قيمة عددية إلى سجل
export const ADD_R_R  = 0X07 // Add Register to Register | إضافة سجل إلى سجل

export const SUB_R_N  = 0X08 // Subtract Number from Register | طرح قيمة عددية من سجل
export const SUB_R_R  = 0X09 // Subtract Register from Register | طرح سجل من سجل

export const MUL_R_N  = 0X0A // Multiply Register by Number | ضرب سجل في قيمة عددية
export const MUL_R_R  = 0X0B // Multiply Register by Register | ضرب سجل في سجل

export const DIV_R_N  = 0X0C // Divide Register by Number | قسمة سجل على قيمة عددية
export const DIV_R_R  = 0X0D // Divide Register by Register | قسمة سجل على سجل

export const MOD_R_N  = 0X0E // Modulo Register by Number | باقي قسمة سجل على عدد
export const MOD_R_R  = 0X0F // Modulo Register by Register | باقي قسمة سجل على سجل

// ============================================================================
// 3. COMPARISON INSTRUCTIONS | تعليمات المقارنة
// ============================================================================
export const CMP_N_N  = 0X10 // Compare Number with Number | مقارنة عدد بعدد
export const CMP_R_N  = 0X11 // Compare Register with Number | مقارنة سجل بعدد
export const CMP_R_R  = 0X12 // Compare Register with Register | مقارنة سجل بسجل
export const CMP_N_R  = 0X13 // Compare Number with Register | مقارنة عدد بسجل

// ============================================================================
// 4. JUMP & CALL INSTRUCTIONS | تعليمات القفز والاستدعاء
// ============================================================================
export const JMP_N    = 0X14 // Jump to Address (Immediate) | قفز مباشر إلى عنوان
export const JMP_R    = 0X15 // Jump to Address (Register) | قفز إلى عنوان مخزن في سجل

export const CALL_N   = 0X16 // Call function (Immediate Address) | استدعاء دالة عبر عنوان مباشر
export const CALL_R   = 0X17 // Call function (Register Address) | استدعاء دالة عبر عنوان في سجل

// ============================================================================
// 5. CONDITIONAL JUMPS | تعليمات القفز المشروط
// ============================================================================
export const JEQ_N    = 0X18 // Jump if Equal (Immediate) | قفز إذا كان متساوياً (عنوان مباشر)
export const JEQ_R    = 0X19 // Jump if Equal (Register) | قفز إذا كان متساوياً (عنوان في سجل)

export const JNE_N    = 0X1A // Jump if Not Equal (Immediate) | قفز إذا لم يكن متساوياً (عنوان مباشر)
export const JNE_R    = 0X1B // Jump if Not Equal (Register) | قفز إذا لم يكن متساوياً (عنوان في سجل)

export const JGT_N    = 0X1C // Jump if Greater Than (Immediate) | قفز إذا كان أكبر (عنوان مباشر)
export const JGT_R    = 0X1D // Jump if Greater Than (Register) | قفز إذا كان أكبر (عنوان في سجل)

export const JLT_N    = 0X1E // Jump if Less Than (Immediate) | قفز إذا كان أصغر (عنوان مباشر)
export const JLT_R    = 0X1F // Jump if Less Than (Register) | قفز إذا كان أصغر (عنوان في سجل)

// ============================================================================
// 6. CONDITIONAL SETS | تعليمات التعيين المشروط
// ============================================================================
export const CEQ_N    = 0X20 // Set if Equal (Number) | تعيين إذا كان متساوياً مع عدد
export const CEQ_R    = 0X21 // Set if Equal (Register) | تعيين إذا كان متساوياً مع سجل

export const CNE_N    = 0X22 // Set if Not Equal (Number) | تعيين إذا لم يكن متساوياً مع عدد
export const CNE_R    = 0X23 // Set if Not Equal (Register) | تعيين إذا لم يكن متساوياً مع سجل

export const CGT_N    = 0X24 // Set if Greater Than (Number) | تعيين إذا كان أكبر من عدد
export const CGT_R    = 0X25 // Set if Greater Than (Register) | تعيين إذا كان أكبر من سجل

export const CLT_N    = 0X26 // Set if Less Than (Number) | تعيين إذا كان أصغر من عدد
export const CLT_R    = 0X27 // Set if Less Than (Register) | تعيين إذا كان أصغر من سجل

// ============================================================================
// 7. LOGICAL & BITWISE INSTRUCTIONS | التعليمات المنطقية وعمليات البت
// ============================================================================
export const CLC      = 0x28 // Clear Condition Flag (clc f0) | مسح علم الشروط

export const AND_R_N  = 0X29 // Bitwise AND Register with Number | عطف منطقي لسجل مع عدد
export const AND_R_R  = 0X2A // Bitwise AND Register with Register | عطف منطقي لسجل مع سجل

export const EOR_R_N  = 0X2B // Bitwise Exclusive OR with Number | اختيار منطقي حصري مع عدد
export const EOR_R_R  = 0X2C // Bitwise Exclusive OR with Register | اختيار منطقي حصري مع سجل

export const XOR_R_N  = 0X2D // Bitwise XOR with Number | عملية XOR لسجل مع عدد
export const XOR_R_R  = 0X2E // Bitwise XOR with Register | عملية XOR لسجل مع سجل

export const NOT      = 0X2F // Bitwise NOT Register (NOT R) | النفي المنطقي للسجل

// ============================================================================
// 8. SYSTEM & SPECIAL CONTROLS | تعليمات النظام والتحكم الخاص
// ============================================================================
export const SYSCALL  = 0X30 // System Call | نداء النظام
export const SYSRET  = 0X31 // System Return | عودة من نداء النظام

export const MCC_N   = 0X32 // Max circles counter (Immediate) | عداد الحلقات الأقصى المباشر
export const MCC_R   = 0X33 // Max circles counter (Register) | عداد الحلقات الأقصى عبر سجل

export const VCC     = 0X34 // Number of remaining enemies | عدد الأعداء المتبقيين

export const MOV_R_N = 0X35 // Move Number into Register | نقل قيمة عددية إلى سجل
export const MOV_R_R = 0X36 // Move Register into Register | نقل قيمة سجل إلى سجل

export const RET     = 0X37 // Return from function | عودة من الدالة

// ============================================================================
// 9. MEMORY BLOCK OPERATIONS (COPY & FILL) | عمليات كتل الذاكرة (النسخ والملء)
// ============================================================================
// Copy format: copy_ destination_ source_ length (r=register, n=number)
export const copy_r_r_r = 0x38
export const copy_r_r_n = 0x39
export const copy_r_n_r = 0x3a
export const copy_r_n_n = 0x3b
export const copy_n_r_r = 0x3c
export const copy_n_r_n = 0x3d
export const copy_n_n_r = 0x3e
export const copy_n_n_n = 0x3f

// Fill format: fill_ address_ value_ length (r=register, n=number)
export const fill_r_r_r = 0x40
export const fill_r_r_n = 0x41
export const fill_r_n_r = 0x42
export const fill_r_n_n = 0x43
export const fill_n_r_r = 0x44
export const fill_n_r_n = 0x45
export const fill_n_n_r = 0x46
export const fill_n_n_n = 0x47

// ============================================================================
// 10. SIMD (VECTIONAL) OPERATIONS | عمليات معالجة المتجهات المتوازية
// ============================================================================
// Parallel addition of 4 elements | جمع متوازي لـ 4 عناصر
export const addx4_r_r = 0x48
export const addx4_r_n = 0x49
export const addx4_n_r = 0x4a
export const addx4_n_n = 0x4b

// Parallel subtraction of 4 elements | طرح متوازي لـ 4 عناصر
export const subx4_r_r = 0x4c
export const subx4_r_n = 0x4d
export const subx4_n_r = 0x4e
export const subx4_n_n = 0x4f

// Max / Min selection operations | عمليات تحديد القيمة القصوى والدنيا
export const max_r_r = 0x50
export const max_r_n = 0x51
export const max_n_r = 0x52
export const max_n_n = 0x53

export const min_r_r = 0x54
export const min_r_n = 0x55
export const min_n_r = 0x56
export const min_n_n = 0x57

// ============================================================================
// 11. QUICK OPERATIONS & MEMORY LOAD/STORE | تعليمات التحميل والتخزين السريع للذاكرة
// ============================================================================
export const rec_r   = 0x58
export const rec_n   = 0x59

// Load instructions (Byte, Half-word, Word) | تعليمات تحميل البيانات من الذاكرة
export const ldb_r_r = 0x60 // Load Byte (Register Address) | تحميل بايت (عنوان سجل)
export const ldb_r_n = 0x61 // Load Byte (Immediate Address) | تحميل بايت (عنوان مباشر)

export const ldh_r_r = 0x62 // Load Half-word (Register Address) | تحميل نصف كلمة
export const ldh_r_n = 0x63 // Load Half-word (Immediate Address) | تحميل نصف كلمة

export const ldw_r_r = 0x64 // Load Word (Register Address) | تحميل كلمة
export const ldw_r_n = 0x65 // Load Word (Immediate Address) | تحميل كلمة

// Store instructions (Byte, Half-word, Word) | تعليمات تخزين البيانات في الذاكرة
export const stb_r_r = 0x66
export const stb_r_n = 0x67
export const stb_n_r = 0x68
export const stb_n_n = 0x69

export const sth_r_r = 0x6a
export const sth_r_n = 0x6b
export const sth_n_r = 0x6c
export const sth_n_n = 0x6d

export const stw_r_r = 0x6e
export const stw_r_n = 0x6f
export const stw_n_r = 0x70
export const stw_n_n = 0x71

// Bitwise shifts | إزاحة البتات
export const SHL_R_N = 0X72 // Shift Left by Number | إزاحة لليسار بعدد
export const SHL_R_R = 0X73 // Shift Left by Register | إزاحة لليسار بسجل

export const SHR_R_N = 0X74 // Shift Right by Number | إزاحة لليمين بعدد
export const SHR_R_R = 0X75 // Shift Right by Register | إزاحة لليمين بسجل

// Fico block operations | عمليات فيكو للكتل
export const fico_r_r_r = 0x76
export const fico_r_r_n = 0x77
export const fico_r_n_r = 0x78
export const fico_r_n_n = 0x79
export const fico_n_r_r = 0x7a
export const fico_n_r_n = 0x7b
export const fico_n_n_r = 0x7c
export const fico_n_n_n = 0x7d


// ============================================================================
// 12. EXCEPTIONS, INTERRUPTS & ERRORS | الاستثناءات والمقاطعات والأخطاء
// ============================================================================
export const DIV_ZERO     = 0  // Division by zero | القسمة على صفر
export const OVER_STACK_V = 1  // Value stack overflow | فيض مكدس القيم
export const OVER_STACK_C = 2  // Call stack overflow | فيض مكدس الاستدعاءات
export const OVER_MEM     = 3  // Out of bounds memory access | تجاوز حدود الذاكرة المسموحة
export const BAD_OP       = 4  // Invalid/Unknown opcode | تعليمة خاطئة أو غير معروفة
export const OP_REC       = 5  // Unauthorized instruction | تعليمة غير مصرح بها
export const JMP_OUT      = 6  // Jump out of allowed boundaries | قفز خارج النطاق المسموح به
export const INPUT        = 7  // Input interrupt / event | مقاطعة لإدخال البيانات
export const NEW_FRAME    = 8  // New graphical/execution frame | إطار جديد للشاشة أو التنفيذ
export const OUTPUT       = 9  // Output interrupt / event | مقاطعة لإخراج البيانات

export const TIME_CLIK    = 10 // Clock tick slice finished (context switch to kernel) | تجاوز عدد من النبضات بغرض استراحة وإعادة زمام الأمور للنواة للتحقق من جدول المهام
export const END_TIME     = 11 // Allowed clock cycles ended | نهاية عدد دورات الساعة المسموح بها
export const OVER_R_V     = 12 // Reverse Overflow (Underflow) | فيض عكسي
export const OVER_R_C     = 13 // Reverse Overflow (Underflow) | فيض عكسي

export const PRIVE        = 15 // Voluntary software interrupt / signal | مقاطعة إرادية من برنامج للإعلام بحالة ما


// ============================================================================
// 13. REGISTERS CONFIGURATION | إعدادات وهيكلية السجلات
// ============================================================================
/*
  Note: V registers are exclusive to the Kernel for read/write. R registers are general purpose.
  ملاحظة: سجلات V هي خاصة لنواة حصراً سواء كتابة أو قراءة، أما R فهي عامة للمستخدم والنواة.
*/
export const COUNTER_REGISTER_V = 64  // Number of kernel-only registers | عدد سجلات النواة
export const COUNTER_REGISTER_R = 192 // Number of general purpose registers | عدد السجلات العامة

// --- Kernel Registers (V) Description | وصف السجلات الخاصة بالنواة ---
export const V_PC   = 255 // Program Counter (v63) | عداد البرنامج (يشير للتعليمة الحالية)
export const VSP    = 254 // Value Stack Pointer (v62) | عداد/مؤشر مكدس القيم
export const VLSP   = 253 // Value Stack Size / Limit (v61) | حجم مكدس القيم المخصص
export const VPSP   = 252 // Value Stack Base Address Location (v60) | موقع عنوان قاعدة مكدس القيم
export const VCP    = 251 // Call Stack Pointer (v59) | عداد/مؤشر مكدس استدعاءات الدوال
export const VLCP   = 250 // Call Stack Length / Limit (v58) | طول مكدس الاستدعاءات الأقصى
export const VPCP   = 249 // Call Stack Base Address Location (v57) | موقع عنوان قاعدة مكدس الاستدعاءات

export const V_FLAG = 248 // Status / Condition Flags (v56) | سجل الأعلام والشروط لنتائج العمليات
export const V_RET  = 247 // Return Address Location for Interrupts (v55) | مكان/عنوان العودة بعد المقاطعة
export const V_MES  = 246 // Interrupt / Exception Message Code (v54) | رمز رسالة أو نوع المقاطعة
export const V_ABF  = 245 // Screen Framebuffer Base Address (v53) | عنوان قاعدة ذاكرة الشاشة (البكسلات)
export const V_MAX_CLOCK_BREAK = 244 // Quantum Time Limit / Break Timeout (v52) | مهلة الراحة / الحد الأقصى لنبضات المستخدم
export const CLOCK  = 243 // Global System Clock / Cycles Counter (v51) | ساعة النظام العامة / عداد الدورات الإجمالي
export const V_CMP  = 242 // Comparison Register result storage (v50) | سجل تخزين نتائج المقارنات المؤقتة
export const V_IDXINP = 241 // Input Buffer Index (v49) | مؤشر سجل الإدخال الحالي
export const V_VALINP = 240 // Input Value register (v48) | سجل قيمة البيانات المدخلة
export const V_BASE   = 239 // User Space Base Address Pointer (v47) | عنوان قاعدة مساحة برنامج المستخدم في الذاكرة
export const V_CLOCK_COUNTER = 238 // Current Program Clock Tick Counter (v46) | عداد نبضات الساعة الحالي لبرنامج المستخدم
export const V_DIRECTING_PROVINCE = 237 // Kernel Interrupt Entry Point / Vector Gateway (v45) | بوابة النواة الرئيسية ونقطة الدخول لمعالجة المقاطعات
export const V_SBF  = 236 // Screen Resolution / Size Buffer (v44) (16bit = width, 16bit = height) | حجم الشاشة (16 بت للعرض، 16 بت للارتفاع)
export const V_BFC  = 235 // Screen Scale / Zoom Factor (v43) | حجم تكبير أبعاد الشاشة

// Bit Flags Layout (For Information) | تخطيط أعلام الشروط (للمعلومات):
// 0B00000...
// 0B EQ=1 / NE=0 | GT=1 / LT=0 | 0000000 ... لأغراض أخرى إن شاء الله

// ============================================================================
// 14. BITMASK UTILITIES & MEMORY LAYOUT | أدوات أقنعة البتات وتوزيع الذاكرة الكلي
// ============================================================================
export const FLi = new Uint32Array(31)

for (let i = 0; i < 31; i++) {
  FLi[i] = 1 << i // Powers of 2 bitmask array | مصفوفة أقنعة البتات المرفوعة للقوة 2
}

// Memory Sizes Specifications (In Bytes) | مواصفات أحجام الذاكرة (بالبايت)
export const KERNEL_SIZE = 2 * 1024 * 1024 // Kernel Memory (2MB) | ذاكرة النواة
export const RAM_SIZE    = 12 * 1024 * 1024 // User System RAM (12MB) | ذاكرة النظام العشوائية للمستحدم
export const REGISTERS   = 1024             // Registers Space Allocation (1KB) | المساحة المخصصة لملف السجلات

// Total System Memory Footprint | إجمالي المساحة الكلية لعتاد الآلة الظاهرية
export const SIZE_TOTALE = (
  KERNEL_SIZE +
  RAM_SIZE    +
  REGISTERS
)
