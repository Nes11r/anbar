"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Puts the signature block at the very end of the page content (layout's #print-tail), only for printing. */
export function PrintTail({ roles }: { roles: string[] }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [at, setAt] = useState("");
  useEffect(() => {
    setEl(document.getElementById("print-tail"));
    const stamp = () => setAt(new Date().toLocaleString("az-AZ", { timeZone: "Asia/Baku" }));
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);
  if (!el) return null;
  return createPortal(
    <div className="print-only print-signatures mt-10">
      {roles.length > 0 && (
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${roles.length}, 1fr)` }}>
          {roles.map((r) => (
            <div key={r} className="text-[10px]">
              <div className="h-10 border-b border-black" />
              <div className="mt-1 font-semibold">{r}</div>
              <div>Ad, soyad / imza / tarix</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 text-[9px]">Sistemdən çap edilib: {at} · HECOTEC Anbar sistemi</div>
    </div>,
    el,
  );
}
