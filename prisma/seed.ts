/**
 * BASE configuration seed — safe for production, idempotent (upserts).
 * Contains NO inventory, NO people, NO fake numbers. Demo data lives in seed-demo.ts (development only).
 * Unit / list codes are copied from HECOTEC_Material_Request_Form.xlsx → "Lists" sheet.
 */
import { PrismaClient, type UserRole } from "@prisma/client";

const db = new PrismaClient();

const UNITS: [code: string, az: string, en: string, decimal: boolean][] = [
  ["PCS", "ədəd", "pcs", false],
  ["SET", "dəst", "set", false],
  ["M", "metr", "m", true],
  ["M2", "m²", "m²", true],
  ["M3", "m³", "m³", true],
  ["KG", "kq", "kg", true],
  ["T", "ton", "t", true],
  ["L", "litr", "L", true],
  ["ROLL", "rulon", "roll", false],
  ["BOX", "qutu", "box", false],
  ["LOT", "lot", "lot", false],
  // Added for PPE (not in MR form list; codes appended, never reuse existing codes)
  ["PAIR", "cüt", "pair", false],
  ["PACK", "paçka", "pack", false],
];

const CATEGORIES: [code: string, az: string, en: string, uniform: boolean][] = [
  ["PPE-CLOTH", "İş geyimi / forma", "Workwear / uniform", true],
  ["PPE-FOOT", "Təhlükəsizlik ayaqqabısı", "Safety footwear", true],
  ["PPE-HEAD", "Dəbilqə, eynək, qulaqlıq", "Head / eye / hearing protection", true],
  ["PPE-HAND", "Əlcəklər", "Gloves", true],
  ["PPE-RESP", "Tənəffüs qoruyucuları", "Respiratory protection", true],
  ["PPE-BAG", "Çanta və aksesuar", "Bags & accessories", true],
  ["PIPE", "Boru və fitinqlər", "Pipes & fittings", false],
  ["VALVE", "Armatur (klapan, flans)", "Valves & flanges", false],
  ["WELD", "Qaynaq materialları", "Welding consumables", false],
  ["ELEC", "Elektrik", "Electrical", false],
  ["CONST", "Tikinti materialları", "Construction materials", false],
  ["TOOL", "Alət və avadanlıq", "Tools & equipment", false],
  ["FUEL", "Yanacaq və sürtkü", "Fuel & lubricants", false],
  ["OFFICE", "Ofis ləvazimatı", "Office supplies", false],
  ["OTHER", "Digər", "Other", false],
];

// MR form Section 7 — route and responsibilities verbatim; system roles allowed to sign each step are configurable.
const STEPS: [step: number, code: string, label: string, resp: string, cond: "ALWAYS" | "URGENT_OR_PM_THRESHOLD" | "GD_THRESHOLD", roles: UserRole[]][] = [
  [1, "REQUESTER", "Tələb edən", "Ehtiyac, miqdar və RoS tarixi düzgündür", "ALWAYS", ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER"]],
  // steps 2–5 are kept for companies that need them but are switched off by default (simple route)
  [2, "DISCIPLINE_LEAD", "Disiplin aparıcı mühəndisi", "Texniki spesifikasiya çertyojlara uyğundur", "ALWAYS", ["PROJECT_MANAGER"]],
  [3, "QAQC_MANAGER", "QA/QC meneceri", "Yoxlama və sertifikat tələbləri kifayətdir", "ALWAYS", ["PROJECT_MANAGER"]],
  [4, "SITE_MANAGER", "Tikinti / sahə meneceri", "Material göstərilən vaxtda və yerdə lazımdır", "ALWAYS", ["PROJECT_MANAGER", "WAREHOUSE_MANAGER"]],
  [5, "COST_CONTROLLER", "Xərc nəzarətçisi", "Büdcə və xərc kodu yoxlanılıb", "ALWAYS", ["PROCUREMENT"]],
  [6, "PROJECT_MANAGER", "Layihə rəhbəri", "Ehtiyac, miqdar və tarix düzgündür", "ALWAYS", ["PROJECT_MANAGER", "DIRECTOR"]],
  [7, "GENERAL_DIRECTOR", "Baş direktor", "Yüksək dəyərli MR-lərin təsdiqi", "GD_THRESHOLD", ["SUPER_ADMIN", "DIRECTOR"]],
  [8, "PROCUREMENT_MANAGER", "Satınalma meneceri", "Tədarük üçün qəbul edildi", "ALWAYS", ["PROCUREMENT"]],
];

async function main() {
  for (const [i, [code, labelAz, labelEn, allowsDecimal]] of UNITS.entries()) {
    await db.unit.upsert({ where: { code }, update: { labelAz, labelEn }, create: { code, labelAz, labelEn, allowsDecimal, sortOrder: i } });
  }
  for (const [i, [code, nameAz, nameEn, isUniform]] of CATEGORIES.entries()) {
    await db.category.upsert({ where: { code }, update: {}, create: { code, nameAz, nameEn, isUniform, sortOrder: i } });
  }
  for (const [step, roleCode, labelAz, responsibility, condition, allowedRoles] of STEPS) {
    await db.approvalStepConfig.upsert({ where: { step }, update: {}, create: { step, roleCode, labelAz, responsibility, condition, allowedRoles, isActive: ![2, 3, 4, 5].includes(step) } });
  }
  // Office store + quarantine for defective goods. Each project gets its own site warehouse automatically.
  const whs: [string, string, "NORMAL" | "QUARANTINE"][] = [
    ["OFIS", "Ofis anbarı", "NORMAL"],
    ["KARANTIN", "Karantin (qüsurlu / bloklanmış)", "QUARANTINE"],
  ];
  for (const [code, name, type] of whs) {
    await db.warehouse.upsert({ where: { code }, update: {}, create: { code, name, type } });
  }
  // Thresholds from MR form "Settings" sheet (marked there as placeholders pending Delegation of Authority).
  for (const [key, value] of [["pmApprovalThreshold", 50000], ["gdApprovalThreshold", 250000], ["overReceiptTolerancePct", 0]] as const) {
    await db.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log("Base seed OK: units, categories, approval route, warehouses, settings.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
