import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { D } from "../stock/rules";

/** All figures come from stock_balances (projection) or stock_ledger — the same numbers everywhere. */

export async function dashboardKpis() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [totals] = await db.$queryRaw<{ skus: bigint; onhand: string | null; reserved: string | null }[]>`
    SELECT COUNT(DISTINCT b."variantId") FILTER (WHERE b."onHand" > 0) AS skus,
           COALESCE(SUM(b."onHand"), 0)::text AS onhand,
           COALESCE(SUM(b.reserved), 0)::text AS reserved
    FROM stock_balances b JOIN warehouses w ON w.id = b."warehouseId" WHERE w.type = 'NORMAL'`;
  const [crit] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT v.id, COALESCE(v."minStock", m."minStock") AS min, COALESCE(SUM(b."onHand" - b.reserved), 0) AS avail
      FROM material_variants v JOIN materials m ON m.id = v."materialId"
      LEFT JOIN stock_balances b ON b."variantId" = v.id AND b."warehouseId" IN (SELECT id FROM warehouses WHERE type = 'NORMAL')
      WHERE v."isActive" AND m."isActive"
      GROUP BY v.id, v."minStock", m."minStock"
    ) x WHERE x.min > 0 AND x.avail <= x.min`;
  const [openPo] = await db.$queryRaw<{ n: bigint; qty: string | null }[]>`
    SELECT COUNT(DISTINCT p.id) AS n, COALESCE(SUM(GREATEST(l."qtyOrdered" - l."qtyReceived", 0)), 0)::text AS qty
    FROM purchase_orders p JOIN po_lines l ON l."poId" = p.id
    WHERE p.status IN ('APPROVED', 'PARTIALLY_RECEIVED')`;
  const [month] = await db.$queryRaw<{ received: string | null; issued: string | null }[]>`
    SELECT COALESCE(SUM(qty) FILTER (WHERE "entryType" = 'RECEIPT'), 0)::text AS received,
           COALESCE(SUM(CASE WHEN "entryType" = 'ISSUE' AND "projectId" IS NOT NULL THEN qty
                             WHEN "entryType" = 'RETURN_IN' AND "projectId" IS NOT NULL THEN -qty ELSE 0 END), 0)::text AS issued
    FROM stock_ledger WHERE "movementDate" >= ${monthStart}`;
  return {
    uniqueSkus: Number(totals?.skus ?? 0),
    onHand: D(totals?.onhand ?? 0),
    reserved: D(totals?.reserved ?? 0),
    critical: Number(crit?.n ?? 0),
    openPoCount: Number(openPo?.n ?? 0),
    openPoQty: D(openPo?.qty ?? 0),
    receivedThisMonth: D(month?.received ?? 0),
    issuedToProjectsThisMonth: D(month?.issued ?? 0),
  };
}

export async function topIssuedMaterials(days = 90, limit = 8) {
  const since = new Date(Date.now() - days * 86400_000);
  return db.$queryRaw<{ sku: string; name: string; size: string; unit: string; qty: string }[]>`
    SELECT v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit, SUM(l.qty)::text AS qty
    FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE l."entryType" = 'ISSUE' AND l."movementDate" >= ${since}
    GROUP BY v.sku, m."nameAz", v.size, m."unitCode" ORDER BY SUM(l.qty) DESC LIMIT ${limit}`;
}

export async function recentMovements(limit = 12) {
  return db.$queryRaw<{ id: bigint; entryType: string; docNumber: string; qty: string; movementDate: Date; sku: string; name: string; size: string; warehouse: string; project: string | null }[]>`
    SELECT l.id, l."entryType", l."docNumber", l.qty::text AS qty, l."movementDate", v.sku, m."nameAz" AS name, v.size, w.name AS warehouse, p.code AS project
    FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    JOIN warehouses w ON w.id = l."warehouseId" LEFT JOIN projects p ON p.id = l."projectId"
    WHERE l."entryType" NOT IN ('RESERVATION', 'RESERVATION_RELEASE')
    ORDER BY l.id DESC LIMIT ${limit}`;
}

export async function lowStock(limit = 200) {
  return db.$queryRaw<{ variantId: string; sku: string; name: string; size: string; unit: string; min: string; onhand: string; avail: string }[]>`
    SELECT v.id AS "variantId", v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit,
           COALESCE(v."minStock", m."minStock")::text AS min,
           COALESCE(SUM(b."onHand"), 0)::text AS onhand,
           COALESCE(SUM(b."onHand" - b.reserved), 0)::text AS avail
    FROM material_variants v JOIN materials m ON m.id = v."materialId"
    LEFT JOIN stock_balances b ON b."variantId" = v.id AND b."warehouseId" IN (SELECT id FROM warehouses WHERE type = 'NORMAL')
    WHERE v."isActive" AND m."isActive"
    GROUP BY v.id, v.sku, m."nameAz", v.size, m."unitCode", v."minStock", m."minStock"
    HAVING COALESCE(v."minStock", m."minStock") > 0 AND COALESCE(SUM(b."onHand" - b.reserved), 0) <= COALESCE(v."minStock", m."minStock")
    ORDER BY COALESCE(SUM(b."onHand" - b.reserved), 0) - COALESCE(v."minStock", m."minStock") ASC LIMIT ${limit}`;
}

export interface StockFilter {
  q?: string;
  warehouseId?: string;
  categoryId?: string;
  group?: string;
  size?: string;
  onlyPositive?: boolean;
  status?: "low" | "out" | "";
  page?: number;
  pageSize?: number;
}

export async function stockList(f: StockFilter) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 10), 5000);
  const page = Math.max(f.page ?? 1, 1);
  const conds: Prisma.Sql[] = [Prisma.sql`v."isActive" AND m."isActive"`];
  if (f.q?.trim()) {
    const like = `%${f.q.trim().slice(0, 80)}%`;
    conds.push(Prisma.sql`(m."nameAz" ILIKE ${like} OR m."nameEn" ILIKE ${like} OR v.sku ILIKE ${like} OR m.code ILIKE ${like} OR m.model ILIKE ${like} OR m."originalCode" ILIKE ${like})`);
  }
  if (f.categoryId) conds.push(Prisma.sql`m."categoryId" = ${f.categoryId}::uuid`);
  if (f.group === "ENGINEER" || f.group === "WORKER") conds.push(Prisma.sql`m."workerGroup" IN (${f.group}::"WorkerGroup", 'BOTH')`);
  else if (f.group === "BOTH" || f.group === "NOT_APPLICABLE") conds.push(Prisma.sql`m."workerGroup" = ${f.group}::"WorkerGroup"`);
  if (f.size) conds.push(Prisma.sql`v.size = ${f.size}`);
  const whCond = f.warehouseId ? Prisma.sql`AND b."warehouseId" = ${f.warehouseId}::uuid` : Prisma.sql`AND b."warehouseId" IN (SELECT id FROM warehouses WHERE type = 'NORMAL')`;
  const having: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.onlyPositive) having.push(Prisma.sql`COALESCE(SUM(b."onHand"), 0) > 0`);
  if (f.status === "out") having.push(Prisma.sql`COALESCE(SUM(b."onHand" - b.reserved), 0) <= 0`);
  if (f.status === "low") having.push(Prisma.sql`COALESCE(v."minStock", m."minStock") > 0 AND COALESCE(SUM(b."onHand" - b.reserved), 0) <= COALESCE(v."minStock", m."minStock")`);
  const where = Prisma.join(conds, " AND ");
  const hav = Prisma.join(having, " AND ");
  const base = Prisma.sql`
    FROM material_variants v JOIN materials m ON m.id = v."materialId" JOIN categories c ON c.id = m."categoryId"
    LEFT JOIN stock_balances b ON b."variantId" = v.id ${whCond}
    LEFT JOIN warehouses w ON w.id = b."warehouseId"
    WHERE ${where}
    GROUP BY v.id, v.sku, v.size, v.color, v."minStock", m.id, m.code, m."nameAz", m."nameEn", m."workerGroup", m."unitCode", m."minStock", m.model, c."nameAz"
    HAVING ${hav}`;
  const [rows, cnt] = await Promise.all([
    db.$queryRaw<{ variantId: string; materialId: string; sku: string; size: string; color: string; code: string; name: string; nameEn: string | null; model: string | null; workerGroup: string; unit: string; category: string; min: string; onhand: string; reserved: string; locations: string | null }[]>`
      SELECT v.id AS "variantId", m.id AS "materialId", v.sku, v.size, v.color, m.code, m."nameAz" AS name, m."nameEn", m.model, m."workerGroup"::text AS "workerGroup",
             m."unitCode" AS unit, c."nameAz" AS category, COALESCE(v."minStock", m."minStock")::text AS min,
             COALESCE(SUM(b."onHand"), 0)::text AS onhand, COALESCE(SUM(b.reserved), 0)::text AS reserved,
             STRING_AGG(REPLACE(w.name, 'Sahə anbarı — ', 'Sahə ') || ': ' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM b."onHand"::text)), ' · ' ORDER BY w."projectId" NULLS FIRST, w.code) FILTER (WHERE b."onHand" > 0) AS locations
      ${base}
      ORDER BY m."nameAz", m.code, v.size LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (SELECT v.id ${base}) x`,
  ]);
  return { rows, total: Number(cnt[0]?.n ?? 0), page, pageSize };
}

/** Per-warehouse balances for one variant + totals (material card). */
export async function variantBalances(variantId: string) {
  return db.stockBalance.findMany({ where: { variantId }, orderBy: { warehouseId: "asc" } });
}

export async function totalOnHand(variantId: string) {
  const r = await db.$queryRaw<{ q: string }[]>`
    SELECT COALESCE(SUM(b."onHand"), 0)::text AS q FROM stock_balances b JOIN warehouses w ON w.id = b."warehouseId"
    WHERE b."variantId" = ${variantId}::uuid AND w.type = 'NORMAL'`;
  return D(r[0]?.q ?? 0);
}

/** Project material report: issued, returned, net per variant (+ split employee PPE vs general project issue). */
export async function projectReport(projectId: string, from?: Date, to?: Date) {
  const conds: Prisma.Sql[] = [Prisma.sql`l."projectId" = ${projectId}::uuid`, Prisma.sql`l."entryType" IN ('ISSUE', 'RETURN_IN')`];
  if (from) conds.push(Prisma.sql`l."movementDate" >= ${from}`);
  if (to) conds.push(Prisma.sql`l."movementDate" <= ${to}`);
  return db.$queryRaw<{ variantId: string; sku: string; name: string; size: string; unit: string; category: string; workerGroup: string; issuedProject: string; issuedEmployee: string; returned: string; net: string }[]>`
    SELECT v.id AS "variantId", v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit, c."nameAz" AS category, m."workerGroup"::text AS "workerGroup",
      COALESCE(SUM(l.qty) FILTER (WHERE l."entryType" = 'ISSUE' AND l."employeeId" IS NULL), 0)::text AS "issuedProject",
      COALESCE(SUM(l.qty) FILTER (WHERE l."entryType" = 'ISSUE' AND l."employeeId" IS NOT NULL), 0)::text AS "issuedEmployee",
      COALESCE(SUM(l.qty) FILTER (WHERE l."entryType" = 'RETURN_IN'), 0)::text AS returned,
      COALESCE(SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END), 0)::text AS net
    FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId" JOIN categories c ON c.id = m."categoryId"
    WHERE ${Prisma.join(conds, " AND ")}
    GROUP BY v.id, v.sku, m."nameAz", v.size, m."unitCode", c."nameAz", m."workerGroup"
    ORDER BY c."nameAz", m."nameAz", v.size`;
}

export async function projectsSummary() {
  return db.$queryRaw<{ projectId: string; code: string; name: string; isActive: boolean; issued: string; returned: string; lastMove: Date | null; docs: bigint }[]>`
    SELECT p.id AS "projectId", p.code, p.name, p."isActive",
      COALESCE(SUM(l.qty) FILTER (WHERE l."entryType" = 'ISSUE'), 0)::text AS issued,
      COALESCE(SUM(l.qty) FILTER (WHERE l."entryType" = 'RETURN_IN'), 0)::text AS returned,
      MAX(l."movementDate") AS "lastMove", COUNT(DISTINCT l."docId") AS docs
    FROM projects p LEFT JOIN stock_ledger l ON l."projectId" = p.id AND l."entryType" IN ('ISSUE', 'RETURN_IN')
    GROUP BY p.id ORDER BY p."isActive" DESC, p.code`;
}

/** Movement journal (ledger) with filters — used by journal page and exports. */
export async function ledgerJournal(f: { variantId?: string; warehouseId?: string; projectId?: string; employeeId?: string; type?: string; from?: Date; to?: Date; q?: string; limit?: number; offset?: number }) {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.variantId) conds.push(Prisma.sql`l."variantId" = ${f.variantId}::uuid`);
  if (f.warehouseId) conds.push(Prisma.sql`l."warehouseId" = ${f.warehouseId}::uuid`);
  if (f.projectId) conds.push(Prisma.sql`l."projectId" = ${f.projectId}::uuid`);
  if (f.employeeId) conds.push(Prisma.sql`l."employeeId" = ${f.employeeId}::uuid`);
  if (f.type) conds.push(Prisma.sql`l."entryType" = ${f.type}::"LedgerEntryType"`);
  if (f.from) conds.push(Prisma.sql`l."movementDate" >= ${f.from}`);
  if (f.to) conds.push(Prisma.sql`l."movementDate" <= ${f.to}`);
  if (f.q?.trim()) {
    const like = `%${f.q.trim().slice(0, 80)}%`;
    conds.push(Prisma.sql`(v.sku ILIKE ${like} OR m."nameAz" ILIKE ${like} OR l."docNumber" ILIKE ${like})`);
  }
  const where = Prisma.join(conds, " AND ");
  const limit = Math.min(f.limit ?? 100, 20000);
  const [rows, cnt] = await Promise.all([
    db.$queryRaw<{ id: bigint; entryType: string; docType: string; docId: string; docNumber: string; qty: string; movementDate: Date; postedAt: Date; reason: string | null; sku: string; name: string; size: string; unit: string; warehouse: string; project: string | null; employee: string | null; userName: string | null; reversalOfId: bigint | null }[]>`
      SELECT l.id, l."entryType"::text AS "entryType", l."docType"::text AS "docType", l."docId"::text AS "docId", l."docNumber", l.qty::text AS qty, l."movementDate", l."postedAt", l.reason,
             v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit, w.name AS warehouse, p.code AS project, e."fullName" AS employee, u.name AS "userName", l."reversalOfId"
      FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
      JOIN warehouses w ON w.id = l."warehouseId" LEFT JOIN projects p ON p.id = l."projectId"
      LEFT JOIN employees e ON e.id = l."employeeId" LEFT JOIN users u ON u.id = l."userId"
      WHERE ${where} ORDER BY l.id DESC LIMIT ${limit} OFFSET ${f.offset ?? 0}`,
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId" WHERE ${where}`,
  ]);
  return { rows, total: Number(cnt[0]?.n ?? 0) };
}

