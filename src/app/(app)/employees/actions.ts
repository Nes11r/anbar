"use server";
import { runAction } from "@/lib/action";
import { updateEmployeeAssignment } from "@/server/services/masterdata";

export async function updateEmployeeAssignmentAction(id: string, data: Record<string, unknown>) {
  return runAction("employee.manage", (a) => updateEmployeeAssignment(a, id, data as never).then((e) => ({ id: e.id })), { revalidate: ["/sites", "/employees"], message: "Yadda saxlanıldı — işçinin üzərindəki materiallar da onunla keçdi." });
}
