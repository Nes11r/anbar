import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can, scopeProjectId } from "@/lib/rbac";
import { db } from "@/lib/db";
import { fmtDate, fmtQty } from "@/lib/format";
import { Badge, Card, Empty, GroupBadge, PageHeader } from "@/components/ui";
import { siteMaterials, siteWorkerHoldings } from "@/server/services/sites";

export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePage("site.view");
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const scope = scopeProjectId(user);
  if (scope && scope !== projectId) notFound();
  const p = await db.project.findUnique({ where: { id: projectId }, include: { siteWarehouse: true } });
  if (!p) notFound();
  const [mats, holdings, reports] = await Promise.all([
    siteMaterials(projectId),
    siteWorkerHoldings(projectId),
    db.siteReport.findMany({ where: { projectId }, orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }], take: 10, include: { lines: true } }),
  ]);
  const t = mats.reduce((a, m) => ({ stock: a.stock + m.inStock.toNumber(), workers: a.workers + m.withWorkers.toNumber() }), { stock: 0, workers: 0 });
  const byWorker = new Map<string, { name: string; code: string; group: string; items: typeof holdings }>();
  for (const h of holdings) {
    const w = byWorker.get(h.employeeId) ?? { name: h.fullName, code: h.code, group: h.group, items: [] };
    w.items.push(h);
    byWorker.set(h.employeeId, w);
  }
  const wh = p.siteWarehouse;
  return (
    <>
      <PageHeader print={["Sahə anbardarı", "Layihə rəhbəri", "Anbar müdiri"]}
        viewOnly={{ role: user.role, perm: "site.report", action: "gündəlik sahə hesabatını daxil etmək" }}
        title={`Sahə: ${p.code} — ${p.name}`}
        subtitle={wh ? `Sahə anbarı: ${wh.name} (${wh.code})` : "Bu layihənin sahə anbarı yoxdur — layihəni yadda saxlayın, avtomatik yaranacaq."}
        crumbs={[{ href: "/sites", label: "Layihələr və sahələr" }, { label: p.code }]}
        actions={<>
          {can(user.role, "site.report") && <Link className="btn btn-primary" href={`/sites/${p.id}/report`}>+ Gündəlik hesabat</Link>}
          {wh && can(user.role, "stockdoc.edit") && <Link className="btn" href={`/movements/new?kind=ISSUE_EMPLOYEE&wh=${wh.id}`}>İşçiyə təhvil</Link>}
          {wh && can(user.role, "stockdoc.edit") && <Link className="btn" href={`/movements/new?kind=ISSUE_PROJECT&wh=${wh.id}`}>Sahədə istifadə (sərf)</Link>}
          {wh && can(user.role, "stockdoc.edit") && !scope && <Link className="btn" href={`/movements/new?kind=TRANSFER&to=${wh.id}`}>Ofisdən sahəyə göndər</Link>}
          {wh && can(user.role, "stockdoc.edit") && <Link className="btn" href={`/movements/new?kind=TRANSFER&wh=${wh.id}`}>Artığı ofisə qaytar</Link>}
          {wh && can(user.role, "stock.view") && <Link className="btn" href={`/stock?wh=${wh.id}`}>Sahə anbarının qalığı</Link>}
          {can(user.role, "project.view") && <Link className="btn" href={`/projects/${p.id}`}>Layihə məlumatı və hesabatı</Link>}
        </>}
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Sahədə cəmi</div><div className="text-2xl font-bold tabular-nums">{fmtQty(t.stock + t.workers)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">İşçilərdə</div><div className="text-2xl font-bold tabular-nums text-brand">{fmtQty(t.workers)}</div><div className="text-xs text-muted">{byWorker.size} işçi</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Sahə anbarında stokda</div><div className="text-2xl font-bold tabular-nums text-ok">{fmtQty(t.stock)}</div></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Material üzrə: cəmi / işçilərdə / stokda" className="xl:col-span-2" pad={false}>
          {mats.length === 0 ? <Empty title="Sahədə material yoxdur" hint="Ofisdən sahəyə göndərin, sonra sahədən işçilərə təhvil verin." /> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Material</th><th>Ölçü</th><th>Təyinat</th><th className="num">Cəmi</th><th className="num">İşçilərdə</th><th className="num">Stokda</th></tr></thead>
                <tbody>{mats.map((m) => (
                  <tr key={m.variantId}>
                    <td><Link className="link" href={`/stock/${m.variantId}`}>{m.name}</Link><div className="text-xs text-muted">{m.sku}</div></td>
                    <td className="font-semibold">{m.size || "—"}</td>
                    <td><GroupBadge group={m.workerGroup} /></td>
                    <td className="num font-bold">{fmtQty(m.total)} {m.unit}</td>
                    <td className="num text-brand">{fmtQty(m.withWorkers)}</td>
                    <td className="num text-ok">{fmtQty(m.inStock)}{m.reserved.gt(0) && <span className="text-xs text-muted"> (rezerv {fmtQty(m.reserved)})</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Son gündəlik hesabatlar" pad={false}>
          {reports.length === 0 ? <p className="p-4 text-sm text-muted">Hələ hesabat daxil edilməyib.</p> : (
            <ul className="divide-y divide-line">{reports.map((r) => {
              const diffs = r.lines.filter((l) => !l.stockQty.eq(l.systemStock) || !l.withWorkersQty.eq(l.systemWithWorkers)).length;
              return (
                <li key={r.id}><Link href={`/sites/reports/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                  <span><b>{fmtDate(r.reportDate)}</b> <span className="text-muted">· {r.reportedBy}</span></span>
                  {diffs ? <Badge tone="bad">{diffs} fərq</Badge> : <Badge tone="ok">Uyğundur</Badge>}
                </Link></li>
              );
            })}</ul>
          )}
        </Card>
        <Card title="Kimdə nə var (işçilər üzrə)" className="xl:col-span-3" pad={false}>
          {byWorker.size === 0 ? <p className="p-4 text-sm text-muted">Heç bir işçiyə material təhvil verilməyib.</p> : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {[...byWorker.entries()].map(([id, w]) => (
                <div key={id} className="rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {can(user.role, "employee.view") ? <Link href={`/employees/${id}`} className="link">{w.name}</Link> : <span className="font-semibold">{w.name}</span>}
                    <span className="text-xs text-muted">{w.code} · {w.group === "ENGINEER" ? "Mühəndis" : "Fəhlə"}</span>
                  </div>
                  <ul className="text-sm">{w.items.map((i, k) => <li key={k} className="flex justify-between gap-2 border-t border-line py-1 first:border-0"><span className="min-w-0 truncate">{i.name}{i.size ? ` · ${i.size}` : ""}</span><span className="font-semibold tabular-nums">{fmtQty(i.qty)} {i.unit}</span></li>)}</ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
