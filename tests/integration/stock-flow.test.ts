import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/server/audit";
import { createMaterial, listMaterials } from "@/server/services/catalog";
import { approveCount, createCount } from "@/server/services/inventory";
import { createGRN, createMR, createPO, decideMR, postGRN, setPOStatus, submitMR, reverseGRN } from "@/server/services/procurement";
import { createStockDoc, postStockDoc, reverseStockDoc } from "@/server/services/stockdocs";
import { dashboardKpis, projectReport, projectionMismatches, totalOnHand } from "@/server/services/reports";
import { saveEmployee, createReservation, releaseReservation } from "@/server/services/masterdata";
import { baseData, makeUser, resetDb } from "./helpers";

let admin: Actor, wm: Actor, sk: Actor, proc: Actor, pm: Actor, auditor: Actor;
let B: Awaited<ReturnType<typeof baseData>>;
const today = new Date();

async function shoe(sizes = ["41", "42"], workerGroup: "ENGINEER" | "WORKER" | "BOTH" = "WORKER") {
  return createMaterial(wm, {
    nameAz: `Botinka ${workerGroup}`,
    categoryId: B.shoes.id,
    workerGroup,
    sizeType: "SHOE_EU",
    unitCode: "PAIR",
    minStock: 2,
    variants: sizes.map((s) => ({ size: s, color: "", isActive: true })),
  } as never);
}

async function opening(variantId: string, qty: number, warehouseId = B.wh.id) {
  const c = await createCount(wm, { mode: "OPENING", warehouseId, countDate: today, countedBy: "Test sayıcı", lines: [{ variantId, countedQty: qty }] });
  await approveCount(wm, c.id);
}

async function approvedPo(variantId: string, qty: number) {
  const mr = await createMR(pm, {
    projectId: B.pA.id, discipline: "MEC", requestType: "NEW", priority: "NORMAL", dateRaised: today, requiredOnSiteDate: today,
    requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {},
    lines: [{ variantId, description: "Botinka", uomCode: "PAIR", qtyRequired: qty, surplusPct: 0 }],
  } as never);
  await submitMR(pm, mr.id);
  await decideMR(pm, mr.id, 2, "APPROVED");
  await decideMR(proc, mr.id, 8, "APPROVED");
  const mrFull = await db.materialRequest.findUniqueOrThrow({ where: { id: mr.id }, include: { lines: true } });
  expect(mrFull.status).toBe("APPROVED");
  const po = await createPO(proc, { supplierId: B.supplier.id, mrId: mr.id, orderDate: today, currency: "AZN", lines: [{ variantId, mrLineId: mrFull.lines[0].id, qtyOrdered: Number(mrFull.lines[0].netQtyToOrder) }] } as never);
  await setPOStatus(proc, po.id, "APPROVED");
  return db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
}

beforeEach(async () => {
  await resetDb();
  B = await baseData();
  admin = await makeUser("SUPER_ADMIN");
  wm = await makeUser("WAREHOUSE_MANAGER");
  sk = await makeUser("STOREKEEPER");
  proc = await makeUser("PROCUREMENT");
  pm = await makeUser("PROJECT_MANAGER");
  auditor = await makeUser("AUDITOR");
});

