"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <label className="label">
        <span>E-poçt</span>
        <input className="input" type="email" name="email" autoComplete="username" required autoFocus maxLength={200} />
      </label>
      <label className="label">
        <span>Parol</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required maxLength={200} />
      </label>
      {state.error && <p className="field-err" role="alert">{state.error}</p>}
      <button className="btn btn-primary mt-1 w-full" disabled={pending} aria-busy={pending}>{pending ? "Yoxlanılır…" : "Daxil ol"}</button>
    </form>
  );
}
