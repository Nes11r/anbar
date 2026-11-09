import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { fmtQty, sp } from "@/lib/format";
import { Card, Empty, FilterChips, GroupBadge, PageHeader, Pagination, StockStatus } from "@/components/ui";
import { SearchBox, UrlSelect } from "@/components/client/search-box";
import { stockList } from "@/server/services/reports";

export const metadata = { title: "Anbar qalığı" };
export const dynamic = "force-dynamic";

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("stock.view");
  const s = await searchParams;
  const params = { q: sp(s.q), wh: sp(s.wh), cat: sp(s.cat), group: sp(s.group), size: sp(s.size), status: sp(s.status), pos: sp(s.pos) };
  const page = Number(sp(s.page)) || 1;
  const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const [data, whs, cats] = await Promise.all([
    stockList({ q: params.q, warehouseId: uuid(params.wh), categoryId: uuid(params.cat), group: params.group, size: params.size, status: params.status as never, onlyPositive: params.pos === "1", page }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  // defective goods wait in quarantine: give a clear way to write them off (or send back to the supplier)
  const quarantine = await db.$queryRaw<{ id: string; name: string; q: string }[]>`
    SELECT w.id::text AS id, w.name, SUM(b."onHand")::text AS q FROM stock_balances b JOIN warehouses w ON w.id = b."warehouseId"
    WHERE w.type = 'QUARANTINE' AND b."onHand" > 0 GROUP BY w.id, w.name`;
  return (
    <>
      {quarantine.length > 0 && can(user.role, "stockdoc.edit") && (
        <div className="alert alert-warn no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1"><b>Karantində qüsurlu mal var:</b> {quarantine.map((x) => `${x.name} — ${fmtQty(x.q)} vahid`).join("; ")}. Yararsızdırsa silin, ya da tədarükçüyə qaytarın.</span>
          {quarantine.map((x) => (
            <span key={x.id} className="flex gap-2">
              <Link className="btn btn-sm" href={`/stock?wh=${x.id}`}>Bax</Link>
              <Link className="btn btn-sm" href={`/movements/new?kind=ADJUSTMENT&wh=${x.id}`}>Yararsızı sil</Link>
              <Link className="btn btn-sm" href={`/movements/new?kind=RETURN_TO_SUPPLIER&wh=${x.id}`}>Tədarükçüyə qaytar</Link>
            </span>
          ))}
        </div>
      )}
      <PageHeader print={["Anbardar", "Anbar müdiri"]}
        viewOnly={{ role: user.role, perm: "stockdoc.edit", action: "qalığı dəyişmək (yalnız mədaxil/məxaric sənədləri ilə)" }}
        title="Anbar qalığı"
        subtitle="Hər material üzrə: harada nə qədər var (ofis və sahə anbarları). Mövcud = fiziki qalıq − rezerv. İşçilərə verilənlər bura daxil deyil — onlar “Sahə anbarları”nda görünür."
        actions={
          <>
            {params.status === "low" && can(user.role, "mr.create") && <Link className="btn btn-primary" href="/mr/new?low=1">Azalanlar üçün MR yarat</Link>}
            <a className="btn" href={`/api/export/stock?${new URLSearchParams(clean)}`}>Excel</a>
            <a className="btn" href={`/api/export/stock?${new URLSearchParams({ ...clean, format: "csv" })}`}>CSV</a>
          </>
        }
      />
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <div className="flex flex-wrap gap-2">
            <SearchBox placeholder="Ad, SKU, model, kod…" />
            <UrlSelect name="wh" label="Anbar" value={params.wh} options={[["", "Bütün normal anbarlar"], ...whs.map((w) => [w.id, `${w.name}${w.type === "QUARANTINE" ? " (karantin)" : ""}`] as [string, string])]} />
            <UrlSelect name="cat" label="Kateqoriya" value={params.cat} options={[["", "Bütün kateqoriyalar"], ...cats.map((c) => [c.id, c.nameAz] as [string, string])]} />
            <form className="flex gap-1">
              {Object.entries(clean).filter(([k]) => k !== "size").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input name="size" defaultValue={params.size} className="input w-24" placeholder="Ölçü" aria-label="Ölçü filtri" />
              <button className="btn">Filtr</button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <FilterChips name="group" value={params.group} params={clean} options={[["", "Hamısı"], ["ENGINEER", "Mühəndis"], ["WORKER", "Fəhlə"], ["BOTH", "Hər ikisi"]]} />
            <FilterChips name="status" value={params.status} params={clean} options={[["", "Bütün statuslar"], ["low", "Azdır"], ["out", "Bitib"]]} />
            <FilterChips name="pos" value={params.pos} params={clean} options={[["", "Sıfırlar daxil"], ["1", "Yalnız qalığı olan"]]} />
          </div>
        </div>
        {data.rows.length === 0 ? (
          <Empty title="Nəticə yoxdur" hint="Filtrləri dəyişin. Qalıq yaratmaq üçün ilkin inventarlaşdırma və ya mal qəbulu (GRN) sənədini təsdiqləyin." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SKU</th><th>Material</th><th>Ölçü</th><th>Kateqoriya</th><th>Təyinat</th><th className="num">Fiziki</th><th className="num">Rezerv</th><th className="num">Mövcud</th><th className="num">Min.</th><th>Vahid</th><th>Harada</th><th>Vəziyyət</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const avail = Number(r.onhand) - Number(r.reserved);
                  return (
                    <tr key={r.variantId}>
                      <td><Link className="link" href={`/stock/${r.variantId}`}>{r.sku}</Link></td>
                      <td><div className="font-semibold">{r.name}</div>{r.model && <div className="text-xs text-muted">{r.model}</div>}</td>
                      <td className="font-semibold">{r.size || "—"}</td>
                      <td className="mob-hide">{r.category}</td>
                      <td><GroupBadge group={r.workerGroup} /></td>
                      <td className="num mob-hide">{fmtQty(r.onhand)}</td>
                      <td className="num mob-hide">{fmtQty(r.reserved)}</td>
                      <td className="num font-bold"><span>{fmtQty(avail)}<span className="md:hidden"> {r.unit}</span></span></td>
                      <td className="num text-muted mob-hide">{fmtQty(r.min)}</td>
                      <td className="mob-hide">{r.unit}</td>
                      <td className="text-xs">{r.locations ?? "—"}</td>
                      <td><StockStatus avail={avail} min={Number(r.min)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} params={clean} />
      </Card>
    </>
  );
}
