import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, Empty, FilterChips, PageHeader } from "@/components/ui";

export const metadata = { title: "İlkin inventarlaşdırma" };
export const dynamic = "force-dynamic";

export default async function InventoryList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("inventory.edit");
  const s = await searchParams;
  const status = sp(s.status);
  const rows = await db.inventoryCount.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { lines: true } } },
  });
  const whs = new Map((await db.warehouse.findMany()).map((w) => [w.id, w.name]));
  return (
    <>
      <PageHeader title="İlkin inventarlaşdırma və sayımlar" subtitle="Açılış qalıqları və dövri sayımlar. Qalıq yalnız təsdiq zamanı jurnala yazılır." actions={<Link href="/inventory/new" className="btn btn-primary">+ Yeni sayım</Link>} />
      <Card pad={false}>
        <div className="border-b border-line p-3"><FilterChips name="status" value={status} params={status ? { status } : {}} options={[["", "Hamısı"], ["DRAFT", "Qaralama"], ["POSTED", "Təsdiqlənib"], ["CANCELLED", "Ləğv"]]} /></div>
        {rows.length === 0 ? <Empty title="Sayım sənədi yoxdur" hint="İlkin qalıqları daxil etmək üçün yeni sayım yaradın və ya Excel-dən “İnventar qalığı” kimi import edin." action={<Link href="/inventory/new" className="btn btn-primary">+ Yeni sayım</Link>} /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>№</th><th>Rejim</th><th>Anbar</th><th>Sayım tarixi</th><th>Sayan</th><th className="num">Sətir</th><th>Status</th></tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={c.id}><td><Link className="link" href={`/inventory/${c.id}`}>{c.number}</Link></td><td>{az.countMode[c.mode]}</td><td>{whs.get(c.warehouseId)}</td><td>{fmtDate(c.countDate)}</td><td>{c.countedBy}</td><td className="num">{c._count.lines}</td><td><DocStatusBadge status={c.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
