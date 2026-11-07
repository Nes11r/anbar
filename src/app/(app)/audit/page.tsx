import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime, sp } from "@/lib/format";
import { Card, Empty, PageHeader, Pagination } from "@/components/ui";
import { SearchBox, UrlSelect } from "@/components/client/search-box";

export const metadata = { title: "Audit jurnalı" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("audit.view");
  const s = await searchParams;
  const params = { q: sp(s.q), entity: sp(s.entity), action: sp(s.action) };
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.AuditLogWhereInput = {};
  if (params.entity) where.entityType = params.entity;
  if (params.action) where.action = params.action;
  if (params.q) where.OR = [{ summary: { contains: params.q, mode: "insensitive" } }, { userEmail: { contains: params.q, mode: "insensitive" } }, { entityId: params.q }];
  const [total, rows, entities, actions] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * 100, take: 100 }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true } }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true } }),
  ]);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="Audit jurnalı" subtitle="Kim, nə vaxt, nəyi dəyişib. Jurnal dəyişdirilə və silinə bilməz (DB trigger)." />
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchBox placeholder="Xülasə, e-poçt, qeyd ID" />
          <UrlSelect name="entity" label="Obyekt" value={params.entity} options={[["", "Bütün obyektlər"], ...entities.map((e) => [e.entityType, e.entityType] as [string, string])]} />
          <UrlSelect name="action" label="Əməliyyat" value={params.action} options={[["", "Bütün əməliyyatlar"], ...actions.map((a) => [a.action, a.action] as [string, string])]} />
        </div>
        {rows.length === 0 ? <Empty title="Qeyd yoxdur" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Vaxt</th><th>İstifadəçi</th><th>Əməliyyat</th><th>Obyekt</th><th>Xülasə</th><th>IP</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={String(r.id)}><td className="whitespace-nowrap">{fmtDateTime(r.at)}</td><td>{r.userEmail ?? "sistem"}</td><td className="font-semibold">{r.action}</td><td className="text-xs">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td><td className="max-w-[520px] text-xs">{r.summary}</td><td className="text-xs text-muted">{r.ip}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={100} total={total} params={clean} />
      </Card>
    </>
  );
}