describe("Kataloq", () => {
  it("1. Fəhlə / mühəndis filtri; 'Hər ikisi' hər iki qrupda görünür", async () => {
    await shoe(["41"], "WORKER");
    await shoe(["41"], "ENGINEER");
    await shoe(["41"], "BOTH");
    const w = await listMaterials({ group: "WORKER" });
    const e = await listMaterials({ group: "ENGINEER" });
    expect(w.rows.map((r) => r.workerGroup).sort()).toEqual(["BOTH", "WORKER"]);
    expect(e.rows.map((r) => r.workerGroup).sort()).toEqual(["BOTH", "ENGINEER"]);
  });

  it("uniform kateqoriyada 'Tətbiq edilmir' qadağandır", async () => {
    await expect(
      createMaterial(wm, { nameAz: "Pencək", categoryId: B.uniform.id, workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "PCS", minStock: 0, variants: [{ size: "", color: "" }] } as never),
    ).rejects.toThrow(/məcburidir/);
  });

  it("2. Eyni ayaqqabının 41 və 42 ölçüsü ayrı variant və ayrı qalıqdır", async () => {
    const m = await shoe(["41", "42"]);
    expect(m.variants).toHaveLength(2);
    const [v41, v42] = [...m.variants].sort((a, b) => a.size.localeCompare(b.size));
    expect(v41.sku).not.toBe(v42.sku);
    await opening(v41.id, 4);
    expect((await totalOnHand(v41.id)).toNumber()).toBe(4);
    expect((await totalOnHand(v42.id)).toNumber()).toBe(0);
  });

  it("13. duplicate SKU rədd edilir", async () => {
    await createMaterial(wm, { code: "X1", nameAz: "Boru", categoryId: B.other.id, workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "M", minStock: 0, variants: [{ size: "", color: "", sku: "SKU-1" }] } as never);
    await expect(
      createMaterial(wm, { code: "X2", nameAz: "Boru 2", categoryId: B.other.id, workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "M", minStock: 0, variants: [{ size: "", color: "", sku: "SKU-1" }] } as never),
    ).rejects.toThrow();
  });
});

