import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, Empty, FilterChips, PageHeader, Pagination } from "@/components/ui";

export const metadata = { title: "Mal qəbulu" };
export const dynamic = "force-dynamic";

export default async function GRNList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("grn.view");
  const s = await searchParams;
  const status = sp(s.status);
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.GoodsReceiptWhereInput = status ? { status: status as never } : {};
  const [total, rows, openPos] = await Promise.all([
    db.goodsReceipt.count({ where }),
    db.goodsReceipt.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { po: { include: { supplier: true } }, _count: { select: { lines: true } } } }),
    db.purchaseOrder.findMany({ where: { status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } }, orderBy: { expectedDate: "asc" }, take: 20, include: { supplier: true } }),
  ]);
  const whs = new Map((await db.warehouse.findMany()).map((w) => [w.id, w.name]));
  return (
    <>
      <PageHeader title="Mal qəbulu (GRN)" subtitle="Fiziki qəbul təsdiqləndikdə (POSTED) stok avtomatik artır. Eyni GRN-in təkrar təsdiqi ikiqat mədaxil yaratmır." />
      {openPos.length > 0 && (
        <Card title="Qəbul gözləyən sifarişlər" className="mb-4" pad={false}>
          <ul className="divide-y divide-line">{openPos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><Link className="link" href={`/po/${p.id}`}>{p.poNumber}</Link> · {p.supplier.name} · gözlənilən {fmtDate(p.expectedDate)}</span>
              <Link className="btn btn-sm btn-brand" href={`/grn/new?po=${p.id}`}>Qəbul et</Link>
            </li>
          ))}</ul>
        </Card>
      )}
      <Card pad={false}>
        <div className="border-b border-line p-3"><FilterChips name="status" value={status} params={status ? { status } : {}} options={[["", "Hamısı"], ["DRAFT", "Qaralama"], ["POSTED", "Təsdiqlənib"], ["REVERSED", "Ləğv edilib"], ["CANCELLED", "Ləğv (qaralama)"]]} /></div>
        {rows.length === 0 ? <Empty title="GRN yoxdur" hint="Təsdiqlənmiş PO üzrə “Qəbul et” düyməsi ilə başlayın." /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>GRN</th><th>PO</th><th>Tədarükçü</th><th>Anbar</th><th>Tarix</th><th>Qəbul edən</th><th className="num">Sətir</th><th>Status</th></tr></thead>
              <tbody>{rows.map((g) => (
                <tr key={g.id}><td><Link className="link" href={`/grn/${g.id}`}>{g.grnNumber}</Link></td><td>{g.po.poNumber}</td><td>{g.po.supplier.name}</td><td>{whs.get(g.warehouseId)}</td><td>{fmtDate(g.receivedDate)}</td><td>{g.receiverName}</td><td className="num">{g._count.lines}</td><td><DocStatusBadge status={g.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={50} total={total} params={status ? { status } : {}} />
      </Card>
    </>
  );
}
