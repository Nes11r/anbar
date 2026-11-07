"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/errors";
import { useToast } from "./toast";

export type FieldDef =
  | { name: string; label: string; type: "text" | "email" | "date" | "number" | "password" | "textarea"; required?: boolean; defaultValue?: string | number | null; hint?: string; span?: 1 | 2 | 3; maxLength?: number }
  | { name: string; label: string; type: "select"; options: [string, string][]; required?: boolean; defaultValue?: string | null; hint?: string; span?: 1 | 2 | 3 }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean; hint?: string; span?: 1 | 2 | 3 };

/** Generic create/edit form for master data. Sends a plain object to the server action. */
export function SimpleForm({ fields, action, submitLabel = "Yadda saxla", redirect, cancelHref, plain }: { fields: FieldDef[]; action: (data: Record<string, unknown>) => Promise<ActionResult<unknown>>; submitLabel?: string; redirect?: (data: unknown) => string; cancelHref?: string; plain?: boolean }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className={plain ? "grid gap-4 md:grid-cols-3" : "card grid gap-4 p-4 md:grid-cols-3"}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: Record<string, unknown> = {};
        for (const f of fields) data[f.name] = f.type === "checkbox" ? fd.get(f.name) === "on" : (fd.get(f.name) as string) ?? "";
        const missing = fields.filter((f) => f.type !== "checkbox" && "required" in f && f.required && !String(data[f.name] ?? "").trim());
        if (missing.length) {
          setErrors(Object.fromEntries(missing.map((m) => [m.name, "Məcburi sahə"])));
          return;
        }
        start(async () => {
          const r = await action(data);
          if (r.ok) {
            toast("ok", r.message ?? "Yadda saxlanıldı");
            if (redirect) router.push(redirect(r.data));
            router.refresh();
          } else {
            setErrors(r.fieldErrors ?? {});
            toast("bad", r.error);
          }
        });
      }}
    >
      {fields.map((f) => {
        const span = f.span === 3 ? "md:col-span-3" : f.span === 2 ? "md:col-span-2" : "";
        if (f.type === "checkbox")
          return (
            <label key={f.name} className={`flex items-center gap-2 text-sm font-semibold ${span}`}>
              <input type="checkbox" name={f.name} defaultChecked={f.defaultValue ?? true} /> {f.label}
            </label>
          );
        const req = "required" in f && f.required;
        return (
          <label key={f.name} className={`label ${span}`}>
            <span className={req ? "req" : undefined}>{f.label}</span>
            {f.type === "select" ? (
              <select name={f.name} className="select" defaultValue={f.defaultValue ?? ""} aria-invalid={!!errors[f.name]}>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea name={f.name} className="textarea" defaultValue={f.defaultValue ?? ""} maxLength={f.maxLength ?? 2000} />
            ) : (
              <input name={f.name} type={f.type} className="input" defaultValue={f.defaultValue ?? ""} aria-invalid={!!errors[f.name]} maxLength={f.maxLength ?? 300} step={f.type === "number" ? "any" : undefined} autoComplete={f.type === "password" ? "new-password" : undefined} />
            )}
            {f.hint && !errors[f.name] && <span className="text-[11px] font-normal text-muted">{f.hint}</span>}
            {errors[f.name] && <span className="field-err">{errors[f.name]}</span>}
          </label>
        );
      })}
      <div className="flex gap-2 md:col-span-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Gözləyin…" : submitLabel}</button>
        {cancelHref && <a className="btn" href={cancelHref}>İmtina</a>}
      </div>
    </form>
  );
}
