import { z } from "zod";
import { db, withTx } from "@/lib/db";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/errors";
import { audit, statusChange, type Actor } from "../audit";
import { applyMovements, nextNumber, type LedgerMovement } from "../stock/ledger";
import { D, validateQty } from "../stock/rules";
import { assertVariantsUsable, unitRulesFor } from "./common";

export const countLineSchema = z.object({
  variantId: z.string().uuid("Material variantı seçilməyib."),
  countedQty: z.coerce.number({ invalid_type_error: "Sayılmış miqdar rəqəm olmalıdır." }).min(0, "Miqdar mənfi ola bilməz."),
  note: z.string().max(500).optional().nullable(),
});

export const countSchema = z.object({
  mode: z.enum(["OPENING", "CYCLE"]),
  warehouseId: z.string().uuid("Anbar seçilməyib."),
  countDate: z.coerce.date({ errorMap: () => ({ message: "Sayım tarixi düzgün deyil." }) }),
  countedBy: z.string().trim().min(2, "Sayımı aparan şəxs göstərilməlidir.").max(200),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(countLineSchema).min(1, "Ən azı bir sətir əlavə edin."),
});

export type CountInput = z.infer<typeof countSchema>;

async function assertCountScope(actor: Actor, warehouseId: string) {
  if (!actor.projectId) return;
  const site = await db.warehouse.findUnique({ where: { projectId: actor.projectId } });
  if (!site || site.id !== warehouseId) throw new ForbiddenError("Yalnız öz layihənizin sahə anbarında sayım apara bilərsiniz.");
}

async function validateLines(lines: CountInput["lines"]) {
  const ids = lines.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) throw new AppError("Eyni variant sayımda iki dəfə göstərilib.", "VALIDATION");
  await assertVariantsUsable(db, ids);
  const units = await unitRulesFor(db, ids);
  for (const l of lines) {
    const err = validateQty(l.countedQty, units.get(l.variantId) ?? false, { allowZero: true });
    if (err) throw new AppError(err, "VALIDATION");
  }
}

export async function createCount(actor: Actor, input: CountInput) {
  if (!can(actor.role, "inventory.edit")) throw new ForbiddenError();
  const data = countSchema.parse(input);
  await assertCountScope(actor, data.warehouseId);
  await validateLines(data.lines);
  return withTx(async (tx) => {
    const number = await nextNumber(tx, data.mode === "OPENING" ? "INV0" : "INV", data.countDate);
    const c = await tx.inventoryCount.create({
      data: {
        number,
        mode: data.mode,
        warehouseId: data.warehouseId,
        countDate: data.countDate,
        countedBy: data.countedBy,
        notes: data.notes ?? null,
        createdById: actor.id,
        lines: { create: data.lines.map((l) => ({ variantId: l.variantId, countedQty: D(l.countedQty), note: l.note ?? null })) },
      },
    });
    await audit(tx, actor, "CREATE", "InventoryCount", c.id, `${number} yaradıldı (${data.lines.length} sətir)`);
    await statusChange(tx, actor, "InventoryCount", c.id, null, "DRAFT");
    return c;
  });
}