/** PPE split by worker group (issued to employees). */
export async function ppeByGroup(from?: Date, to?: Date) {
  const conds: Prisma.Sql[] = [Prisma.sql`l."employeeId" IS NOT NULL`, Prisma.sql`l."entryType" IN ('ISSUE','RETURN_IN')`];
  if (from) conds.push(Prisma.sql`l."movementDate" >= ${from}`);
  if (to) conds.push(Prisma.sql`l."movementDate" <= ${to}`);
  return db.$queryRaw<{ employeeGroup: string; sku: string; name: string; size: string; unit: string; net: string }[]>`
    SELECT e."group"::text AS "employeeGroup", v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit,
      SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END)::text AS net
    FROM stock_ledger l JOIN employees e ON e.id = l."employeeId" JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE ${Prisma.join(conds, " AND ")}
    GROUP BY e."group", v.sku, m."nameAz", v.size, m."unitCode" ORDER BY e."group", m."nameAz", v.size`;
}

export async function poReceiptStatusReport() {
  return db.$queryRaw<{ poNumber: string; status: string; supplier: string; orderDate: Date; expectedDate: Date | null; lineNo: number; sku: string; name: string; ordered: string; received: string; open: string }[]>`
    SELECT p."poNumber", p.status::text AS status, s.name AS supplier, p."orderDate", p."expectedDate", l."lineNo", v.sku, m."nameAz" AS name,
      l."qtyOrdered"::text AS ordered, l."qtyReceived"::text AS received, GREATEST(l."qtyOrdered" - l."qtyReceived", 0)::text AS open
    FROM purchase_orders p JOIN suppliers s ON s.id = p."supplierId" JOIN po_lines l ON l."poId" = p.id
    JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE p.status <> 'DRAFT' ORDER BY p."orderDate" DESC, p."poNumber", l."lineNo"`;
}

