import { Prisma, type MRStatus, type UserRole } from "@prisma/client";
import { z } from "zod";
import { db, withTx, type Tx } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can, isLeadership } from "@/lib/rbac";
import { audit, statusChange, type Actor } from "../audit";
import { applyMovements, nextNumber, reversalMovements, type LedgerMovement } from "../stock/ledger";
import { D, poReceiptStatus, validateQty } from "../stock/rules";
import { assertVariantsUsable, assertWarehouse, getSettings, unitRulesFor } from "./common";

// ───────────────────────── Material Request ─────────────────────────

const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const mrLineSchema = z.object({
  variantId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  materialCode: optStr(100),
  description: z.string().trim().min(2, "Hər sətirdə materialın təsviri olmalıdır.").max(1000),
  size: optStr(50),
  gradeStandard: optStr(200),
  uomCode: z.string().min(1, "Hər sətirdə ölçü vahidi olmalıdır."),
  qtyRequired: z.coerce.number({ invalid_type_error: "Miqdar rəqəm olmalıdır." }).positive("Tələb olunan miqdar 0-dan böyük olmalıdır."),
  surplusPct: z.coerce.number().min(0).max(100).default(0),
  estUnitPrice: z.coerce.number().min(0).optional().nullable(),
  requiredDate: z.coerce.date().optional().nullable(),
  remarks: optStr(500),
});

export const mrSchema = z
  .object({
    projectId: z.string().uuid("Layihə seçilməyib."),
    discipline: z.string().min(2, "Disiplin seçilməyib."),
    disciplineOther: optStr(100),
    projectPhase: optStr(20),
    requestType: z.enum(["NEW", "REVISION", "REPLACEMENT", "CANCELLATION"]),
    priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]),
    supplyCategory: optStr(40),
    procurementRoute: optStr(40),
    supersedesMrNumber: optStr(60),
    revisionReason: optStr(1000),
    dateRaised: z.coerce.date({ errorMap: () => ({ message: "MR tarixi düzgün deyil." }) }),
    requiredOnSiteDate: z.coerce.date({ errorMap: () => ({ message: "Sahəyə tələb tarixi (RoS) düzgün deyil." }) }),
    requesterName: z.string().trim().min(2, "Tələb edənin adı məcburidir.").max(200),
    requesterPosition: optStr(200),
    justification: optStr(4000),
    notes: optStr(4000),
    currency: z.string().length(3).default("AZN"),
    deliveryWarehouseId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
    referenceDocs: z
      .array(z.object({ docType: z.string().max(30), docNumber: z.string().max(100), revision: z.string().max(20).optional(), title: z.string().max(300).optional() }))
      .max(20)
      .default([]),
    formData: z.record(z.string(), z.unknown()).default({}),
    lines: z.array(mrLineSchema).min(1, "Ən azı bir material sətri əlavə edin."),
  })
  .superRefine((v, ctx) => {
    if (v.requiredOnSiteDate < v.dateRaised) ctx.addIssue({ code: "custom", path: ["requiredOnSiteDate"], message: "RoS tarixi MR tarixindən əvvəl ola bilməz." });
    if (v.priority !== "NORMAL" && !v.justification) ctx.addIssue({ code: "custom", path: ["justification"], message: "Təcili / fövqəladə tələb üçün əsaslandırma məcburidir." });
    if ((v.requestType === "REVISION" || v.requestType === "CANCELLATION") && !v.revisionReason)
      ctx.addIssue({ code: "custom", path: ["revisionReason"], message: "Reviziya / ləğv səbəbi məcburidir." });
    if (v.discipline === "OTH" && !v.disciplineOther) ctx.addIssue({ code: "custom", path: ["disciplineOther"], message: "Digər disiplini göstərin." });
  });
export type MRInput = z.infer<typeof mrSchema>;

/**
 * Stock that can really cover this project's request: the office (non-project) warehouses and the
 * project's own site — never what sits on OTHER projects' sites.
 */
async function availableByVariant(c: Tx | typeof db, ids: string[], projectId: string) {
  if (!ids.length) return new Map<string, Prisma.Decimal>();
  const rows = await c.$queryRaw<{ variantId: string; avail: string }[]>`
    SELECT b."variantId"::text AS "variantId", SUM(b."onHand" - b.reserved)::text AS avail
    FROM stock_balances b JOIN warehouses w ON w.id = b."warehouseId"
    WHERE w.type = 'NORMAL' AND w."isActive" AND (w."projectId" IS NULL OR w."projectId" = ${projectId}::uuid)
      AND b."variantId" = ANY(${ids}::uuid[]) GROUP BY b."variantId"`;
  return new Map(rows.map((r) => [r.variantId, D(r.avail)]));
}

async function buildMrLines(c: Tx | typeof db, lines: MRInput["lines"], projectId: string) {
  const ids = lines.map((l) => l.variantId).filter((x): x is string => !!x);
  if (ids.length) await assertVariantsUsable(c, ids);
  const units = await c.unit.findMany();
  const unitMap = new Map(units.map((u) => [u.code, u]));
  const avail = await availableByVariant(c, ids, projectId);
  let total = D(0);
  const rows = lines.map((l, i) => {
    const u = unitMap.get(l.uomCode);
    if (!u) throw new AppError(`Sətir ${i + 1}: ölçü vahidi tanınmır (${l.uomCode}).`, "VALIDATION");
    const err = validateQty(l.qtyRequired, u.allowsDecimal);
    if (err) throw new AppError(`Sətir ${i + 1}: ${err}`, "VALIDATION");
    const inStock = l.variantId ? Prisma.Decimal.max(avail.get(l.variantId) ?? D(0), 0) : D(0);
    const required = D(l.qtyRequired);
    const withSurplus = required.times(D(1).plus(D(l.surplusPct).div(100)));
    let net = Prisma.Decimal.max(withSurplus.minus(inStock), 0);
    net = u.allowsDecimal ? net.toDecimalPlaces(3) : net.ceil();
    if (l.estUnitPrice) total = total.plus(net.times(l.estUnitPrice));
    return {
      lineNo: i + 1,
      variantId: l.variantId || null,
      materialCode: l.materialCode,
      description: l.description,
      size: l.size,
      gradeStandard: l.gradeStandard,
      uomCode: l.uomCode,
      qtyRequired: required,
      qtyInStock: inStock,
      surplusPct: D(l.surplusPct),
      netQtyToOrder: net,
      estUnitPrice: l.estUnitPrice == null ? null : D(l.estUnitPrice),
      requiredDate: l.requiredDate ?? null,
      remarks: l.remarks,
    };
  });
  return { rows, total: total.toDecimalPlaces(2) };
}

