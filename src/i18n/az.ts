/**
 * Azerbaijani UI dictionary. English can be added as en.ts with the same keys; `t()` picks by locale.
 * Enum codes stay stable internally; only labels are translated.
 */
export const az = {
  app: { name: "HECOTEC Anbar Sistemi", tagline: "Anbar, satınalma və layihə materialları" },
  nav: {
    dashboard: "İdarə paneli",
    catalog: "Material kataloqu",
    stock: "Anbar qalığı",
    inventory: "Sayım və ilkin qalıq",
    mr: "Material tələbləri (MR)",
    po: "Satınalma sifarişləri (PO)",
    grn: "Mal qəbulu (GRN)",
    movements: "Mədaxil / Məxaric",
    journal: "Hərəkət jurnalı",
    projects: "Layihələr",
    sites: "Sahə anbarları",
    my: "Mənim materiallarım",
    employees: "İşçilər və PPE",
    reports: "Hesabatlar",
    import: "Excel importu",
    audit: "Audit jurnalı",
    settings: "Parametrlər",
  },
  role: {
    SUPER_ADMIN: "Super Admin (sistem administratoru)",
    DIRECTOR: "Rəhbər / Direktor",
    WAREHOUSE_MANAGER: "Anbar müdiri",
    STOREKEEPER: "Anbardar",
    PROCUREMENT: "Satınalma",
    PROJECT_MANAGER: "Layihə rəhbəri",
    AUDITOR: "Oxucu / Auditor",
    EMPLOYEE: "İşçi",
    CLIENT: "Sifarişçi",
  },
  accountType: { EMPLOYEE: "İşçi", COMPANY: "Şirkət (rəhbərlik / ofis)", CLIENT: "Sifarişçi" },
  paymentStatus: { NOT_SET: "Qeyd edilməyib", PENDING: "Ödəniş gözləyir", PAID: "Ödənilib" },
  workerGroup: { ENGINEER: "Mühəndis", WORKER: "Fəhlə", BOTH: "Hər ikisi", NOT_APPLICABLE: "Tətbiq edilmir" },
  employeeGroup: { ENGINEER: "Mühəndis", WORKER: "Fəhlə" },
  sizeType: { NONE: "Ölçüsüz", CLOTHING_NUMERIC: "Geyim (48, 50, 52…)", CLOTHING_LETTER: "Geyim (S, M, L, XL…)", SHOE_EU: "Ayaqqabı (EU 36–48)", OTHER: "Digər" },
  docStatus: { DRAFT: "Qaralama", POSTED: "Təsdiqlənib", CANCELLED: "Ləğv edilib", REVERSED: "Geri qaytarılıb (reversal)" },
  stockDocKind: {
    ISSUE_PROJECT: "Layihəyə məxaric",
    ISSUE_EMPLOYEE: "İşçiyə PPE təhvili",
    RETURN_FROM_PROJECT: "Layihədən qaytarma",
    RETURN_FROM_EMPLOYEE: "İşçidən geri alma",
    RETURN_TO_SUPPLIER: "Tədarükçüyə qaytarma",
    TRANSFER: "Anbarlararası köçürmə",
    ADJUSTMENT: "Qalıq düzəlişi",
  },
  entryType: {
    OPENING: "Açılış qalığı",
    RECEIPT: "Mədaxil (GRN)",
    ISSUE: "Məxaric",
    RETURN_IN: "Qaytarma (giriş)",
    RETURN_OUT: "Qaytarma (çıxış)",
    TRANSFER_IN: "Köçürmə (giriş)",
    TRANSFER_OUT: "Köçürmə (çıxış)",
    ADJUSTMENT_PLUS: "Düzəliş (+)",
    ADJUSTMENT_MINUS: "Düzəliş (−)",
    RESERVATION: "Rezerv",
    RESERVATION_RELEASE: "Rezerv azad",
  },
  mrStatus: {
    DRAFT: "Qaralama", SUBMITTED: "Göndərilib", UNDER_REVIEW: "Təsdiqdə", RETURNED: "Düzəlişə qaytarılıb", APPROVED: "Təsdiqlənib",
    REJECTED: "Rədd edilib", IN_SOURCING: "Tədarükdə (RFQ)", PARTIALLY_ORDERED: "Qismən sifariş", FULLY_ORDERED: "Tam sifariş",
    PARTIALLY_DELIVERED: "Qismən çatdırılıb", DELIVERED: "Tam çatdırılıb", CLOSED: "Bağlanıb", CANCELLED: "Ləğv edilib",
  },
  poStatus: { DRAFT: "Qaralama", SUBMITTED: "Göndərilib", APPROVED: "Təsdiqlənib", PARTIALLY_RECEIVED: "Qismən qəbul", RECEIVED: "Tam qəbul", CANCELLED: "Ləğv edilib" },
  decision: { PENDING: "Gözləyir", APPROVED: "Təsdiq", REJECTED: "Rədd", REVISE: "Düzəlişə", SKIPPED: "Tələb olunmur" },
  quality: { ACCEPTED: "Qəbul", ACCEPTED_WITH_NCR: "NCR ilə qəbul", REJECTED: "Rədd" },
  requestType: { NEW: "Yeni", REVISION: "Reviziya", REPLACEMENT: "Əvəzləmə", CANCELLATION: "Ləğv" },
  priority: { NORMAL: "Normal", URGENT: "Təcili", EMERGENCY: "Fövqəladə" },
  importType: { CATALOG: "Kataloq", OPENING_BALANCE: "İnventar qalığı (açılış)", HISTORICAL_ISSUES: "Tarixi məxaric", OPEN_ORDERS: "Açıq sifariş", SUMMARY_REPORT: "Hesabat xülasəsi" },
  importStatus: { UPLOADED: "Yüklənib", MAPPED: "Preview", COMMITTED: "Təsdiqlənib", ROLLED_BACK: "Geri qaytarılıb", FAILED: "Xəta" },
  countMode: { OPENING: "İlkin qalıq", CYCLE: "Dövri sayım" },
  whType: { NORMAL: "Normal", QUARANTINE: "Karantin" },
  approvalCondition: { ALWAYS: "Həmişə", URGENT_OR_PM_THRESHOLD: "Təcili/fövqəladə və ya PM limitindən yuxarı", GD_THRESHOLD: "Baş direktor limitindən yuxarı" },
} as const;

