"use server";
import { runAction } from "@/lib/action";
import { bulkSetActive, createMaterial, setMaterialActive, updateMaterial, type MaterialInput } from "@/server/services/catalog";

export async function createMaterialAction(input: MaterialInput) {
  return runAction("catalog.manage", (a) => createMaterial(a, input).then((m) => ({ id: m.id, code: m.code })), { revalidate: ["/catalog", "/stock"], message: (r) => `Material yaradıldı: ${r.code}` });
}
export async function updateMaterialAction(id: string, version: number, input: MaterialInput) {
  return runAction("catalog.manage", (a) => updateMaterial(a, id, version, input).then(() => ({ id })), { revalidate: ["/catalog", "/stock"], message: "Material yeniləndi" });
}
export async function setActiveAction(id: string, active: boolean) {
  return runAction("catalog.manage", (a) => setMaterialActive(a, id, active), { revalidate: ["/catalog"], message: active ? "Aktivləşdirildi" : "Arxivləndi" });
}
export async function bulkArchiveAction(ids: string[], active: boolean) {
  return runAction("catalog.manage", (a) => bulkSetActive(a, ids, active), {
    revalidate: ["/catalog"],
    message: (r) => `${r.done} material ${active ? "aktivləşdirildi" : "arxivləndi"}${r.errors.length ? `; ${r.errors.length} xəta: ${r.errors[0]}` : ""}`,
  });
}