function mrHeader(d: MRInput) {
  return {
    projectId: d.projectId,
    discipline: d.discipline,
    disciplineOther: d.disciplineOther,
    projectPhase: d.projectPhase,
    requestType: d.requestType,
    priority: d.priority,
    supplyCategory: d.supplyCategory,
    procurementRoute: d.procurementRoute,
    supersedesMrNumber: d.supersedesMrNumber,
    revisionReason: d.revisionReason,
    dateRaised: d.dateRaised,
    requiredOnSiteDate: d.requiredOnSiteDate,
    requesterName: d.requesterName,
    requesterPosition: d.requesterPosition,
    justification: d.justification,
    notes: d.notes,
    currency: d.currency,
    deliveryWarehouseId: d.deliveryWarehouseId || null,
    referenceDocs: d.referenceDocs as Prisma.InputJsonValue,
    formData: d.formData as Prisma.InputJsonValue,
  };
}

export async function createMR(actor: Actor, input: MRInput) {
  if (!can(actor.role, "mr.create")) throw new ForbiddenError();
  const d = mrSchema.parse(input);
  if (actor.projectId && actor.projectId !== d.projectId) throw new ForbiddenError("Yalnız öz layihəniz üçün MR yarada bilərsiniz.");
  const project = await db.project.findUnique({ where: { id: d.projectId } });
  if (!project || !project.isActive) throw new AppError("Layihə tapılmadı və ya deaktivdir.", "VALIDATION");
  return withTx(async (tx) => {
    const { rows, total } = await buildMrLines(tx, d.lines, d.projectId);
    // MR-[Project Code]-[Discipline Code]-[Sequence]
    const key = `MR-${project.code}-${d.discipline}`;
    const seq = await tx.$queryRaw<{ n: number }[]>`
      INSERT INTO doc_sequences (key, next) VALUES (${key}, 2)
      ON CONFLICT (key) DO UPDATE SET next = doc_sequences.next + 1 RETURNING next - 1 AS n`;
    const mrNumber = `${key}-${String(seq[0].n).padStart(4, "0")}`;
    const mr = await tx.materialRequest.create({
      data: { ...mrHeader(d), mrNumber, revision: "00", requesterId: actor.id, estimatedValue: total, lines: { create: rows } },
    });
    await statusChange(tx, actor, "MaterialRequest", mr.id, null, "DRAFT");
    await audit(tx, actor, "CREATE", "MaterialRequest", mr.id, `${mrNumber} yaradıldı (${rows.length} sətir)`);
    return mr;
  });
}

export async function updateMR(actor: Actor, id: string, version: number, input: MRInput) {
  if (!can(actor.role, "mr.create")) throw new ForbiddenError();
  const d = mrSchema.parse(input);
  return withTx(async (tx) => {
    const cur = await tx.materialRequest.findUnique({ where: { id } });
    if (!cur) throw new NotFoundError("MR");
    if (cur.requesterId !== actor.id && !isLeadership(actor.role)) throw new ForbiddenError("MR-i yalnız onu yaradan və ya rəhbərlik dəyişə bilər.");
    if (cur.projectId !== d.projectId || cur.discipline !== d.discipline) throw new AppError("MR nömrəsi layihə və disiplinə bağlıdır; onları dəyişmək üçün yeni MR yaradın.");
    const { rows, total } = await buildMrLines(tx, d.lines, d.projectId);
    const r = await tx.materialRequest.updateMany({
      where: { id, version, status: { in: ["DRAFT", "RETURNED"] } },
      data: { ...mrHeader(d), estimatedValue: total, version: { increment: 1 } },
    });
    if (r.count === 0) throw new ConflictError("MR yalnız qaralama və ya geri qaytarılmış statusda dəyişdirilə bilər (və ya başqası dəyişib).");
    await tx.mRLine.deleteMany({ where: { mrId: id } });
    await tx.mRLine.createMany({ data: rows.map((r2) => ({ ...r2, mrId: id })) });
    await audit(tx, actor, "UPDATE", "MaterialRequest", id, `${cur.mrNumber} yeniləndi`);
  });
}

