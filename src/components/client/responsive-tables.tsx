"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Copies each column header into data-label on its cells, so CSS can render every table
 * as stacked cards on phones (see .tbl rules in globals.css). One component for the whole app —
 * no per-page mobile markup needed.
 */
export function ResponsiveTables() {
  const path = usePathname();
  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>("table.tbl").forEach((t) => {
        const heads = Array.from(t.querySelectorAll("thead th")).map((th) => (th.textContent ?? "").trim());
        if (!heads.length) return;
        t.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            const el = td as HTMLElement;
            if (el.dataset.label === undefined) el.dataset.label = heads[i] ?? "";
          });
        });
      });
    };
    label();
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(label);
    });
    const main = document.getElementById("main");
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [path]);
  return null;
}
