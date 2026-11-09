import { siteWorkerHoldings } from "@/server/services/sites";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can, scopeProjectId } from "@/lib/rbac";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtQty } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { variantOptionsByIds } from "@/server/services/catalog";
import { siteReportToCountAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SiteReportView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("site.view");
  if (user.role === "CLIENT") redirect("/forbidden");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await db.siteReport.findUnique({ where: { id }, include: { lines: true, project: true } });
  if (!r) notFound();
  const scope = scopeProjectId(user);
  if (scope && scope !== r.projectId) notFound();
  const [opts, holdings, site] = await Promise.all([
    variantOptionsByIds(r.lines.map((l) => l.variantId)),
    siteWorkerHoldings(r.projectId),
    db.warehouse.findUnique({ where: { projectId: r.projectId }, select: { id: true } }),
  ]);
  const canFix = can(user.role, "stockdoc.edit");
  const workerFix = r.lines
    .map((l) => ({ l, v: opts.get(l.variantId), dw: l.withWorkersQty.toNumber() - l.systemWithWorkers.toNumber() }))
    .filter((x) => x.dw !== 0 && x.v);
  const stockDiffs = r.lines.filter((l) => !l.stockQty.eq(l.systemStock)).length;
  const workerDiffs = r.lines.filter((l) => !l.withWorkersQty.eq(l.systemWithWorkers)).length;
  const sign = (n: number) => (n > 0 ? `+${fmtQty(n)}` : fmtQty(n));
  return (
    <>
      <PageHeader print={["Hesabatı verən (sahə anbardarı)", "Layihə rəhbəri", "Anbar müdiri"]}
        viewOnly={{ role: user.role, perm: "site.report", action: "sahə hesabatı daxil etmək" }}
        title={`Sahə hesabatı — ${r.project.code}, ${fmtDate(r.reportDate)}`}
        subtitle={`Hesabatı verən: ${r.reportedBy} · daxil edilib ${fmtDateTime(r.createdAt)}`}
        crumbs={[{ href: "/sites", label: "Layihələr və sahələr" }, { href: `/sites/${r.projectId}`, label: r.project.code }, { label: fmtDate(r.reportDate) }]}
        actions={<>
          {stockDiffs > 0 && can(user.role, "inventory.edit") && (
            <ActionButton className="btn btn-primary" action={siteReportToCountAction.bind(null, r.id)} confirm={`Stok fərqi olan ${stockDiffs} material üçün sahə anbarında qaralama sayım yaradılsın? Anbar müdiri təsdiq edənə qədər qalıq dəyişmir.`}>
              Stok fərqini sayım sənədinə çevir
            </ActionButton>
          )}
        </>}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className={`alert ${stockDiffs ? "alert-bad" : "alert-ok"}`}><b>Stok:</b> {stockDiffs ? `${stockDiffs} materialda sistemlə fərq var` : "sistemlə uyğundur"}</div>
        <div className={`alert ${workerDiffs ? "alert-warn" : "alert-ok"}`}><b>İşçilərdə:</b> {workerDiffs ? `${workerDiffs} materialda fərq — qeyd olunmamış təhvil və ya qaytarma ola bilər` : "sistemlə uyğundur"}</div>
        {r.notes ? <div className="alert alert-info"><b>Qeyd:</b> {r.notes}</div> : <div />}
      </div>
      <Card pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="num">Stok: sahə</th><th className="num">Stok: sistem</th><th className="num">Fərq</th><th className="num">İşçilərdə: sahə</th><th className="num">İşçilərdə: sistem</th><th className="num">Fərq</th><th>Qeyd</th></tr></thead>
            <tbody>{r.lines.map((l) => {
              const v = opts.get(l.variantId);
              const ds = l.stockQty.toNumber() - l.systemStock.toNumber();
              const dw = l.withWorkersQty.toNumber() - l.systemWithWorkers.toNumber();
              return (
                <tr key={l.id}>
                  <td>{v ? <Link className="link" href={`/stock/${v.id}`}>{v.name}{v.size ? ` · ${v.size}` : ""}</Link> : "—"}<div className="text-xs text-muted">{v?.sku}</div></td>
                  <td className="num font-semibold">{fmtQty(l.stockQty)}</td><td className="num">{fmtQty(l.systemStock)}</td>
                  <td className="num">{ds === 0 ? <Badge tone="ok">0</Badge> : <Badge tone="bad">{sign(ds)}</Badge>}</td>
                  <td className="num font-semibold">{fmtQty(l.withWorkersQty)}</td><td className="num">{fmtQty(l.systemWithWorkers)}</td>
                  <td className="num">{dw === 0 ? <Badge tone="ok">0</Badge> : <Badge tone="warn">{sign(dw)}</Badge>}</td>
                  <td className="text-xs">{l.note}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      {workerFix.length > 0 && canFix && site && (
        <Card title="İşçilərdəki fərqi düzəlt" className="no-print mt-4" pad={false}>
          <p className="px-4 pt-3 text-xs text-muted">
            Sahədə işçilərdə <b>az</b> sayılıbsa — kimdəsə geri qaytarılıb və ya itib: həmin işçidən “Geri al” edin (itibsə / yararsızdırsa vəziyyəti <b>qüsurlu</b> seçin — karantinə düşür, sonra oradan silinir).
            Sahədə <b>çox</b> sayılıbsa — qeyd olunmamış təhvil var: “İşçiyə təhvil” edin.
          </p>
          <ul className="divide-y divide-line">
            {workerFix.map(({ l, v, dw }) => {
              const who = holdings.filter((h) => h.sku === v!.sku);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><b>{v!.name}{v!.size ? ` · ${v!.size}` : ""}</b> — fərq <Badge tone="warn">{sign(dw)}</Badge></span>
                  {dw > 0 ? (
                    <Link className="btn btn-sm" href={`/movements/new?kind=ISSUE_EMPLOYEE&wh=${site.id}`}>İşçiyə təhvil qeyd et</Link>
                  ) : who.length === 0 ? (
                    <span className="text-xs text-muted">Sistemdə bu material heç bir işçidə görünmür.</span>
                  ) : (
                    who.map((h) => <Link key={h.employeeId} className="btn btn-sm" href={`/movements/new?kind=RETURN_FROM_EMPLOYEE&employee=${h.employeeId}&wh=${site.id}`}>{h.fullName} ({fmtQty(h.qty)}) — geri al</Link>)
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted">Sistem rəqəmləri hesabatın daxil edildiyi anda yadda saxlanılıb, sonrakı hərəkətlər bu müqayisəni dəyişmir.</p>
    </>
  );
}
