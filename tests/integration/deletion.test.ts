import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/server/audit";
import { createMaterial } from "@/server/services/catalog";
import { deleteRecord } from "@/server/services/deletion";
import { approveCount, createCount } from "@/server/services/inventory";
import { saveEmployee } from "@/server/services/masterdata";
import { cancelStockDoc, createStockDoc, postStockDoc } from "@/server/services/stockdocs";
import { createMR } from "@/server/services/procurement";
import { baseData, makeUser, resetDb } from "./helpers";

let admin: Actor, wm: Actor, sk: Actor, auditor: Actor;
let B: Awaited<ReturnType<typeof baseData>>;
const today = new Date();

const mat = (code: string, sizes = ["41", "42"]) =>
  createMaterial(wm, { code, nameAz: `Botinka ${code}`, categoryId: B.shoes.id, workerGroup: "WORKER", sizeType: "SHOE_EU", unitCode: "PAIR", minStock: 0, variants: sizes.map((size) => ({ size, color: "", isActive: true })) } as never);

beforeEach(async () => {
  await resetDb();
  B = await baseData();
  admin = await makeUser("SUPER_ADMIN");
  wm = await makeUser("WAREHOUSE_MANAGER");
  sk = await makeUser("STOREKEEPER");
  auditor = await makeUser("AUDITOR");
});

describe("Silmə qaydaları", () => {
  it("istifadə olunmayan material silinir, audit qeydi yazılır", async () => {
    const m = await mat("DEL1");
    await deleteRecord(wm, "material", m.id);
    expect(await db.material.count({ where: { id: m.id } })).toBe(0);
    expect(await db.materialVariant.count({ where: { materialId: m.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "DELETE", entityId: m.id } })).toBe(1);
  });

  it("hərəkəti olan material, layihə, anbar silinmir; jurnal toxunulmaz qalır", async () => {
    const m = await mat("DEL2");
    const c = await createCount(wm, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: m.variants[0].id, countedQty: 5 }] });
    await approveCount(wm, c.id);
    const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "Usta", docDate: today, lines: [{ variantId: m.variants[0].id, qty: 2 }] });
    await postStockDoc(sk, d.id);
    const ledger = await db.stockLedgerEntry.count();
    await expect(deleteRecord(wm, "material", m.id)).rejects.toThrow(/jurnal hərəkəti/);
    await expect(deleteRecord(wm, "variant", m.variants[0].id)).rejects.toThrow(/Silmək olmaz/);
    await expect(deleteRecord(admin, "project", B.pA.id)).rejects.toThrow(/material hərəkəti/);
    await expect(deleteRecord(admin, "warehouse", B.wh.id)).rejects.toThrow(/Silmək olmaz/);
    await expect(deleteRecord(sk, "stockDocument", d.id)).rejects.toThrow(/qaralama/);
    await expect(deleteRecord(wm, "inventoryCount", c.id)).rejects.toThrow(/qaralama/);
    expect(await db.stockLedgerEntry.count()).toBe(ledger);
    // unused variant of the same material can be removed
    await deleteRecord(wm, "variant", m.variants[1].id);
    expect(await db.materialVariant.count({ where: { materialId: m.id } })).toBe(1);
  });

  it("qaralama və ləğv edilmiş sənəd silinir", async () => {
    const m = await mat("DEL3");
    const draft = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "Usta", docDate: today, lines: [{ variantId: m.variants[0].id, qty: 1 }] });
    await deleteRecord(sk, "stockDocument", draft.id);
    expect(await db.stockDocument.count({ where: { id: draft.id } })).toBe(0);
    const cancelled = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "Usta", docDate: today, lines: [{ variantId: m.variants[0].id, qty: 1 }] });
    await cancelStockDoc(sk, cancelled.id);
    await deleteRecord(sk, "stockDocument", cancelled.id);
    expect(await db.stockDocLine.count({ where: { docId: cancelled.id } })).toBe(0);
    const c = await createCount(wm, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: m.variants[0].id, countedQty: 5 }] });
    await deleteRecord(wm, "inventoryCount", c.id);
    expect(await db.inventoryCount.count()).toBe(0);
  });

  it("MR: yalnız qaralama və yalnız müəllif / admin silə bilər", async () => {
    const pm = await makeUser("PROJECT_MANAGER");
    const mr = await createMR(pm, { projectId: B.pA.id, discipline: "MEC", requestType: "NEW", priority: "NORMAL", dateRaised: today, requiredOnSiteDate: today, requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {}, lines: [{ description: "Botinka", uomCode: "PAIR", qtyRequired: 2, surplusPct: 0 }] } as never);
    await expect(deleteRecord(sk, "materialRequest", mr.id)).rejects.toThrow(/müəllif|yaradan/);
    await deleteRecord(pm, "materialRequest", mr.id);
    expect(await db.mRLine.count()).toBe(0);
  });

  it("istifadəçi: fəaliyyəti olan silinmir, yeni istifadəçi silinir, özünü silmək olmaz", async () => {
    await mat("DEL4"); // wm created a material → audit history
    await expect(deleteRecord(admin, "user", wm.id)).rejects.toThrow(/deaktiv/);
    const fresh = await makeUser("PROCUREMENT", "fresh@test.local");
    await deleteRecord(admin, "user", fresh.id);
    expect(await db.user.count({ where: { id: fresh.id } })).toBe(0);
    await expect(deleteRecord(admin, "user", admin.id)).rejects.toThrow(/Öz hesabınızı/);
  });

  it("işçi, kateqoriya, tədarükçü: tarixçəsiz olanlar silinir", async () => {
    const e = await saveEmployee(wm, null, { code: "X1", fullName: "Test İşçi", group: "WORKER", isActive: true });
    await deleteRecord(wm, "employee", e.id);
    await deleteRecord(wm, "supplier", B.supplier.id);
    await expect(deleteRecord(wm, "category", B.shoes.id)).resolves.toBeTruthy();
    await mat("DEL5").catch(() => undefined); // category gone → creating fails, fine
    const cat = await db.category.findFirstOrThrow({ where: { code: "PPE-CLOTH" } });
    await createMaterial(wm, { code: "DEL6", nameAz: "Pencək", categoryId: cat.id, workerGroup: "ENGINEER", sizeType: "NONE", unitCode: "PCS", minStock: 0, variants: [{ size: "", color: "" }] } as never);
    await expect(deleteRecord(wm, "category", cat.id)).rejects.toThrow(/material bu kateqoriyadadır/);
  });

  it("səlahiyyəti olmayan silə bilmir", async () => {
    const m = await mat("DEL7");
    await expect(deleteRecord(auditor, "material", m.id)).rejects.toThrow(/səlahiyyət/);
    await expect(deleteRecord(sk, "warehouse", B.wh2.id)).rejects.toThrow(/səlahiyyət/);
  });
});
