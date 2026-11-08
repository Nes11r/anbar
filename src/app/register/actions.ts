"use server";
import { clientIp, hashPassword } from "@/lib/auth";
import { logServerError, toUserError } from "@/lib/errors";
import { registerAccount } from "@/server/services/registration";

type State = { error: string; ok: boolean; fieldErrors: Record<string, string> };

/** Simple per-IP limit: max 5 registration requests per hour. */
const hits = new Map<string, number[]>();

export async function registerAction(_p: State, fd: FormData): Promise<State> {
  const ip = await clientIp();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 5) return { error: "Çox sayda sorğu. Bir saat sonra yenidən cəhd edin.", ok: false, fieldErrors: {} };
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  try {
    await registerAccount(
      {
        accountType: String(fd.get("accountType") ?? "") as never,
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? "") || null,
        note: String(fd.get("note") ?? "") || null,
        password: String(fd.get("password") ?? ""),
        password2: String(fd.get("password2") ?? ""),
      },
      hashPassword,
      ip,
    );
    return { error: "", ok: true, fieldErrors: {} };
  } catch (e) {
    logServerError("register", e);
    const u = toUserError(e);
    return { error: u.error, ok: false, fieldErrors: u.fieldErrors ?? {} };
  }
}