/** Copy an MR into the next revision (00 → 01). The copy starts as DRAFT. */
export async function reviseMR(actor: Actor, id: string, reason: string) {
  if (!can(actor.role, "mr.create")) throw new ForbiddenError();
  if (!reason?.trim()) throw new AppError("Reviziya səbəbi məcburidir.", "VALIDATION");
  return withTx(async (tx) => {
    const cur = await tx.materialRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!cur) throw new NotFoundError("MR");
    const latest = await tx.materialRequest.findFirst({ where: { mrNumber: cur.mrNumber }, orderBy: { revision: "desc" } });
    const nextRev = String(Number(latest!.revision) + 1).padStart(2, "0");
    if (Number(nextRev) > 99) throw new AppError("Reviziya limiti aşılıb.");
    const { id: _id, createdAt: _c, updatedAt: _u, version: _v, lines, status: _s, submittedAt: _sa, approvedAt: _aa, ...rest } = cur;
    void _id; void _c; void _u; void _v; void _s; void _sa; void _aa;
    const mr = await tx.materialRequest.create({
      data: {
        ...rest,
        referenceDocs: rest.referenceDocs as Prisma.InputJsonValue,
        formData: rest.formData as Prisma.InputJsonValue,
        revision: nextRev,
        requestType: "REVISION",
        revisionReason: reason.trim(),
        supersedesMrNumber: `${cur.mrNumber} Rev.${cur.revision}`,
        requesterId: actor.id,
        lines: { create: lines.map(({ id: _lid, mrId: _m, ...l }) => (void _lid, void _m, l)) },
      },
    });
    await statusChange(tx, actor, "MaterialRequest", mr.id, null, "DRAFT", `Rev.${nextRev}`);
    await audit(tx, actor, "REVISE", "MaterialRequest", mr.id, `${cur.mrNumber} Rev.${nextRev} yaradıldı. Səbəb: ${reason}`);
    return mr;
  });
}

function stepRequired(cond: string, mr: { priority: string; estimatedValue: Prisma.Decimal }, s: { pmApprovalThreshold: number; gdApprovalThreshold: number }) {
  if (cond === "ALWAYS") return true;
  if (cond === "URGENT_OR_PM_THRESHOLD") return mr.priority !== "NORMAL" || mr.estimatedValue.gt(s.pmApprovalThreshold);
  if (cond === "GD_THRESHOLD") return mr.estimatedValue.gt(s.gdApprovalThreshold);
  return true;
}

export async function submitMR(actor: Actor, id: string) {
  if (!can(actor.role, "mr.create")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: MRStatus }[]>`SELECT status FROM material_requests WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("MR");
    if (lock[0].status !== "DRAFT" && lock[0].status !== "RETURNED") throw new AppError("Yalnız qaralama və ya geri qaytarılmış MR göndərilə bilər.");
    const mr = await tx.materialRequest.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (mr.lines.length === 0) throw new AppError("MR-də ən azı bir sətir olmalıdır.");
    const cfg = await tx.approvalStepConfig.findMany({ where: { isActive: true }, orderBy: { step: "asc" } });
    if (cfg.length === 0) throw new AppError("Təsdiq marşrutu konfiqurasiya edilməyib (Parametrlər → MR təsdiq mərhələləri).");
    const settings = await getSettings(tx);
    await tx.mRApproval.deleteMany({ where: { mrId: id } });
    await tx.mRApproval.createMany({
      data: cfg.map((c) => {
        const required = stepRequired(c.condition, mr, settings);
        const isRequester = c.roleCode === "REQUESTER";
        return {
          mrId: id,
          step: c.step,
          roleCode: c.roleCode,
          roleLabel: c.labelAz,
          required,
          allowedRoles: c.allowedRoles,
          decision: isRequester ? "APPROVED" : required ? "PENDING" : "SKIPPED",
          approverId: isRequester ? actor.id : null,
          approverName: isRequester ? actor.name : null,
          decidedAt: isRequester ? new Date() : null,
          comment: isRequester ? "Göndərildi" : null,
        };
      }),
    });
    const pending = await tx.mRApproval.count({ where: { mrId: id, decision: "PENDING" } });
    const status: MRStatus = pending === 0 ? "APPROVED" : "UNDER_REVIEW";
    await tx.materialRequest.update({ where: { id }, data: { status, submittedAt: new Date(), approvedAt: status === "APPROVED" ? new Date() : null, version: { increment: 1 } } });
    await statusChange(tx, actor, "MaterialRequest", id, lock[0].status, status);
    await audit(tx, actor, "SUBMIT", "MaterialRequest", id, `${mr.mrNumber} təsdiqə göndərildi`);
    return { status };
  });
}

export function canDecideStep(role: UserRole, allowed: UserRole[]) {
  return isLeadership(role) || allowed.includes(role);
}

export async function decideMR(actor: Actor, id: string, step: number, decision: "APPROVED" | "REJECTED" | "REVISE", comment?: string) {
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: MRStatus }[]>`SELECT status FROM material_requests WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("MR");
    if (lock[0].status !== "UNDER_REVIEW" && lock[0].status !== "SUBMITTED") throw new AppError("MR hazırda təsdiq mərhələsində deyil.");
    const approvals = await tx.mRApproval.findMany({ where: { mrId: id }, orderBy: { step: "asc" } });
    const current = approvals.find((a) => a.decision === "PENDING");
    if (!current) throw new AppError("Gözləyən təsdiq mərhələsi yoxdur.");
    if (current.step !== step) throw new AppError(`Təsdiq ardıcıllıqla aparılır. Hazırkı mərhələ: ${current.step}. ${current.roleLabel}.`);
    if (!canDecideStep(actor.role, current.allowedRoles)) throw new ForbiddenError(`"${current.roleLabel}" mərhələsini təsdiqləmək səlahiyyətiniz yoxdur.`);
    if (decision !== "APPROVED" && !comment?.trim()) throw new AppError("İmtina və ya geri qaytarma üçün şərh məcburidir.", "VALIDATION");
    await tx.mRApproval.update({
      where: { id: current.id },
      data: { decision, approverId: actor.id, approverName: actor.name, decidedAt: new Date(), comment: comment?.trim() || null },
    });
    let status: MRStatus = "UNDER_REVIEW";
    if (decision === "REJECTED") status = "REJECTED";
    else if (decision === "REVISE") status = "RETURNED";
    else if (!approvals.some((a) => a.id !== current.id && a.decision === "PENDING")) status = "APPROVED";
    await tx.materialRequest.update({ where: { id }, data: { status, approvedAt: status === "APPROVED" ? new Date() : undefined, version: { increment: 1 } } });
    if (status !== lock[0].status) await statusChange(tx, actor, "MaterialRequest", id, lock[0].status, status, comment);
    await audit(tx, actor, `MR_${decision}`, "MaterialRequest", id, `Mərhələ ${step} (${current.roleLabel}): ${decision}${comment ? ` — ${comment}` : ""}`);
    return { status };
  });
}

