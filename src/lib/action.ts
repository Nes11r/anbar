import "server-only";
import { revalidatePath } from "next/cache";
import type { Actor } from "@/server/audit";
import { clientIp, requireUser } from "./auth";
import { logServerError, toUserError, type ActionResult } from "./errors";
import type { Permission } from "./rbac";

/**
 * Every server action goes through here:
 *  - authenticates + authorises on the server (UI hiding is never trusted),
 *  - never throws to the browser (no white screen): returns { ok:false, error },
 *  - logs unexpected errors server-side only,
 *  - revalidates the affected pages.
 */
export async function runAction<T>(
  perm: Permission | null,
  fn: (actor: Actor) => Promise<T>,
  opts: { revalidate?: string[]; message?: string | ((r: T) => string) } = {},
): Promise<ActionResult<T>> {
  try {
    const u = await requireUser(perm ?? undefined);
    const actor: Actor = { id: u.id, email: u.email, name: u.name, role: u.role, ip: await clientIp() };
    const data = await fn(actor);
    for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
    const message = typeof opts.message === "function" ? opts.message(data) : opts.message;
    return { ok: true, data: JSON.parse(JSON.stringify(data ?? null, (_k, v) => (typeof v === "bigint" ? v.toString() : v))), message };
  } catch (err) {
    logServerError("action", err);
    const e = toUserError(err);
    return { ok: false, error: e.error, code: e.code, fieldErrors: e.fieldErrors };
  }
}

/** FormData → plain object (checkbox "on" → true). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    o[k] = v === "on" ? true : v;
  }
  return o;
}