export async function updateCount(actor: Actor, id: string, version: number, input: CountInput) {
  if (!can(actor.role, "inventory.edit")) throw new ForbiddenError();
  const data = countSchema.parse(input);
  await assertCountScope(actor, data.warehouseId);
  await validateLines(data.lines);
  return withTx(async (tx) => {
    const res = await tx.inventoryCount.updateMany({
      where: { id, version, status: "DRAFT" },
      data: {
        mode: data.mode,
        warehouseId: data.warehouseId,
        countDate: data.countDate,
        countedBy: data.countedBy,
        notes: data.notes ?? null,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) throw new ConflictError();
    await tx.inventoryCountLine.deleteMany({ where: { countId: id } });
    await tx.inventoryCountLine.createMany({
      data: data.lines.map((l) => ({ countId: id, variantId: l.variantId, countedQty: D(l.countedQty), note: l.note ?? null })),
    });
    await audit(tx, actor, "UPDATE", "InventoryCount", id, `Sayım sətirləri yeniləndi (${data.lines.length})`);
  });
}

/**
 * Approve = post. OPENING writes OPENING entries (only where the warehouse has never held the variant).
 * CYCLE writes ADJUSTMENT_PLUS / ADJUSTMENT_MINUS for the difference against the locked system quantity.
 * Idempotent: a second approval returns { alreadyPosted: true } and writes nothing.
 */
export async function approveCount(actor: Actor, id: string) {
  if (!can(actor.role, "inventory.approve")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM inventory_counts WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked[0]) throw new NotFoundError("Sayım sənədi");
    if (locked[0].status === "POSTED") return { alreadyPosted: true };
    if (locked[0].status !== "DRAFT") throw new AppError("Yalnız qaralama sənəd təsdiqlənə bilər.");

    const c = await tx.inventoryCount.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (c.lines.length === 0) throw new AppError("Sayımda sətir yoxdur.");
    const variantIds = c.lines.map((l) => l.variantId);

    // Lock affected balances first (consistent order with applyMovements)
    for (const v of [...variantIds].sort()) {
      await tx.$executeRaw`
        INSERT INTO stock_balances ("warehouseId", "variantId", "onHand", reserved, "updatedAt")
        VALUES (${c.warehouseId}::uuid, ${v}::uuid, 0, 0, now()) ON CONFLICT DO NOTHING`;
    }
    const balances = await tx.$queryRaw<{ variantId: string; onHand: string }[]>`
      SELECT "variantId"::text AS "variantId", "onHand"::text AS "onHand" FROM stock_balances
      WHERE "warehouseId" = ${c.warehouseId}::uuid AND "variantId" = ANY(${variantIds}::uuid[])
      ORDER BY "variantId" FOR UPDATE`;
    const sys = new Map(balances.map((b) => [b.variantId, D(b.onHand)]));

    const movements: LedgerMovement[] = [];
    if (c.mode === "OPENING") {
      const prior = await tx.stockLedgerEntry.groupBy({
        by: ["variantId"],
        where: { warehouseId: c.warehouseId, variantId: { in: variantIds } },
        _count: true,
      });
      if (prior.length > 0) {
        const vs = await tx.materialVariant.findMany({ where: { id: { in: prior.map((p) => p.variantId) } }, select: { sku: true } });
        throw new AppError(
          `Açılış qalığı yalnız hərəkəti olmayan materiallar üçündür. Bu SKU-ların artıq hərəkəti var: ${vs.map((v) => v.sku).join(", ")}. Onlar üçün "Dövri sayım" rejimindən istifadə edin.`,
          "OPENING_NOT_ALLOWED",
        );
      }
    }
    for (const l of c.lines) {
      const s = sys.get(l.variantId) ?? D(0);
      await tx.inventoryCountLine.update({ where: { id: l.id }, data: { systemQty: s } });
      const counted = D(l.countedQty);
      if (c.mode === "OPENING") {
        if (counted.gt(0))
          movements.push({ entryType: "OPENING", warehouseId: c.warehouseId, variantId: l.variantId, qty: counted, docLineId: l.id, idempotencyKey: `INV:${c.id}:${l.id}` });
      } else {
        const diff = counted.minus(s);
        if (!diff.isZero())
          movements.push({
            entryType: diff.gt(0) ? "ADJUSTMENT_PLUS" : "ADJUSTMENT_MINUS",
            warehouseId: c.warehouseId,
            variantId: l.variantId,
            qty: diff.abs(),
            docLineId: l.id,
            idempotencyKey: `INV:${c.id}:${l.id}`,
          });
      }
    }
    // Cycle count adjusts on_hand; reserved quantities must still fit — checked by applyMovements + DB CHECK.
    await applyMovements(tx, { docType: "INVENTORY_COUNT", docId: c.id, docNumber: c.number, movementDate: c.countDate, userId: actor.id, reason: c.mode === "OPENING" ? "İlkin inventarlaşdırma" : "Sayım fərqi" }, movements);
    await tx.inventoryCount.update({ where: { id }, data: { status: "POSTED", approvedById: actor.id, approvedAt: new Date(), version: { increment: 1 } } });
    await statusChange(tx, actor, "InventoryCount", id, "DRAFT", "POSTED");
    await audit(tx, actor, "POST", "InventoryCount", id, `${c.number} təsdiqləndi: ${movements.length} jurnal qeydi`);
    return { alreadyPosted: false, entries: movements.length };
  });
}

export async function cancelCount(actor: Actor, id: string) {
  if (!can(actor.role, "inventory.edit")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const r = await tx.inventoryCount.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED", version: { increment: 1 } } });
    if (r.count === 0) throw new AppError("Yalnız qaralama sənəd ləğv edilə bilər.");
    await statusChange(tx, actor, "InventoryCount", id, "DRAFT", "CANCELLED");
    await audit(tx, actor, "CANCEL", "InventoryCount", id, "Qaralama ləğv edildi");
  });
}