export async function cancelMR(actor: Actor, id: string, reason: string) {
  if (!can(actor.role, "mr.create")) throw new ForbiddenError();
  if (!reason?.trim()) throw new AppError("Ləğv səbəbi məcburidir.", "VALIDATION");
  return withTx(async (tx) => {
    const mr = await tx.materialRequest.findUnique({ where: { id }, include: { orders: { where: { status: { not: "CANCELLED" } } } } });
    if (!mr) throw new NotFoundError("MR");
    if (mr.orders.length) throw new AppError("Bu MR üzrə aktiv satınalma sifarişi var. Əvvəlcə PO-nu ləğv edin.");
    if (["CANCELLED", "CLOSED", "DELIVERED"].includes(mr.status)) throw new AppError("Bu statusda MR ləğv edilə bilməz.");
    await tx.materialRequest.update({ where: { id }, data: { status: "CANCELLED", version: { increment: 1 } } });
    await statusChange(tx, actor, "MaterialRequest", id, mr.status, "CANCELLED", reason);
    await audit(tx, actor, "CANCEL", "MaterialRequest", id, `${mr.mrNumber} ləğv edildi: ${reason}`);
  });
}

async function refreshMrStatus(tx: Tx, actor: Actor, mrId: string) {
  const mr = await tx.materialRequest.findUnique({ where: { id: mrId }, include: { lines: true } });
  if (!mr || ["CANCELLED", "CLOSED", "REJECTED", "DRAFT", "RETURNED", "UNDER_REVIEW", "SUBMITTED"].includes(mr.status)) return;
  const poLines = await tx.pOLine.findMany({ where: { mrLineId: { in: mr.lines.map((l) => l.id) }, po: { status: { notIn: ["CANCELLED", "DRAFT"] } } } });
  const ordered = new Map<string, Prisma.Decimal>();
  const received = new Map<string, Prisma.Decimal>();
  for (const p of poLines) {
    ordered.set(p.mrLineId!, (ordered.get(p.mrLineId!) ?? D(0)).plus(p.qtyOrdered));
    received.set(p.mrLineId!, (received.get(p.mrLineId!) ?? D(0)).plus(p.qtyReceived));
  }
  const toOrder = mr.lines.filter((l) => D(l.netQtyToOrder).gt(0));
  let status: MRStatus = "APPROVED";
  if (toOrder.length) {
    const allOrdered = toOrder.every((l) => (ordered.get(l.id) ?? D(0)).gte(l.netQtyToOrder));
    const anyOrdered = toOrder.some((l) => (ordered.get(l.id) ?? D(0)).gt(0));
    const allRecv = toOrder.every((l) => (received.get(l.id) ?? D(0)).gte(l.netQtyToOrder));
    const anyRecv = toOrder.some((l) => (received.get(l.id) ?? D(0)).gt(0));
    status = allRecv ? "DELIVERED" : anyRecv ? "PARTIALLY_DELIVERED" : allOrdered ? "FULLY_ORDERED" : anyOrdered ? "PARTIALLY_ORDERED" : "APPROVED";
  }
  if (status !== mr.status) {
    await tx.materialRequest.update({ where: { id: mrId }, data: { status, version: { increment: 1 } } });
    await statusChange(tx, actor, "MaterialRequest", mrId, mr.status, status, "Avtomatik (PO/GRN)");
  }
}

// ───────────────────────── Purchase Order ─────────────────────────

export const poSchema = z.object({
  supplierId: z.string().uuid("Tədarükçü seçilməyib."),
  mrId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  orderDate: z.coerce.date({ errorMap: () => ({ message: "Sifariş tarixi düzgün deyil." }) }),
  expectedDate: z.coerce.date().optional().nullable(),
  currency: z.string().length(3).default("AZN"),
  notes: optStr(2000),
  overrideReason: optStr(1000),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid("PO sətri kataloq variantına bağlanmalıdır."),
        mrLineId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
        qtyOrdered: z.coerce.number().positive("Sifariş miqdarı 0-dan böyük olmalıdır."),
        unitPrice: z.coerce.number().min(0).optional().nullable(),
        notes: optStr(500),
      }),
    )
    .min(1, "Ən azı bir sətir əlavə edin."),
});
export type POInput = z.infer<typeof poSchema>;

const MR_ORDERABLE: MRStatus[] = ["APPROVED", "IN_SOURCING", "PARTIALLY_ORDERED", "PARTIALLY_DELIVERED"];

