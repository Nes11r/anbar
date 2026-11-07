import { Prisma, type LedgerDocType, type LedgerEntryType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { applyToBalance, D, entryEffect, reverseType } from "./rules";

export interface LedgerMovement {
  entryType: LedgerEntryType;
  warehouseId: string;
  variantId: string;
  qty: Prisma.Decimal;
  docLineId?: string | null;
  projectId?: string | null;
  employeeId?: string | null;
  /** Unique per movement; a retried post can never write the same movement twice. */
  idempotencyKey: string;
  reversalOfId?: bigint | null;
}

export interface LedgerContext {
  docType: LedgerDocType;
  docId: string;
  docNumber: string;
  movementDate: Date;
  userId: string;
  reason?: string | null;
}

type BalanceRow = { warehouseId: string; variantId: string; onHand: Prisma.Decimal; reserved: Prisma.Decimal };

/**
 * The only code path that writes stock. Must be called inside a transaction.
 *  1. ensures balance rows exist,
 *  2. locks them with SELECT … FOR UPDATE in a deterministic order (no deadlocks between concurrent posts),
 *  3. validates availability per (warehouse, variant),
 *  4. appends ledger rows and updates the projection.
 * DB CHECK constraints are the final safety net.
 */
export async function applyMovements(tx: Tx, ctx: LedgerContext, movements: LedgerMovement[]): Promise<void> {
  if (movements.length === 0) return;

  const keys = Array.from(new Set(movements.map((m) => `${m.warehouseId}|${m.variantId}`))).sort();
  const pairs = keys.map((k) => k.split("|") as [string, string]);

  // 1. Ensure rows exist (no-op when present)
  for (const [w, v] of pairs) {
    await tx.$executeRaw`
      INSERT INTO stock_balances ("warehouseId", "variantId", "onHand", reserved, "updatedAt")
      VALUES (${w}::uuid, ${v}::uuid, 0, 0, now())
      ON CONFLICT ("warehouseId", "variantId") DO NOTHING`;
  }

  // 2. Lock in sorted order
  const locked = new Map<string, BalanceRow>();
  for (const [w, v] of pairs) {
    const rows = await tx.$queryRaw<BalanceRow[]>`
      SELECT "warehouseId"::text AS "warehouseId", "variantId"::text AS "variantId", "onHand", reserved
      FROM stock_balances WHERE "warehouseId" = ${w}::uuid AND "variantId" = ${v}::uuid
      FOR UPDATE`;
    const r = rows[0];
    locked.set(`${w}|${v}`, { warehouseId: w, variantId: v, onHand: D(r.onHand), reserved: D(r.reserved) });
  }

  // 3. Validate per key, in document order
  const ends = new Map<string, { onHand: Prisma.Decimal; reserved: Prisma.Decimal }>();
  for (const key of keys) {
    const start = locked.get(key)!;
    const ms = movements.filter((m) => `${m.warehouseId}|${m.variantId}` === key);
    const res = applyToBalance(start, ms);
    if (!res.ok) {
      const label = await describeVariant(tx, start.variantId, start.warehouseId);
      throw new AppError(
        res.reason === "INSUFFICIENT_RESERVED"
          ? `${label}: rezerv kifayət deyil (rezervdə ${fmt(res.available)}, tələb ${fmt(res.requested)}).`
          : `${label}: mövcud qalıq kifayət deyil (mövcud ${fmt(res.available)}, tələb olunan ${fmt(res.requested)}).`,
        "INSUFFICIENT_STOCK",
      );
    }
    ends.set(key, res.end);
  }

  // 4. Append ledger + update projection
  await tx.stockLedgerEntry.createMany({
    data: movements.map((m) => ({
      entryType: m.entryType,
      warehouseId: m.warehouseId,
      variantId: m.variantId,
      qty: m.qty,
      docType: ctx.docType,
      docId: ctx.docId,
      docLineId: m.docLineId ?? null,
      docNumber: ctx.docNumber,
      projectId: m.projectId ?? null,
      employeeId: m.employeeId ?? null,
      movementDate: ctx.movementDate,
      userId: ctx.userId,
      reason: ctx.reason ?? null,
      idempotencyKey: m.idempotencyKey,
      reversalOfId: m.reversalOfId ?? null,
    })),
  });

  for (const key of keys) {
    const [w, v] = key.split("|");
    const e = ends.get(key)!;
    await tx.$executeRaw`
      UPDATE stock_balances SET "onHand" = ${e.onHand}, reserved = ${e.reserved}, "updatedAt" = now()
      WHERE "warehouseId" = ${w}::uuid AND "variantId" = ${v}::uuid`;
  }
}

/** Build movements that cancel every ledger entry of a document. */
export async function reversalMovements(tx: Tx, docType: LedgerDocType, docId: string): Promise<LedgerMovement[]> {
  const entries = await tx.stockLedgerEntry.findMany({
    where: { docType, docId, reversalOfId: null },
    orderBy: { id: "asc" },
  });
  const already = await tx.stockLedgerEntry.count({ where: { reversalOfId: { in: entries.map((e) => e.id) } } });
  if (already > 0) throw new AppError("Bu sənəd artıq ləğv edilib.", "ALREADY_REVERSED");
  // Stock-increasing reversal entries first, so a transfer reversal validates against the restored quantity.
  const ms = entries.map<LedgerMovement>((e) => ({
    entryType: reverseType(e.entryType),
    warehouseId: e.warehouseId,
    variantId: e.variantId,
    qty: D(e.qty),
    docLineId: e.docLineId,
    projectId: e.projectId,
    employeeId: e.employeeId,
    idempotencyKey: `REV:${e.idempotencyKey}`,
    reversalOfId: e.id,
  }));
  return ms.sort((a, b) => entryEffect(b.entryType).onHand - entryEffect(a.entryType).onHand);
}

async function describeVariant(tx: Tx, variantId: string, warehouseId: string) {
  const v = await tx.materialVariant.findUnique({ where: { id: variantId }, include: { material: true } });
  const w = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!v) return "Material";
  return `${v.sku} – ${v.material.nameAz}${v.size ? ` (${v.size})` : ""}${w ? ` [${w.name}]` : ""}`;
}

function fmt(d: Prisma.Decimal) {
  return d.toDecimalPlaces(3).toString();
}

/** Atomic, gap-tolerant document numbers: PREFIX-YYYY-00001 */
export async function nextNumber(tx: Tx, prefix: string, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const key = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO doc_sequences (key, next) VALUES (${key}, 2)
    ON CONFLICT (key) DO UPDATE SET next = doc_sequences.next + 1
    RETURNING next - 1 AS n`;
  return `${key}-${String(rows[0].n).padStart(5, "0")}`;
}
