import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty } from "@/lib/format";
import { Card, Empty, Kpi, PageHeader } from "@/components/ui";
import { dashboardKpis, lowStock, recentMovements, topIssuedMaterials } from "@/server/services/reports";

export const metadata = { title: "İdarə paneli" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const me = await getSessionUser();
  // a client only ever sees their own project: start on its site page
  if (me?.role === "CLIENT") redirect(me.projectId ? `/sites/${me.projectId}` : "/sites");
  const user = await requirePage("dashboard.view");
  const canMr = can(user.role, "mr.create");
  const pendingMr = await db.materialRequest.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } });
  const [k, low, recent, top] = await Promise.all([dashboardKpis(), lowStock(8), recentMovements(10), topIssuedMaterials(90, 8)]);
  const isEmpty = k.uniqueSkus === 0 && recent.length === 0;
  return (
    <>
      <PageHeader title={az.nav.dashboard} subtitle="Bütün rəqəmlər təsdiqlənmiş anbar jurnalından hesablanır (karantin anbarı istisna)." />
      {isEmpty && (
        <div className="alert alert-info mb-4">
          Sistemdə hələ təsdiqlənmiş hərəkət yoxdur. Başlamaq üçün: <Link className="link" href="/catalog/new">material əlavə edin</Link> və ya{" "}
          <Link className="link" href="/import">Excel-dən import edin</Link>, sonra <Link className="link" href="/inventory/new">ilkin inventarlaşdırma</Link> sənədini təsdiqləyin.
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Stokda unikal SKU" value={k.uniqueSkus} href="/stock?pos=1" />
        <Kpi label="Fiziki qalıq (cəmi vahid)" value={fmtQty(k.onHand)} hint="Bütün normal anbarlar" href="/stock" />
        <Kpi label="Təsdiq gözləyən MR" value={pendingMr} href="/mr" tone={pendingMr > 0 ? "warn" : "default"} />
        <Kpi label="Kritik stok" value={k.critical} tone={k.critical > 0 ? "warn" : "default"} hint="Mövcud ≤ minimum" href="/stock?status=low" />
        <Kpi label="Gözlənilən sifariş (PO)" value={k.openPoCount} hint={`${fmtQty(k.openPoQty)} vahid gözlənilir`} href="/po?status=open" />
        <Kpi label="Bu ay qəbul (GRN)" value={fmtQty(k.receivedThisMonth)} href="/journal?type=RECEIPT" />
        <Kpi label="Bu ay layihələrə (xalis)" value={fmtQty(k.issuedToProjectsThisMonth)} href="/projects" />
        <Kpi label="Ən çox verilən (90 gün)" value={top[0] ? top[0].name : "—"} hint={top[0] ? `${fmtQty(top[0].qty)} ${top[0].unit}` : "Məlumat yoxdur"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Son hərəkətlər" className="xl:col-span-2" pad={false} actions={<Link href="/journal" className="btn btn-sm">Hamısı</Link>}>
          {recent.length === 0 ? (
            <Empty title="Hərəkət yoxdur" hint="Təsdiqlənmiş mədaxil, məxaric və sayımlar burada görünəcək." />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>Material</th><th>Anbar</th><th className="num">Miqdar</th></tr></thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={String(r.id)}>
                      <td>{fmtDate(r.movementDate)}</td>
                      <td>{az.entryType[r.entryType as keyof typeof az.entryType]}</td>
                      <td className="font-semibold">{r.docNumber}</td>
                      <td>{r.sku} · {r.name}{r.size ? ` (${r.size})` : ""}{r.project ? <span className="text-muted"> → {r.project}</span> : null}</td>
                      <td>{r.warehouse}</td>
                      <td className="num">{fmtQty(r.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Aşağı qalıq xəbərdarlığı" pad={false} actions={<>{low.length > 0 && canMr && <Link href="/mr/new?low=1" className="btn btn-sm btn-primary">MR yarat</Link>}<Link href="/stock?status=low" className="btn btn-sm">Hamısı</Link></>}>
            {low.length === 0 ? (
              <Empty title="Kritik material yoxdur" hint="Minimum ehtiyat təyin edilmiş materiallar mövcud qalıq minimuma çatanda burada görünür." />
            ) : (
              <ul className="divide-y divide-line">
                {low.map((r) => (
                  <li key={r.variantId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <Link href={`/stock/${r.variantId}`} className="min-w-0 truncate hover:underline">{r.name}{r.size ? ` · ${r.size}` : ""}</Link>
                    <span className={`whitespace-nowrap tabular-nums font-semibold ${Number(r.avail) <= 0 ? "text-bad" : "text-warn"}`}>{fmtQty(r.avail)} / {fmtQty(r.min)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Ən çox istifadə olunan (90 gün)" pad={false}>
            {top.length === 0 ? (
              <Empty title="Məxaric yoxdur" />
            ) : (
              <ul className="divide-y divide-line">
                {top.map((r) => (
                  <li key={r.sku} className="flex justify-between gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 truncate">{r.name}{r.size ? ` · ${r.size}` : ""}</span>
                    <span className="tabular-nums font-semibold">{fmtQty(r.qty)} {r.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
