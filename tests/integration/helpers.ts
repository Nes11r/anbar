import { db } from "@/lib/db";
import type { Actor } from "@/server/audit";
import type { UserRole } from "@prisma/client";

if (!/_test\b|_test\?/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Integration tests must run against a *_test database (TEST_DATABASE_URL). Refusing to continue.");
}

/** Wipe all business data. Ledger/audit triggers block DELETE, so we drop+recreate rows via TRUNCATE with triggers disabled for the test DB only. */
export async function resetDb() {
  const tables = [
    "stock_ledger", "stock_balances", "reservations", "inventory_count_lines", "inventory_counts", "grn_lines", "goods_receipts",
    "po_lines", "purchase_orders", "mr_approvals", "mr_lines", "material_requests", "stock_doc_lines", "stock_documents",
    "historical_issues", "import_rows", "import_batches", "material_variants", "materials", "employees", "projects", "suppliers",
    "audit_log", "status_history", "doc_sequences", "sessions", "users", "attachments", "approval_step_config", "app_settings",
    "categories", "units", "warehouses",
  ];
  // TRUNCATE statement-trigger is not affected by replica mode → use DELETE (row triggers ARE disabled in replica mode)
  // One connection for the whole sequence (session setting must apply to every DELETE)
  await db.$transaction([
    db.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
    ...tables.map((t) => db.$executeRawUnsafe(`DELETE FROM "${t}"`)),
  ]);
}

export async function makeUser(role: UserRole, email = `${role.toLowerCase()}@test.local`): Promise<Actor> {
  const u = await db.user.create({ data: { email, name: role, role, passwordHash: "x" } });
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export async function baseData() {
  await db.unit.createMany({ data: [{ code: "PCS", labelAz: "ədəd", labelEn: "pcs" }, { code: "PAIR", labelAz: "cüt", labelEn: "pair" }, { code: "M", labelAz: "metr", labelEn: "m", allowsDecimal: true }] });
  const uniform = await db.category.create({ data: { code: "PPE-CLOTH", nameAz: "İş geyimi", isUniform: true } });
  const shoes = await db.category.create({ data: { code: "PPE-FOOT", nameAz: "Ayaqqabı", isUniform: true } });
  const other = await db.category.create({ data: { code: "PIPE", nameAz: "Boru", isUniform: false } });
  const wh = await db.warehouse.create({ data: { code: "OFIS", name: "Ofis anbarı" } });
  const wh2 = await db.warehouse.create({ data: { code: "SAHE", name: "Sahə anbarı" } });
  const q = await db.warehouse.create({ data: { code: "KAR", name: "Karantin", type: "QUARANTINE" } });
  const steps: [number, string, UserRole[], "ALWAYS" | "URGENT_OR_PM_THRESHOLD" | "GD_THRESHOLD"][] = [
    [1, "REQUESTER", ["STOREKEEPER", "PROJECT_MANAGER", "WAREHOUSE_MANAGER", "PROCUREMENT"], "ALWAYS"],
    [2, "DISCIPLINE_LEAD", ["PROJECT_MANAGER"], "ALWAYS"],
    [6, "PROJECT_MANAGER", ["PROJECT_MANAGER"], "URGENT_OR_PM_THRESHOLD"],
    [7, "GENERAL_DIRECTOR", ["SUPER_ADMIN"], "GD_THRESHOLD"],
    [8, "PROCUREMENT_MANAGER", ["PROCUREMENT"], "ALWAYS"],
  ];
  for (const [step, roleCode, allowedRoles, condition] of steps) {
    await db.approvalStepConfig.create({ data: { step, roleCode, labelAz: roleCode, allowedRoles, condition } });
  }
  const supplier = await db.supplier.create({ data: { name: "Test Təchizat MMC" } });
  const pA = await db.project.create({ data: { code: "PA", name: "Layihə A" } });
  const pB = await db.project.create({ data: { code: "PB", name: "Layihə B" } });
  return { uniform, shoes, other, wh, wh2, q, supplier, pA, pB };
}
