"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";
import { useToast } from "./toast";

/**
 * Button that calls a server action. Optional confirm dialog + reason input.
 * Disabled while running → double-clicks never send twice (the server is idempotent anyway).
 */
export function ActionButton({
  action,
  children,
  confirm,
  reason,
  className = "btn",
  redirectTo,
  successText,
}: {
  action: (reason?: string) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  confirm?: string;
  reason?: { label: string; required?: boolean };
  className?: string;
  redirectTo?: string | ((data: unknown) => string);
  successText?: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const router = useRouter();

  const run = () => {
    setErr("");
    if (reason?.required && why.trim().length < 3) {
      setErr("Səbəb yazın (ən azı 3 simvol).");
      return;
    }
    start(async () => {
      let r: ActionResult<unknown>;
      try {
        r = await action(why.trim() || undefined);
      } catch {
        r = { ok: false, error: "Serverlə əlaqə alınmadı. İnternet bağlantısını yoxlayın və yenidən cəhd edin." };
      }
      if (r.ok) {
        dlg.current?.close();
        setOpen(false);
        setWhy("");
        toast("ok", r.message ?? successText ?? "Əməliyyat uğurla yerinə yetirildi.");
        const auto = (r.data as { redirect?: unknown } | null | undefined)?.redirect;
        if (typeof auto === "string" && auto.startsWith("/")) router.push(auto);
        else if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(r.data) : redirectTo);
        else router.refresh();
      } else {
        if (open) setErr(r.error);
        toast("bad", r.error);
      }
    });
  };

  const onClick = () => {
    if (confirm || reason) {
      setOpen(true);
      dlg.current?.showModal();
    } else run();
  };

  return (
    <>
      <button type="button" className={className} onClick={onClick} disabled={pending} aria-busy={pending}>
        {pending ? "Gözləyin…" : children}
      </button>
      <dialog ref={dlg} className="m-auto w-[min(460px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/40" onClose={() => setOpen(false)}>
        <div className="p-5">
          <h2 className="text-base font-bold">{confirm ?? "Təsdiq"}</h2>
          {reason && (
            <label className="label mt-3">
              <span className={reason.required ? "req" : undefined}>{reason.label}</span>
              <textarea className="textarea" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={1000} autoFocus />
            </label>
          )}
          {err && <p className="field-err mt-2" role="alert">{err}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => dlg.current?.close()} disabled={pending}>İmtina</button>
            <button type="button" className="btn btn-primary" onClick={run} disabled={pending} aria-busy={pending}>{pending ? "Gözləyin…" : "Təsdiq et"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
