"use server";
import { runAction } from "@/lib/action";
import { cancelMR, createMR, decideMR, reviseMR, submitMR, updateMR, type MRInput } from "@/server/services/procurement";

export async function createMRAction(input: MRInput) {
  return runAction("mr.create", (a) => createMR(a, input).then((m) => ({ id: m.id, mrNumber: m.mrNumber })), { revalidate: ["/mr"], message: (r) => `MR yaradıldı: ${r.mrNumber}` });
}
export async function updateMRAction(id: string, version: number, input: MRInput) {
  return runAction("mr.create", (a) => updateMR(a, id, version, input).then(() => ({ id })), { revalidate: ["/mr"], message: "MR yeniləndi" });
}
export async function submitMRAction(id: string) {
  return runAction("mr.create", (a) => submitMR(a, id), { revalidate: ["/mr"], message: "MR təsdiqə göndərildi" });
}
export async function decideMRAction(id: string, step: number, decision: "APPROVED" | "REJECTED" | "REVISE", comment?: string) {
  return runAction(null, (a) => decideMR(a, id, step, decision, comment), { revalidate: ["/mr"], message: (r) => `Qərar qeyd edildi. MR statusu: ${r.status}` });
}
export async function reviseMRAction(id: string, reason?: string) {
  return runAction("mr.create", (a) => reviseMR(a, id, reason ?? "").then((m) => ({ id: m.id, revision: m.revision, redirect: `/mr/${m.id}` })), { revalidate: ["/mr"], message: (r) => `Rev.${r.revision} yaradıldı` });
}
export async function cancelMRAction(id: string, reason?: string) {
  return runAction("mr.create", (a) => cancelMR(a, id, reason ?? ""), { revalidate: ["/mr"], message: "MR ləğv edildi" });
}