export async function inventoryDifferences(from?: Date, to?: Date) {
  const conds: Prisma.Sql[] = [Prisma.sql`c.status = 'POSTED'`];
  if (from) conds.push(Prisma.sql`c."countDate" >= ${from}`);
  if (to) conds.push(Prisma.sql`c."countDate" <= ${to}`);
  return db.$queryRaw<{ number: string; mode: string; countDate: Date; warehouse: string; sku: string; name: string; size: string; system: string; counted: string; diff: string }[]>`
    SELECT c.number, c.mode::text AS mode, c."countDate", w.name AS warehouse, v.sku, m."nameAz" AS name, v.size,
      COALESCE(l."systemQty", 0)::text AS system, l."countedQty"::text AS counted, (l."countedQty" - COALESCE(l."systemQty", 0))::text AS diff
    FROM inventory_counts c JOIN inventory_count_lines l ON l."countId" = c.id JOIN warehouses w ON w.id = c."warehouseId"
    JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE ${Prisma.join(conds, " AND ")} ORDER BY c."countDate" DESC, c.number, v.sku`;
}

/** Turnover per variant in a date range: opening balance, in, out, closing. */
export async function turnover(from: Date, to: Date, warehouseId?: string) {
  const wh = warehouseId ? Prisma.sql`AND l."warehouseId" = ${warehouseId}::uuid` : Prisma.sql`AND l."warehouseId" IN (SELECT id FROM warehouses WHERE type = 'NORMAL')`;
  return db.$queryRaw<{ sku: string; name: string; size: string; unit: string; opening: string; incoming: string; outgoing: string; closing: string }[]>`
    WITH x AS (
      SELECT l."variantId",
        SUM(CASE WHEN l."movementDate" < ${from} THEN (CASE WHEN l."entryType" IN ('OPENING','RECEIPT','RETURN_IN','TRANSFER_IN','ADJUSTMENT_PLUS') THEN l.qty WHEN l."entryType" IN ('ISSUE','RETURN_OUT','TRANSFER_OUT','ADJUSTMENT_MINUS') THEN -l.qty ELSE 0 END) ELSE 0 END) AS opening,
        SUM(CASE WHEN l."movementDate" BETWEEN ${from} AND ${to} AND l."entryType" IN ('OPENING','RECEIPT','RETURN_IN','TRANSFER_IN','ADJUSTMENT_PLUS') THEN l.qty ELSE 0 END) AS incoming,
        SUM(CASE WHEN l."movementDate" BETWEEN ${from} AND ${to} AND l."entryType" IN ('ISSUE','RETURN_OUT','TRANSFER_OUT','ADJUSTMENT_MINUS') THEN l.qty ELSE 0 END) AS outgoing
      FROM stock_ledger l WHERE l."movementDate" <= ${to} ${wh} GROUP BY l."variantId")
    SELECT v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit, x.opening::text AS opening, x.incoming::text AS incoming, x.outgoing::text AS outgoing,
      (x.opening + x.incoming - x.outgoing)::text AS closing
    FROM x JOIN material_variants v ON v.id = x."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE x.opening <> 0 OR x.incoming <> 0 OR x.outgoing <> 0 ORDER BY m."nameAz", v.size`;
}

