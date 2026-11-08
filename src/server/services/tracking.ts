import { db } from "@/lib/db";

/**
 * Order tracking — like a parcel tracker: one line of stages from request to "in the warehouse".
 * Built from MR, its approvals, POs (approval, payment, shipment) and posted GRNs. Read-only.
 */
export type StageState = "done" | "current" | "todo" | "skipped" | "problem";
export interface Stage {
  key: string;
  label: string;
  state: StageState;
  date?: Date | null;
  detail?: string;
}

const done = (b: boolean): StageState => (b ? "done" : "todo");

function finalize(stages: Stage[]): Stage[] {
  // the first not-done (and not skipped) stage after the last done one becomes "current"
  let lastDone = -1;
  stages.forEach((s, i) => { if (s.state === "done") lastDone = i; });
  const next = stages.findIndex((s, i) => i > lastDone && s.state === "todo");
  if (next >= 0) stages[next].state = "current";
  return stages;
}

export async function mrTimeline(mrId: string): Promise<Stage[]> {
  const mr = await db.materialRequest.findUnique({
    where: { id: mrId },
    include: { approvals: { orderBy: { step: "asc" } }, orders: { include: { lines: true, receipts: { where: { status: "POSTED" }, orderBy: { postedAt: "asc" } } } } },
  });
  if (!mr) return [];
  const pos = mr.orders.filter((p) => p.status !== "CANCELLED");
  const approvedPos = pos.filter((p) => ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(p.status));
  const decided = mr.approvals.filter((a) => a.decision === "APPROVED" || a.decision === "SKIPPED").length;
  const required = mr.approvals.length;
  const rejected = mr.status === "REJECTED" || mr.status === "CANCELLED";
  const returned = mr.status === "RETURNED";
  const paid = approvedPos.length > 0 && approvedPos.every((p) => p.paymentStatus === "PAID");
  const paymentPending = approvedPos.some((p) => p.paymentStatus === "PENDING");
  const shipped = approvedPos.some((p) => p.shippedAt) || approvedPos.some((p) => p.receipts.length);
  const received = approvedPos.some((p) => p.receipts.length);
  const fully = approvedPos.length > 0 && approvedPos.every((p) => p.status === "RECEIVED");
  const firstPo = approvedPos[0];

  const stages: Stage[] = [
    { key: "created", label: "Tələb yaradıldı", state: "done", date: mr.createdAt, detail: mr.requesterName },
    { key: "submitted", label: "Təsdiqə göndərildi", state: done(!!mr.submittedAt), date: mr.submittedAt },
    {
      key: "approved",
      label: rejected ? (mr.status === "CANCELLED" ? "Ləğv edildi" : "Rədd edildi") : returned ? "Düzəlişə qaytarıldı" : "Təsdiqləndi",
      state: rejected || returned ? "problem" : done(!!mr.approvedAt),
      date: mr.approvedAt,
      detail: required ? `${decided}/${required} mərhələ` : undefined,
    },
    { key: "ordered", label: "Sifariş verildi (PO)", state: done(approvedPos.length > 0), date: firstPo?.approvedAt, detail: approvedPos.map((p) => p.poNumber).join(", ") || undefined },
    {
      key: "payment",
      label: paid ? "Ödənildi" : paymentPending ? "Ödəniş gözləyir" : "Ödəniş",
      state: paid ? "done" : paymentPending ? "current" : approvedPos.length && approvedPos.every((p) => p.paymentStatus === "NOT_SET") && received ? "skipped" : "todo",
      date: firstPo?.paidAt,
    },
    { key: "shipped", label: "Yoldadır", state: done(shipped), date: firstPo?.shippedAt, detail: [firstPo?.carrier, firstPo?.trackingNo].filter(Boolean).join(" · ") || undefined },
    { key: "received", label: fully ? "Anbarda (tam)" : received ? "Anbarda (qismən)" : "Anbara daxil oldu", state: fully ? "done" : received ? "current" : "todo", date: approvedPos.flatMap((p) => p.receipts).at(-1)?.postedAt },
  ];
  if (rejected) return stages.map((s, i) => (i > 2 ? { ...s, state: "skipped" as const } : s));
  return finalize(stages.map((s) => (s.state === "current" && s.key !== "payment" && s.key !== "received" ? { ...s, state: "todo" as const } : s)));
}

