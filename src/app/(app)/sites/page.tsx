import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can, scopeProjectId } from "@/lib/rbac";
import { fmtDate, fmtQty } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { siteOverview } from "@/server/services/sites";

export const metadata = { title: "Sahə anbarları" };
export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const user = await requirePage("site.view");
  const rows = await siteOverview(scopeProjectId(user));
  const daysAgo = (d: Date | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400_000) : null);
  return (
    <>
      <PageHeader print={["Anbar müdiri", "Rəhbər"]}
        viewOnly={{ role: user.role, perm: "site.report", action: "gündəlik sahə hesabatını daxil etmək" }}
        title="Sahə anbarları"
        subtitle="Hər layihənin sahəsində materialın cəmi: sahə anbarında stokda + işçilərin üzərində. Sahədən gələn tələbi bura baxıb yoxlayın."
        actions={can(user.role, "stockdoc.edit") && !scopeProjectId(user) && <Link className="btn btn-primary" href="/movements/new?kind=TRANSFER">+ Ofisdən sahəyə göndər</Link>}
      />
      {user.role === "CLIENT" && !user.projectId ? (
        <div className="alert alert-info">Hesabınız hələ layihəyə bağlanmayıb. Administrator layihənizi seçdikdən sonra yalnız öz layihənizin məlumatlarını görəcəksiniz.</div>
      ) : rows.length === 0 ? (
        <Card><Empty title="Layihə yoxdur" hint="Layihə yaradılanda onun sahə anbarı avtomatik açılır." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const age = daysAgo(r.lastReport);
            return (
              <Link key={r.projectId} href={`/sites/${r.projectId}`} className="card block p-4 transition hover:-translate-y-px">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold">{r.code}</div>
                    <div className="truncate text-sm text-muted">{r.name}</div>
                  </div>
                  {r.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Bağlı</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[11px] font-semibold text-muted">Sahədə cəmi</div><div className="text-xl font-bold tabular-nums">{fmtQty(r.total)}</div></div>
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[11px] font-semibold text-muted">İşçilərdə</div><div className="text-xl font-bold tabular-nums text-brand">{fmtQty(r.withWorkers)}</div></div>
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[11px] font-semibold text-muted">Stokda</div><div className="text-xl font-bold tabular-nums text-ok">{fmtQty(r.inStock)}</div></div>
                </div>
                <div className="mt-3 flex justify-between text-xs text-muted">
                  <span>{r.workers} işçidə material var</span>
                  <span className={age == null || age > 1 ? "font-semibold text-warn" : ""}>{r.lastReport ? `Son hesabat: ${fmtDate(r.lastReport)}` : "Hesabat yoxdur"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
