import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchVariants, listMaterials } from "@/server/services/catalog";
import { dashboardKpis, ledgerJournal, lowStock, stockList } from "@/server/services/reports";
import { baseData, makeUser, resetDb } from "./helpers";

/** Response-time budget with realistic volume: 3 000 materials × 4 sizes, 36 000 ledger rows. */
const MATS = 3000;
const SIZES = ["40", "41", "42", "43"];

async function time<T>(fn: () => Promise<T>) {
  await fn(); // warm-up (plan cache)
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

describe("performance", () => {
  beforeAll(async () => {
    await resetDb();
    const B = await baseData();
    const u = await makeUser("SUPER_ADMIN");
    const mats = Array.from({ length: MATS }, (_, i) => ({ id: randomUUID(), code: `P-${i}`, nameAz: `Material ${i} ${["Botinka", "Şalvar", "Pencək", "Eynək"][i % 4]}`, categoryId: B.shoes.id, workerGroup: (["ENGINEER", "WORKER", "BOTH"] as const)[i % 3], sizeType: "SHOE_EU" as const, unitCode: "PAIR", minStock: 5 }));
    await db.material.createMany({ data: mats });
    const vars = mats.flatMap((m) => SIZES.map((s) => ({ id: randomUUID(), materialId: m.id, size: s, sku: `${m.code}-${s}` })));
    for (let i = 0; i < vars.length; i += 5000) await db.materialVariant.createMany({ data: vars.slice(i, i + 5000) });
    const docId = randomUUID();
    const ledger = vars.flatMap((v, i) => [
      { entryType: "OPENING" as const, warehouseId: B.wh.id, variantId: v.id, qty: 20, docType: "INVENTORY_COUNT" as const, docId, docNumber: "INV0-P", movementDate: new Date(), userId: u.id, idempotencyKey: `P:${i}:a` },
      { entryType: "ISSUE" as const, warehouseId: B.wh.id, variantId: v.id, qty: i % 7, docType: "STOCK_DOCUMENT" as const, docId, docNumber: "ISP-P", movementDate: new Date(), userId: u.id, projectId: B.pA.id, idempotencyKey: `P:${i}:b` },
      { entryType: "RECEIPT" as const, warehouseId: B.wh.id, variantId: v.id, qty: 3, docType: "GOODS_RECEIPT" as const, docId, docNumber: "GRN-P", movementDate: new Date(), userId: u.id, idempotencyKey: `P:${i}:c` },
    ]).filter((l) => l.qty > 0);
    for (let i = 0; i < ledger.length; i += 5000) await db.stockLedgerEntry.createMany({ data: ledger.slice(i, i + 5000) });
    const bal = vars.map((v, i) => ({ warehouseId: B.wh.id, variantId: v.id, onHand: 23 - (i % 7) }));
    for (let i = 0; i < bal.length; i += 5000) await db.stockBalance.createMany({ data: bal.slice(i, i + 5000) });
    await db.$executeRawUnsafe("ANALYZE");
  }, 300_000);

  it("key queries answer within budget", async () => {
    const results: Record<string, number> = {
      dashboard: await time(() => dashboardKpis()),
      stockPage: await time(() => stockList({ page: 1 })),
      stockSearch: await time(() => stockList({ q: "Botinka", page: 1 })),
      lowStock: await time(() => lowStock(50)),
      catalogPage: await time(() => listMaterials({ page: 1 })),
      catalogSearch: await time(() => listMaterials({ q: "Material 12", page: 1 })),
      pickerSearch: await time(() => searchVariants("P-29")),
      journalPage: await time(() => ledgerJournal({ limit: 100 })),
    };
    console.table(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, `${v.toFixed(0)} ms`])));
    for (const [k, ms] of Object.entries(results)) expect(ms, k).toBeLessThan(1500);
  });
});
