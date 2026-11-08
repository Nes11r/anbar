import { fmtDate } from "@/lib/format";
import type { Stage, StageState } from "@/server/services/tracking";

const DOT: Record<StageState, string> = {
  done: "bg-ok border-ok text-white",
  current: "bg-accent border-accent text-accent-ink animate-pulse",
  todo: "bg-surface border-line-strong text-muted",
  skipped: "bg-surface-2 border-line text-muted",
  problem: "bg-bad border-bad text-white",
};
const ICON: Record<StageState, string> = { done: "✓", current: "●", todo: "", skipped: "–", problem: "!" };

/** Parcel-tracker style progress: horizontal on desktop, vertical on phones. */
export function OrderTimeline({ stages, title = "Sifarişin vəziyyəti" }: { stages: Stage[]; title?: string }) {
  if (!stages.length) return null;
  return (
    <section className="card mb-4 p-4" aria-label={title}>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <ol className="flex flex-col gap-3 md:flex-row md:gap-0">
        {stages.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 md:flex-1 md:flex-col md:items-center md:gap-1.5 md:text-center">
            {i < stages.length - 1 && (
              <span aria-hidden className={`absolute left-[13px] top-7 h-[calc(100%-4px)] w-0.5 md:left-[calc(50%+16px)] md:top-[13px] md:h-0.5 md:w-[calc(100%-32px)] ${s.state === "done" || s.state === "skipped" ? "bg-ok" : "bg-line"}`} />
            )}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${DOT[s.state]}`} aria-hidden>{ICON[s.state]}</span>
            <span className="min-w-0 md:px-1">
              <span className={`block text-[13px] font-semibold leading-tight ${s.state === "todo" || s.state === "skipped" ? "text-muted" : s.state === "problem" ? "text-bad" : "text-ink"}`}>
                {s.label}
                <span className="sr-only"> — {s.state === "done" ? "tamamlanıb" : s.state === "current" ? "hazırkı mərhələ" : s.state === "problem" ? "problem" : s.state === "skipped" ? "keçildi" : "gözlənilir"}</span>
              </span>
              {s.date && <span className="block text-[11px] text-muted">{fmtDate(s.date)}</span>}
              {s.detail && <span className="block truncate text-[11px] text-muted" title={s.detail}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Compact stage badge for list tables. */
export function StageBadge({ label, state, progress }: { label: string; state: StageState; progress: number }) {
  const color = state === "problem" ? "bg-bad" : state === "done" ? "bg-ok" : "bg-accent";
  return (
    <span className="inline-flex min-w-[140px] flex-col gap-1">
      <span className={`text-xs font-semibold ${state === "problem" ? "text-bad" : "text-ink"}`}>{label}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden><span className={`block h-full ${color}`} style={{ width: `${Math.max(8, progress)}%` }} /></span>
    </span>
  );
}
