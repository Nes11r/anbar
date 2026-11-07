"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** Sidebar on desktop; slide-in drawer on phones (opened from header ☰ or bottom "Menyu"). */
export function SideNav({ items, children, footer }: { items: { href: string; label: string; icon: string; group?: string }[]; children: ReactNode; footer?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const o = () => setOpen(true);
    window.addEventListener("hec:open-menu", o);
    return () => window.removeEventListener("hec:open-menu", o);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  let lastGroup: string | undefined;
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface p-3 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-64 lg:translate-x-0 ${open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"}`}
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        aria-label="Əsas menyu"
      >
        <div className="flex items-start justify-between gap-2">
          {children}
          <button type="button" className="btn btn-sm btn-ghost lg:hidden" onClick={() => setOpen(false)} aria-label="Menyunu bağla">✕</button>
        </div>
        <form
          role="search"
          className="mb-2 lg:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const v = q.trim();
            if (!v) return;
            router.push(/^(MR|PO|GRN|IS[PE]|RT[PES]|TRF|ADJ|INV0?)-/i.test(v) ? `/journal?q=${encodeURIComponent(v)}` : `/stock?q=${encodeURIComponent(v)}`);
          }}
        >
          <input type="search" className="input" placeholder="Material, SKU, sənəd №" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Axtarış" />
        </form>
        <nav className="flex-1">
          <ul className="flex flex-col gap-0.5">
            {items.map((it) => {
              const header = it.group && it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  {header && <div className="mb-1 mt-3 px-2 text-[11px] font-bold uppercase tracking-wider text-muted">{header}</div>}
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[14px] font-semibold lg:py-2 lg:text-[13px] ${active ? "bg-brand text-brand-ink" : "text-ink hover:bg-surface-2"}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={it.icon} />
                    </svg>
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {footer && <div className="mt-3 border-t border-line pt-3 lg:hidden">{footer}</div>}
      </aside>
    </>
  );
}

export function MenuButton() {
  return (
    <button type="button" className="btn btn-sm btn-ghost h-10 w-10 p-0 lg:hidden" aria-label="Menyunu aç" onClick={() => window.dispatchEvent(new Event("hec:open-menu"))}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
  );
}
