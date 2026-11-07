"use server";
import { runAction } from "@/lib/action";
import { commitBatch, parseBatch, rollbackBatch, setRowAction, uploadImport, type ImportMapping } from "@/server/import/service";
import { AppError } from "@/lib/errors";

export async function uploadAction(fd: FormData) {
  return runAction("import.run", async (a) => {
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new AppError("Fayl seçilməyib.", "VALIDATION");
    const b = await uploadImport(a, f.name, Buffer.from(await f.arrayBuffer()));
    return { id: b.id, redirect: `/import/${b.id}` };
  }, { revalidate: ["/import"], message: "Fayl yükləndi. Vərəqi və məlumat növünü seçin." });
}
export async function parseAction(batchId: string, mapping: ImportMapping) {
  return runAction("import.run", (a) => parseBatch(a, batchId, mapping), { revalidate: ["/import"], message: (r) => `${r.rows} sətir oxundu. Xəbərdarlıqları yoxlayın.` });
}
export async function rowAction(rowId: string, action: "CREATE" | "SKIP") {
  return runAction("import.run", (a) => setRowAction(a, rowId, action), { revalidate: ["/import"] });
}
export async function commitAction(batchId: string) {
  return runAction("import.run", (a) => commitBatch(a, batchId), { revalidate: ["/import", "/catalog", "/inventory", "/employees"], message: (r) => (r.alreadyCommitted ? "Paket artıq təsdiqlənib." : `Təsdiqləndi: ${r.created} yeni qeyd.`) });
}
export async function rollbackAction(batchId: string) {
  return runAction("import.run", (a) => rollbackBatch(a, batchId), { revalidate: ["/import", "/catalog", "/inventory"], message: "Import geri qaytarıldı" });
}
