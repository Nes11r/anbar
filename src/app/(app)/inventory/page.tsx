import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, Empty, FilterChips, PageHeader } from "@/components/ui";

export const metadata = { title: "İlkin inventarlaşdırma" };
export const dynamic = "force-dynamic";

export default async function InventoryList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("inventory.view");
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
      <PageHeader print={["Tərtib etdi", "Yoxladı"]} viewOnly={{ role: user.role, perm: "inventory.edit", action: "sayım sənədi yaratmaq" }} title="Sayım və ilkin qalıq" actions={can(user.role, "inventory.edit") && <Link href="/inventory/new" className="btn btn-primary">+ Yeni sayım</Link>} />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4 text-sm">
          <h2 className="mb-1 font-bold">1. İlkin qalıq — bir dəfə, sistemə başlayanda</h2>
          <p className="text-muted">Sistemə keçən gün anbarda fiziki olaraq nə varsa, onu sayıb buraya yazırsınız (məs. “Ofis anbarı: 52 ölçülü kombinezon — 10 ədəd”). Anbar müdiri təsdiqləyəndə bu rəqəmlər anbar qalığının başlanğıcı olur. Bundan sonra qalıq yalnız mal qəbulu və məxaric sənədləri ilə dəyişir.</p>
        </div>
        <div className="card p-4 text-sm">
          <h2 className="mb-1 font-bold">2. Dövri sayım — vaxtaşırı yoxlama</h2>
          <p className="text-muted">Ayda bir və ya ehtiyac olanda anbarı yenidən sayırsınız. Sistem sayılan rəqəmi öz rəqəmi ilə müqayisə edir; fərq (itki, səhv) təsdiqlə düzəldilir və hesabatda “inventar fərqi” kimi görünür. Sahə hesabatındakı stok fərqləri də bura sayım kimi düşür.</p>
        </div>
      </div>
      <Card pad={false}>
        <div className="border-b border-line p-3"><FilterChips name="status" value={status} params={status ? { status } : {}} options={[["", "Hamısı"], ["DRAFT", "Qaralama"], ["POSTED", "Təsdiqlənib"], ["CANCELLED", "Ləğv"]]} /></div>
        {rows.length === 0 ? <Empty title="Sayım sənədi yoxdur" hint="Başlamaq üçün “+ Yeni sayım” → “İlkin qalıq” seçin və anbarda olanları yazın. Və ya Excel-dən “İnventar qalığı” kimi import edin." action={can(user.role, "inventory.edit") ? <Link href="/inventory/new" className="btn btn-primary">+ Yeni sayım</Link> : undefined} /> : (
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
