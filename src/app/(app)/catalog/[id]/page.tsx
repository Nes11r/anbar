import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtQty, sp } from "@/lib/format";
import { Badge, Card, GroupBadge, PageHeader, StockStatus } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { MaterialForm } from "../material-form";
import { materialFormOptions } from "../form-data";
import { setActiveAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("catalog.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await db.material.findUnique({
    where: { id },
    include: { category: true, unit: true, supplier: true, variants: { orderBy: { size: "asc" }, include: { balances: true } } },
  });
  if (!m) notFound();
  const canManage = can(user.role, "catalog.manage");
  const editing = canManage && sp(s.edit) === "1";
  const [warehouses, usedIds, recent, batch] = await Promise.all([
    db.warehouse.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }] }),
    db.stockLedgerEntry.groupBy({ by: ["variantId"], where: { variantId: { in: m.variants.map((v) => v.id) } } }),
    db.$queryRaw<{ id: bigint; entryType: string; docNumber: string; qty: string; movementDate: Date; size: string; warehouse: string }[]>`
      SELECT l.id, l."entryType"::text AS "entryType", l."docNumber", l.qty::text AS qty, l."movementDate", v.size, w.name AS warehouse
      FROM stock_ledger l JOIN material_variants v ON v.id = l."variantId" JOIN warehouses w ON w.id = l."warehouseId"
      WHERE v."materialId" = ${m.id}::uuid ORDER BY l.id DESC LIMIT 15`,
    m.importBatchId ? db.importBatch.findUnique({ where: { id: m.importBatchId } }) : null,
  ]);
  const used = new Set(usedIds.map((u) => u.variantId));
  const whMap = new Map(warehouses.map((w) => [w.id, w]));

  if (editing) {
    const opts = await materialFormOptions();
    return (
      <>
        <PageHeader title={`Düzəliş: ${m.code}`} crumbs={[{ href: "/catalog", label: "Material kataloqu" }, { href: `/catalog/${m.id}`, label: m.code }, { label: "Düzəliş" }]} />
        <MaterialForm
          {...opts}
          id={m.id}
          version={m.version}
          initial={{
            code: m.code, originalCode: m.originalCode, nameAz: m.nameAz, nameEn: m.nameEn, categoryId: m.categoryId, subcategory: m.subcategory, workerGroup: m.workerGroup,
            brand: m.brand, model: m.model, description: m.description, sizeType: m.sizeType, color: m.color, unitCode: m.unitCode, supplierId: m.supplierId, minStock: Number(m.minStock), notes: m.notes,
            variants: m.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, sku: v.sku, barcode: v.barcode, minStock: v.minStock == null ? null : Number(v.minStock), isActive: v.isActive, used: used.has(v.id) })),
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${m.nameAz}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{m.code}</span><GroupBadge group={m.workerGroup} />{m.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge tone="muted">Arxiv</Badge>}</span>}
        crumbs={[{ href: "/catalog", label: "Material kataloqu" }, { label: m.code }]}
        actions={canManage && (
          <>
            <Link className="btn" href={`/catalog/${m.id}?edit=1`}>Düzəliş</Link>
            <ActionButton action={setActiveAction.bind(null, m.id, !m.isActive)} confirm={m.isActive ? "Material arxivlənsin? Tarixçə saxlanılır, yeni əməliyyatlarda görünməyəcək." : "Material yenidən aktivləşdirilsin?"} className={m.isActive ? "btn btn-danger" : "btn"}>
              {m.isActive ? "Arxivlə" : "Aktivləşdir"}
            </ActionButton>
            <DeleteButton type="material" id={m.id} label={`${m.code} — ${m.nameAz}`} />
          </>
        )}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Əsas kart">
          <dl className="kv">
            <dt>Kateqoriya</dt><dd>{m.category.nameAz}{m.subcategory ? ` / ${m.subcategory}` : ""}</dd>
            <dt>Ad (EN)</dt><dd>{m.nameEn ?? "—"}</dd>
            <dt>Orijinal kod</dt><dd>{m.originalCode ?? "—"}</dd>
            <dt>Marka / model</dt><dd>{[m.brand, m.model].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Rəng</dt><dd>{m.color ?? "—"}</dd>
            <dt>Ölçü növü</dt><dd>{az.sizeType[m.sizeType]}</dd>
            <dt>Vahid</dt><dd>{m.unit.labelAz} ({m.unit.code})</dd>
            <dt>Tədarükçü</dt><dd>{m.supplier?.name ?? "—"}</dd>
            <dt>Min. ehtiyat</dt><dd>{fmtQty(m.minStock)}</dd>
            <dt>Təsvir</dt><dd className="whitespace-pre-wrap">{m.description ?? "—"}</dd>
            <dt>Qeyd</dt><dd>{m.notes ?? "—"}</dd>
            <dt>Mənbə</dt>
            <dd>{m.sourceConfidence === "MANUAL" ? "Əl ilə daxil edilib" : <>Excel import ({batch?.fileName ?? "—"}, vərəq {batch?.sheetName ?? "—"}) · etibarlılıq: <Badge tone={m.sourceConfidence === "LOW" ? "warn" : "info"}>{m.sourceConfidence}</Badge></>}</dd>
            <dt>Yaradılıb</dt><dd>{fmtDateTime(m.createdAt)}</dd>
          </dl>
        </Card>
        <Card title="Variantlar və qalıq" className="xl:col-span-2" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>SKU</th><th>Ölçü</th><th>Rəng</th>{warehouses.map((w) => <th key={w.id} className="num">{w.name}</th>)}<th className="num">Rezerv</th><th className="num">Mövcud</th><th>Vəziyyət</th>{canManage && <th></th>}</tr>
              </thead>
              <tbody>
                {m.variants.map((v) => {
                  const normal = v.balances.filter((b) => whMap.get(b.warehouseId)?.type === "NORMAL");
                  const on = normal.reduce((a, b) => a + Number(b.onHand), 0);
                  const res = normal.reduce((a, b) => a + Number(b.reserved), 0);
                  const min = Number(v.minStock ?? m.minStock);
                  return (
                    <tr key={v.id} className={v.isActive ? "" : "opacity-60"}>
                      <td><Link className="link" href={`/stock/${v.id}`}>{v.sku}</Link>{!v.isActive && <span className="ml-1"><Badge>deaktiv</Badge></span>}</td>
                      <td className="font-semibold">{v.size || "—"}</td>
                      <td>{v.color || "—"}</td>
                      {warehouses.map((w) => <td key={w.id} className="num">{fmtQty(v.balances.find((b) => b.warehouseId === w.id)?.onHand ?? 0)}</td>)}
                      <td className="num">{fmtQty(res)}</td>
                      <td className="num font-bold">{fmtQty(on - res)}</td>
                      <td><StockStatus avail={on - res} min={min} /></td>
                      {canManage && <td>{!used.has(v.id) && m.variants.length > 1 && <DeleteButton small type="variant" id={v.id} label={v.sku} />}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Son hərəkətlər" className="xl:col-span-3" pad={false}>
          {recent.length === 0 ? <p className="p-4 text-sm text-muted">Hərəkət yoxdur.</p> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>Ölçü</th><th>Anbar</th><th className="num">Miqdar</th></tr></thead>
                <tbody>{recent.map((r) => (
                  <tr key={String(r.id)}><td>{fmtDate(r.movementDate)}</td><td>{az.entryType[r.entryType as keyof typeof az.entryType]}</td><td>{r.docNumber}</td><td>{r.size || "—"}</td><td>{r.warehouse}</td><td className="num">{fmtQty(r.qty)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
