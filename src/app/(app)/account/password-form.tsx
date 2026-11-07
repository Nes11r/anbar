"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "", ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label"><span className="req">Cari parol</span><input className="input" type="password" name="current" autoComplete="current-password" required /></label>
      <label className="label"><span className="req">Yeni parol</span><input className="input" type="password" name="next" autoComplete="new-password" required minLength={10} /><span className="text-[11px] font-normal text-muted">Ən azı 10 simvol, hərf və rəqəm.</span></label>
      <label className="label"><span className="req">Yeni parol (təkrar)</span><input className="input" type="password" name="next2" autoComplete="new-password" required /></label>
      {state.error && <p className="field-err" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold text-ok" role="status">Parol dəyişdirildi. Digər cihazlardakı sessiyalar bağlandı.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "…" : "Parolu dəyiş"}</button>
    </form>
  );
}
