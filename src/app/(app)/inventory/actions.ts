"use server";
import { runAction } from "@/lib/action";
import { approveCount, cancelCount, createCount, updateCount, type CountInput } from "@/server/services/inventory";

export async function createCountAction(input: CountInput) {
  return runAction("inventory.edit", (a) => createCount(a, input).then((c) => ({ id: c.id, number: c.number })), { revalidate: ["/inventory"], message: (r) => `Sayım qaralaması yaradıldı: ${r.number}` });
}
export async function updateCountAction(id: string, version: number, input: CountInput) {
  return runAction("inventory.edit", (a) => updateCount(a, id, version, input).then(() => ({ id })), { revalidate: ["/inventory"], message: "Sayım yeniləndi" });
}
export async function approveCountAction(id: string) {
  return runAction("inventory.approve", (a) => approveCount(a, id), {
    revalidate: ["/inventory", "/stock", "/"],
    message: (r) => (r.alreadyPosted ? "Sənəd artıq təsdiqlənib — heç nə dəyişmədi." : `Təsdiqləndi: ${r.entries} jurnal qeydi yazıldı.`),
  });
}
export async function cancelCountAction(id: string) {
  return runAction("inventory.edit", (a) => cancelCount(a, id), { revalidate: ["/inventory"], message: "Qaralama ləğv edildi" });
}