async function validatePO(tx: Tx, actor: Actor, d: POInput, excludePoId?: string) {
  const sup = await tx.supplier.findUnique({ where: { id: d.supplierId } });
  if (!sup || !sup.isActive) throw new AppError("Tədarükçü tapılmadı və ya deaktivdir.", "VALIDATION");
  if (d.expectedDate && d.expectedDate < d.orderDate) throw new AppError("Gözlənilən tarix sifariş tarixindən əvvəl ola bilməz.", "VALIDATION");
  const ids = d.lines.map((l) => l.variantId);
  await assertVariantsUsable(tx, ids);
  const units = await unitRulesFor(tx, ids);
  for (const l of d.lines) {
    const e = validateQty(l.qtyOrdered, units.get(l.variantId) ?? false);
    if (e) throw new AppError(e, "VALIDATION");
  }
  if (d.mrId) {
    const mr = await tx.materialRequest.findUnique({ where: { id: d.mrId }, include: { lines: true } });
    if (!mr) throw new NotFoundError("MR");
    if (!MR_ORDERABLE.includes(mr.status)) {
      if (!can(actor.role, "po.override") || !d.overrideReason)
        throw new AppError("Təsdiqlənməmiş MR əsasında PO yaradıla bilməz.", "MR_NOT_APPROVED");
    }
    const mrLineIds = new Set(mr.lines.map((l) => l.id));
    for (const l of d.lines) {
      if (l.mrLineId && !mrLineIds.has(l.mrLineId)) throw new AppError("PO sətri başqa MR-in sətrinə bağlanıb.", "VALIDATION");
    }
    // Do not order more than the MR's net quantity (other non-cancelled POs included)
    for (const ml of mr.lines) {
      const thisPo = d.lines.filter((l) => l.mrLineId === ml.id).reduce((a, l) => a.plus(l.qtyOrdered), D(0));
      if (thisPo.isZero()) continue;
      const other = await tx.pOLine.aggregate({
        where: { mrLineId: ml.id, po: { status: { not: "CANCELLED" }, ...(excludePoId ? { id: { not: excludePoId } } : {}) } },
        _sum: { qtyOrdered: true },
      });
      const total = thisPo.plus(other._sum.qtyOrdered ?? 0);
      if (total.gt(ml.netQtyToOrder) && !(can(actor.role, "po.override") && d.overrideReason))
        throw new AppError(`MR sətri ${ml.lineNo}: sifariş (${total}) MR-dəki xalis miqdardan (${ml.netQtyToOrder}) çoxdur.`, "OVER_ORDER");
    }
  } else if (!can(actor.role, "po.override") || !d.overrideReason) {
    throw new AppError("PO təsdiqlənmiş MR əsasında yaradılmalıdır. İstisna yalnız xüsusi səlahiyyət və səbəb ilə mümkündür.", "MR_REQUIRED");
  }
}

export async function createPO(actor: Actor, input: POInput) {
  if (!can(actor.role, "po.manage")) throw new ForbiddenError();
  const d = poSchema.parse(input);
  return withTx(async (tx) => {
    await validatePO(tx, actor, d);
    const poNumber = await nextNumber(tx, "PO", d.orderDate);
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: d.supplierId,
        mrId: d.mrId || null,
        orderDate: d.orderDate,
        expectedDate: d.expectedDate ?? null,
        currency: d.currency,
        notes: d.notes,
        overrideReason: d.overrideReason,
        createdById: actor.id,
        lines: {
          create: d.lines.map((l, i) => ({
            lineNo: i + 1,
            variantId: l.variantId,
            mrLineId: l.mrLineId || null,
            qtyOrdered: D(l.qtyOrdered),
            unitPrice: l.unitPrice == null ? null : D(l.unitPrice),
            notes: l.notes,
          })),
        },
      },
    });
    await statusChange(tx, actor, "PurchaseOrder", po.id, null, "DRAFT");
    await audit(tx, actor, "CREATE", "PurchaseOrder", po.id, `${poNumber} yaradıldı${d.overrideReason ? ` (OVERRIDE: ${d.overrideReason})` : ""}`);
    return po;
  });
}

export async function updatePO(actor: Actor, id: string, version: number, input: POInput) {
  if (!can(actor.role, "po.manage")) throw new ForbiddenError();
  const d = poSchema.parse(input);
  return withTx(async (tx) => {
    await validatePO(tx, actor, d, id);
    const r = await tx.purchaseOrder.updateMany({
      where: { id, version, status: "DRAFT" },
      data: { supplierId: d.supplierId, mrId: d.mrId || null, orderDate: d.orderDate, expectedDate: d.expectedDate ?? null, currency: d.currency, notes: d.notes, overrideReason: d.overrideReason, version: { increment: 1 } },
    });
    if (r.count === 0) throw new ConflictError("PO yalnız qaralama statusunda dəyişdirilə bilər (və ya başqası dəyişib).");
    await tx.pOLine.deleteMany({ where: { poId: id } });
    await tx.pOLine.createMany({
      data: d.lines.map((l, i) => ({ poId: id, lineNo: i + 1, variantId: l.variantId, mrLineId: l.mrLineId || null, qtyOrdered: D(l.qtyOrdered), unitPrice: l.unitPrice == null ? null : D(l.unitPrice), notes: l.notes })),
    });
    await audit(tx, actor, "UPDATE", "PurchaseOrder", id, "PO qaralaması yeniləndi");
  });
}

export async function setPOStatus(actor: Actor, id: string, to: "SUBMITTED" | "APPROVED" | "CANCELLED", reason?: string) {
  const perm = to === "APPROVED" ? "po.approve" : "po.manage";
  if (!can(actor.role, perm)) throw new ForbiddenError();
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("PO");
    const from = lock[0].status;
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (to === "SUBMITTED" && from !== "DRAFT") throw new AppError("Yalnız qaralama PO göndərilə bilər.");
    if (to === "APPROVED") {
      if (from === "APPROVED") return { status: from };
      if (from !== "DRAFT" && from !== "SUBMITTED") throw new AppError("Bu statusda PO təsdiqlənə bilməz.");
      // Re-validate against MR at approval time
      await validatePO(tx, actor, {
        supplierId: po.supplierId,
        mrId: po.mrId,
        orderDate: po.orderDate,
        expectedDate: po.expectedDate,
        currency: po.currency,
        notes: po.notes,
        overrideReason: po.overrideReason,
        lines: po.lines.map((l) => ({ variantId: l.variantId, mrLineId: l.mrLineId, qtyOrdered: Number(l.qtyOrdered), unitPrice: l.unitPrice == null ? null : Number(l.unitPrice), notes: l.notes })),
      }, id);
    }
    if (to === "CANCELLED") {
      if (!reason?.trim()) throw new AppError("Ləğv səbəbi məcburidir.", "VALIDATION");
      if (from === "CANCELLED") return { status: from };
      const posted = await tx.goodsReceipt.count({ where: { poId: id, status: "POSTED" } });
      if (posted > 0) throw new AppError("Bu PO üzrə təsdiqlənmiş mal qəbulu var. Əvvəlcə GRN-i ləğv edin.");
      await tx.goodsReceipt.updateMany({ where: { poId: id, status: "DRAFT" }, data: { status: "CANCELLED" } });
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: to, version: { increment: 1 }, ...(to === "APPROVED" ? { approvedById: actor.id, approvedAt: new Date() } : {}), ...(to === "CANCELLED" ? { cancelReason: reason } : {}) },
    });
    await statusChange(tx, actor, "PurchaseOrder", id, from, to, reason);
    await audit(tx, actor, `PO_${to}`, "PurchaseOrder", id, `${po.poNumber}: ${from} → ${to}${reason ? ` (${reason})` : ""}`);
    if (po.mrId) await refreshMrStatus(tx, actor, po.mrId);
    return { status: to };
  });
}

