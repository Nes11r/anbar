import type { PrismaClient } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Client = Tx | PrismaClient;

/** All variants exist, are active and belong to active materials. */
export async function assertVariantsUsable(c: Client, ids: string[]) {
  const uniq = Array.from(new Set(ids));
  if (uniq.length === 0) return;
  const vs = await c.materialVariant.findMany({
    where: { id: { in: uniq } },
    select: { id: true, sku: true, isActive: true, material: { select: { isActive: true } } },
  });
  if (vs.length !== uniq.length) throw new AppError("Seçilmiş materiallardan biri tapılmadı.", "VALIDATION");
  const bad = vs.filter((v) => !v.isActive || !v.material.isActive);
  if (bad.length) throw new AppError(`Deaktiv materiallarla əməliyyat aparmaq olmaz: ${bad.map((b) => b.sku).join(", ")}`, "VALIDATION");
}

/** variantId → unit.allowsDecimal */
export async function unitRulesFor(c: Client, ids: string[]) {
  const vs = await c.materialVariant.findMany({
    where: { id: { in: Array.from(new Set(ids)) } },
    select: { id: true, material: { select: { unit: { select: { allowsDecimal: true } } } } },
  });
  return new Map(vs.map((v) => [v.id, v.material.unit.allowsDecimal]));
}

export async function assertWarehouse(c: Client, id: string, opts: { allowQuarantine?: boolean } = {}) {
  const w = await c.warehouse.findUnique({ where: { id } });
  if (!w || !w.isActive) throw new AppError("Anbar tapılmadı və ya deaktivdir.", "VALIDATION");
  if (w.type === "QUARANTINE" && !opts.allowQuarantine) throw new AppError("Karantin anbarından birbaşa məxaric edilə bilməz.", "VALIDATION");
  return w;
}

export interface AppSettings {
  pmApprovalThreshold: number;
  gdApprovalThreshold: number;
  allowNegativeStock: false;
  overReceiptTolerancePct: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pmApprovalThreshold: 50000,
  gdApprovalThreshold: 250000,
  allowNegativeStock: false,
  overReceiptTolerancePct: 0,
};

export async function getSettings(c: Client = db): Promise<AppSettings> {
  const rows = await c.appSetting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return {
    pmApprovalThreshold: Number(s.pmApprovalThreshold) || DEFAULT_SETTINGS.pmApprovalThreshold,
    gdApprovalThreshold: Number(s.gdApprovalThreshold) || DEFAULT_SETTINGS.gdApprovalThreshold,
    allowNegativeStock: false,
    overReceiptTolerancePct: Math.max(0, Number(s.overReceiptTolerancePct) || 0),
  };
}

export function toDateOnly(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d) : d;
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
}
