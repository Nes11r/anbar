import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Actor } from "@/server/audit";
import { createMaterial } from "@/server/services/catalog";
import { approveCount, createCount } from "@/server/services/inventory";
import { saveEmployee, saveProject } from "@/server/services/masterdata";
import { createGRN, createMR, createPO, decideMR, postGRN, setPOPayment, setPOShipment, setPOStatus, submitMR } from "@/server/services/procurement";
import { registerAccount } from "@/server/services/registration";
import { createSiteReport, siteMaterials, siteOverview, siteReportToCount, siteWorkerHoldings } from "@/server/services/sites";
import { createStockDoc, postStockDoc } from "@/server/services/stockdocs";
import { mrTimeline, currentStageLabel } from "@/server/services/tracking";
import { baseData, makeUser, resetDb } from "./helpers";

let wm: Actor, sk: Actor, pm: Actor, proc: Actor;
let B: Awaited<ReturnType<typeof baseData>>;
const today = new Date();

async function setup() {
  const project = await saveProject(wm, null, { code: "SGC", name: "Səngəçal", isActive: true });
  const other = await saveProject(wm, null, { code: "BKU", name: "Bakı", isActive: true });
  const site = await db.warehouse.findUniqueOrThrow({ where: { projectId: project.id } });
  const m = await createMaterial(wm, { code: "COV", nameAz: "Kombinezon", categoryId: B.uniform.id, workerGroup: "WORKER", sizeType: "CLOTHING_NUMERIC", unitCode: "PCS", minStock: 0, variants: [{ size: "52", color: "" }] } as never);
  const v = m.variants[0];
  const emp = await saveEmployee(wm, null, { code: "W1", fullName: "Elvin Fəhlə", group: "WORKER", projectId: project.id, isActive: true });
  const emp2 = await saveEmployee(wm, null, { code: "W2", fullName: "Orxan Fəhlə", group: "WORKER", projectId: other.id, isActive: true });
  const c = await createCount(wm, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: v.id, countedQty: 10 }] });
  await approveCount(wm, c.id);
  return { project, other, site, v, emp, emp2 };
}

beforeEach(async () => {
  await resetDb();
  B = await baseData();
  wm = await makeUser("WAREHOUSE_MANAGER");
  sk = await makeUser("STOREKEEPER");
  pm = await makeUser("PROJECT_MANAGER");
  proc = await makeUser("PROCUREMENT");
});