/** MR form "Lists" sheet — label → code. Never change an existing code. */
export const MR_LISTS = {
  SUPPLY_CATEGORY: [["PERMANENT_MATERIAL", "Permanent Material"], ["CONSUMABLE", "Consumable"], ["EQUIPMENT", "Equipment"], ["SPARE_PARTS", "Spare Parts"], ["TOOLS", "Tools"]],
  PROCUREMENT_ROUTE: [["LOCAL", "Local"], ["INTERNATIONAL", "International"], ["FRAMEWORK_AGREEMENT", "Framework Agreement"], ["CLIENT_FURNISHED", "Client-Furnished"]],
  DISCIPLINE: [["CIV", "Civil"], ["STR", "Structural"], ["MEC", "Mechanical"], ["PIP", "Piping"], ["ELE", "Electrical"], ["INS", "Instrumentation"], ["HVAC", "HVAC"], ["OTH", "Other"]],
  PROJECT_PHASE: [["ENG", "Engineering"], ["PROC", "Procurement"], ["CONST", "Construction"], ["COMM", "Commissioning"], ["OM", "Operations & Maintenance"]],
  REF_DOC_TYPE: [["DRAWING", "Drawing"], ["MTO", "Material Take-Off"], ["DATASHEET", "Datasheet"], ["SPECIFICATION", "Specification"], ["ITP", "Inspection & Test Plan"], ["SDS", "Safety Data Sheet"], ["OTHER", "Other"]],
  CURRENCY: [["AZN", "Azerbaijani Manat"], ["USD", "US Dollar"], ["EUR", "Euro"], ["GBP", "Pound Sterling"], ["TRY", "Turkish Lira"], ["RUB", "Russian Rouble"]],
} as const;

export type Dict = typeof az;
export function t(): Dict {
  return az;
}
