import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Expected business-rule failure. Message is safe to show to the user (Azerbaijani). */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = "BUSINESS_RULE",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Bu əməliyyat üçün səlahiyyətiniz yoxdur.") {
    super(message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Qeyd") {
    super(`${what} tapılmadı.`, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Sənəd başqa istifadəçi tərəfindən dəyişdirilib. Səhifəni yeniləyin və yenidən cəhd edin.") {
    super(message, "CONFLICT");
  }
}

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

/**
 * Convert any thrown value into a user-safe message. Internal details (SQL, stack)
 * are logged on the server only, never sent to the browser.
 */
export function toUserError(err: unknown): { error: string; code: string; fieldErrors?: Record<string, string> } {
  if (err instanceof AppError) return { error: err.message, code: err.code, fieldErrors: err.fieldErrors };

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) {
      const k = i.path.join(".") || "_";
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    const first = err.issues[0];
    return { error: first ? first.message : "Məlumat düzgün deyil.", code: "VALIDATION", fieldErrors };
  }

  const msg = String((err as Error)?.message ?? "");

  if (msg.includes("stock_bal_onhand_nonneg") || msg.includes("stock_bal_reserved_le")) {
    return { error: "Əməliyyat anbar qalığını mənfi edərdi. Qalıq kifayət deyil.", code: "INSUFFICIENT_STOCK" };
  }
  if (msg.includes("HEC_APPEND_ONLY")) {
    return { error: "Təsdiqlənmiş jurnal qeydləri dəyişdirilə bilməz. Ləğv (reversal) sənədi yaradın.", code: "APPEND_ONLY" };
  }
  if (msg.includes("HEC_POSTED_LOCKED")) {
    return { error: "Təsdiqlənmiş sənədin sətirləri dəyişdirilə bilməz.", code: "POSTED_LOCKED" };
  }
  if (msg.includes("mr_ros_after_raised")) {
    return { error: "Sahəyə tələb tarixi (RoS) MR tarixindən əvvəl ola bilməz.", code: "VALIDATION" };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "";
      return { error: `Bu dəyər artıq mövcuddur (unikal olmalıdır: ${Array.isArray(target) ? target.join(", ") : target}).`, code: "DUPLICATE" };
    }
    if (err.code === "P2025") return { error: "Qeyd tapılmadı və ya artıq dəyişdirilib.", code: "NOT_FOUND" };
    if (err.code === "P2003") return { error: "Əlaqəli qeyd mövcud deyil və ya istifadə olunur.", code: "FK" };
    if (err.code === "P2034") return { error: "Sistem məşğuldur, bir neçə saniyə sonra yenidən cəhd edin.", code: "BUSY" };
    if (err.code === "P1001" || err.code === "P1002" || err.code === "P1017") {
      return { error: "Verilənlər bazası ilə əlaqə müvəqqəti kəsilib. Yenidən cəhd edin.", code: "DB_UNAVAILABLE" };
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { error: "Verilənlər bazası ilə əlaqə yoxdur. Administratora müraciət edin.", code: "DB_UNAVAILABLE" };
  }

  return { error: "Gözlənilməz xəta baş verdi. Dəyişiklik yadda saxlanmadı.", code: "INTERNAL" };
}

export function logServerError(scope: string, err: unknown) {
  if (err instanceof AppError) return; // expected, not an incident
  // Never log request bodies / passwords — only the error itself.
  console.error(`[${new Date().toISOString()}] [${scope}]`, err instanceof Error ? err.stack ?? err.message : err);
}
