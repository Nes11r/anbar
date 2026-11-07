"use server";
import { runAction } from "@/lib/action";
import { saveEmployee } from "@/server/services/masterdata";

export async function saveEmployeeAction(id: string | null, data: Record<string, unknown>) {
  return runAction("employee.manage", (a) => saveEmployee(a, id, data as never).then((e) => ({ id: e.id })), { revalidate: ["/employees"], message: "İşçi kartı yadda saxlanıldı" });
}
