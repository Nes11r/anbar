/**
 * DEMO data — development / training ONLY. Every record is prefixed "DEMO" and is NOT real HECOTEC data.
 * Refuses to run when NODE_ENV=production or without the explicit flag:
 *   npm run db:seed:demo -- --i-understand-this-is-demo
 * All stock is created through the real services (count → approve, GRN post, issue post…),
 * so the ledger, balances, audit log and status history are exactly what real usage would produce.
 */
import { PrismaClient } from "@prisma/client";
import type { Actor } from "../src/server/audit";
import { createMaterial } from "../src/server/services/catalog";
import { approveCount, createCount } from "../src/server/services/inventory";
import { saveEmployee, saveProject } from "../src/server/services/masterdata";
import { createGRN, createMR, createPO, decideMR, postGRN, setPOPayment, setPOShipment, setPOStatus, submitMR } from "../src/server/services/procurement";
import { createStockDoc, postStockDoc } from "../src/server/services/stockdocs";

const db = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed production mühitində qadağandır.");
  if (!process.argv.includes("--i-understand-this-is-demo")) throw new Error("Təsdiq bayrağı yoxdur: --i-understand-this-is-demo");
  if (await db.material.count({ where: { code: { startsWith: "DEMO" } } })) {
    console.log("DEMO məlumatlar artıq var. Yenidən yaratmaq üçün əvvəlcə silin: npm run db:clear:demo -- --i-understand-this-is-demo");
    return;
  }
  const admin = (await db.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true, email: process.env.DEMO_ADMIN_EMAIL ?? "admin@hecotec.com" } })) ?? (await db.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, orderBy: { createdAt: "asc" } }));
  if (!admin) throw new Error("Əvvəlcə Super Admin yaradın: npm run admin:create");
  const A: Actor = { id: admin.id, email: admin.email, name: admin.name, role: "SUPER_ADMIN" };
  const cat = async (code: string) => (await db.category.findUniqueOrThrow({ where: { code } })).id;
  const OFIS = await db.warehouse.findUniqueOrThrow({ where: { code: "OFIS" } });
  const KAR = await db.warehouse.findUniqueOrThrow({ where: { code: "KARANTIN" } });

  // ── Projects, employees, suppliers ──
  const p1 = await saveProject(A, null, { code: "DEMO-SGC", name: "DEMO — Səngəçal terminalı təmiri", client: "DEMO Neft MMC", location: "Səngəçal", managerName: "DEMO Layihə rəhbəri", startDate: new Date("2026-09-01"), isActive: true });
  const p2 = await saveProject(A, null, { code: "DEMO-BKU", name: "DEMO — Bakı ofis binası (mülki)", client: "DEMO İnşaat", location: "Bakı", startDate: new Date("2026-10-01"), isActive: true });
  const p3 = await saveProject(A, null, { code: "DEMO-SUM", name: "DEMO — Sumqayıt günəş stansiyası", client: "DEMO Enerji", location: "Sumqayıt", isActive: true });
  // every project gets its own site warehouse automatically
  const SAHE = await db.warehouse.findUniqueOrThrow({ where: { projectId: p1.id } });
  const SAHE3 = await db.warehouse.findUniqueOrThrow({ where: { projectId: p3.id } });

  const emps = [
    ["DEMO-E01", "DEMO Rəşad Mühəndisov", "ENGINEER", "Mexanika mühəndisi", p1.id],
    ["DEMO-E02", "DEMO Leyla Mühəndisova", "ENGINEER", "QA/QC mühəndisi", p1.id],
    ["DEMO-E03", "DEMO Kamran Mühəndisli", "ENGINEER", "Sahə rəisi", p2.id],
    ["DEMO-W01", "DEMO Elvin Fəhləyev", "WORKER", "Qaynaqçı", p1.id],
    ["DEMO-W02", "DEMO Orxan Fəhləli", "WORKER", "Montajçı", p1.id],
    ["DEMO-W03", "DEMO Tural Fəhləzadə", "WORKER", "Fəhlə", p2.id],
    ["DEMO-W04", "DEMO Samir Fəhlə", "WORKER", "Elektrik", p3.id],
  ] as const;
  const E: Record<string, string> = {};
  for (const [code, fullName, group, position, projectId] of emps) E[code] = (await saveEmployee(A, null, { code, fullName, group, position, projectId, isActive: true })).id;

  const sup1 = await db.supplier.create({ data: { code: "DEMO-S1", name: "DEMO PPE Təchizat MMC", contact: "DEMO Satış", phone: "+994 00 000 00 01", notes: "Nümunə — real deyil" } });
  await db.supplier.create({ data: { code: "DEMO-S2", name: "DEMO Boru və Armatur MMC", notes: "Nümunə — real deyil" } });

  // ── Catalogue ──
  const mk = (x: Record<string, unknown>) => createMaterial(A, { minStock: 0, ...x } as never);
  const sizes = (list: string[]) => list.map((size) => ({ size, color: "", isActive: true }));
  const bootsW = await mk({ code: "DEMO-BOOT-W", nameAz: "DEMO Təhlükəsizlik botinkası (fəhlə)", nameEn: "Safety boots S3", brand: "DEMO", model: "S3 SRC", categoryId: await cat("PPE-FOOT"), workerGroup: "WORKER", sizeType: "SHOE_EU", unitCode: "PAIR", minStock: 3, variants: sizes(["40", "41", "42", "43", "44", "45"]) });
  const bootsE = await mk({ code: "DEMO-BOOT-E", nameAz: "DEMO Botinka (mühəndis)", model: "S1P", categoryId: await cat("PPE-FOOT"), workerGroup: "ENGINEER", sizeType: "SHOE_EU", unitCode: "PAIR", minStock: 2, variants: sizes(["39", "41", "42", "43"]) });
  const coverall = await mk({ code: "DEMO-COV", nameAz: "DEMO Kombinezon (göy)", nameEn: "Coverall navy", categoryId: await cat("PPE-CLOTH"), workerGroup: "WORKER", sizeType: "CLOTHING_NUMERIC", unitCode: "PCS", minStock: 4, color: "Göy", variants: sizes(["48", "50", "52", "54", "56"]) });
  const pants = await mk({ code: "DEMO-PANTS-E", nameAz: "DEMO Şalvar (mühəndis)", model: "Stretch", categoryId: await cat("PPE-CLOTH"), workerGroup: "ENGINEER", sizeType: "CLOTHING_NUMERIC", unitCode: "PCS", minStock: 2, variants: sizes(["48", "50", "52", "54"]) });
  const jacket = await mk({ code: "DEMO-JKT", nameAz: "DEMO Qış kurtkası", categoryId: await cat("PPE-CLOTH"), workerGroup: "BOTH", sizeType: "CLOTHING_LETTER", unitCode: "PCS", minStock: 2, variants: sizes(["M", "L", "XL", "2XL"]) });
  const vest = await mk({ code: "DEMO-VEST", nameAz: "DEMO Siqnal jileti (sarı)", categoryId: await cat("PPE-CLOTH"), workerGroup: "BOTH", sizeType: "CLOTHING_LETTER", unitCode: "PCS", minStock: 5, variants: sizes(["L", "XL", "2XL"]) });
  const helmet = await mk({ code: "DEMO-HELM", nameAz: "DEMO Dəbilqə", model: "Ratchet", categoryId: await cat("PPE-HEAD"), workerGroup: "BOTH", sizeType: "NONE", unitCode: "PCS", minStock: 10, variants: sizes([""]) });
  const glassC = await mk({ code: "DEMO-GLS-C", nameAz: "DEMO Eynək (şəffaf)", categoryId: await cat("PPE-HEAD"), workerGroup: "BOTH", sizeType: "NONE", unitCode: "PCS", minStock: 20, variants: sizes([""]) });
  const glassD = await mk({ code: "DEMO-GLS-D", nameAz: "DEMO Eynək (qara)", categoryId: await cat("PPE-HEAD"), workerGroup: "BOTH", sizeType: "NONE", unitCode: "PCS", minStock: 10, variants: sizes([""]) });
  const gloves = await mk({ isConsumable: true, code: "DEMO-GLV", nameAz: "DEMO İş əlcəyi", categoryId: await cat("PPE-HAND"), workerGroup: "BOTH", sizeType: "NONE", unitCode: "PAIR", minStock: 50, variants: sizes([""]) });
  const bag = await mk({ code: "DEMO-BAG", nameAz: "DEMO Çanta (mühəndis)", categoryId: await cat("PPE-BAG"), workerGroup: "ENGINEER", sizeType: "NONE", unitCode: "PCS", minStock: 2, variants: sizes([""]) });
  const pipe = await mk({ code: "DEMO-PIPE219", nameAz: "DEMO Karbon polad boru Ø219", categoryId: await cat("PIPE"), workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "M", minStock: 100, variants: sizes([""]) });
  const flange = await mk({ code: "DEMO-FLG200", nameAz: "DEMO Flans DN200 PN16", categoryId: await cat("VALVE"), workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "PCS", minStock: 10, variants: sizes([""]) });
  const electrode = await mk({ isConsumable: true, code: "DEMO-ELD32", nameAz: "DEMO Qaynaq elektrodu Ø3.2", categoryId: await cat("WELD"), workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "KG", minStock: 50, variants: sizes([""]) });
  const cable = await mk({ code: "DEMO-CBL416", nameAz: "DEMO Kabel NYY 4x16", categoryId: await cat("ELEC"), workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "M", minStock: 200, variants: sizes([""]) });
  const v = (m: { variants: { id: string; size: string }[] }, size = "") => m.variants.find((x) => x.size === size)!.id;

  // ── Opening inventory (Office warehouse) — approved ──
  const officeLines: [string, number][] = [
    [v(bootsW, "40"), 4], [v(bootsW, "41"), 8], [v(bootsW, "42"), 10], [v(bootsW, "43"), 6], [v(bootsW, "44"), 2], [v(bootsW, "45"), 1],
    [v(bootsE, "39"), 1], [v(bootsE, "41"), 3], [v(bootsE, "42"), 4], [v(bootsE, "43"), 2],
    [v(coverall, "48"), 3], [v(coverall, "50"), 8], [v(coverall, "52"), 10], [v(coverall, "54"), 6], [v(coverall, "56"), 2],
    [v(pants, "48"), 2], [v(pants, "50"), 6], [v(pants, "52"), 5], [v(pants, "54"), 3],
    [v(jacket, "M"), 3], [v(jacket, "L"), 5], [v(jacket, "XL"), 6], [v(jacket, "2XL"), 2],
    [v(vest, "L"), 12], [v(vest, "XL"), 15], [v(vest, "2XL"), 4],
    [v(helmet), 42], [v(glassC), 125], [v(glassD), 8], [v(gloves), 336], [v(bag), 20],
    [v(pipe), 260], [v(flange), 16], [v(electrode), 120],
  ];
  const c1 = await createCount(A, { mode: "OPENING", warehouseId: OFIS.id, countDate: daysAgo(30), countedBy: "DEMO Anbardar, DEMO Anbar müdiri", notes: "DEMO ilkin inventarlaşdırma", lines: officeLines.map(([variantId, countedQty]) => ({ variantId, countedQty })) });
  await approveCount(A, c1.id);
  const c2 = await createCount(A, { mode: "OPENING", warehouseId: SAHE.id, countDate: daysAgo(30), countedBy: "DEMO Sahə anbardarı", lines: [{ variantId: v(helmet), countedQty: 15 }, { variantId: v(glassC), countedQty: 40 }, { variantId: v(pipe), countedQty: 150 }, { variantId: v(gloves), countedQty: 60 }] });
  await approveCount(A, c2.id);

  // ── Issues to projects ──
  // office → project site (transfer), then used on site (consumption is recorded from the site warehouse only)
  const issueP = async (projectId: string, recipientName: string, ago: number, lines: [string, number][], fromSiteOnly = false) => {
    const site = await db.warehouse.findUniqueOrThrow({ where: { projectId } });
    if (!fromSiteOnly) {
      const t = await createStockDoc(A, { kind: "TRANSFER", warehouseId: OFIS.id, toWarehouseId: site.id, recipientName: "DEMO Sürücü", docDate: daysAgo(ago + 1), lines: lines.map(([variantId, qty]) => ({ variantId, qty })) });
      await postStockDoc(A, t.id);
    }
    const d = await createStockDoc(A, { kind: "ISSUE_PROJECT", warehouseId: site.id, projectId, recipientName, docDate: daysAgo(ago), lines: lines.map(([variantId, qty]) => ({ variantId, qty })) });
    await postStockDoc(A, d.id);
    return d;
  };
  await issueP(p1.id, "DEMO Usta Əli", 25, [[v(pipe), 80], [v(flange), 6], [v(electrode), 45], [v(helmet), 10], [v(gloves), 60]]);
  await issueP(p2.id, "DEMO Usta Vüqar", 20, [[v(pipe), 40], [v(helmet), 6], [v(vest, "XL"), 8], [v(glassC), 30]]);
  await issueP(p3.id, "DEMO Usta Nicat", 12, [[v(gloves), 40], [v(helmet), 4]]);
  await issueP(p1.id, "DEMO Sahə rəisi", 6, [[v(pipe), 60], [v(gloves), 30]], true);

  // ── PPE to employees (incl. one authorised group-mismatch override) ──
  const ppe = async (emp: string, ago: number, lines: [string, number, string?][]) => {
    const d = await createStockDoc(A, { kind: "ISSUE_EMPLOYEE", warehouseId: OFIS.id, employeeId: E[emp], recipientName: "Özü", docDate: daysAgo(ago), lines: lines.map(([variantId, qty, overrideReason]) => ({ variantId, qty, overrideReason: overrideReason ?? null })) });
    await postStockDoc(A, d.id);
  };
  await ppe("DEMO-W01", 22, [[v(bootsW, "42"), 1], [v(coverall, "52"), 2], [v(helmet), 1], [v(glassC), 1], [v(gloves), 10]]);
  await ppe("DEMO-W02", 22, [[v(bootsW, "43"), 1], [v(coverall, "54"), 2], [v(helmet), 1], [v(vest, "XL"), 1]]);
  await ppe("DEMO-W03", 15, [[v(bootsW, "41"), 1], [v(coverall, "50"), 1], [v(jacket, "L"), 1]]);
  await ppe("DEMO-W04", 9, [[v(bootsW, "44"), 1], [v(coverall, "50"), 2], [v(glassD), 1]]);
  await ppe("DEMO-E01", 21, [[v(bootsE, "42"), 1], [v(pants, "50"), 2], [v(jacket, "XL"), 1], [v(bag), 1], [v(glassD), 1]]);
  await ppe("DEMO-E02", 18, [[v(bootsE, "41"), 1], [v(pants, "48"), 1], [v(vest, "L"), 1]]);
  await ppe("DEMO-E03", 4, [[v(bootsW, "43"), 1, "Mühəndis ölçüsü bitib, müvəqqəti fəhlə botinkası verildi"], [v(pants, "52"), 1]]);

  // ── Returns: one good (back to Office), one defective (→ Quarantine) ──
  const r1 = await createStockDoc(A, { kind: "RETURN_FROM_PROJECT", warehouseId: SAHE.id, projectId: p1.id, reason: "Artıq qaldı", docDate: daysAgo(3), lines: [{ variantId: v(pipe), qty: 12, condition: "GOOD" }, { variantId: v(flange), qty: 1, condition: "DEFECTIVE", targetWarehouseId: KAR.id }] });
  await postStockDoc(A, r1.id);
  const r2 = await createStockDoc(A, { kind: "RETURN_FROM_EMPLOYEE", warehouseId: OFIS.id, employeeId: E["DEMO-W02"], reason: "Ölçü uyğun gəlmədi", docDate: daysAgo(2), lines: [{ variantId: v(coverall, "54"), qty: 1, condition: "GOOD" }] });
  await postStockDoc(A, r2.id);

  // ── Transfer Office → Field ──
  const t = await createStockDoc(A, { kind: "TRANSFER", warehouseId: OFIS.id, toWarehouseId: SAHE.id, recipientName: "DEMO Sürücü", docDate: daysAgo(5), lines: [{ variantId: v(helmet), qty: 8 }, { variantId: v(vest, "L"), qty: 5 }] });
  await postStockDoc(A, t.id);

  // ── Procurement: MR → full approval → PO → partial GRN (60/100 + 4/4 …) ──
  const mr1 = await createMR(A, {
    projectId: p1.id, discipline: "MEC", projectPhase: "CONST", requestType: "NEW", priority: "NORMAL", supplyCategory: "CONSUMABLE", procurementRoute: "LOCAL",
    dateRaised: daysAgo(14), requiredOnSiteDate: daysAgo(-10), requesterName: "DEMO Rəşad Mühəndisov", requesterPosition: "Mexanika mühəndisi", currency: "AZN",
    deliveryWarehouseId: OFIS.id, referenceDocs: [{ docType: "MTO", docNumber: "DEMO-MTO-001", revision: "A", title: "Boru xətti MTO" }], formData: {},
    lines: [
      { variantId: v(cable), description: "Kabel NYY 4x16", uomCode: "M", qtyRequired: 100, surplusPct: 0, estUnitPrice: 12.5 },
      { variantId: v(bootsW, "44"), description: "Təhlükəsizlik botinkası S3, ölçü 44", size: "44", uomCode: "PAIR", qtyRequired: 6, surplusPct: 0, estUnitPrice: 85 },
      { variantId: v(glassD), description: "Qara eynək", uomCode: "PCS", qtyRequired: 20, surplusPct: 0, estUnitPrice: 6 },
    ],
  } as never);
  await submitMR(A, mr1.id);
  for (const a of await db.mRApproval.findMany({ where: { mrId: mr1.id, decision: "PENDING" }, orderBy: { step: "asc" } })) await decideMR(A, mr1.id, a.step, "APPROVED", "DEMO təsdiq");
  const mr1Full = await db.materialRequest.findUniqueOrThrow({ where: { id: mr1.id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  const po1 = await createPO(A, {
    supplierId: sup1.id, mrId: mr1.id, orderDate: daysAgo(10), expectedDate: daysAgo(-5), currency: "AZN", notes: "DEMO sifariş",
    lines: mr1Full.lines.filter((l) => Number(l.netQtyToOrder) > 0).map((l) => ({ variantId: l.variantId!, mrLineId: l.id, qtyOrdered: Number(l.netQtyToOrder), unitPrice: l.estUnitPrice == null ? null : Number(l.estUnitPrice) })),
  } as never);
  await setPOStatus(A, po1.id, "APPROVED");
  const po1Full = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po1.id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  // First delivery: cable 60 of 100, boots full (1 rejected with NCR), glasses not yet
  const g1 = await createGRN(A, {
    poId: po1.id, warehouseId: OFIS.id, receivedDate: daysAgo(4), receiverName: "DEMO Anbardar", deliveryNoteNo: "DEMO-QAİMƏ-1001",
    lines: po1Full.lines.map((l, i) => i === 0 ? { poLineId: l.id, qtyReceived: 60, qtyRejected: 0, qualityStatus: "ACCEPTED" } : i === 1 ? { poLineId: l.id, qtyReceived: Number(l.qtyOrdered), qtyRejected: 1, qualityStatus: "ACCEPTED_WITH_NCR", note: "1 cüt zədəli" } : { poLineId: l.id, qtyReceived: 0, qtyRejected: 0, qualityStatus: "ACCEPTED" }),
  } as never);
  await postGRN(A, g1.id);
  // Order tracking: paid, the rest is on the way
  await setPOPayment(A, po1.id, { status: "PAID", ref: "DEMO-ÖDƏNİŞ-001" });
  await setPOShipment(A, po1.id, { carrier: "DEMO Kargo", trackingNo: "DEMO-TRK-555", shippedAt: daysAgo(1) });

  // A second MR waiting for approval (shows the approval queue), urgent
  const mr2 = await createMR(A, {
    projectId: p3.id, discipline: "ELE", requestType: "NEW", priority: "URGENT", justification: "DEMO: kabel çəkilişi qrafikdən geri qalır",
    dateRaised: daysAgo(1), requiredOnSiteDate: daysAgo(-3), requesterName: "DEMO Samir Fəhlə", currency: "AZN", deliveryWarehouseId: SAHE3.id, referenceDocs: [], formData: {},
    lines: [{ variantId: v(cable), description: "Kabel NYY 4x16", uomCode: "M", qtyRequired: 300, surplusPct: 5, estUnitPrice: 12.5 }, { description: "DEMO Kabel ucluğu 16 mm² (kataloqda yoxdur)", uomCode: "PCS", qtyRequired: 50, surplusPct: 0, estUnitPrice: 1.2 }],
  } as never);
  await submitMR(A, mr2.id);

  // A draft MR (editable)
  await createMR(A, {
    projectId: p2.id, discipline: "CIV", requestType: "NEW", priority: "NORMAL", dateRaised: new Date(), requiredOnSiteDate: daysAgo(-20), requesterName: "DEMO Kamran Mühəndisli", currency: "AZN", referenceDocs: [], formData: {},
    lines: [{ variantId: v(vest, "2XL"), description: "Siqnal jileti 2XL", size: "2XL", uomCode: "PCS", qtyRequired: 10, surplusPct: 0 }],
  } as never);

  // A draft transfer (shows a saved-but-not-sent document)
  const p2site = await db.warehouse.findUniqueOrThrow({ where: { projectId: p2.id } });
  await createStockDoc(A, { kind: "TRANSFER", warehouseId: OFIS.id, toWarehouseId: p2site.id, recipientName: "DEMO Usta Vüqar", docDate: new Date(), lines: [{ variantId: v(helmet), qty: 5 }, { variantId: v(gloves), qty: 20 }] });

  await demoSites(A);
  console.log("DEMO məlumatlar yaradıldı: 3 layihə (hər birinin sahə anbarı), 8 işçi, 2 tədarükçü, 15 material (ölçülərlə), 2 açılış sayımı, layihə/PPE məxaricləri, qaytarmalar, köçürmə, MR→PO→qismən GRN, təsdiq gözləyən MR və qaralamalar.");
}


/**
 * Site-warehouse scenario (office → project site → workers + a daily site report).
 * Runs as part of the full demo, and can be added to an existing demo database on its own.
 */
async function demoSites(A: Actor) {
  const sgc = await db.project.findUnique({ where: { code: "DEMO-SGC" }, include: { siteWarehouse: true } });
  if (!sgc?.siteWarehouse) return console.log("DEMO-SGC sahə anbarı yoxdur — sahə ssenarisi atlandı.");
  if (await db.stockDocument.count({ where: { recipientName: "DEMO Layihə rəhbəri" } })) return console.log("Sahə ssenarisi artıq var.");
  const office = await db.warehouse.findUniqueOrThrow({ where: { code: "OFIS" } });
  const v = async (code: string, size = "") => (await db.materialVariant.findFirstOrThrow({ where: { material: { code }, size } })).id;
  const site = sgc.siteWarehouse.id;
  const emp = async (code: string) => (await db.employee.findUniqueOrThrow({ where: { code } })).id;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
  // Project manager collects extra from the office: part goes to workers, the rest stays in site stock
  const t = await createStockDoc(A, {
    kind: "TRANSFER", warehouseId: office.id, toWarehouseId: site, recipientName: "DEMO Layihə rəhbəri", docDate: daysAgo(3),
    lines: [
      { variantId: await v("DEMO-COV", "50"), qty: 4 }, { variantId: await v("DEMO-COV", "52"), qty: 4 },
      { variantId: await v("DEMO-BOOT-W", "42"), qty: 3 }, { variantId: await v("DEMO-HELM"), qty: 6 },
      { variantId: await v("DEMO-GLV"), qty: 40 }, { variantId: await v("DEMO-VEST", "XL"), qty: 4 },
    ],
  });
  await postStockDoc(A, t.id);
  for (const [code, lines] of [
    ["DEMO-W01", [["DEMO-COV", "52", 1], ["DEMO-GLV", "", 10], ["DEMO-HELM", "", 1]]],
    ["DEMO-W02", [["DEMO-COV", "50", 1], ["DEMO-BOOT-W", "42", 1], ["DEMO-GLV", "", 10], ["DEMO-HELM", "", 1]]],
  ] as const) {
    const d = await createStockDoc(A, { kind: "ISSUE_EMPLOYEE", warehouseId: site, employeeId: await emp(code), recipientName: "Özü", docDate: daysAgo(2), lines: await Promise.all(lines.map(async ([m, sz, q]) => ({ variantId: await v(m, sz), qty: q }))) });
    await postStockDoc(A, d.id);
  }
  // Issue by simply typing a new worker's name (no separate worker registration)
  const byName = await createStockDoc(A, { kind: "ISSUE_EMPLOYEE", warehouseId: site, employeeName: "DEMO Nihad Qaynaqçı", employeeGroup: "WORKER", docDate: daysAgo(1), lines: [{ variantId: await v("DEMO-COV", "52"), qty: 1 }, { variantId: await v("DEMO-VEST", "XL"), qty: 1 }] });
  await postStockDoc(A, byName.id);
  // Yesterday's report from the site storekeeper — one glove pack unaccounted for
  const { createSiteReport, siteMaterials } = await import("../src/server/services/sites");
  const mats = await siteMaterials(sgc.id);
  await createSiteReport(A, {
    projectId: sgc.id, reportDate: daysAgo(1), reportedBy: "DEMO Sahə anbardarı", notes: "DEMO gündəlik hesabat",
    lines: mats.map((m) => ({ variantId: m.variantId, stockQty: m.sku.startsWith("DEMO-GLV") ? Math.max(0, m.inStock.toNumber() - 5) : m.inStock.toNumber(), withWorkersQty: m.withWorkers.toNumber() })),
  });
  console.log("Sahə ssenarisi əlavə edildi: DEMO-SGC sahə anbarı, işçilərə təhvil və gündəlik hesabat.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