describe("Sahə anbarları", () => {
  it("layihə yaradılanda öz sahə anbarı avtomatik açılır", async () => {
    const p = await saveProject(wm, null, { code: "NEW1", name: "Yeni", isActive: true });
    const w = await db.warehouse.findUnique({ where: { projectId: p.id } });
    expect(w?.code).toBe("SAHE-NEW1");
  });

  it("Ofis → sahə → işçi: sahədə cəmi = stokda + işçilərdə; ofis qalığı düzgün azalır", async () => {
    const { project, site, v, emp } = await setup();
    const t = await createStockDoc(sk, { kind: "TRANSFER", warehouseId: B.wh.id, toWarehouseId: site.id, recipientName: "Layihə rəhbəri", docDate: today, lines: [{ variantId: v.id, qty: 6 }] });
    await postStockDoc(sk, t.id);
    const i = await createStockDoc(sk, { kind: "ISSUE_EMPLOYEE", warehouseId: site.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 2 }] });
    await postStockDoc(sk, i.id);
    let row = (await siteOverview()).find((r) => r.projectId === project.id)!;
    expect([row.inStock.toNumber(), row.withWorkers.toNumber(), row.total.toNumber(), row.workers]).toEqual([4, 2, 6, 1]);
    const office = await db.stockBalance.findUniqueOrThrow({ where: { warehouseId_variantId: { warehouseId: B.wh.id, variantId: v.id } } });
    expect(Number(office.onHand)).toBe(4);
    // worker returns 1 to site
    const r = await createStockDoc(sk, { kind: "RETURN_FROM_EMPLOYEE", warehouseId: site.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 1, condition: "GOOD" }] });
    await postStockDoc(sk, r.id);
    row = (await siteOverview()).find((x) => x.projectId === project.id)!;
    expect([row.inStock.toNumber(), row.withWorkers.toNumber(), row.total.toNumber()]).toEqual([5, 1, 6]);
    const mats = await siteMaterials(project.id);
    expect(mats[0].total.toNumber()).toBe(6);
    expect((await siteWorkerHoldings(project.id))[0].fullName).toBe("Elvin Fəhlə");
  });

  it("gündəlik sahə hesabatı: fərqlər saxlanılır; stok fərqi qaralama sayıma çevrilir və təsdiqlə düzəlir", async () => {
    const { project, site, v, emp } = await setup();
    const t = await createStockDoc(sk, { kind: "TRANSFER", warehouseId: B.wh.id, toWarehouseId: site.id, recipientName: "PM", docDate: today, lines: [{ variantId: v.id, qty: 6 }] });
    await postStockDoc(sk, t.id);
    const i = await createStockDoc(sk, { kind: "ISSUE_EMPLOYEE", warehouseId: site.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 2 }] });
    await postStockDoc(sk, i.id);
    // site says: 3 in stock (system 4), 2 with workers (matches)
    const rep = await createSiteReport(sk, { projectId: project.id, reportDate: today, reportedBy: "Sahə anbardarı", lines: [{ variantId: v.id, stockQty: 3, withWorkersQty: 2 }] });
    expect(rep.diffs).toBe(1);
    const line = await db.siteReportLine.findFirstOrThrow();
    expect([Number(line.systemStock), Number(line.systemWithWorkers)]).toEqual([4, 2]);
    const cnt = await siteReportToCount(wm, rep.id);
    expect((await db.stockBalance.findUniqueOrThrow({ where: { warehouseId_variantId: { warehouseId: site.id, variantId: v.id } } })).onHand.toNumber()).toBe(4); // draft → no change
    await approveCount(wm, cnt.id);
    expect((await db.stockBalance.findUniqueOrThrow({ where: { warehouseId_variantId: { warehouseId: site.id, variantId: v.id } } })).onHand.toNumber()).toBe(3);
  });

  it("layihəyə bağlı anbardar yalnız öz sahə anbarında və öz işçiləri ilə işləyə bilir", async () => {
    const { project, site, v, emp, emp2 } = await setup();
    const t = await createStockDoc(sk, { kind: "TRANSFER", warehouseId: B.wh.id, toWarehouseId: site.id, recipientName: "PM", docDate: today, lines: [{ variantId: v.id, qty: 5 }] });
    await postStockDoc(sk, t.id);
    const siteKeeper: Actor = { ...(await makeUser("STOREKEEPER", "site@test.local")), projectId: project.id };
    await expect(createStockDoc(siteKeeper, { kind: "ISSUE_EMPLOYEE", warehouseId: B.wh.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 1 }] })).rejects.toThrow(/sahə anbarı/);
    await expect(createStockDoc(siteKeeper, { kind: "ISSUE_EMPLOYEE", warehouseId: site.id, employeeId: emp2.id, docDate: today, lines: [{ variantId: v.id, qty: 1 }] })).rejects.toThrow(/layihənizə aid deyil/);
    await expect(createStockDoc(siteKeeper, { kind: "TRANSFER", warehouseId: site.id, toWarehouseId: B.wh.id, docDate: today, lines: [{ variantId: v.id, qty: 1 }] })).rejects.toThrow(/köçürmə/i);
    const ok = await createStockDoc(siteKeeper, { kind: "ISSUE_EMPLOYEE", warehouseId: site.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    await postStockDoc(siteKeeper, ok.id);
    await expect(createSiteReport(siteKeeper, { projectId: (await db.project.findFirstOrThrow({ where: { code: "BKU" } })).id, reportDate: today, reportedBy: "X Y", lines: [{ variantId: v.id, stockQty: 0, withWorkersQty: 0 }] })).rejects.toThrow(/səlahiyyət dairənizdə/);
    void pm;
  });
});