export async function poTimeline(poId: string): Promise<Stage[]> {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { mr: true, receipts: { where: { status: "POSTED" }, orderBy: { postedAt: "asc" } } } });
  if (!po) return [];
  if (po.status === "CANCELLED") return [{ key: "cancelled", label: "Ləğv edildi", state: "problem", detail: po.cancelReason ?? undefined }];
  const approved = ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status);
  const received = po.receipts.length > 0;
  return finalize([
    { key: "mr", label: po.mr ? `MR təsdiqlənib (${po.mr.mrNumber})` : "MR-siz (istisna)", state: "done", date: po.mr?.approvedAt },
    { key: "created", label: "PO hazırlandı", state: "done", date: po.createdAt },
    { key: "approved", label: "PO təsdiqləndi", state: done(approved), date: po.approvedAt },
    { key: "payment", label: po.paymentStatus === "PAID" ? "Ödənildi" : po.paymentStatus === "PENDING" ? "Ödəniş gözləyir" : "Ödəniş", state: po.paymentStatus === "PAID" ? "done" : po.paymentStatus === "PENDING" ? "current" : received ? "skipped" : "todo", date: po.paidAt, detail: po.paymentRef ?? undefined },
    { key: "shipped", label: "Yoldadır", state: done(!!po.shippedAt || received), date: po.shippedAt, detail: [po.carrier, po.trackingNo].filter(Boolean).join(" · ") || undefined },
    { key: "received", label: po.status === "RECEIVED" ? "Anbarda (tam)" : received ? "Anbarda (qismən)" : "Anbara daxil oldu", state: po.status === "RECEIVED" ? "done" : received ? "current" : "todo", date: po.receipts.at(-1)?.postedAt },
  ]);
}

/** Short label of the current stage for list views. */
export function currentStageLabel(stages: Stage[]): { label: string; state: StageState; progress: number } {
  const problem = stages.find((s) => s.state === "problem");
  const doneCount = stages.filter((s) => s.state === "done" || s.state === "skipped").length;
  const cur = problem ?? stages.find((s) => s.state === "current") ?? [...stages].reverse().find((s) => s.state === "done") ?? stages[0];
  return { label: cur?.label ?? "—", state: cur?.state ?? "todo", progress: stages.length ? Math.round((doneCount / stages.length) * 100) : 0 };
}

type ListPO = { status: string; paymentStatus: string; shippedAt: Date | null };

/** Stage for list rows, computed from already-loaded fields (no extra queries per row). */
export function mrListStage(mr: { status: string; orders: ListPO[] }, pendingStep?: string | null): { label: string; state: StageState; progress: number } {
  const pos = mr.orders.filter((p) => ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(p.status));
  switch (mr.status) {
    case "DRAFT": return { label: "Qaralama", state: "todo", progress: 8 };
    case "SUBMITTED":
    case "UNDER_REVIEW": return { label: pendingStep ? `Təsdiqdə: ${pendingStep}` : "Təsdiqdə", state: "current", progress: 28 };
    case "RETURNED": return { label: "Düzəlişə qaytarılıb", state: "problem", progress: 20 };
    case "REJECTED": return { label: "Rədd edilib", state: "problem", progress: 100 };
    case "CANCELLED": return { label: "Ləğv edilib", state: "problem", progress: 100 };
    case "DELIVERED":
    case "CLOSED": return { label: "Anbarda (tam)", state: "done", progress: 100 };
    case "PARTIALLY_DELIVERED": return { label: "Anbarda (qismən)", state: "current", progress: 90 };
  }
  if (!pos.length) return { label: "Təsdiqləndi — sifariş gözləyir", state: "current", progress: 45 };
  if (pos.some((p) => p.shippedAt)) return { label: "Yoldadır", state: "current", progress: 80 };
  if (pos.some((p) => p.paymentStatus === "PENDING")) return { label: "Ödəniş gözləyir", state: "current", progress: 62 };
  if (pos.every((p) => p.paymentStatus === "PAID")) return { label: "Ödənildi — göndərilmə gözlənilir", state: "current", progress: 70 };
  return { label: "Sifariş verildi", state: "current", progress: 58 };
}

export function poListStage(po: ListPO & { hasReceipt?: boolean }): { label: string; state: StageState; progress: number } {
  switch (po.status) {
    case "DRAFT": return { label: "Qaralama", state: "todo", progress: 10 };
    case "SUBMITTED": return { label: "Təsdiq gözləyir", state: "current", progress: 25 };
    case "CANCELLED": return { label: "Ləğv edilib", state: "problem", progress: 100 };
    case "RECEIVED": return { label: "Anbarda (tam)", state: "done", progress: 100 };
    case "PARTIALLY_RECEIVED": return { label: "Anbarda (qismən)", state: "current", progress: 90 };
  }
  if (po.shippedAt) return { label: "Yoldadır", state: "current", progress: 78 };
  if (po.paymentStatus === "PENDING") return { label: "Ödəniş gözləyir", state: "current", progress: 55 };
  if (po.paymentStatus === "PAID") return { label: "Ödənildi — göndərilmə gözlənilir", state: "current", progress: 66 };
  return { label: "Təsdiqləndi — tədarükçüdə", state: "current", progress: 45 };
}
