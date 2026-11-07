"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface TabItem { href: string; label: string; icon: string }

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Phone / installed-app bottom navigation + quick-action sheet. Hidden on desktop (lg+). */
export function MobileTabBar({ tabs, actions }: { tabs: TabItem[]; actions: TabItem[] }) {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [path]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2, 3);

  const Tab = ({ t }: { t: TabItem }) => (
    <Link href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-semibold ${active(t.href) ? "text-brand" : "text-muted"}`}>
      <Icon d={t.icon} />
      <span className="max-w-full truncate px-1">{t.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Mobil naviqasiya">
        <div className="mx-auto flex h-16 max-w-xl items-stretch">
          {left.map((t) => <Tab key={t.href} t={t} />)}
          <div className="flex flex-1 items-center justify-center">
            {actions.length > 0 ? (
              <button type="button" onClick={() => setSheet(true)} aria-label="Sürətli əməliyyatlar" aria-expanded={sheet} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow-lg)] ring-4 ring-bg">
                <Icon d="M12 5v14M5 12h14" size={26} />
              </button>
            ) : null}
          </div>
          {right.map((t) => <Tab key={t.href} t={t} />)}
          <button type="button" onClick={() => window.dispatchEvent(new Event("hec:open-menu"))} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-semibold text-muted">
            <Icon d="M4 6h16M4 12h16M4 18h16" />
            <span>Menyu</span>
          </button>
        </div>
      </nav>

      {sheet && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Sürətli əməliyyatlar">
          <div className="absolute inset-0 bg-black/45" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4 shadow-[var(--shadow-lg)]" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
            <h2 className="mb-3 text-sm font-bold">Sürətli əməliyyat</h2>
            <div className="grid grid-cols-3 gap-2">
              {actions.map((a) => (
                <Link key={a.href} href={a.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2 py-3 text-center text-[12px] font-semibold text-ink active:bg-brand-soft">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon d={a.icon} /></span>
                  {a.label}
                </Link>
              ))}
            </div>
            <button type="button" className="btn mt-3 w-full" onClick={() => setSheet(false)}>Bağla</button>
          </div>
        </div>
      )}
    </>
  );
}
