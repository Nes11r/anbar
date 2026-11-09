"use server";
import { runAction } from "@/lib/action";
import { cancelStockDoc, createAndPostStockDoc, createStockDoc, postStockDoc, reverseStockDoc, siteRedirectFor, updateStockDoc, type StockDocInput } from "@/server/services/stockdocs";

const R = ["/movements", "/stock", "/projects", "/employees", "/"];

export async function createStockDocAction(input: StockDocInput) {
  return runAction("stockdoc.edit", (a) => createStockDoc(a, input).then((d) => ({ id: d.id, number: d.number })), { revalidate: ["/movements"], message: (r) => `Qaralama yaradıldı: ${r.number}` });
}
export async function createAndPostStockDocAction(input: StockDocInput) {
  return runAction("stockdoc.edit", async (a) => {
    const r = await createAndPostStockDoc(a, input);
    return { ...r, redirect: r.posted ? await siteRedirectFor(r.id) : `/movements/${r.id}` };
  }, { revalidate: R, message: (r) => (r.posted ? `Təsdiqləndi: ${r.number}. Qalıq yeniləndi.` : r.kind === "ADJUSTMENT" ? `${r.number} saxlanıldı — təsdiqi anbar müdiri edəcək.` : `Sorğu göndərildi: ${r.number}. Anbardar və ya anbar müdiri təsdiqləyəndə qalıq dəyişəcək.`) });
}
export async function updateStockDocAction(id: string, version: number, input: StockDocInput) {
  return runAction("stockdoc.edit", (a) => updateStockDoc(a, id, version, input).then(() => ({ id })), { revalidate: ["/movements"], message: "Qaralama yeniləndi" });
}
export async function postStockDocAction(id: string) {
  return runAction("stockdoc.post", (a) => postStockDoc(a, id), { revalidate: R, message: (r) => (r.alreadyPosted ? "Sənəd artıq təsdiqlənib — təkrar yazılmadı." : "Təsdiqləndi, qalıq yeniləndi.") });
}
export async function cancelStockDocAction(id: string) {
  return runAction("stockdoc.edit", (a) => cancelStockDoc(a, id), { revalidate: ["/movements"], message: "Qaralama ləğv edildi" });
}
export async function reverseStockDocAction(id: string, reason?: string) {
  return runAction("document.reverse", (a) => reverseStockDoc(a, id, reason ?? "").then((r) => ({ id: r.id, number: r.number, redirect: `/movements/${r.id}` })), { revalidate: R, message: (r) => `Ləğv sənədi yaradıldı: ${r.number}` });
}
