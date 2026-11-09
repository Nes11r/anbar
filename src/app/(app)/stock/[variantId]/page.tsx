import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty } from "@/lib/format";
import { Card, GroupBadge, PageHeader, StockStatus } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { ledgerJournal } from "@/server/services/reports";
import { releaseReservationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function VariantPage({ params }: { params: Promise<{ variantId: string }> }) {
  const user = await requirePage("stock.view");
  const { variantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(variantId)) notFound();
  const v = await db.materialVariant.findUnique({ where: { id: variantId }, include: { material: { include: { unit: true, category: true } }, balances: true } });
  if (!v) notFound();
  const [whs, journal, reservations, projects] = await Promise.all([
    db.warehouse.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }] }),
    ledgerJournal({ variantId, limit: 100 }),
    db.reservation.findMany({ where: { variantId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    db.project.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const normal = new Set(whs.filter((w) => w.type === "NORMAL").map((w) => w.id));
  const on = v.balances.filter((b) => normal.has(b.warehouseId)).reduce((a, b) => a + Number(b.onHand), 0);
  const res = v.balances.filter((b) => normal.has(b.warehouseId)).reduce((a, b) => a + Number(b.reserved), 0);
  const min = Number(v.minStock ?? v.material.minStock);
  const canRes = can(user.role, "reservation.manage");
  return (
    <>
      <PageHeader print={["Anbardar", "Anbar müdiri"]}
        viewOnly={{ role: user.role, perm: "stockdoc.edit", action: "qalığı dəyişmək (yalnız mədaxil/məxaric sənədləri ilə)" }}
        title={`${v.sku}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{v.material.nameAz}{v.size ? ` · ölçü ${v.size}` : ""} <GroupBadge group={v.material.workerGroup} /></span>}
        crumbs={[{ href: "/stock", label: "Anbar qalığı" }, { label: v.sku }]}
        actions={<><Link className="btn" href={`/catalog/${v.materialId}`}>Material kartı</Link><a className="btn" href={`/api/export/journal?variant=${v.id}`}>Hərəkətlər (Excel)</a></>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Fiziki qalıq</div><div className="text-2xl font-bold tabular-nums">{fmtQty(on)} <span className="text-sm text-muted">{v.material.unit.labelAz}</span></div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Rezerv</div><div className="text-2xl font-bold tabular-nums">{fmtQty(res)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Mövcud</div><div className="text-2xl font-bold tabular-nums">{fmtQty(on - res)}</div></div>
        <div className="card p-4"><div className="text-xs font-semibold text-muted">Minimum</div><div className="text-2xl font-bold tabular-nums">{fmtQty(min)}</div><StockStatus avail={on - res} min={min} /></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Anbarlar üzrə" pad={false}>
          <table className="tbl">
            <thead><tr><th>Anbar</th><th className="num">Fiziki</th><th className="num">Rezerv</th></tr></thead>
            <tbody>{whs.map((w) => { const b = v.balances.find((x) => x.warehouseId === w.id); return (
              <tr key={w.id}><td>{w.name}{w.type === "QUARANTINE" && <span className="text-xs text-muted"> (karantin — mövcuda daxil deyil)</span>}</td><td className="num">{fmtQty(b?.onHand ?? 0)}</td><td className="num">{fmtQty(b?.reserved ?? 0)}</td></tr>
            ); })}</tbody>
          </table>
        </Card>
        {reservations.length > 0 && <Card title="Aktiv rezervlər (köhnə — azad edin)" className="xl:col-span-2" pad={false}>
          {reservations.length === 0 ? <p className="p-4 text-sm text-muted">Aktiv rezerv yoxdur.</p> : (
            <table className="tbl">
              <thead><tr><th>№</th><th>Anbar</th><th>Layihə</th><th className="num">Miqdar</th><th>Səbəb</th><th>Tarix</th><th></th></tr></thead>
              <tbody>{reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.number}</td><td>{whs.find((w) => w.id === r.warehouseId)?.name}</td><td>{projects.find((p) => p.id === r.projectId)?.code ?? "—"}</td>
                  <td className="num">{fmtQty(r.qty)}</td><td>{r.reason ?? "—"}</td><td>{fmtDate(r.createdAt)}</td>
                  <td>{canRes && <ActionButton className="btn btn-sm" action={releaseReservationAction.bind(null, r.id)} confirm="Rezerv azad edilsin?">Azad et</ActionButton>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>}
        <Card title={`Hərəkət jurnalı (son ${journal.rows.length} / ${journal.total})`} className="xl:col-span-3" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>Anbar</th><th>Layihə</th><th>İşçi</th><th className="num">Miqdar</th><th>İstifadəçi</th><th>Səbəb</th></tr></thead>
              <tbody>{journal.rows.map((r) => (
                <tr key={String(r.id)}><td>{fmtDate(r.movementDate)}</td><td>{az.entryType[r.entryType as keyof typeof az.entryType]}</td><td>{r.docNumber}</td><td>{r.warehouse}</td><td>{r.project ?? "—"}</td><td>{r.employee ?? "—"}</td><td className="num">{fmtQty(r.qty)}</td><td>{r.userName}</td><td className="text-xs">{r.reason}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