// ───────────────────────── Goods Receipt (GRN) ─────────────────────────

export const grnSchema = z.object({
  poId: z.string().uuid("PO seçilməyib."),
  warehouseId: z.string().uuid("Qəbul anbarı seçilməyib."),
  receivedDate: z.coerce.date({ errorMap: () => ({ message: "Qəbul tarixi düzgün deyil." }) }),
  receiverName: z.string().trim().min(2, "Qəbul edən şəxs göstərilməlidir.").max(200),
  deliveryNoteNo: optStr(100),
  notes: optStr(2000),
  lines: z
    .array(
      z.object({
        poLineId: z.string().uuid(),
        qtyReceived: z.coerce.number().min(0, "Miqdar mənfi ola bilməz."),
        qtyRejected: z.coerce.number().min(0).default(0),
        qualityStatus: z.enum(["ACCEPTED", "ACCEPTED_WITH_NCR", "REJECTED"]).default("ACCEPTED"),
        note: optStr(500),
      }),
    )
    .min(1),
});
export type GRNInput = z.infer<typeof grnSchema>;

async function validateGrnLines(tx: Tx, d: GRNInput) {
  const lines = d.lines.filter((l) => l.qtyReceived > 0);
  if (lines.length === 0) throw new AppError("Ən azı bir sətirdə qəbul edilən miqdar 0-dan böyük olmalıdır.", "VALIDATION");
  const po = await tx.purchaseOrder.findUnique({ where: { id: d.poId }, include: { lines: true } });
  if (!po) throw new NotFoundError("PO");
  if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED") throw new AppError("Mal qəbulu yalnız təsdiqlənmiş və tam qəbul edilməmiş PO üzrə mümkündür.", "PO_NOT_RECEIVABLE");
  if (d.receivedDate > new Date(Date.now() + 2 * 86400_000)) throw new AppError("Qəbul tarixi gələcəkdə ola bilməz.", "VALIDATION");
  await assertWarehouse(tx, d.warehouseId, { allowQuarantine: true });
  const poLines = new Map(po.lines.map((l) => [l.id, l]));
  const units = await unitRulesFor(tx, po.lines.map((l) => l.variantId));
  const seen = new Set<string>();
  const out = lines.map((l) => {
    const pl = poLines.get(l.poLineId);
    if (!pl) throw new AppError("GRN sətri bu PO-ya aid deyil.", "VALIDATION");
    if (seen.has(l.poLineId)) throw new AppError("Eyni PO sətri GRN-də iki dəfə göstərilib.", "VALIDATION");
    seen.add(l.poLineId);
    const e = validateQty(l.qtyReceived, units.get(pl.variantId) ?? false);
    if (e) throw new AppError(`PO sətri ${pl.lineNo}: ${e}`, "VALIDATION");
    const rejected = l.qualityStatus === "REJECTED" ? l.qtyReceived : l.qtyRejected;
    if (rejected > l.qtyReceived) throw new AppError(`PO sətri ${pl.lineNo}: rədd edilən miqdar qəbul ediləndən çox ola bilməz.`, "VALIDATION");
    return { ...l, qtyRejected: rejected, variantId: pl.variantId };
  });
  return { po, lines: out };
}

export async function createGRN(actor: Actor, input: GRNInput) {
  if (!can(actor.role, "grn.edit")) throw new ForbiddenError();
  const d = grnSchema.parse(input);
  return withTx(async (tx) => {
    const { po, lines } = await validateGrnLines(tx, d);
    const grnNumber = await nextNumber(tx, "GRN", d.receivedDate);
    const grn = await tx.goodsReceipt.create({
      data: {
        grnNumber,
        poId: po.id,
        warehouseId: d.warehouseId,
        receivedDate: d.receivedDate,
        receiverName: d.receiverName,
        deliveryNoteNo: d.deliveryNoteNo,
        notes: d.notes,
        createdById: actor.id,
        lines: { create: lines.map((l) => ({ poLineId: l.poLineId, variantId: l.variantId, qtyReceived: D(l.qtyReceived), qtyRejected: D(l.qtyRejected), qualityStatus: l.qualityStatus, note: l.note })) },
      },
    });
    await statusChange(tx, actor, "GoodsReceipt", grn.id, null, "DRAFT");
    await audit(tx, actor, "CREATE", "GoodsReceipt", grn.id, `${grnNumber} (${po.poNumber}) qaralama yaradıldı`);
    return grn;
  });
}

