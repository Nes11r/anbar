"use server";
import { runAction } from "@/lib/action";
import { cancelGRN, createAndPostGRN, createGRN, postGRN, reverseGRN, type GRNInput } from "@/server/services/procurement";

const R = ["/grn", "/po", "/mr", "/stock", "/"];
export async function createGRNAction(input: GRNInput) {
  return runAction("grn.edit", (a) => createGRN(a, input).then((g) => ({ id: g.id, grnNumber: g.grnNumber })), { revalidate: ["/grn"], message: (r) => `GRN qaralaması: ${r.grnNumber}` });
}
export async function createAndPostGRNAction(input: GRNInput) {
  return runAction("grn.edit", (a) => createAndPostGRN(a, input).then((g) => ({ ...g, redirect: `/grn/${g.id}` })), {
    revalidate: R,
    message: (g) => (g.posted ? `Qəbul təsdiqləndi: ${g.grnNumber}. Mal anbara mədaxil edildi.` : `${g.grnNumber} saxlanıldı — təsdiq gözləyir.`),
  });
}
export async function postGRNAction(id: string) {
  return runAction("grn.post", (a) => postGRN(a, id), { revalidate: R, message: (r) => (r.alreadyPosted ? "GRN artıq təsdiqlənib — ikinci dəfə mədaxil edilmədi." : "GRN təsdiqləndi: mal avtomatik anbara mədaxil edildi.") });
}
export async function cancelGRNAction(id: string) {
  return runAction("grn.edit", (a) => cancelGRN(a, id), { revalidate: ["/grn"], message: "GRN qaralaması ləğv edildi" });
}
export async function reverseGRNAction(id: string, reason?: string) {
  return runAction("document.reverse", (a) => reverseGRN(a, id, reason ?? ""), { revalidate: R, message: "GRN ləğv edildi, qalıq geri alındı" });
}