describe("Qeydiyyat", () => {
  it("özünü qeydiyyatdan keçirən hesab aktiv deyil və minimal roldadır; eyni e-poçt təkrar olmur", async () => {
    await registerAccount({ accountType: "COMPANY", name: "Yeni Rəhbər", email: "boss@test.local", password: "Parol12345x", password2: "Parol12345x" }, (p) => bcrypt.hash(p, 4));
    const u = await db.user.findUniqueOrThrow({ where: { email: "boss@test.local" } });
    expect([u.isActive, u.pendingApproval, u.role, u.requestedType]).toEqual([false, true, "AUDITOR", "COMPANY"]);
    await expect(registerAccount({ accountType: "CLIENT", name: "X Y Z", email: "boss@test.local", password: "Parol12345x", password2: "Parol12345x" }, (p) => bcrypt.hash(p, 4))).rejects.toThrow(/artıq/);
    await expect(registerAccount({ accountType: "EMPLOYEE", name: "X Y Z", email: "w@test.local", password: "short", password2: "short" }, (p) => bcrypt.hash(p, 4))).rejects.toThrow();
  });
});

describe("Sifarişin izlənməsi", () => {
  it("mərhələlər: təsdiq → PO → ödəniş gözləyir → ödənildi → yoldadır → anbarda", async () => {
    const { project, v } = await setup();
    const mr = await createMR(pm, { projectId: project.id, discipline: "MEC", requestType: "NEW", priority: "NORMAL", dateRaised: today, requiredOnSiteDate: today, requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {}, lines: [{ variantId: v.id, description: "Kombinezon 52", uomCode: "PCS", qtyRequired: 15, surplusPct: 0 }] } as never);
    expect(currentStageLabel(await mrTimeline(mr.id)).label).toBe("Təsdiqə göndərildi");
    await submitMR(pm, mr.id);
    await decideMR(pm, mr.id, 2, "APPROVED");
    await decideMR(proc, mr.id, 8, "APPROVED");
    const full = await db.materialRequest.findUniqueOrThrow({ where: { id: mr.id }, include: { lines: true } });
    const po = await createPO(proc, { supplierId: B.supplier.id, mrId: mr.id, orderDate: today, currency: "AZN", lines: [{ variantId: v.id, mrLineId: full.lines[0].id, qtyOrdered: Number(full.lines[0].netQtyToOrder) }] } as never);
    await setPOStatus(proc, po.id, "APPROVED");
    await setPOPayment(proc, po.id, { status: "PENDING" });
    expect(currentStageLabel(await mrTimeline(mr.id)).label).toBe("Ödəniş gözləyir");
    await setPOPayment(proc, po.id, { status: "PAID", ref: "Ödəniş tapşırığı 77" });
    await setPOShipment(proc, po.id, { carrier: "DHL", trackingNo: "123456" });
    const t = await mrTimeline(mr.id);
    expect(t.find((s) => s.key === "shipped")?.state).toBe("done");
    expect(t.find((s) => s.key === "shipped")?.detail).toContain("DHL");
    const pl = await db.pOLine.findFirstOrThrow({ where: { poId: po.id } });
    const g = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: pl.id, qtyReceived: Number(pl.qtyOrdered), qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    await postGRN(sk, g.id);
    expect(currentStageLabel(await mrTimeline(mr.id)).label).toBe("Anbarda (tam)");
    await expect(setPOPayment(sk, po.id, { status: "PAID" })).rejects.toThrow(/səlahiyyət/);
  });

  it("direktor istənilən MR mərhələsini təsdiq edə bilir", async () => {
    const { project, v } = await setup();
    const director = await makeUser("DIRECTOR");
    const mr = await createMR(pm, { projectId: project.id, discipline: "MEC", requestType: "NEW", priority: "NORMAL", dateRaised: today, requiredOnSiteDate: today, requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {}, lines: [{ variantId: v.id, description: "Kombinezon 52", uomCode: "PCS", qtyRequired: 15, surplusPct: 0 }] } as never);
    await submitMR(pm, mr.id);
    await decideMR(director, mr.id, 2, "APPROVED");
    const r = await decideMR(director, mr.id, 8, "APPROVED");
    expect(r.status).toBe("APPROVED");
  });
});