describe("Ledger və qalıq", () => {
  it("3. 10 açılış + 5 qəbul − 3 layihəyə = 12; dashboard, kart və hesabat eyni rəqəm", async () => {
    const m = await shoe(["42"]);
    const v = m.variants[0];
    // MR nets against stock (MR form: Net Qty = Required − In stock), so the MR/PO is raised before the opening count
    const po = await approvedPo(v.id, 5);
    await opening(v.id, 10);
    const grn = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 5, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    await postGRN(sk, grn.id);
    const iss = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "Usta", docDate: today, lines: [{ variantId: v.id, qty: 3 }] });
    await postStockDoc(sk, iss.id);

    expect((await totalOnHand(v.id)).toNumber()).toBe(12);
    const k = await dashboardKpis();
    expect(k.onHand.toNumber()).toBe(12);
    const rep = await projectReport(B.pA.id);
    expect(Number(rep[0].net)).toBe(3);
    expect(await projectionMismatches()).toHaveLength(0);
  });

  it("4. MR/PO təsdiqi qalığı artırmır; yalnız GRN posting artırır", async () => {
    const v = (await shoe(["43"])).variants[0];
    const po = await approvedPo(v.id, 7);
    expect((await totalOnHand(v.id)).toNumber()).toBe(0);
    const grn = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 7, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    expect((await totalOnHand(v.id)).toNumber()).toBe(0); // draft GRN
    await postGRN(sk, grn.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(7);
  });

  it("5. GRN retry / double-click / paralel posting ikiqat mədaxil yaratmır", async () => {
    const v = (await shoe(["44"])).variants[0];
    const po = await approvedPo(v.id, 10);
    const grn = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 10, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    const results = await Promise.allSettled([postGRN(sk, grn.id), postGRN(sk, grn.id), postGRN(wm, grn.id)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    await postGRN(sk, grn.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(10);
    expect(await db.stockLedgerEntry.count({ where: { docId: grn.id } })).toBe(1);
  });

  it("6. İki paralel məxaric 1 ədəd qalıqdan iki dəfə çıxmır", async () => {
    const v = (await shoe(["45"])).variants[0];
    await opening(v.id, 1);
    const d1 = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "X", docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    const d2 = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pB.id, recipientName: "Y", docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    const r = await Promise.allSettled([postStockDoc(sk, d1.id), postStockDoc(wm, d2.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect((await totalOnHand(v.id)).toNumber()).toBe(0);
  });

  it("7 + 8. Layihə A=3, B=2; qaytarma xalis veriləni düzəldir", async () => {
    const v = (await shoe(["40"])).variants[0];
    await opening(v.id, 10);
    for (const [p, q] of [[B.pA.id, 3], [B.pB.id, 2]] as const) {
      const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: p, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: q }] });
      await postStockDoc(sk, d.id);
    }
    expect(Number((await projectReport(B.pA.id))[0].net)).toBe(3);
    expect(Number((await projectReport(B.pB.id))[0].net)).toBe(2);
    const r = await createStockDoc(sk, { kind: "RETURN_FROM_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, docDate: today, lines: [{ variantId: v.id, qty: 1, condition: "GOOD" }] });
    await postStockDoc(sk, r.id);
    const a = (await projectReport(B.pA.id))[0];
    expect([Number(a.issuedProject), Number(a.returned), Number(a.net)]).toEqual([3, 1, 2]);
    expect((await totalOnHand(v.id)).toNumber()).toBe(6);
    // cannot return more than net issued
    const bad = await createStockDoc(sk, { kind: "RETURN_FROM_PROJECT", warehouseId: B.wh.id, projectId: B.pB.id, docDate: today, lines: [{ variantId: v.id, qty: 3, condition: "GOOD" }] });
    await expect(postStockDoc(sk, bad.id)).rejects.toThrow(/çoxdur/);
  });

  it("qüsurlu qaytarma karantin anbarına düşür, istifadə üçün mövcud stoka yox", async () => {
    const v = (await shoe(["39"])).variants[0];
    await opening(v.id, 2);
    const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: 2 }] });
    await postStockDoc(sk, d.id);
    const r = await createStockDoc(sk, { kind: "RETURN_FROM_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, docDate: today, lines: [{ variantId: v.id, qty: 1, condition: "DEFECTIVE", targetWarehouseId: B.q.id }] });
    await postStockDoc(sk, r.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(0); // normal warehouses only
    const qb = await db.stockBalance.findUnique({ where: { warehouseId_variantId: { warehouseId: B.q.id, variantId: v.id } } });
    expect(Number(qb!.onHand)).toBe(1);
  });

  it("işçiyə PPE: təyinat uyğunsuzluğu bloklamır, amma sənəddə və auditdə qeyd olunur", async () => {
    const v = (await shoe(["42"], "ENGINEER")).variants[0];
    await opening(v.id, 3);
    const emp = await saveEmployee(wm, null, { code: "E1", fullName: "Test Fəhlə", group: "WORKER", projectId: B.pA.id, isActive: true });
    const d = await createStockDoc(sk, { kind: "ISSUE_EMPLOYEE", warehouseId: B.wh.id, employeeId: emp.id, docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    expect((await db.stockDocLine.findFirstOrThrow({ where: { docId: d.id } })).overrideReason).toMatch(/Təyinat fərqli/);
    await postStockDoc(sk, d.id);
    // employee issue is attributed to employee's project, counted once
    const rep = (await projectReport(B.pA.id))[0];
    expect([Number(rep.issuedEmployee), Number(rep.issuedProject), Number(rep.net)]).toEqual([1, 0, 1]);
    expect(await db.auditLog.count({ where: { entityId: d.id, summary: { contains: "təyinat fərqi" } } })).toBe(1);
  });

  it("ledger append-only: UPDATE/DELETE DB səviyyəsində bloklanır", async () => {
    const v = (await shoe(["38"])).variants[0];
    await opening(v.id, 5);
    await expect(db.$executeRawUnsafe(`UPDATE stock_ledger SET qty = 999`)).rejects.toThrow(/HEC_APPEND_ONLY/);
    await expect(db.$executeRawUnsafe(`DELETE FROM stock_ledger`)).rejects.toThrow(/HEC_APPEND_ONLY/);
    await expect(db.$executeRawUnsafe(`UPDATE stock_balances SET "onHand" = -1`)).rejects.toThrow(/stock_bal_onhand_nonneg/);
  });

  it("reversal: təsdiqlənmiş məxaric ləğv sənədi ilə geri qaytarılır, silinmir", async () => {
    const v = (await shoe(["37"])).variants[0];
    await opening(v.id, 5);
    const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: 2 }] });
    await postStockDoc(sk, d.id);
    await expect(reverseStockDoc(sk, d.id, "səhv")).rejects.toThrow(/səlahiyyət/);
    await reverseStockDoc(wm, d.id, "Səhv layihə seçilib");
    expect((await totalOnHand(v.id)).toNumber()).toBe(5);
    expect(Number((await projectReport(B.pA.id))[0].net)).toBe(0);
    await expect(reverseStockDoc(wm, d.id, "yenə")).rejects.toThrow(/artıq/);
  });

  it("transfer, rezerv və available qaydası", async () => {
    const v = (await shoe(["46"])).variants[0];
    await opening(v.id, 5);
    const t = await createStockDoc(sk, { kind: "TRANSFER", warehouseId: B.wh.id, toWarehouseId: B.wh2.id, docDate: today, lines: [{ variantId: v.id, qty: 2 }] });
    await postStockDoc(sk, t.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(5);
    const r = await createReservation(sk, { warehouseId: B.wh.id, variantId: v.id, qty: 3 });
    const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    await expect(postStockDoc(sk, d.id)).rejects.toThrow(/kifayət deyil/); // 3 on hand, 3 reserved
    await releaseReservation(sk, r.id);
    await postStockDoc(sk, d.id);
    expect(await projectionMismatches()).toHaveLength(0);
  });
});

describe("Satınalma və GRN", () => {
  it("PO 100: 60 + 40 qəbul; üçüncü 40 qalığı artırmır", async () => {
    const v = (await shoe(["41"])).variants[0];
    const po = await approvedPo(v.id, 100);
    const mk = (q: number) => createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: q, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    const g1 = await mk(60);
    await postGRN(sk, g1.id);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");
    const g2 = await mk(40);
    await postGRN(sk, g2.id);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");
    await expect(mk(40)).rejects.toThrow(); // PO closed for receiving
    await postGRN(sk, g2.id); // retry of the same GRN
    expect((await totalOnHand(v.id)).toNumber()).toBe(100);
    const mr = await db.materialRequest.findFirstOrThrow();
    expect(mr.status).toBe("DELIVERED");
  });

  it("artıq qəbul bloklanır, rədd edilən miqdar anbara düşmür, GRN ləğvi düzgündür", async () => {
    const v = (await shoe(["42"])).variants[0];
    const po = await approvedPo(v.id, 10);
    const over = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 11, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never);
    await expect(postGRN(sk, over.id)).rejects.toThrow(/artıq qəbul/);
    const g = await createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 6, qtyRejected: 2, qualityStatus: "ACCEPTED_WITH_NCR" }] } as never);
    await postGRN(sk, g.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(4);
    await reverseGRN(wm, g.id, "Səhv qaimə");
    expect((await totalOnHand(v.id)).toNumber()).toBe(0);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("APPROVED");
  });

  it("təsdiqlənməmiş MR-dan PO yaradılmır; ləğv edilmiş PO-ya qəbul olmur", async () => {
    const v = (await shoe(["43"])).variants[0];
    const mr = await createMR(pm, { projectId: B.pA.id, discipline: "MEC", requestType: "NEW", priority: "NORMAL", dateRaised: today, requiredOnSiteDate: today, requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {}, lines: [{ variantId: v.id, description: "Botinka", uomCode: "PAIR", qtyRequired: 5, surplusPct: 0 }] } as never);
    expect(mr.mrNumber).toBe("MR-PA-MEC-0001");
    await expect(createPO(proc, { supplierId: B.supplier.id, mrId: mr.id, orderDate: today, currency: "AZN", lines: [{ variantId: v.id, qtyOrdered: 5 }] } as never)).rejects.toThrow(/Təsdiqlənməmiş/);
    const po = await approvedPo(v.id, 5);
    await setPOStatus(proc, po.id, "CANCELLED", "Tədarükçü imtina etdi");
    await expect(createGRN(sk, { poId: po.id, warehouseId: B.wh.id, receivedDate: today, receiverName: "Anbardar", lines: [{ poLineId: po.lines[0].id, qtyReceived: 5, qtyRejected: 0, qualityStatus: "ACCEPTED" }] } as never)).rejects.toThrow();
  });

  it("təcili MR layihə meneceri mərhələsini məcburi edir və əsaslandırma tələb edir", async () => {
    const v = (await shoe(["44"])).variants[0];
    const base = { projectId: B.pA.id, discipline: "ELE", requestType: "NEW", priority: "URGENT", dateRaised: today, requiredOnSiteDate: today, requesterName: "PM", currency: "AZN", referenceDocs: [], formData: {}, lines: [{ variantId: v.id, description: "Botinka", uomCode: "PAIR", qtyRequired: 1, surplusPct: 0 }] };
    await expect(createMR(pm, base as never)).rejects.toThrow(/əsaslandırma/);
    const mr = await createMR(pm, { ...base, justification: "Qəza" } as never);
    await submitMR(pm, mr.id);
    const ap = await db.mRApproval.findMany({ where: { mrId: mr.id }, orderBy: { step: "asc" } });
    expect(ap.find((a) => a.roleCode === "PROJECT_MANAGER")!.decision).toBe("PENDING");
    expect(ap.find((a) => a.roleCode === "GENERAL_DIRECTOR")!.decision).toBe("SKIPPED");
    await expect(decideMR(proc, mr.id, 8, "APPROVED")).rejects.toThrow(/ardıcıllıq/);
    await expect(decideMR(proc, mr.id, 2, "APPROVED")).rejects.toThrow(/səlahiyyət/);
  });
});

