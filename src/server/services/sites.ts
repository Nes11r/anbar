import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, withTx, type Tx } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { audit, statusChange, type Actor } from "../audit";
import { nextNumber } from "../stock/ledger";
import { D, validateQty } from "../stock/rules";
import { assertVariantsUsable, unitRulesFor } from "./common";

/**
 * Site (project) warehouses.
 *   Office → (project manager collects) → TRANSFER → project's SITE warehouse → ISSUE_EMPLOYEE → worker
 * On a site:  total = in site stock + with workers.
 */

export function siteWarehouseCode(projectCode: string) {
  return `SAHE-${projectCode.toUpperCase()}`.slice(0, 40);
}

/** Creates (or returns) the project's site warehouse. Called when a project is created. */
export async function ensureSiteWarehouse(tx: Tx, project: { id: string; code: string; location?: string | null }) {
  const existing = await tx.warehouse.findUnique({ where: { projectId: project.id } });
  if (existing) return existing;
  let code = siteWarehouseCode(project.code);
  if (await tx.warehouse.findUnique({ where: { code } })) code = `${code}-${project.id.slice(0, 4)}`.toUpperCase();
  return tx.warehouse.create({
    data: { code, name: `Sahə anbarı — ${project.code}`, type: "NORMAL", location: project.location ?? null, projectId: project.id },
  });
}

export function assertProjectInScope(actor: Actor, projectId: string) {
  if (actor.projectId && actor.projectId !== projectId) throw new ForbiddenError("Bu layihə sizin səlahiyyət dairənizdə deyil.");
}

export interface SiteRow {
  projectId: string;
  code: string;
  name: string;
  isActive: boolean;
  warehouseId: string | null;
  inStock: Prisma.Decimal;
  withWorkers: Prisma.Decimal;
  total: Prisma.Decimal;
  workers: number;
  lastReport: Date | null;
}

/** One row per project: site stock, items with workers, total, last daily report. */
export async function siteOverview(scopeProjectId?: string | null): Promise<SiteRow[]> {
  const projects = await db.project.findMany({
    where: scopeProjectId ? { id: scopeProjectId } : {},
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: { siteWarehouse: true },
  });
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const whIds = projects.map((p) => p.siteWarehouse?.id).filter((x): x is string => !!x);
  const [stock, held, reports] = await Promise.all([
    whIds.length
      ? db.$queryRaw<{ warehouseId: string; q: string }[]>`SELECT "warehouseId"::text AS "warehouseId", SUM("onHand")::text AS q FROM stock_balances WHERE "warehouseId" = ANY(${whIds}::uuid[]) GROUP BY "warehouseId"`
      : Promise.resolve([]),
    db.$queryRaw<{ projectId: string; q: string; workers: bigint }[]>`
      SELECT x."projectId", SUM(x.net)::text AS q, COUNT(DISTINCT x."employeeId") FILTER (WHERE x.net > 0) AS workers FROM (
        SELECT e."projectId"::text AS "projectId", l."employeeId", l."variantId",
               SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END) AS net
        FROM stock_ledger l JOIN employees e ON e.id = l."employeeId"
        JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
        WHERE l."entryType" IN ('ISSUE','RETURN_IN') AND NOT m."isConsumable" AND e."projectId" = ANY(${ids}::uuid[])
        GROUP BY e."projectId", l."employeeId", l."variantId") x
      GROUP BY x."projectId"`,
    db.siteReport.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _max: { reportDate: true } }),
  ]);
  const sMap = new Map(stock.map((r) => [r.warehouseId, D(r.q)]));
  const hMap = new Map(held.map((r) => [r.projectId, r]));
  const rMap = new Map(reports.map((r) => [r.projectId, r._max.reportDate]));
  return projects.map((p) => {
    const inStock = p.siteWarehouse ? sMap.get(p.siteWarehouse.id) ?? D(0) : D(0);
    const h = hMap.get(p.id);
    const withWorkers = h ? Prisma.Decimal.max(D(h.q), 0) : D(0);
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      isActive: p.isActive,
      warehouseId: p.siteWarehouse?.id ?? null,
      inStock,
      withWorkers,
      total: inStock.plus(withWorkers),
      workers: Number(h?.workers ?? 0),
      lastReport: rMap.get(p.id) ?? null,
    };
  });
}

