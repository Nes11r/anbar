import Link from "next/link";
import type { POStatus, Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty, sp } from "@/lib/format";
import { Card, Empty, FilterChips, PageHeader, Pagination, PoStatusBadge } from "@/components/ui";
import { SearchBox } from "@/components/client/search-box";

export const metadata = { title: "Satınalma sifarişləri" };
export const dynamic = "force-dynamic";

export default async function POList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("po.view");
  const s = await searchParams;
  const params = { q: sp(s.q), status: sp(s.status) };
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (params.status === "open") where.status = { in: ["APPROVED", "PARTIALLY_RECEIVED"] };
  else if (params.status in az.poStatus) where.status = params.status as POStatus;
  if (params.q) where.OR = [{ poNumber: { contains: params.q, mode: "insensitive" } }, { supplier: { name: { contains: params.q, mode: "insensitive" } } }];
  const [total, rows] = await Promise.all([
    db.purchaseOrder.count({ where }),
    db.purchaseOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { supplier: true, mr: { select: { mrNumber: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true } } } }),
  ]);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="Satınalma sifarişləri (PO)" actions={<><a className="btn" href="/api/export/po-status" download>Qəbul statusları (Excel)</a>{can(user.role, "po.override") && <Link href="/po/new" className="btn">+ MR-siz PO</Link>}</>} subtitle="PO təsdiqlənmiş MR-dan yaradılır (MR səhifəsində “PO yarat”)." />
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <SearchBox placeholder="PO №, tədarükçü" />
          <FilterChips name="status" value={params.status} params={clean} options={[["", "Hamısı"], ["DRAFT", "Qaralama"], ["open", "Qəbul gözləyən"], ["RECEIVED", "Tam qəbul"], ["CANCELLED", "Ləğv"]]} />
        </div>
        {rows.length === 0 ? <Empty title="PO yoxdur" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>PO №</th><th>Tədarükçü</th><th>MR</th><th>Tarix</th><th>Gözlənilən</th><th className="num">Sifariş</th><th className="num">Qəbul</th><th>Status</th></tr></thead>
              <tbody>{rows.map((p) => {
                const o = p.lines.reduce((a, l) => a + Number(l.qtyOrdered), 0), r = p.lines.reduce((a, l) => a + Number(l.qtyReceived), 0);
                return (
                  <tr key={p.id}><td><Link className="link" href={`/po/${p.id}`}>{p.poNumber}</Link></td><td>{p.supplier.name}</td><td>{p.mr?.mrNumber ?? "—"}</td><td>{fmtDate(p.orderDate)}</td><td>{fmtDate(p.expectedDate)}</td><td className="num">{fmtQty(o)}</td><td className="num">{fmtQty(r)}</td><td><PoStatusBadge status={p.status} /></td></tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={50} total={total} params={clean} />
      </Card>
    </>
  );
}