/** Warnings shown before posting (over / short delivery). Posting itself blocks over-receipt beyond tolerance. */
export async function grnWarnings(grnId: string) {
  const grn = await db.goodsReceipt.findUnique({ where: { id: grnId }, include: { lines: true, po: { include: { lines: true } } } });
  if (!grn) return [];
  const settings = await getSettings();
  const w: string[] = [];
  for (const l of grn.lines) {
    const pl = grn.po.lines.find((p) => p.id === l.poLineId);
    if (!pl) continue;
    const accepted = D(l.qtyReceived).minus(l.qtyRejected);
    const after = D(pl.qtyReceived).plus(accepted);
    const limit = D(pl.qtyOrdered).times(1 + settings.overReceiptTolerancePct / 100);
    if (after.gt(limit)) w.push(`PO sətri ${pl.lineNo}: artıq mal — sifariş ${pl.qtyOrdered}, əvvəl qəbul ${pl.qtyReceived}, indi ${accepted}. Təsdiq bloklanacaq.`);
    else if (after.lt(pl.qtyOrdered)) w.push(`PO sətri ${pl.lineNo}: çatışmayan mal — qəbuldan sonra ${D(pl.qtyOrdered).minus(after)} qalacaq (qismən qəbul).`);
    if (D(l.qtyRejected).gt(0)) w.push(`PO sətri ${pl.lineNo}: ${l.qtyRejected} ədəd rədd edilib, anbara daxil olmayacaq.`);
  }
  return w;
}

/**
 * GRN POSTED → RECEIPT ledger entries for accepted quantity, PO line received projection, PO & MR status.
 * Idempotent: posting the same GRN twice (double click, retry, two tabs) writes nothing the second time.
 */
export async function postGRN(actor: Actor, id: string) {
  if (!can(actor.role, "grn.post")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string; poId: string }[]>`SELECT status, "poId"::text AS "poId" FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("GRN");
    if (lock[0].status === "POSTED") return { alreadyPosted: true };
    if (lock[0].status !== "DRAFT") throw new AppError("Yalnız qaralama GRN təsdiqlənə bilər.");
    // Lock PO header + lines: two different GRNs for the same PO serialise here
    const poLock = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM purchase_orders WHERE id = ${lock[0].poId}::uuid FOR UPDATE`;
    if (poLock[0].status !== "APPROVED" && poLock[0].status !== "PARTIALLY_RECEIVED") throw new AppError("PO artıq qəbul üçün açıq deyil (tam qəbul edilib və ya ləğv olunub).", "PO_NOT_RECEIVABLE");
    await tx.$queryRaw`SELECT id FROM po_lines WHERE "poId" = ${lock[0].poId}::uuid ORDER BY id FOR UPDATE`;

    const grn = await tx.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { lines: true, po: { include: { lines: true } } } });
    const settings = await getSettings(tx);
    const movements: LedgerMovement[] = [];
    for (const l of grn.lines) {
      const pl = grn.po.lines.find((p) => p.id === l.poLineId)!;
      const accepted = D(l.qtyReceived).minus(l.qtyRejected);
      const after = D(pl.qtyReceived).plus(accepted);
      const limit = D(pl.qtyOrdered).times(1 + settings.overReceiptTolerancePct / 100);
      if (after.gt(limit)) {
        throw new AppError(
          `PO sətri ${pl.lineNo}: artıq qəbul bloklandı. Sifariş ${pl.qtyOrdered}, artıq qəbul edilib ${pl.qtyReceived}, bu GRN ${accepted}. Qalıq dəyişmədi.`,
          "OVER_RECEIPT",
        );
      }
      if (accepted.gt(0)) {
        movements.push({ entryType: "RECEIPT", warehouseId: grn.warehouseId, variantId: l.variantId, qty: accepted, docLineId: l.id, idempotencyKey: `GRN:${grn.id}:${l.id}` });
        await tx.pOLine.update({ where: { id: pl.id }, data: { qtyReceived: after } });
        pl.qtyReceived = after;
      }
    }
    await applyMovements(tx, { docType: "GOODS_RECEIPT", docId: grn.id, docNumber: grn.grnNumber, movementDate: grn.receivedDate, userId: actor.id, reason: `${grn.po.poNumber} qəbulu` }, movements);
    await tx.goodsReceipt.update({ where: { id }, data: { status: "POSTED", postedById: actor.id, postedAt: new Date(), version: { increment: 1 } } });
    await statusChange(tx, actor, "GoodsReceipt", id, "DRAFT", "POSTED");

    const rs = poReceiptStatus(grn.po.lines.map((l) => ({ ordered: D(l.qtyOrdered), received: D(l.qtyReceived) })));
    const newPoStatus = rs === "FULL" ? "RECEIVED" : rs === "PARTIAL" ? "PARTIALLY_RECEIVED" : poLock[0].status;
    if (newPoStatus !== poLock[0].status) {
      await tx.purchaseOrder.update({ where: { id: grn.poId }, data: { status: newPoStatus as "RECEIVED" | "PARTIALLY_RECEIVED", version: { increment: 1 } } });
      await statusChange(tx, actor, "PurchaseOrder", grn.poId, poLock[0].status, newPoStatus, grn.grnNumber);
    }
    await audit(tx, actor, "POST", "GoodsReceipt", id, `${grn.grnNumber} təsdiqləndi: ${movements.length} mədaxil, PO ${grn.po.poNumber} → ${newPoStatus}`);
    if (grn.po.mrId) await refreshMrStatus(tx, actor, grn.po.mrId);
    return { alreadyPosted: false, poStatus: newPoStatus };
  });
}

export async function cancelGRN(actor: Actor, id: string) {
  if (!can(actor.role, "grn.edit")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const r = await tx.goodsReceipt.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED", version: { increment: 1 } } });
    if (r.count === 0) throw new AppError("Yalnız qaralama GRN ləğv edilə bilər.");
    await statusChange(tx, actor, "GoodsReceipt", id, "DRAFT", "CANCELLED");
    await audit(tx, actor, "CANCEL", "GoodsReceipt", id, "GRN qaralaması ləğv edildi");
  });
}