export interface SiteMaterialRow {
  variantId: string;
  sku: string;
  name: string;
  size: string;
  unit: string;
  workerGroup: string;
  inStock: Prisma.Decimal;
  reserved: Prisma.Decimal;
  withWorkers: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** Per material on one site: in site stock / with workers / total. */
export async function siteMaterials(projectId: string): Promise<SiteMaterialRow[]> {
  const wh = await db.warehouse.findUnique({ where: { projectId } });
  const rows = await db.$queryRaw<{ variantId: string; sku: string; name: string; size: string; unit: string; workerGroup: string; instock: string; reserved: string; withworkers: string }[]>`
    WITH st AS (
      SELECT "variantId", "onHand", reserved FROM stock_balances WHERE "warehouseId" = ${wh?.id ?? "00000000-0000-0000-0000-000000000000"}::uuid
    ), hw AS (
      SELECT l."variantId", SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END) AS q
      FROM stock_ledger l JOIN employees e ON e.id = l."employeeId"
      JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
      WHERE e."projectId" = ${projectId}::uuid AND l."entryType" IN ('ISSUE','RETURN_IN') AND NOT m."isConsumable"
      GROUP BY l."variantId"
    )
    SELECT v.id AS "variantId", v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit, m."workerGroup"::text AS "workerGroup",
           COALESCE(st."onHand", 0)::text AS instock, COALESCE(st.reserved, 0)::text AS reserved, GREATEST(COALESCE(hw.q, 0), 0)::text AS withworkers
    FROM material_variants v JOIN materials m ON m.id = v."materialId"
    LEFT JOIN st ON st."variantId" = v.id LEFT JOIN hw ON hw."variantId" = v.id
    WHERE COALESCE(st."onHand", 0) <> 0 OR COALESCE(hw.q, 0) <> 0
    ORDER BY m."nameAz", v.size`;
  return rows.map((r) => {
    const inStock = D(r.instock), withWorkers = D(r.withworkers);
    return { variantId: r.variantId, sku: r.sku, name: r.name, size: r.size, unit: r.unit, workerGroup: r.workerGroup, inStock, reserved: D(r.reserved), withWorkers, total: inStock.plus(withWorkers) };
  });
}

/** Who on this site holds what (workers currently assigned to the project; consumables are used up, not held). */
export async function siteWorkerHoldings(projectId: string) {
  return db.$queryRaw<{ employeeId: string; fullName: string; code: string; group: string; sku: string; name: string; size: string; unit: string; qty: string }[]>`
    SELECT e.id AS "employeeId", e."fullName", e.code, e."group"::text AS "group", v.sku, m."nameAz" AS name, v.size, m."unitCode" AS unit,
           SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END)::text AS qty
    FROM stock_ledger l JOIN employees e ON e.id = l."employeeId" JOIN material_variants v ON v.id = l."variantId" JOIN materials m ON m.id = v."materialId"
    WHERE e."projectId" = ${projectId}::uuid AND l."entryType" IN ('ISSUE','RETURN_IN') AND NOT m."isConsumable"
    GROUP BY e.id, e."fullName", e.code, e."group", v.sku, m."nameAz", v.size, m."unitCode"
    HAVING SUM(CASE WHEN l."entryType" = 'ISSUE' THEN l.qty ELSE -l.qty END) > 0
    ORDER BY e."fullName", m."nameAz", v.size`;
}

/** Site figures for given variants (used by MR to show "the site already has X"). */
export async function siteFiguresFor(projectId: string, variantIds: string[]) {
  const out = new Map<string, { inStock: Prisma.Decimal; withWorkers: Prisma.Decimal }>();
  if (!variantIds.length) return out;
  const all = await siteMaterials(projectId);
  for (const r of all) if (variantIds.includes(r.variantId)) out.set(r.variantId, { inStock: r.inStock, withWorkers: r.withWorkers });
  return out;
}

// ───────────────────────── Daily site report ─────────────────────────

export const siteReportSchema = z.object({
  projectId: z.string().uuid("Layihə seçilməyib."),
  reportDate: z.coerce.date({ errorMap: () => ({ message: "Tarix düzgün deyil." }) }),
  reportedBy: z.string().trim().min(2, "Hesabatı verən şəxs göstərilməlidir.").max(200),
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        stockQty: z.coerce.number().min(0, "Miqdar mənfi ola bilməz."),
        withWorkersQty: z.coerce.number().min(0, "Miqdar mənfi ola bilməz."),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1, "Ən azı bir material sətri olmalıdır."),
});
export type SiteReportInput = z.infer<typeof siteReportSchema>;

