import Link from "next/link";
import type { Prisma, StockDocKind } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, Empty, FilterChips, PageHeader, Pagination } from "@/components/ui";
import { SearchBox } from "@/components/client/search-box";

export const metadata = { title: "Mədaxil / Məxaric" };
export const dynamic = "force-dynamic";

const KINDS = Object.keys(az.stockDocKind) as StockDocKind[];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("stockdoc.view");
  const s = await searchParams;
  const params = { kind: sp(s.kind), status: sp(s.status), q: sp(s.q) };
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.StockDocumentWhereInput = {};
  if (KINDS.includes(params.kind as StockDocKind)) where.kind = params.kind as StockDocKind;
  if (params.status) where.status = params.status as never;
  if (params.q) where.OR = [{ number: { contains: params.q, mode: "insensitive" } }, { recipientName: { contains: params.q, mode: "insensitive" } }, { externalRef: { contains: params.q, mode: "insensitive" } }];
  const [total, rows, projects, employees, whs] = await Promise.all([
    db.stockDocument.count({ where }),
    db.stockDocument.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { _count: { select: { lines: true } } } }),
    db.project.findMany({ select: { id: true, code: true } }),
    db.employee.findMany({ select: { id: true, fullName: true } }),
    db.warehouse.findMany({ select: { id: true, name: true } }),
  ]);
  const pm = new Map(projects.map((p) => [p.id, p.code]));
  const em = new Map(employees.map((e) => [e.id, e.fullName]));
  const wm = new Map(whs.map((w) => [w.id, w.name]));
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const canEdit = can(user.role, "stockdoc.edit");
  return (
    <>
      <PageHeader print={["Tərtib etdi", "Yoxladı", "Təsdiq etdi"]}
        viewOnly={{ role: user.role, perm: "stockdoc.edit", action: "mədaxil/məxaric sənədi yaratmaq və təsdiqləmək" }}
        title="Mədaxil / Məxaric sənədləri"
        subtitle="Layihəyə ümumi məxaric və işçiyə PPE təhvili ayrı əməliyyat növləridir — eyni ədəd iki dəfə çıxılmır."
        actions={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/movements/new?kind=ISSUE_PROJECT">+ Layihəyə məxaric</Link>
            <Link className="btn btn-primary" href="/movements/new?kind=ISSUE_EMPLOYEE">+ İşçiyə PPE</Link>
            <Link className="btn" href="/movements/new?kind=RETURN_FROM_PROJECT">Layihədən qaytarma</Link>
            <Link className="btn" href="/movements/new?kind=RETURN_FROM_EMPLOYEE">İşçidən geri alma</Link>
            <Link className="btn" href="/movements/new?kind=TRANSFER">Köçürmə</Link>
            <Link className="btn" href="/movements/new?kind=ADJUSTMENT">Düzəliş</Link>
            <Link className="btn" href="/movements/new?kind=RETURN_TO_SUPPLIER">Tədarükçüyə qaytarma</Link>
          </div>
        )}
      />
      <p className="mb-3 text-xs text-muted">Tədarükçüdən mədaxil yalnız <Link className="link" href="/grn">Mal qəbulu (GRN)</Link> ilə, açılış qalığı isə <Link className="link" href="/inventory">İnventarlaşdırma</Link> ilə daxil olur.</p>
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <SearchBox placeholder="Sənəd №, təhvil alan, xarici sənəd" />
          <FilterChips name="kind" value={params.kind} params={clean} options={[["", "Bütün növlər"], ...KINDS.map((k) => [k, az.stockDocKind[k]] as [string, string])]} />
          <FilterChips name="status" value={params.status} params={clean} options={[["", "Bütün statuslar"], ["DRAFT", "Qaralama"], ["POSTED", "Təsdiqlənib"], ["REVERSED", "Geri qaytarılıb"], ["CANCELLED", "Ləğv"]]} />
        </div>
        {rows.length === 0 ? <Empty title="Sənəd yoxdur" hint="Yuxarıdakı düymələrlə yeni əməliyyat yaradın." /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>№</th><th>Növ</th><th>Tarix</th><th>Anbar</th><th>Layihə / işçi / təyinat</th><th>Təhvil alan</th><th className="num">Sətir</th><th>Status</th></tr></thead>
              <tbody>{rows.map((d) => (
                <tr key={d.id}>
                  <td><Link className="link" href={`/movements/${d.id}`}>{d.number}</Link>{d.reversalOfId && <span className="ml-1 text-xs text-muted">(ləğv sənədi)</span>}</td>
                  <td>{az.stockDocKind[d.kind]}</td><td>{fmtDate(d.docDate)}</td><td>{wm.get(d.warehouseId)}</td>
                  <td>{[d.projectId && pm.get(d.projectId), d.employeeId && em.get(d.employeeId), d.toWarehouseId && `→ ${wm.get(d.toWarehouseId)}`].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{d.recipientName ?? "—"}</td><td className="num">{d._count.lines}</td><td><DocStatusBadge status={d.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={50} total={total} params={clean} />
      </Card>
    </>
  );
}
