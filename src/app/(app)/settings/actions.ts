"use server";
import type { UserRole } from "@prisma/client";
import { runAction } from "@/lib/action";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";
import { saveApprovalStep, saveMasterRecord, saveSettings, saveUser } from "@/server/services/masterdata";

export async function saveMasterAction(entity: "warehouse" | "supplier" | "category", id: string | null, data: Record<string, unknown>) {
  return runAction("masterdata.manage", (a) => saveMasterRecord(a, entity, id, data).then((r) => ({ id: r.id, redirect: `/settings/${entity === "category" ? "categories" : entity + "s"}` })), { revalidate: ["/settings"], message: "Yadda saxlanıldı" });
}
export async function saveUserAction(id: string | null, data: Record<string, unknown>) {
  return runAction("settings.manage", (a) => saveUser(a, id, data as never, hashPassword, validatePasswordStrength).then((u) => ({ id: u.id })), { revalidate: ["/settings"], message: "İstifadəçi yadda saxlanıldı" });
}
export async function saveSettingsAction(data: Record<string, unknown>) {
  return runAction("settings.manage", (a) => saveSettings(a, data as never), { revalidate: ["/settings"], message: "Parametrlər yadda saxlanıldı" });
}
export async function saveStepAction(step: number, data: Record<string, unknown>) {
  const roles = (["SUPER_ADMIN", "WAREHOUSE_MANAGER", "STOREKEEPER", "PROCUREMENT", "PROJECT_MANAGER", "AUDITOR"] as UserRole[]).filter((r) => data[`role_${r}`] === true);
  return runAction("settings.manage", (a) => saveApprovalStep(a, step, { isActive: data.isActive === true, condition: data.condition as never, allowedRoles: roles }), { revalidate: ["/settings"], message: "Mərhələ yadda saxlanıldı" });
}