/** Saves the daily report and snapshots the system figures at that moment (differences stay visible later). */
export async function createSiteReport(actor: Actor, input: SiteReportInput) {
  if (!can(actor.role, "site.report")) throw new ForbiddenError();
  const d = siteReportSchema.parse(input);
  assertProjectInScope(actor, d.projectId);
  if (d.reportDate > new Date(Date.now() + 86400_000)) throw new AppError("Hesabat tarixi gələcəkdə ola bilməz.", "VALIDATION");
  const ids = d.lines.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) throw new AppError("Eyni material hesabatda iki dəfə göstərilib.", "VALIDATION");
  await assertVariantsUsable(db, ids);
  const units = await unitRulesFor(db, ids);
  for (const l of d.lines) {
    for (const q of [l.stockQty, l.withWorkersQty]) {
      const e = validateQty(q, units.get(l.variantId) ?? false, { allowZero: true });
      if (e) throw new AppError(e, "VALIDATION");
    }
  }
  const sys = new Map((await siteMaterials(d.projectId)).map((r) => [r.variantId, r]));
  return withTx(async (tx) => {
    const r = await tx.siteReport.create({
      data: {
        projectId: d.projectId,
        reportDate: d.reportDate,
        reportedBy: d.reportedBy,
        notes: d.notes ?? null,
        createdById: actor.id,
        lines: {
          create: d.lines.map((l) => ({
            variantId: l.variantId,
            stockQty: D(l.stockQty),
            withWorkersQty: D(l.withWorkersQty),
            systemStock: sys.get(l.variantId)?.inStock ?? D(0),
            systemWithWorkers: sys.get(l.variantId)?.withWorkers ?? D(0),
            note: l.note ?? null,
          })),
        },
      },
      include: { lines: true },
    });
    const diffs = r.lines.filter((l) => !D(l.stockQty).eq(l.systemStock) || !D(l.withWorkersQty).eq(l.systemWithWorkers)).length;
    await audit(tx, actor, "CREATE", "SiteReport", r.id, `Sahə hesabatı (${d.reportDate.toISOString().slice(0, 10)}): ${r.lines.length} sətir, ${diffs} fərq`);
    return { id: r.id, diffs };
  });
}

/**
 * Turn the reported SITE STOCK figures into a draft cycle count for the site warehouse.
 * Nothing changes until a warehouse manager approves that count (normal approval flow).
 * "With workers" differences are not auto-corrected — they mean an issue/return was not recorded.
 */
export async function siteReportToCount(actor: Actor, reportId: string) {
  if (!can(actor.role, "inventory.edit")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const r = await tx.siteReport.findUnique({ where: { id: reportId }, include: { lines: true } });
    if (!r) throw new NotFoundError("Sahə hesabatı");
    assertProjectInScope(actor, r.projectId);
    const wh = await tx.warehouse.findUnique({ where: { projectId: r.projectId } });
    if (!wh) throw new AppError("Bu layihənin sahə anbarı yoxdur.");
    const lines = r.lines.filter((l) => !D(l.stockQty).eq(l.systemStock));
    if (!lines.length) throw new AppError("Stok üzrə fərq yoxdur — sayım lazım deyil.");
    const number = await nextNumber(tx, "INV", r.reportDate);
    const c = await tx.inventoryCount.create({
      data: {
        number,
        mode: "CYCLE",
        warehouseId: wh.id,
        countDate: r.reportDate,
        countedBy: r.reportedBy,
        notes: `Sahə hesabatından yaradılıb (${r.reportDate.toISOString().slice(0, 10)}). Təsdiq edilənə qədər qalıq dəyişmir.`,
        createdById: actor.id,
        lines: { create: lines.map((l) => ({ variantId: l.variantId, countedQty: l.stockQty, note: l.note })) },
      },
    });
    await statusChange(tx, actor, "InventoryCount", c.id, null, "DRAFT", "Sahə hesabatından");
    await audit(tx, actor, "CREATE", "InventoryCount", c.id, `${number}: sahə hesabatı fərqlərindən qaralama sayım (${lines.length} sətir)`);
    return { id: c.id, number, redirect: `/inventory/${c.id}` };
  });
}
