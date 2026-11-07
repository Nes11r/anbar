import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty, isoDate, sp } from "@/lib/format";
import { Badge, Card, Empty, GroupBadge, PageHeader } from "@/components/ui";
import { ledgerJournal, projectReport } from "@/server/services/reports";
import { ProjectForm } from "../project-form";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("project.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await db.project.findUnique({ where: { id } });
  if (!p) notFound();
  if (sp(s.edit) === "1" && can(user.role, "project.manage")) {
    return (
      <>
        <PageHeader title={`Düzəliş: ${p.code}`} crumbs={[{ href: "/projects", label: "Layihələr" }, { href: `/projects/${p.id}`, label: p.code }, { label: "Düzəliş" }]} />
        <ProjectForm id={p.id} v={{ ...p, startDate: isoDate(p.startDate), endDate: isoDate(p.endDate) }} />
      </>
    );
  }
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp(s.from)) ? new Date(sp(s.from)) : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp(s.to)) ? new Date(sp(s.to)) : undefined;
  const [rows, journal, mrs] = await Promise.all([
    projectReport(id, from, to),
    ledgerJournal({ projectId: id, from, to, limit: 200 }),
    db.materialRequest.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, mrNumber: true, revision: true, status: true, dateRaised: true } }),
  ]);
  const t = rows.reduce((a, r) => ({ ip: a.ip + Number(r.issuedProject), ie: a.ie + Number(r.issuedEmployee), ret: a.ret + Number(r.returned), net: a.net + Number(r.net) }), { ip: 0, ie: 0, ret: 0, net: 0 });
  const exportQs = new URLSearchParams({ id, ...(sp(s.from) ? { from: sp(s.from) } : {}), ...(sp(s.to) ? { to: sp(s.to) } : {}) });
  return (
    <>
      <PageHeader
        title={`${p.code} — ${p.name}`}
        subtitle={<span className="flex items-center gap-2">{p.client ?? ""}{p.location ? ` · ${p.location}` : ""} {p.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Bağlı</Badge>}</span>}
        crumbs={[{ href: "/projects", label: "Layihələr" }, { label: p.code }]}
        actions={<>
          <a className="btn" href={`/api/export/project?${exportQs}`}>Excel</a>
          {can(user.role, "stockdoc.edit") && <Link className="btn btn-primary" href="/movements/new?kind=ISSUE_PROJECT">+ Məxaric</Link>}
          {can(user.role, "project.manage") && <Link className="btn" href={`/projects/${p.id}?edit=1`}>Düzəliş</Link>}
          {can(user.role, "project.manage") && <DeleteButton type="project" id={p.id} label={`${p.code} — ${p.name}`} />}
        </>}
      />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2">
        <label className="label"><span>Başlanğıc</span><input className="input" type="date" name="from" defaultValue={sp(s.from)} /></label>
        <label className="label"><span>Son</span><input className="input" type="date" name="to" defaultValue={sp(s.to)} /></label>
        <button className="btn">Dövrü tətbiq et</button>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Layihəyə ümumi verilən</div><div className="text-2xl font-bold">{fmtQty(t.ip)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">İşçilərə PPE</div><div className="text-2xl font-bold">{fmtQty(t.ie)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Qaytarılan</div><div className="text-2xl font-bold">{fmtQty(t.ret)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Xalis layihədə</div><div className="text-2xl font-bold">{fmtQty(t.net)}</div></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Material bölgüsü (kateqoriya / ölçü)" className="xl:col-span-2" pad={false}>
          {rows.length === 0 ? <Empty title="Bu layihəyə hələ material verilməyib" /> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Kateqoriya</th><th>SKU</th><th>Material</th><th>Ölçü</th><th>Təyinat</th><th className="num">Ümumi</th><th className="num">PPE</th><th className="num">Qaytarılan</th><th className="num">Xalis</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.variantId}><td>{r.category}</td><td><Link className="link" href={`/stock/${r.variantId}`}>{r.sku}</Link></td><td>{r.name}</td><td>{r.size || "—"}</td><td><GroupBadge group={r.workerGroup} /></td>
                    <td className="num">{fmtQty(r.issuedProject)}</td><td className="num">{fmtQty(r.issuedEmployee)}</td><td className="num">{fmtQty(r.returned)}</td><td className="num font-bold">{fmtQty(r.net)} {r.unit}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Material tələbləri (MR)" pad={false} actions={can(user.role, "mr.create") && <Link className="btn btn-sm" href={`/mr/new?project=${p.id}`}>+ MR</Link>}>
          {mrs.length === 0 ? <p className="p-4 text-sm text-muted">MR yoxdur.</p> : (
            <ul className="divide-y divide-line">{mrs.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 px-4 py-2 text-sm"><Link className="link" href={`/mr/${m.id}`}>{m.mrNumber} Rev.{m.revision}</Link><span className="text-xs text-muted">{az.mrStatus[m.status]} · {fmtDate(m.dateRaised)}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Kim, nə vaxt təhvil alıb (hərəkətlər)" className="xl:col-span-3" pad={false}>
          {journal.rows.length === 0 ? <p className="p-4 text-sm text-muted">Hərəkət yoxdur.</p> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>Material</th><th>İşçi</th><th className="num">Miqdar</th><th>İstifadəçi</th></tr></thead>
                <tbody>{journal.rows.map((r) => (
                  <tr key={String(r.id)}><td>{fmtDate(r.movementDate)}</td><td>{az.entryType[r.entryType as keyof typeof az.entryType]}</td><td>{r.docNumber}</td><td>{r.sku} · {r.name}{r.size ? ` (${r.size})` : ""}</td><td>{r.employee ?? "—"}</td><td className="num">{r.entryType === "ISSUE" ? "" : "−"}{fmtQty(r.qty)}</td><td>{r.userName}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
