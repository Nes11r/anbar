import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { User, UserRole } from "@prisma/client";
import { db } from "./db";
import { can, type Permission } from "./rbac";
import { ForbiddenError, AppError } from "./errors";

export const SESSION_COOKIE = "hec_session";
const TTL_HOURS = Math.max(1, Number(process.env.SESSION_TTL_HOURS ?? 12) || 12);
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "mustChangePwd">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "Parol ən azı 10 simvol olmalıdır.";
  if (!/[A-Za-zƏəĞğİıÖöŞşÜüÇç]/.test(pw) || !/\d/.test(pw)) return "Parolda həm hərf, həm rəqəm olmalıdır.";
  return null;
}

let _dummy: Promise<string> | null = null;
function dummyHash() {
  _dummy ??= bcrypt.hash("timing-equaliser-not-a-password", 12);
  return _dummy;
}

/** In-memory per-IP throttle (complements the per-account lockout stored in DB). */
const ipAttempts = new Map<string, { n: number; until: number }>();
function ipThrottled(ip: string) {
  const now = Date.now();
  const e = ipAttempts.get(ip);
  if (!e || e.until < now) return false;
  return e.n >= 20;
}
function ipFail(ip: string) {
  const now = Date.now();
  const e = ipAttempts.get(ip);
  if (!e || e.until < now) ipAttempts.set(ip, { n: 1, until: now + 15 * 60_000 });
  else e.n++;
  if (ipAttempts.size > 10_000) ipAttempts.clear();
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

export async function login(emailRaw: string, password: string): Promise<SessionUser> {
  const email = emailRaw.trim().toLowerCase();
  const ip = await clientIp();
  if (ipThrottled(ip)) throw new AppError("Çox sayda uğursuz cəhd. 15 dəqiqə sonra yenidən cəhd edin.", "THROTTLED");

  const user = await db.user.findUnique({ where: { email } });
  const generic = new AppError("E-poçt və ya parol yanlışdır.", "BAD_CREDENTIALS");

  if (!user || !user.isActive) {
    // Equalise timing to avoid user enumeration
    await bcrypt.compare(password, await dummyHash());
    ipFail(ip);
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(`Hesab müvəqqəti bloklanıb. ${LOCK_MINUTES} dəqiqə sonra yenidən cəhd edin.`, "LOCKED");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    ipFail(ip);
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await db.auditLog.create({ data: { userId: user.id, userEmail: user.email, action: "LOGIN_FAILED", entityType: "User", entityId: user.id, ip } });
    throw generic;
  }

  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await db.$transaction([
    db.session.create({
      data: {
        id: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
        ip,
        userAgent: (h.get("user-agent") ?? "").slice(0, 300),
      },
    }),
    db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.auditLog.create({ data: { userId: user.id, userEmail: user.email, action: "LOGIN", entityType: "User", entityId: user.id, ip } }),
    db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ]);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: TTL_HOURS * 3600,
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePwd: user.mustChangePwd };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: hashToken(token) } }).catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
}

/** Cached per request. Returns null when not logged in or session expired. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const s = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, isActive: true, mustChangePwd: true } } },
  });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  const { isActive: _ignored, ...u } = s.user;
  void _ignored;
  return u;
});

/** For pages: redirect to /login when unauthenticated, 403 page when unauthorised. */
export async function requirePage(perm?: Permission): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (perm && !can(u.role, perm)) redirect("/forbidden");
  return u;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireUser(perm?: Permission): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AppError("Sessiya bitib. Yenidən daxil olun.", "UNAUTHENTICATED");
  if (perm && !can(u.role, perm)) throw new ForbiddenError();
  return u;
}

export function hasRole(u: SessionUser, roles: UserRole[]) {
  return roles.includes(u.role);
}