describe("Səlahiyyət və validasiya", () => {
  it("11. Auditor qəbul/məxaric təsdiq edə bilmir (servis səviyyəsində)", async () => {
    const v = (await shoe(["41"])).variants[0];
    await opening(v.id, 5);
    const d = await createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: 1 }] });
    await expect(postStockDoc(auditor, d.id)).rejects.toThrow(/səlahiyyət/);
    await expect(createStockDoc(auditor, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate: today, lines: [{ variantId: v.id, qty: 1 }] })).rejects.toThrow(/səlahiyyət/);
    await expect(createCount(auditor, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "x y", lines: [{ variantId: v.id, countedQty: 1 }] })).rejects.toThrow(/səlahiyyət/);
  });

  it("13. qty=0, kəsr ədəd, mənfi stok, gələcək tarix bloklanır", async () => {
    const v = (await shoe(["42"])).variants[0];
    await opening(v.id, 2);
    const mk = (qty: number, docDate = today) => createStockDoc(sk, { kind: "ISSUE_PROJECT", warehouseId: B.wh.id, projectId: B.pA.id, recipientName: "R", docDate, lines: [{ variantId: v.id, qty }] });
    await expect(mk(0)).rejects.toThrow();
    await expect(mk(1.5)).rejects.toThrow(/tam ədəd/);
    await expect(mk(1, new Date(Date.now() + 10 * 86400_000))).rejects.toThrow(/gələcək/);
    const d = await mk(3);
    await expect(postStockDoc(sk, d.id)).rejects.toThrow(/kifayət deyil/);
    expect((await totalOnHand(v.id)).toNumber()).toBe(2);
  });

  it("açılış qalığı yalnız hərəkətsiz variant üçün; təkrar təsdiq idempotentdir", async () => {
    const v = (await shoe(["43"])).variants[0];
    const c = await createCount(wm, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: v.id, countedQty: 10 }] });
    const r = await Promise.all([approveCount(wm, c.id), approveCount(wm, c.id)]);
    expect(r.filter((x) => x.alreadyPosted)).toHaveLength(1);
    expect((await totalOnHand(v.id)).toNumber()).toBe(10);
    const c2 = await createCount(wm, { mode: "OPENING", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: v.id, countedQty: 3 }] });
    await expect(approveCount(wm, c2.id)).rejects.toThrow(/Dövri sayım/);
    const cyc = await createCount(wm, { mode: "CYCLE", warehouseId: B.wh.id, countDate: today, countedBy: "Sayıcı", lines: [{ variantId: v.id, countedQty: 8 }] });
    await approveCount(wm, cyc.id);
    expect((await totalOnHand(v.id)).toNumber()).toBe(8);
    void admin;
  });
});
