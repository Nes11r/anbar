"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword, requireUser, SESSION_COOKIE, validatePasswordStrength } from "@/lib/auth";
import { logServerError, toUserError } from "@/lib/errors";

export async function changePasswordAction(_p: { error: string; ok: boolean }, fd: FormData): Promise<{ error: string; ok: boolean }> {
  try {
    const u = await requireUser();
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("next2") ?? "")) return { error: "Yeni parollar uyğun gəlmir.", ok: false };
    const weak = validatePasswordStrength(next);
    if (weak) return { error: weak, ok: false };
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await bcrypt.compare(current, row.passwordHash))) return { error: "Cari parol yanlışdır.", ok: false };
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const keep = createHash("sha256").update(token).digest("hex");
    await db.$transaction([
      db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), mustChangePwd: false } }),
      db.session.deleteMany({ where: { userId: u.id, id: { not: keep } } }),
      db.auditLog.create({ data: { userId: u.id, userEmail: u.email, action: "PASSWORD_CHANGE", entityType: "User", entityId: u.id } }),
    ]);
    return { error: "", ok: true };
  } catch (e) {
    logServerError("password", e);
    return { error: toUserError(e).error, ok: false };
  }
}