/** Employee PPE history: ledger (system) + historical import rows (clearly labelled as history). */
export async function employeeHistory(employeeId: string) {
  const [ledger, hist] = await Promise.all([
    ledgerJournal({ employeeId, limit: 1000 }),
    (async () => {
      const e = await db.employee.findUnique({ where: { id: employeeId } });
      if (!e) return [];
      return db.historicalIssue.findMany({ where: { OR: [{ employeeId }, { employeeName: { equals: e.fullName, mode: "insensitive" } }] }, orderBy: { issueDate: "desc" }, take: 1000 });
    })(),
  ]);
  return { ledger: ledger.rows, historical: hist };
}

/** Consistency check: projection must equal ledger sum. Used by tests and the /api/health?deep=1 endpoint. */
export async function projectionMismatches() {
  return db.$queryRaw<{ warehouseId: string; variantId: string; onHand: string; ledger: string }[]>`
    SELECT b."warehouseId"::text, b."variantId"::text, b."onHand"::text AS "onHand", COALESCE(s.q, 0)::text AS ledger
    FROM stock_balances b LEFT JOIN (
      SELECT "warehouseId", "variantId", SUM(CASE WHEN "entryType" IN ('OPENING','RECEIPT','RETURN_IN','TRANSFER_IN','ADJUSTMENT_PLUS') THEN qty
                                              WHEN "entryType" IN ('ISSUE','RETURN_OUT','TRANSFER_OUT','ADJUSTMENT_MINUS') THEN -qty ELSE 0 END) AS q
      FROM stock_ledger GROUP BY "warehouseId", "variantId") s ON s."warehouseId" = b."warehouseId" AND s."variantId" = b."variantId"
    WHERE b."onHand" <> COALESCE(s.q, 0)`;
}