export async function reverseGRN(actor: Actor, id: string, reason: string) {
  if (!can(actor.role, "document.reverse")) throw new ForbiddenError();
  if (!reason?.trim()) throw new AppError("Ləğv səbəbi məcburidir.", "VALIDATION");
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string; poId: string }[]>`SELECT status, "poId"::text AS "poId" FROM goods_receipts WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("GRN");
    if (lock[0].status !== "POSTED") throw new AppError("Yalnız təsdiqlənmiş GRN ləğv edilə bilər.");
    const poLock = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM purchase_orders WHERE id = ${lock[0].poId}::uuid FOR UPDATE`;
    const grn = await tx.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { lines: true, po: { include: { lines: true } } } });
    const ms = await reversalMovements(tx, "GOODS_RECEIPT", id);
    await applyMovements(tx, { docType: "GOODS_RECEIPT", docId: id, docNumber: `${grn.grnNumber}-R`, movementDate: new Date(), userId: actor.id, reason: `GRN ləğvi: ${reason}` }, ms);
    for (const l of grn.lines) {
      const accepted = D(l.qtyReceived).minus(l.qtyRejected);
      if (accepted.gt(0)) {
        const pl = grn.po.lines.find((p) => p.id === l.poLineId)!;
        pl.qtyReceived = D(pl.qtyReceived).minus(accepted);
        await tx.pOLine.update({ where: { id: pl.id }, data: { qtyReceived: pl.qtyReceived } });
      }
    }
    await tx.goodsReceipt.update({ where: { id }, data: { status: "REVERSED", version: { increment: 1 } } });
    await statusChange(tx, actor, "GoodsReceipt", id, "POSTED", "REVERSED", reason);
    const rs = poReceiptStatus(grn.po.lines.map((l) => ({ ordered: D(l.qtyOrdered), received: D(l.qtyReceived) })));
    const newPo = rs === "FULL" ? "RECEIVED" : rs === "PARTIAL" ? "PARTIALLY_RECEIVED" : "APPROVED";
    if (newPo !== poLock[0].status) {
      await tx.purchaseOrder.update({ where: { id: grn.poId }, data: { status: newPo, version: { increment: 1 } } });
      await statusChange(tx, actor, "PurchaseOrder", grn.poId, poLock[0].status, newPo, `${grn.grnNumber} ləğvi`);
    }
    await audit(tx, actor, "REVERSE", "GoodsReceipt", id, `${grn.grnNumber} ləğv edildi. Səbəb: ${reason}`);
    if (grn.po.mrId) await refreshMrStatus(tx, actor, grn.po.mrId);
  });
}

// ───────────────────────── Payment & shipment tracking ─────────────────────────

export async function setPOPayment(actor: Actor, id: string, input: { status: "PENDING" | "PAID" | "NOT_SET"; ref?: string | null }) {
  if (!can(actor.role, "po.payment")) throw new ForbiddenError();
  const status = z.enum(["PENDING", "PAID", "NOT_SET"]).parse(input.status);
  return withTx(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundError("PO");
    if (po.status === "CANCELLED" || po.status === "DRAFT") throw new AppError("Ödəniş statusu yalnız təsdiqlənmiş PO üçün qeyd edilir.");
    await tx.purchaseOrder.update({ where: { id }, data: { paymentStatus: status, paymentRef: input.ref?.trim() || po.paymentRef, paidAt: status === "PAID" ? new Date() : null, version: { increment: 1 } } });
    await statusChange(tx, actor, "PurchaseOrderPayment", id, po.paymentStatus, status, input.ref ?? undefined);
    await audit(tx, actor, "PO_PAYMENT", "PurchaseOrder", id, `${po.poNumber}: ödəniş ${po.paymentStatus} → ${status}${input.ref ? ` (${input.ref})` : ""}`);
    return { status };
  });
}

export async function setPOShipment(actor: Actor, id: string, input: { carrier?: string | null; trackingNo?: string | null; shippedAt?: Date | null }) {
  if (!can(actor.role, "po.payment")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundError("PO");
    if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED") throw new AppError("Göndərilmə yalnız təsdiqlənmiş və tam qəbul edilməmiş PO üçün qeyd edilir.");
    const shippedAt = input.shippedAt ?? new Date();
    await tx.purchaseOrder.update({ where: { id }, data: { shippedAt, carrier: input.carrier?.trim() || null, trackingNo: input.trackingNo?.trim() || null, version: { increment: 1 } } });
    await statusChange(tx, actor, "PurchaseOrderShipment", id, po.shippedAt ? "SHIPPED" : null, "SHIPPED", [input.carrier, input.trackingNo].filter(Boolean).join(" · ") || undefined);
    await audit(tx, actor, "PO_SHIPPED", "PurchaseOrder", id, `${po.poNumber}: yoldadır${input.carrier ? ` — ${input.carrier}` : ""}${input.trackingNo ? ` #${input.trackingNo}` : ""}`);
    return { ok: true };
  });
}

/** One-step goods receipt: create and post; on failure nothing stays behind. */
export async function createAndPostGRN(actor: Actor, input: GRNInput) {
  const grn = await createGRN(actor, input);
  if (!can(actor.role, "grn.post")) return { id: grn.id, grnNumber: grn.grnNumber, posted: false };
  try {
    await postGRN(actor, grn.id);
    return { id: grn.id, grnNumber: grn.grnNumber, posted: true };
  } catch (e) {
    await withTx(async (tx) => {
      await tx.gRNLine.deleteMany({ where: { grnId: grn.id } });
      await tx.goodsReceipt.deleteMany({ where: { id: grn.id, status: "DRAFT" } });
      await audit(tx, actor, "DISCARD", "GoodsReceipt", grn.id, `${grn.grnNumber} təsdiqlənmədi və silindi: ${(e as Error).message}`.slice(0, 900));
    });
    throw e;
  }
}
