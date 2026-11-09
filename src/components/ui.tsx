import Link from "next/link";
import type { ReactNode } from "react";
import { az } from "@/i18n/az";
import type { UserRole } from "@prisma/client";
import { can, rolesWith, type Permission } from "@/lib/rbac";

export interface ViewOnlyProps { role: UserRole; perm: Permission; action: string }

/** Shown to users who may look at a section but not change it — names the roles that can. */
export function ViewOnlyNotice({ role, perm, action }: ViewOnlyProps) {
  if (can(role, perm)) return null;
  const who = rolesWith(perm).filter((r) => r !== "SUPER_ADMIN").map((r) => az.role[r]);
  return (
    <div className="alert alert-info no-print mb-4 flex items-start gap-2 text-sm" role="note">
      <span aria-hidden>👁</span>
      <span>
        <b>Bu bölmə sizin üçün yalnız baxış üçündür.</b> {action[0].toUpperCase() + action.slice(1)} üçün rol lazımdır: <b>{who.join(", ")}</b> (və Super Admin). Sizin rolunuz: {az.role[role]}.
      </span>
    </div>
  );
}

export function PageHeader({ title, crumbs = [], actions, subtitle, viewOnly }: { title: string; crumbs?: { href?: string; label: string }[]; actions?: ReactNode; subtitle?: ReactNode; viewOnly?: ViewOnlyProps }) {
  return (
    <>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="no-print mb-1 text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li><Link href="/" className="hover:underline">Əsas</Link></li>
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span aria-hidden>/</span>
                  {c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {viewOnly && <ViewOnlyNotice {...viewOnly} />}
    </>
  );
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-line-strong" aria-hidden>
        <path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
      </svg>
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" | "ok"; href?: string }) {
  const color = tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-ink";
  const body = (
    <div className="card h-full p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`mt-1 truncate text-2xl font-bold tabular-nums ${color}`} title={typeof value === "string" ? value : undefined}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block min-w-0 transition hover:-translate-y-px">{body}</Link> : body;
}

type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "brand";
export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

const DOC_TONE: Record<string, Tone> = { DRAFT: "muted", POSTED: "ok", CANCELLED: "bad", REVERSED: "warn" };
export function DocStatusBadge({ status }: { status: string }) {
  return <Badge tone={DOC_TONE[status] ?? "muted"}>{az.docStatus[status as keyof typeof az.docStatus] ?? status}</Badge>;
}
const MR_TONE: Record<string, Tone> = { DRAFT: "muted", SUBMITTED: "info", UNDER_REVIEW: "info", RETURNED: "warn", APPROVED: "ok", REJECTED: "bad", IN_SOURCING: "brand", PARTIALLY_ORDERED: "brand", FULLY_ORDERED: "brand", PARTIALLY_DELIVERED: "warn", DELIVERED: "ok", CLOSED: "muted", CANCELLED: "bad" };
export function MrStatusBadge({ status }: { status: string }) {
  return <Badge tone={MR_TONE[status] ?? "muted"}>{az.mrStatus[status as keyof typeof az.mrStatus] ?? status}</Badge>;
}
const PO_TONE: Record<string, Tone> = { DRAFT: "muted", SUBMITTED: "info", APPROVED: "brand", PARTIALLY_RECEIVED: "warn", RECEIVED: "ok", CANCELLED: "bad" };
export function PoStatusBadge({ status }: { status: string }) {
  return <Badge tone={PO_TONE[status] ?? "muted"}>{az.poStatus[status as keyof typeof az.poStatus] ?? status}</Badge>;
}
export function GroupBadge({ group }: { group: string }) {
  const tone: Tone = group === "ENGINEER" ? "brand" : group === "WORKER" ? "warn" : group === "BOTH" ? "info" : "muted";
  return <Badge tone={tone}>{az.workerGroup[group as keyof typeof az.workerGroup] ?? group}</Badge>;
}
export function StockStatus({ avail, min }: { avail: number; min: number }) {
  if (avail <= 0) return <Badge tone="bad">Bitib</Badge>;
  if (min > 0 && avail <= min) return <Badge tone="warn">Azdır</Badge>;
  return <Badge tone="ok">Kifayətdir</Badge>;
}

export function Pagination({ page, pageSize, total, params }: { page: number; pageSize: number; total: number; params: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="px-4 py-3 text-xs text-muted">{total} qeyd</p>;
  const href = (p: number) => "?" + new URLSearchParams({ ...params, page: String(p) }).toString();
  return (
    <nav aria-label="Səhifələmə" className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted">
      <span>{total} qeyd · səhifə {page} / {pages}</span>
      <span className="flex gap-1">
        {page > 1 ? <Link className="btn btn-sm" href={href(page - 1)}>← Əvvəlki</Link> : <span className="btn btn-sm" aria-disabled="true">← Əvvəlki</span>}
        {page < pages ? <Link className="btn btn-sm" href={href(page + 1)}>Növbəti →</Link> : <span className="btn btn-sm" aria-disabled="true">Növbəti →</span>}
      </span>
    </nav>
  );
}

export function FilterChips({ name, value, options, params }: { name: string; value: string; options: [string, string][]; params: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map(([v, label]) => {
        const p = { ...params, [name]: v, page: "1" };
        if (!v) delete (p as Record<string, string>)[name];
        return (
          <Link key={v || "all"} href={"?" + new URLSearchParams(p).toString()} className="chip" aria-current={value === v ? "true" : undefined}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function Field({ label, required, children, error, hint, className = "" }: { label: string; required?: boolean; children: ReactNode; error?: string; hint?: string; className?: string }) {
  return (
    <label className={`label ${className}`}>
      <span className={required ? "req" : undefined}>{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] font-normal text-muted">{hint}</span>}
      {error && <span className="field-err">{error}</span>}
    </label>
  );
}
