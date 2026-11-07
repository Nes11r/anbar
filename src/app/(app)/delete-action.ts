"use server";
import { runAction } from "@/lib/action";
import { deleteRecord, type DeletableType } from "@/server/services/deletion";

const REVALIDATE = ["/", "/catalog", "/stock", "/inventory", "/movements", "/mr", "/po", "/grn", "/projects", "/employees", "/import", "/settings"];

/** Generic delete. Permission + history checks happen inside deleteRecord (server-side). */
export async function deleteAction(type: DeletableType, id: string) {
  return runAction(null, (a) => deleteRecord(a, type, id), { revalidate: REVALIDATE, message: (r) => r.label });
}
