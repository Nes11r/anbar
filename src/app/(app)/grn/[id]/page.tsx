import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtQty } from "@/lib/format";
import { Badge, Card, DocStatusBadge, PageHeader } from "@/components/ui";
import { PrintButton, PrintHeader, Signatures } from "@/components/print";
import { ActionButton } from "@/components/client/action-button";
import { variantOptionsByIds } from "@/server/services/catalog";
import { grnWarnings } from "@/server/services/procurement";
import { cancelGRNAction, postGRNAction, reverseGRNAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function GRNPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("grn.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const g = await db.goodsReceipt.findUnique({ where: { id }, include: { lines: true, po: { include: { supplier: true, lines: true } } } });
  if (!g) notFound();
  const [opts, wh, warnings, history] = await Promise.all([
    variantOptionsByIds(g.lines.map((l) => l.variantId)),
    db.warehouse.findUnique({ where: { id: g.warehouseId } }),
    g.status === "DRAFT" ? grnWarnings(g.id) : Promise.resolve([] as string[]),
    db.statusHistory.findMany({ where: { entityType: "GoodsReceipt", entityId: g.id }, orderBy: { id: "asc" } }),
  ]);
  const blocked = warnings.some((w) => w.includes("bloklanacaq"));
  return (
    <>
      <PrintHeader title="Goods Received Note (GRN)" number={g.grnNumber} />
      <PageHeader
        title={`GRN ${g.grnNumber}`}
        subtitle={<span className="flex items-center gap-2"><DocStatusBadge status={g.status} /> PO <Link className="link" href={`/po/${g.poId}`}>{g.po.poNumber}</Link> · {g.po.supplier.name}</span>}
        crumbs={[{ href: "/grn", label: "Mal qəbulu" }, { label: g.grnNumber }]}
        actions={<>
          <PrintButton />
          {g.status === "DRAFT" && can(user.role, "grn.edit") && <ActionButton className="btn" action={cancelGRNAction.bind(null, g.id)} confirm="GRN qaralaması ləğv edilsin?">Ləğv et</ActionButton>}
          {(g.status === "DRAFT" || g.status === "CANCELLED") && can(user.role, "grn.edit") && <DeleteButton type="goodsReceipt" id={g.id} label={g.grnNumber} />}
          {g.status === "DRAFT" && can(user.role, "grn.post") && !blocked && <ActionButton className="btn btn-primary" action={postGRNAction.bind(null, g.id)} confirm="Mal qəbulu təsdiqlənsin? Qəbul edilən miqdar dərhal anbara mədaxil olunacaq.">Təsdiqlə (anbara mədaxil)</ActionButton>}
          {g.status === "POSTED" && can(user.role, "document.reverse") && <ActionButton className="btn btn-danger" action={reverseGRNAction.bind(null, g.id)} confirm="GRN ləğv edilsin? Mədaxil geri alınacaq (mal artıq verilibsə, əməliyyat bloklanır)." reason={{ label: "Ləğv səbəbi", required: true }}>Ləğv et (reversal)</ActionButton>}
        </>}
      />
      {warnings.length > 0 && (
        <div className={`alert ${blocked ? "alert-bad" : "alert-warn"} no-print mb-4`}>
          <ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Qəbul">
          <dl className="kv">
            <dt>Anbar</dt><dd>{wh?.name}</dd>
            <dt>Qəbul tarixi</dt><dd>{fmtDate(g.receivedDate)}</dd>
            <dt>Qəbul edən</dt><dd>{g.receiverName}</dd>
            <dt>Qaimə №</dt><dd>{g.deliveryNoteNo ?? "—"}</dd>
            <dt>Təsdiqlənib</dt><dd>{g.postedAt ? fmtDateTime(g.postedAt) : "—"}</dd>
            {g.notes && <><dt>Qeyd</dt><dd>{g.notes}</dd></>}
          </dl>
        </Card>
        <Card title="Sətirlər" className="xl:col-span-2" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>PO sətri</th><th>SKU</th><th>Material</th><th className="num">Sifariş</th><th className="num">Gələn</th><th className="num">Rədd</th><th className="num">Anbara</th><th>Keyfiyyət</th><th>Qeyd</th></tr></thead>
              <tbody>{g.lines.map((l) => { const v = opts.get(l.variantId); const pl = g.po.lines.find((p) => p.id === l.poLineId); return (
                <tr key={l.id}><td>{pl?.lineNo}</td><td>{v?.sku}</td><td>{v?.name}{v?.size ? ` (${v.size})` : ""}</td><td className="num">{fmtQty(pl?.qtyOrdered)}</td><td className="num">{fmtQty(l.qtyReceived)}</td><td className="num">{fmtQty(l.qtyRejected)}</td><td className="num font-bold">{fmtQty(Number(l.qtyReceived) - Number(l.qtyRejected))}</td>
                  <td><Badge tone={l.qualityStatus === "ACCEPTED" ? "ok" : l.qualityStatus === "REJECTED" ? "bad" : "warn"}>{az.quality[l.qualityStatus]}</Badge></td><td className="text-xs">{l.note}</td></tr>
              ); })}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Status tarixçəsi" pad={false}>
          <ul className="divide-y divide-line text-sm">{history.map((h) => <li key={String(h.id)} className="px-4 py-2"><b>{az.docStatus[h.toStatus as keyof typeof az.docStatus] ?? h.toStatus}</b><span className="block text-xs text-muted">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ""}</span></li>)}</ul>
        </Card>
      </div>
      <Signatures roles={["Təhvil verən (tədarükçü)", "Qəbul edən (anbardar)", "QA/QC"]} />
    </>
  );
}
