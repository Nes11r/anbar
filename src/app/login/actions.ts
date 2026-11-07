"use server";
import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";
import { logServerError, toUserError } from "@/lib/errors";

export async function loginAction(_prev: { error: string }, fd: FormData): Promise<{ error: string }> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "E-poçt və parolu daxil edin." };
  try {
    await login(email, password);
  } catch (e) {
    logServerError("login", e);
    return { error: toUserError(e).error };
  }
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
