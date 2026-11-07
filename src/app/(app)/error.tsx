"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Any rendering error inside the app shell lands here — the menu keeps working, nothing is lost. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("UI error", error.digest ?? "");
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-lg font-bold">Səhifə yüklənərkən xəta baş verdi</h1>
      <p className="mt-2 text-sm text-muted">
        Məlumatlarınız təhlükəsizdir — yarımçıq əməliyyatlar avtomatik geri qaytarılır. Səhifəni yenidən yükləyin; problem davam edərsə administratora bu kodu göndərin:
      </p>
      <code className="mt-2 block rounded bg-surface-2 px-2 py-1 text-xs">{error.digest ?? "—"}</code>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" onClick={() => reset()}>Yenidən cəhd et</button>
        <Link className="btn" href="/">İdarə panelinə qayıt</Link>
      </div>
    </div>
  );
}
