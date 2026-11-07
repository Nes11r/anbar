import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { fmtQty, sp } from "@/lib/format";
import { Badge, Card, Empty, FilterChips, GroupBadge, PageHeader, Pagination } from "@/components/ui";
import { SearchBox, UrlSelect } from "@/components/client/search-box";
import { listMaterials } from "@/server/services/catalog";

export const metadata = { title: "Material kataloqu" };
export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("catalog.view");
  const s = await searchParams;
  const params = { q: sp(s.q), cat: sp(s.cat), group: sp(s.group), active: sp(s.active), sort: sp(s.sort) };
  const page = Number(sp(s.page)) || 1;
  const [data, cats] = await Promise.all([
    listMaterials({ q: params.q, categoryId: params.cat || undefined, group: (params.group || undefined) as never, active: (params.active || "1") as never, sort: (params.sort || "code") as never, page }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const canManage = can(user.role, "catalog.manage");
  return (
    <>
      <PageHeader
        title="Material kataloqu"
        subtitle="Məhsul ailəsi → ölçü variantları (hər ölçü ayrıca SKU və qalıq)."
        actions={
          <>
            <a className="btn" href={`/api/export/catalog?${new URLSearchParams(clean)}`}>Excel export</a>
            {canManage && <Link className="btn btn-primary" href="/catalog/new">+ Yeni material</Link>}
          </>
        }
      />
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <div className="flex flex-wrap gap-2">
            <SearchBox placeholder="Ad, kod, model, SKU, barkod…" />
            <UrlSelect name="cat" label="Kateqoriya" value={params.cat} options={[["", "Bütün kateqoriyalar"], ...cats.map((c) => [c.id, c.nameAz] as [string, string])]} />
            <UrlSelect name="sort" label="Sıralama" value={params.sort} options={[["", "Koda görə"], ["name", "Ada görə"], ["updated", "Son dəyişən"]]} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <FilterChips name="group" value={params.group} params={clean} options={[["", "Hamısı"], ["ENGINEER", "Mühəndis"], ["WORKER", "Fəhlə"], ["BOTH", "Hər ikisi"], ["NOT_APPLICABLE", "Tətbiq edilmir"]]} />
            <FilterChips name="active" value={params.active} params={clean} options={[["", "Aktiv"], ["0", "Arxiv"], ["all", "Hamısı"]]} />
          </div>
          {(params.group === "ENGINEER" || params.group === "WORKER") && <p className="text-xs text-muted">“Hər ikisi” təyinatlı materiallar da göstərilir.</p>}
        </div>
        {data.rows.length === 0 ? (
          <Empty title="Material tapılmadı" hint="Filtrləri dəyişin və ya yeni material əlavə edin / Excel-dən import edin." action={canManage ? <Link className="btn btn-primary" href="/catalog/new">+ Yeni material</Link> : undefined} />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Kod</th><th>Material</th><th>Kateqoriya</th><th>Təyinat</th><th>Orijinal kod</th><th>Ölçülər</th><th className="num">Qalıq</th><th>Vahid</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.rows.map((m) => {
                  const qty = m.variants.reduce((a, v) => a + v.balances.reduce((b, x) => b + Number(x.onHand), 0), 0);
                  return (
                    <tr key={m.id}>
                      <td><Link className="link" href={`/catalog/${m.id}`}>{m.code}</Link></td>
                      <td>
                        <div className="font-semibold">{m.nameAz}</div>
                        {(m.model || m.brand) && <div className="text-xs text-muted">{[m.brand, m.model].filter(Boolean).join(" · ")}</div>}
                      </td>
                      <td className="mob-hide">{m.category.nameAz}</td>
                      <td><GroupBadge group={m.workerGroup} /></td>
                      <td className="text-xs mob-hide">{m.originalCode ?? "—"}</td>
                      <td className="max-w-[260px] text-xs">{m.variants.filter((v) => v.size).map((v) => v.size).join(", ") || "—"}</td>
                      <td className="num font-semibold">{fmtQty(qty)}</td>
                      <td className="mob-hide">{m.unit.labelAz}</td>
                      <td>{m.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge tone="muted">Arxiv</Badge>}{m.sourceConfidence === "LOW" && <span className="ml-1"><Badge tone="warn">Import: yoxlanmalı</Badge></span>}</td>
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
