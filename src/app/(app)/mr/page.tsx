import Link from "next/link";
import type { MRStatus, Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtMoney, sp } from "@/lib/format";
import { Badge, Card, Empty, FilterChips, PageHeader, Pagination } from "@/components/ui";
import { SearchBox } from "@/components/client/search-box";
import { StageBadge } from "@/components/timeline";
import { mrListStage } from "@/server/services/tracking";
import { isLeadership, scopeProjectId } from "@/lib/rbac";

export const metadata = { title: "Material tələbləri" };
export const dynamic = "force-dynamic";

export default async function MRList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("mr.view");
  const s = await searchParams;
  const params = { q: sp(s.q), status: sp(s.status), mine: sp(s.mine) };
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.MaterialRequestWhereInput = {};
  const scope = scopeProjectId(user);
  if (scope) where.projectId = scope;
  if (params.status === "pending") where.status = { in: ["SUBMITTED", "UNDER_REVIEW"] };
  else if (params.status && params.status in az.mrStatus) where.status = params.status as MRStatus;
  if (params.q) where.OR = [{ mrNumber: { contains: params.q, mode: "insensitive" } }, { requesterName: { contains: params.q, mode: "insensitive" } }];
  if (params.mine === "approve") where.approvals = { some: { decision: "PENDING", ...(isLeadership(user.role) ? {} : { allowedRoles: { has: user.role } }) } };
  const [total, rows, projects] = await Promise.all([
    db.materialRequest.count({ where }),
    db.materialRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { _count: { select: { lines: true } }, approvals: { where: { decision: "PENDING" }, orderBy: { step: "asc" }, take: 1 }, orders: { select: { status: true, paymentStatus: true, shippedAt: true } } } }),
    db.project.findMany({ select: { id: true, code: true } }),
  ]);
  const pm = new Map(projects.map((p) => [p.id, p.code]));
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="Material tələbləri (MR)" subtitle="MR və PO yaradılması qalığı artırmır — stok yalnız təsdiqlənmiş mal qəbulu (GRN) ilə artır." actions={can(user.role, "mr.create") && <Link href="/mr/new" className="btn btn-primary">+ Yeni MR</Link>} />
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <SearchBox placeholder="MR №, tələb edən" />
          <div className="flex flex-wrap gap-4">
            <FilterChips name="status" value={params.status} params={clean} options={[["", "Hamısı"], ["DRAFT", "Qaralama"], ["pending", "Təsdiqdə"], ["RETURNED", "Qaytarılıb"], ["APPROVED", "Təsdiqlənib"], ["PARTIALLY_ORDERED", "Qismən sifariş"], ["DELIVERED", "Çatdırılıb"], ["REJECTED", "Rədd"]]} />
            <FilterChips name="mine" value={params.mine} params={clean} options={[["", "Bütün"], ["approve", "Mənim təsdiqimi gözləyən"]]} />
          </div>
        </div>
        {rows.length === 0 ? <Empty title="MR yoxdur" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>MR №</th><th>Rev.</th><th>Layihə</th><th>Tarix</th><th>RoS</th><th>Prioritet</th><th>Tələb edən</th><th className="num">Sətir</th><th className="num">Təxmini dəyər</th><th>Vəziyyət (izləmə)</th></tr></thead>
              <tbody>{rows.map((m) => (
                <tr key={m.id}>
                  <td><Link className="link" href={`/mr/${m.id}`}>{m.mrNumber}</Link></td><td>{m.revision}</td><td>{pm.get(m.projectId)}</td><td>{fmtDate(m.dateRaised)}</td><td>{fmtDate(m.requiredOnSiteDate)}</td>
                  <td>{m.priority === "NORMAL" ? az.priority.NORMAL : <Badge tone={m.priority === "EMERGENCY" ? "bad" : "warn"}>{az.priority[m.priority]}</Badge>}</td>
                  <td>{m.requesterName}</td><td className="num">{m._count.lines}</td><td className="num">{fmtMoney(m.estimatedValue, m.currency)}</td><td><Link href={`/mr/${m.id}`}><StageBadge {...mrListStage(m, m.approvals[0]?.roleLabel)} /></Link></td>
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
