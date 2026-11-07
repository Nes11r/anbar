"use server";
import { runAction } from "@/lib/action";
import { createPO, setPOStatus, updatePO, type POInput } from "@/server/services/procurement";

export async function createPOAction(input: POInput) {
  return runAction("po.manage", (a) => createPO(a, input).then((p) => ({ id: p.id, poNumber: p.poNumber })), { revalidate: ["/po", "/mr"], message: (r) => `PO yaradıldı: ${r.poNumber}` });
}
export async function updatePOAction(id: string, version: number, input: POInput) {
  return runAction("po.manage", (a) => updatePO(a, id, version, input).then(() => ({ id })), { revalidate: ["/po"], message: "PO yeniləndi" });
}
export async function setPOStatusAction(id: string, to: "SUBMITTED" | "APPROVED" | "CANCELLED", reason?: string) {
  return runAction(to === "APPROVED" ? "po.approve" : "po.manage", (a) => setPOStatus(a, id, to, reason), { revalidate: ["/po", "/mr", "/"], message: (r) => `PO statusu: ${r.status}` });
}
