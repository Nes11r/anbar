/**
 * Pure stock rules — no DB access, fully unit-tested (tests/unit/stock-rules.test.ts).
 */
import { Prisma, type LedgerEntryType, type WorkerGroup, type EmployeeGroup } from "@prisma/client";

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);

/** Effect of one ledger entry on (on_hand, reserved). qty is always positive. */
export function entryEffect(type: LedgerEntryType): { onHand: -1 | 0 | 1; reserved: -1 | 0 | 1 } {
  switch (type) {
    case "OPENING":
    case "RECEIPT":
    case "RETURN_IN":
    case "TRANSFER_IN":
    case "ADJUSTMENT_PLUS":
      return { onHand: 1, reserved: 0 };
    case "ISSUE":
    case "RETURN_OUT":
    case "TRANSFER_OUT":
    case "ADJUSTMENT_MINUS":
      return { onHand: -1, reserved: 0 };
    case "RESERVATION":
      return { onHand: 0, reserved: 1 };
    case "RESERVATION_RELEASE":
      return { onHand: 0, reserved: -1 };
  }
}

/** Outbound entries that must respect available (= on_hand − reserved), not just on_hand. */
export function consumesAvailable(type: LedgerEntryType): boolean {
  return type === "ISSUE" || type === "RETURN_OUT" || type === "TRANSFER_OUT" || type === "ADJUSTMENT_MINUS" || type === "RESERVATION";
}

/** Entry type that cancels another one (used by reversal documents). */
export function reverseType(type: LedgerEntryType): LedgerEntryType {
  const map: Record<LedgerEntryType, LedgerEntryType> = {
    OPENING: "ADJUSTMENT_MINUS",
    RECEIPT: "RETURN_OUT",
    ISSUE: "RETURN_IN",
    RETURN_IN: "ISSUE",
    RETURN_OUT: "RETURN_IN",
    TRANSFER_IN: "TRANSFER_OUT",
    TRANSFER_OUT: "TRANSFER_IN",
    ADJUSTMENT_PLUS: "ADJUSTMENT_MINUS",
    ADJUSTMENT_MINUS: "ADJUSTMENT_PLUS",
    RESERVATION: "RESERVATION_RELEASE",
    RESERVATION_RELEASE: "RESERVATION",
  };
  return map[type];
}

export interface BalanceState {
  onHand: Prisma.Decimal;
  reserved: Prisma.Decimal;
}

export interface Movement {
  entryType: LedgerEntryType;
  qty: Prisma.Decimal;
}

/**
 * Apply movements to a balance and report a violation instead of producing negative stock.
 * Inbound movements are applied before outbound ones only within the same call order — the caller
 * passes movements in document order; we check after each step so "issue then receipt" in one doc cannot cheat.
 */
export function applyToBalance(
  start: BalanceState,
  movements: Movement[],
  opts: { allowNegative?: boolean } = {},
): { ok: true; end: BalanceState } | { ok: false; reason: "INSUFFICIENT_AVAILABLE" | "INSUFFICIENT_RESERVED"; available: Prisma.Decimal; requested: Prisma.Decimal } {
  let onHand = start.onHand;
  let reserved = start.reserved;
  for (const m of movements) {
    if (m.qty.lte(0)) throw new Error("Movement qty must be > 0");
    const e = entryEffect(m.entryType);
    const available = onHand.minus(reserved);
    if (consumesAvailable(m.entryType) && !opts.allowNegative && available.lt(m.qty)) {
      return { ok: false, reason: "INSUFFICIENT_AVAILABLE", available, requested: m.qty };
    }
    if (e.reserved < 0 && reserved.lt(m.qty)) {
      return { ok: false, reason: "INSUFFICIENT_RESERVED", available: reserved, requested: m.qty };
    }
    onHand = onHand.plus(m.qty.times(e.onHand));
    reserved = reserved.plus(m.qty.times(e.reserved));
  }
  return { ok: true, end: { onHand, reserved } };
}

/** Quantity validation per unit: integer units (pcs, pair, set…) reject fractions. */
export function validateQty(qty: Prisma.Decimal.Value, allowsDecimal: boolean, opts: { allowZero?: boolean } = {}): string | null {
  let d: Prisma.Decimal;
  try {
    d = D(qty);
  } catch {
    return "Miqdar rəqəm olmalıdır.";
  }
  if (!d.isFinite()) return "Miqdar rəqəm olmalıdır.";
  if (opts.allowZero ? d.lt(0) : d.lte(0)) return opts.allowZero ? "Miqdar mənfi ola bilməz." : "Miqdar 0-dan böyük olmalıdır.";
  if (!allowsDecimal && !d.isInteger()) return "Bu ölçü vahidi üçün miqdar tam ədəd olmalıdır.";
  if (d.decimalPlaces() > 3) return "Miqdarda ən çox 3 onluq rəqəm ola bilər.";
  if (d.gt("999999999")) return "Miqdar çox böyükdür.";
  return null;
}

/** Is a material's worker-group assignment compatible with an employee's group? */
export function groupCompatible(material: WorkerGroup, employee: EmployeeGroup): boolean {
  if (material === "BOTH" || material === "NOT_APPLICABLE") return true;
  return material === employee;
}

/** Catalogue filter semantics: a BOTH material shows under both ENGINEER and WORKER filters. */
export function groupFilterValues(filter: "ENGINEER" | "WORKER"): WorkerGroup[] {
  return [filter, "BOTH"];
}

/** Uniform categories must have an explicit ENGINEER/WORKER/BOTH assignment. */
export function validateWorkerGroup(isUniform: boolean, g: WorkerGroup): string | null {
  if (isUniform && g === "NOT_APPLICABLE") return "Forma/PPE materialı üçün təyinat (Mühəndis / Fəhlə / Hər ikisi) məcburidir.";
  return null;
}

/** PO receipt state from line quantities. */
export function poReceiptStatus(lines: { ordered: Prisma.Decimal; received: Prisma.Decimal }[]): "NONE" | "PARTIAL" | "FULL" {
  const any = lines.some((l) => l.received.gt(0));
  const all = lines.length > 0 && lines.every((l) => l.received.gte(l.ordered));
  return all ? "FULL" : any ? "PARTIAL" : "NONE";
}

export function sumBy<T>(rows: T[], f: (r: T) => Prisma.Decimal.Value): Prisma.Decimal {
  return rows.reduce((a, r) => a.plus(f(r)), ZERO);
}
