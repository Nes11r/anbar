"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; tone: "ok" | "bad" | "info"; text: string };
const Ctx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "bad" ? 9000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-24 right-3 z-[100] lg:bottom-4 lg:right-4 flex w-[min(420px,calc(100vw-32px))] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto alert ${t.tone === "ok" ? "alert-ok" : t.tone === "bad" ? "alert-bad" : "alert-info"} shadow-lg`} style={{ background: "var(--surface)" }}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-ink">{t.text}</span>
              <button type="button" className="text-muted" aria-label="Bağla" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}>×</button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
