"use client";
import { useActionState } from "react";
import { registerAction } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, { error: "", ok: false, fieldErrors: {} as Record<string, string> });
  if (state.ok) {
    return (
      <div className="alert alert-ok" role="status">
        <b>Sorğunuz qəbul edildi.</b> Administrator hesabınızı təsdiq etdikdən sonra e-poçt və parolunuzla daxil ola biləcəksiniz.
      </div>
    );
  }
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="accountType" value="COMPANY" />
      <label className="label"><span className="req">Ad, soyad</span><input className="input" name="name" required maxLength={100} autoComplete="name" />{fe.name && <span className="field-err">{fe.name}</span>}</label>
      <label className="label"><span className="req">E-poçt</span><input className="input" type="email" name="email" required maxLength={200} autoComplete="email" />{fe.email && <span className="field-err">{fe.email}</span>}</label>
      <label className="label"><span>Telefon</span><input className="input" type="tel" name="phone" maxLength={30} autoComplete="tel" /></label>
      <label className="label"><span>Layihə / vəzifə</span><input className="input" name="note" maxLength={300} placeholder="məs. Səngəçal, sahə anbardarı" /></label>
      <label className="label"><span className="req">Parol</span><input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" /><span className="text-[11px] font-normal text-muted">Ən azı 10 simvol, hərf və rəqəm</span>{fe.password && <span className="field-err">{fe.password}</span>}</label>
      <label className="label"><span className="req">Parol (təkrar)</span><input className="input" type="password" name="password2" required autoComplete="new-password" />{fe.password2 && <span className="field-err">{fe.password2}</span>}</label>
      {state.error && <p className="field-err" role="alert">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Göndərilir…" : "Qeydiyyat sorğusu göndər"}</button>
    </form>
  );
}
