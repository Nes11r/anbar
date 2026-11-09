import { Prisma, type StockDocKind } from "@prisma/client";
import { z } from "zod";
import { db, withTx, type Tx } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { audit, statusChange, type Actor } from "../audit";
import { applyMovements, nextNumber, reversalMovements, type LedgerMovement } from "../stock/ledger";
import { D, groupCompatible, validateQty } from "../stock/rules";
import { assertVariantsUsable, assertWarehouse, unitRulesFor } from "./common";

export const KIND_PREFIX: Record<StockDocKind, string> = {
  ISSUE_PROJECT: "ISP",
  ISSUE_EMPLOYEE: "ISE",
  RETURN_FROM_PROJECT: "RTP",
  RETURN_FROM_EMPLOYEE: "RTE",
  RETURN_TO_SUPPLIER: "RTS",
  TRANSFER: "TRF",
  ADJUSTMENT: "ADJ",
};

const lineSchema = z.object({
  variantId: z.string().uuid("Material variantı seçilməyib."),
  qty: z.coerce.number({ invalid_type_error: "Miqdar rəqəm olmalıdır." }).positive("Miqdar 0-dan böyük olmalıdır."),
  direction: z.coerce.number().int().refine((v) => v === 1 || v === -1).optional(),
  condition: z.enum(["GOOD", "DEFECTIVE"]).optional().nullable(),
  targetWarehouseId: z.string().uuid().optional().nullable(),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const stockDocSchema = z.object({
  kind: z.enum(["ISSUE_PROJECT", "ISSUE_EMPLOYEE", "RETURN_FROM_PROJECT", "RETURN_FROM_EMPLOYEE", "RETURN_TO_SUPPLIER", "TRANSFER", "ADJUSTMENT"]),
  warehouseId: z.string().uuid("Anbar seçilməyib."),
  toWarehouseId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  recipientName: z.string().trim().max(200).optional().nullable(),
  purpose: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  externalRef: z.string().trim().max(100).optional().nullable(),
  docDate: z.coerce.date({ errorMap: () => ({ message: "Tarix düzgün deyil." }) }),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Ən azı bir sətir əlavə edin."),
});
export type StockDocInput = z.infer<typeof stockDocSchema>;

function maxFutureDate() {
  return new Date(Date.now() + 2 * 86400_000);
}

async function validateHeader(c: Tx | typeof db, d: StockDocInput) {
  if (d.docDate > maxFutureDate()) throw new AppError("Sənəd tarixi gələcəkdə ola bilməz.", "VALIDATION");
  if (d.docDate < new Date("2000-01-01")) throw new AppError("Sənəd tarixi düzgün deyil.", "VALIDATION");
  const isReturnIn = d.kind === "RETURN_FROM_PROJECT" || d.kind === "RETURN_FROM_EMPLOYEE";
  await assertWarehouse(c, d.warehouseId, { allowQuarantine: d.kind === "TRANSFER" || d.kind === "ADJUSTMENT" || isReturnIn || d.kind === "RETURN_TO_SUPPLIER" });

  switch (d.kind) {
    case "ISSUE_PROJECT":
    case "RETURN_FROM_PROJECT": {
      if (!d.projectId) throw new AppError("Layihə seçilməyib.", "VALIDATION", { projectId: "Layihə seçin" });
      const p = await c.project.findUnique({ where: { id: d.projectId } });
      if (!p) throw new NotFoundError("Layihə");
      if (d.kind === "ISSUE_PROJECT" && !p.isActive) throw new AppError("Deaktiv layihəyə material verilə bilməz.", "VALIDATION");
      if (d.kind === "ISSUE_PROJECT" && !d.recipientName) throw new AppError("Təhvil alan şəxs göstərilməlidir.", "VALIDATION", { recipientName: "Təhvil alanı yazın" });
      break;
    }
    case "ISSUE_EMPLOYEE":
    case "RETURN_FROM_EMPLOYEE": {
      if (!d.employeeId) throw new AppError("İşçi seçilməyib.", "VALIDATION", { employeeId: "İşçi seçin" });
      const e = await c.employee.findUnique({ where: { id: d.employeeId } });
      if (!e) throw new NotFoundError("İşçi");
      if (d.kind === "ISSUE_EMPLOYEE" && !e.isActive) throw new AppError("Deaktiv işçiyə material verilə bilməz.", "VALIDATION");
      break;
    }
    case "RETURN_TO_SUPPLIER":
      if (!d.supplierId) throw new AppError("Tədarükçü seçilməyib.", "VALIDATION");
      break;
    case "TRANSFER":
      if (!d.toWarehouseId) throw new AppError("Təyinat anbarı seçilməyib.", "VALIDATION");
      if (d.toWarehouseId === d.warehouseId) throw new AppError("Mənbə və təyinat anbarı eyni ola bilməz.", "VALIDATION");
      await assertWarehouse(c, d.toWarehouseId, { allowQuarantine: true });
      break;
    case "ADJUSTMENT":
      if (!d.reason || d.reason.length < 3) throw new AppError("Düzəlişin səbəbi məcburidir.", "VALIDATION", { reason: "Səbəb yazın" });
      break;
  }

  const ids = d.lines.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) throw new AppError("Eyni variant sənəddə iki dəfə göstərilib. Miqdarı bir sətirdə birləşdirin.", "VALIDATION");
  await assertVariantsUsable(c, ids);
  const units = await unitRulesFor(c, ids);
  for (const l of d.lines) {
    const err = validateQty(l.qty, units.get(l.variantId) ?? false);
    if (err) throw new AppError(err, "VALIDATION");
    if (l.targetWarehouseId) await assertWarehouse(c, l.targetWarehouseId, { allowQuarantine: true });
  }
}

/**
 * Users limited to one project (site storekeeper / project manager) may only work with their own
 * site warehouse, their own project and their own project's employees.
 */
async function assertDocScope(c: Tx | typeof db, actor: Actor, d: StockDocInput) {
  if (!actor.projectId) return;
  const site = await c.warehouse.findUnique({ where: { projectId: actor.projectId } });
  const msg = "Bu əməliyyat sizin layihənizin sahə anbarı ilə məhdudlaşır.";
  if (!site || d.warehouseId !== site.id) throw new ForbiddenError(msg);
  if (d.kind === "TRANSFER") throw new ForbiddenError("Anbarlararası köçürməni ofis anbarı edir. Sahə anbarından yalnız işçilərə təhvil və qaytarma qeyd olunur.");
  if (d.projectId && d.projectId !== actor.projectId) throw new ForbiddenError(msg);
  for (const l of d.lines) {
    if (l.targetWarehouseId && l.targetWarehouseId !== site.id) {
      const t = await c.warehouse.findUnique({ where: { id: l.targetWarehouseId } });
      if (t?.type !== "QUARANTINE") throw new ForbiddenError(msg);
    }
  }
  if (d.employeeId) {
    const e = await c.employee.findUnique({ where: { id: d.employeeId } });
    if (e?.projectId !== actor.projectId) throw new ForbiddenError("Bu işçi sizin layihənizə aid deyil.");
  }
}

/** Worker-group check for employee PPE issue. Returns list of mismatching SKUs lacking an override reason. */
async function checkGroupCompatibility(c: Tx | typeof db, actor: Actor, d: StockDocInput) {
  if (d.kind !== "ISSUE_EMPLOYEE" || !d.employeeId) return;
  const emp = await c.employee.findUniqueOrThrow({ where: { id: d.employeeId } });
  const vs = await c.materialVariant.findMany({
    where: { id: { in: d.lines.map((l) => l.variantId) } },
    select: { id: true, sku: true, material: { select: { workerGroup: true } } },
  });
  const byId = new Map(vs.map((v) => [v.id, v]));
  for (const l of d.lines) {
    const v = byId.get(l.variantId)!;
    if (!groupCompatible(v.material.workerGroup, emp.group)) {
      if (!l.overrideReason || l.overrideReason.length < 3) {
        throw new AppError(
          `${v.sku}: material ${v.material.workerGroup === "ENGINEER" ? "mühəndis" : "fəhlə"} üçündür, işçi isə ${emp.group === "ENGINEER" ? "mühəndisdir" : "fəhlədir"}. Davam etmək üçün səbəb yazın (səlahiyyətli şəxs).`,
          "GROUP_MISMATCH",
        );
      }
      if (!can(actor.role, "issue.override")) throw new ForbiddenError("Uyğunsuz təyinatla təhvil üçün səlahiyyətiniz yoxdur.");
    }
  }
}

export async function createStockDoc(actor: Actor, input: StockDocInput) {
  if (!can(actor.role, "stockdoc.edit")) throw new ForbiddenError();
  const d = stockDocSchema.parse(input);
  await validateHeader(db, d);
  await assertDocScope(db, actor, d);
  await checkGroupCompatibility(db, actor, d);
  return withTx(async (tx) => {
    const number = await nextNumber(tx, KIND_PREFIX[d.kind], d.docDate);
    const doc = await tx.stockDocument.create({
      data: {
        number,
        kind: d.kind,
        warehouseId: d.warehouseId,
        toWarehouseId: d.kind === "TRANSFER" ? d.toWarehouseId : null,
        projectId: d.projectId ?? null,
        employeeId: d.employeeId ?? null,
        supplierId: d.supplierId ?? null,
        recipientName: d.recipientName ?? null,
        purpose: d.purpose ?? null,
        reason: d.reason ?? null,
        externalRef: d.externalRef ?? null,
        docDate: d.docDate,
        notes: d.notes ?? null,
        createdById: actor.id,
        lines: {
          create: d.lines.map((l, i) => ({
            lineNo: i + 1,
            variantId: l.variantId,
            qty: D(l.qty),
            direction: d.kind === "ADJUSTMENT" ? (l.direction ?? -1) : -1,
            condition: l.condition ?? null,
            targetWarehouseId: l.targetWarehouseId ?? null,
            overrideReason: l.overrideReason || null,
            note: l.note ?? null,
          })),
        },
      },
    });
    await audit(tx, actor, "CREATE", "StockDocument", doc.id, `${number} (${d.kind}) qaralama yaradıldı`);
    await statusChange(tx, actor, "StockDocument", doc.id, null, "DRAFT");
    return doc;
  });
}

export async function updateStockDoc(actor: Actor, id: string, version: number, input: StockDocInput) {
  if (!can(actor.role, "stockdoc.edit")) throw new ForbiddenError();
  const d = stockDocSchema.parse(input);
  await validateHeader(db, d);
  await assertDocScope(db, actor, d);
  await checkGroupCompatibility(db, actor, d);
  return withTx(async (tx) => {
    const cur = await tx.stockDocument.findUnique({ where: { id } });
    if (!cur) throw new NotFoundError("Sənəd");
    if (cur.kind !== d.kind) throw new AppError("Sənəd növü dəyişdirilə bilməz.");
    const r = await tx.stockDocument.updateMany({
      where: { id, version, status: "DRAFT" },
      data: {
        warehouseId: d.warehouseId,
        toWarehouseId: d.kind === "TRANSFER" ? d.toWarehouseId : null,
        projectId: d.projectId ?? null,
        employeeId: d.employeeId ?? null,
        supplierId: d.supplierId ?? null,
        recipientName: d.recipientName ?? null,
        purpose: d.purpose ?? null,
        reason: d.reason ?? null,
        externalRef: d.externalRef ?? null,
        docDate: d.docDate,
        notes: d.notes ?? null,
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ConflictError();
    await tx.stockDocLine.deleteMany({ where: { docId: id } });
    await tx.stockDocLine.createMany({
      data: d.lines.map((l, i) => ({
        docId: id,
        lineNo: i + 1,
        variantId: l.variantId,
        qty: D(l.qty),
        direction: d.kind === "ADJUSTMENT" ? (l.direction ?? -1) : -1,
        condition: l.condition ?? null,
        targetWarehouseId: l.targetWarehouseId ?? null,
        overrideReason: l.overrideReason || null,
        note: l.note ?? null,
      })),
    });
    await audit(tx, actor, "UPDATE", "StockDocument", id, `${cur.number} qaralama yeniləndi`);
  });
}

/** Net quantity per variant currently held by a project / employee (issued − returned). */
export async function netHeld(c: Tx | typeof db, by: { projectId?: string; employeeId?: string }, variantIds?: string[]) {
  const where: Prisma.StockLedgerEntryWhereInput = {
    entryType: { in: ["ISSUE", "RETURN_IN"] },
    ...(by.projectId ? { projectId: by.projectId } : {}),
    ...(by.employeeId ? { employeeId: by.employeeId } : {}),
    ...(variantIds ? { variantId: { in: variantIds } } : {}),
  };
  const rows = await c.stockLedgerEntry.groupBy({ by: ["variantId", "entryType"], where, _sum: { qty: true } });
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const q = D(r._sum.qty ?? 0);
    m.set(r.variantId, (m.get(r.variantId) ?? D(0)).plus(r.entryType === "ISSUE" ? q : q.neg()));
  }
  return m;
}

export async function postStockDoc(actor: Actor, id: string) {
  if (!can(actor.role, "stockdoc.post")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string; kind: StockDocKind }[]>`SELECT status, kind FROM stock_documents WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("Sənəd");
    if (lock[0].status === "POSTED") return { alreadyPosted: true };
    if (lock[0].status !== "DRAFT") throw new AppError("Yalnız qaralama sənəd təsdiqlənə bilər.");
    if (lock[0].kind === "ADJUSTMENT" && !can(actor.role, "adjustment.post")) throw new ForbiddenError("Qalıq düzəlişini yalnız anbar müdiri təsdiqləyə bilər.");

    const doc = await tx.stockDocument.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
    const input: StockDocInput = {
      ...doc,
      lines: doc.lines.map((l) => ({ ...l, qty: Number(l.qty), direction: l.direction })),
    } as unknown as StockDocInput;
    await validateHeader(tx, input);
    await assertDocScope(tx, actor, input);
    await checkGroupCompatibility(tx, actor, input);

    // Serialise returns per project / employee so two parallel returns cannot exceed what was issued
    if (doc.kind === "RETURN_FROM_PROJECT" && doc.projectId) {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${doc.projectId}::uuid FOR UPDATE`;
      const held = await netHeld(tx, { projectId: doc.projectId }, doc.lines.map((l) => l.variantId));
      for (const l of doc.lines) {
        const h = held.get(l.variantId) ?? D(0);
        if (D(l.qty).gt(h)) throw new AppError(`Sətir ${l.lineNo}: layihədən qaytarılan miqdar (${l.qty}) layihəyə xalis verilən miqdardan (${h}) çoxdur.`, "RETURN_EXCEEDS");
      }
    }
    if (doc.kind === "RETURN_FROM_EMPLOYEE" && doc.employeeId) {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${doc.employeeId}::uuid FOR UPDATE`;
      const held = await netHeld(tx, { employeeId: doc.employeeId }, doc.lines.map((l) => l.variantId));
      for (const l of doc.lines) {
        const h = held.get(l.variantId) ?? D(0);
        if (D(l.qty).gt(h)) throw new AppError(`Sətir ${l.lineNo}: işçidən geri alınan miqdar (${l.qty}) ona xalis verilən miqdardan (${h}) çoxdur.`, "RETURN_EXCEEDS");
      }
    }

    let employeeProjectId: string | null = null;
    if ((doc.kind === "ISSUE_EMPLOYEE" || doc.kind === "RETURN_FROM_EMPLOYEE") && doc.employeeId && !doc.projectId) {
      employeeProjectId = (await tx.employee.findUnique({ where: { id: doc.employeeId }, select: { projectId: true } }))?.projectId ?? null;
    }
    const projectId = doc.projectId ?? employeeProjectId;

    const ms: LedgerMovement[] = [];
    for (const l of doc.lines) {
      const base = { variantId: l.variantId, qty: D(l.qty), docLineId: l.id };
      const key = `SD:${doc.id}:${l.id}`;
      switch (doc.kind) {
        case "ISSUE_PROJECT":
          ms.push({ ...base, entryType: "ISSUE", warehouseId: doc.warehouseId, projectId: doc.projectId, idempotencyKey: key });
          break;
        case "ISSUE_EMPLOYEE":
          ms.push({ ...base, entryType: "ISSUE", warehouseId: doc.warehouseId, employeeId: doc.employeeId, projectId, idempotencyKey: key });
          break;
        case "RETURN_FROM_PROJECT":
          ms.push({ ...base, entryType: "RETURN_IN", warehouseId: l.targetWarehouseId ?? doc.warehouseId, projectId: doc.projectId, idempotencyKey: key });
          break;
        case "RETURN_FROM_EMPLOYEE": {
          // keep the same project attribution as the original issues for correct project net figures
          ms.push({ ...base, entryType: "RETURN_IN", warehouseId: l.targetWarehouseId ?? doc.warehouseId, employeeId: doc.employeeId, projectId, idempotencyKey: key });
          break;
        }
        case "RETURN_TO_SUPPLIER":
          ms.push({ ...base, entryType: "RETURN_OUT", warehouseId: doc.warehouseId, idempotencyKey: key });
          break;
        case "TRANSFER":
          ms.push({ ...base, entryType: "TRANSFER_OUT", warehouseId: doc.warehouseId, idempotencyKey: `${key}:OUT` });
          ms.push({ ...base, entryType: "TRANSFER_IN", warehouseId: doc.toWarehouseId!, idempotencyKey: `${key}:IN` });
          break;
        case "ADJUSTMENT":
          ms.push({ ...base, entryType: l.direction > 0 ? "ADJUSTMENT_PLUS" : "ADJUSTMENT_MINUS", warehouseId: doc.warehouseId, idempotencyKey: key });
          break;
      }
    }
    await applyMovements(tx, { docType: "STOCK_DOCUMENT", docId: doc.id, docNumber: doc.number, movementDate: doc.docDate, userId: actor.id, reason: doc.reason ?? doc.purpose }, ms);
    await tx.stockDocument.update({ where: { id }, data: { status: "POSTED", postedById: actor.id, postedAt: new Date(), version: { increment: 1 }, ...(employeeProjectId ? { projectId: employeeProjectId } : {}) } });
    await statusChange(tx, actor, "StockDocument", id, "DRAFT", "POSTED");
    const overrides = doc.lines.filter((l) => l.overrideReason);
    await audit(tx, actor, "POST", "StockDocument", id, `${doc.number} təsdiqləndi (${ms.length} jurnal qeydi)${overrides.length ? `; təyinat override: ${overrides.map((o) => o.overrideReason).join("; ")}` : ""}`);
    return { alreadyPosted: false };
  });
}

export async function cancelStockDoc(actor: Actor, id: string) {
  if (!can(actor.role, "stockdoc.edit")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const r = await tx.stockDocument.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED", version: { increment: 1 } } });
    if (r.count === 0) throw new AppError("Yalnız qaralama sənəd ləğv edilə bilər.");
    await statusChange(tx, actor, "StockDocument", id, "DRAFT", "CANCELLED");
    await audit(tx, actor, "CANCEL", "StockDocument", id, "Qaralama ləğv edildi");
  });
}

/**
 * Reverse a POSTED document: creates a separate reversal document whose ledger entries cancel the original.
 * Fails (and changes nothing) if stock that came in has meanwhile been issued.
 */
export async function reverseStockDoc(actor: Actor, id: string, reason: string) {
  if (!can(actor.role, "document.reverse")) throw new ForbiddenError();
  if (!reason || reason.trim().length < 3) throw new AppError("Ləğv səbəbi məcburidir.", "VALIDATION");
  return withTx(async (tx) => {
    const lock = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM stock_documents WHERE id = ${id}::uuid FOR UPDATE`;
    if (!lock[0]) throw new NotFoundError("Sənəd");
    if (lock[0].status === "REVERSED") throw new AppError("Sənəd artıq ləğv edilib.", "ALREADY_REVERSED");
    if (lock[0].status !== "POSTED") throw new AppError("Yalnız təsdiqlənmiş sənəd ləğv edilə bilər.");
    const doc = await tx.stockDocument.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const ms = await reversalMovements(tx, "STOCK_DOCUMENT", id);
    const number = await nextNumber(tx, `${KIND_PREFIX[doc.kind]}R`);
    const rev = await tx.stockDocument.create({
      data: {
        number,
        kind: doc.kind,
        status: "POSTED",
        warehouseId: doc.warehouseId,
        toWarehouseId: doc.toWarehouseId,
        projectId: doc.projectId,
        employeeId: doc.employeeId,
        supplierId: doc.supplierId,
        reason: reason.trim(),
        docDate: new Date(),
        notes: `${doc.number} sənədinin ləğvi`,
        reversalOfId: doc.id,
        createdById: actor.id,
        postedById: actor.id,
        postedAt: new Date(),
      },
    });
    await applyMovements(tx, { docType: "STOCK_DOCUMENT", docId: rev.id, docNumber: number, movementDate: new Date(), userId: actor.id, reason: `Ləğv: ${reason.trim()}` }, ms);
    await tx.stockDocument.update({ where: { id }, data: { status: "REVERSED", version: { increment: 1 } } });
    await statusChange(tx, actor, "StockDocument", id, "POSTED", "REVERSED", reason);
    await audit(tx, actor, "REVERSE", "StockDocument", id, `${doc.number} ləğv edildi → ${number}. Səbəb: ${reason}`);
    return rev;
  });
}

/**
 * One-step "Təsdiqlə": create and post in one go. If posting fails (e.g. not enough stock) the draft
 * is discarded, so nothing half-done stays behind and the user simply corrects the form.
 * Users who may create but not post (e.g. adjustments by a storekeeper) get a draft for approval.
 */
export async function createAndPostStockDoc(actor: Actor, input: StockDocInput) {
  const postPerm = input.kind === "ADJUSTMENT" ? "adjustment.post" : "stockdoc.post";
  const doc = await createStockDoc(actor, input);
  if (!can(actor.role, postPerm)) return { id: doc.id, number: doc.number, posted: false };
  try {
    await postStockDoc(actor, doc.id);
    return { id: doc.id, number: doc.number, posted: true };
  } catch (e) {
    await withTx(async (tx) => {
      await tx.stockDocLine.deleteMany({ where: { docId: doc.id } });
      await tx.stockDocument.deleteMany({ where: { id: doc.id, status: "DRAFT" } });
      await audit(tx, actor, "DISCARD", "StockDocument", doc.id, `${doc.number} təsdiqlənmədi və silindi: ${(e as Error).message}`.slice(0, 900));
    });
    throw e;
  }
}

/** Where to go after a one-step post: the site page if a project site warehouse is involved. */
export async function siteRedirectFor(docId: string): Promise<string> {
  const d = await db.stockDocument.findUnique({ where: { id: docId } });
  if (!d) return "/movements";
  const ids = [d.toWarehouseId, d.warehouseId].filter((x): x is string => !!x);
  const site = await db.warehouse.findFirst({ where: { id: { in: ids }, projectId: { not: null } }, orderBy: { createdAt: "asc" } });
  const pick = d.toWarehouseId && site?.id === d.toWarehouseId ? site : site;
  return pick?.projectId ? `/sites/${pick.projectId}` : `/movements/${docId}`;
}
