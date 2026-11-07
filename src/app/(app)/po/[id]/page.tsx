import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, isoDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, PageHeader, PoStatusBadge } from "@/components/ui";
import { PrintButton, PrintHeader, Signatures } from "@/components/print";
import { ActionButton } from "@/components/client/action-button";
import { variantOptionsByIds } from "@/server/services/catalog";
import { POForm } from "../po-form";
import { setPOStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function POPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("po.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, mr: true, lines: { orderBy: { lineNo: "asc" }, include: { mrLine: true } }, receipts: { orderBy: { createdAt: "desc" } } } });
  if (!po) notFound();
  const opts = await variantOptionsByIds(po.lines.map((l) => l.variantId));
  const history = await db.statusHistory.findMany({ where: { entityType: "PurchaseOrder", entityId: po.id }, orderBy: { id: "asc" } });

  if (po.status === "DRAFT" && sp(s.edit) === "1" && can(user.role, "po.manage")) {
    const suppliers = await db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    return (
      <>
        <PageHeader title={`Düzəliş: ${po.poNumber}`} crumbs={[{ href: "/po", label: "PO" }, { href: `/po/${po.id}`, label: po.poNumber }, { label: "Düzəliş" }]} />
        <POForm id={po.id} version={po.version} suppliers={suppliers.map((x) => ({ id: x.id, name: x.name }))} canOverride={can(user.role, "po.override")}
          mr={po.mr ? { id: po.mr.id, label: `${po.mr.mrNumber} Rev.${po.mr.revision}`, approved: ["APPROVED", "IN_SOURCING", "PARTIALLY_ORDERED", "PARTIALLY_DELIVERED", "FULLY_ORDERED"].includes(po.mr.status) } : null}
          initial={{ supplierId: po.supplierId, orderDate: isoDate(po.orderDate), expectedDate: isoDate(po.expectedDate), currency: po.currency, notes: po.notes ?? "", overrideReason: po.overrideReason ?? "",
            lines: po.lines.map((l) => ({ key: l.id, variant: opts.get(l.variantId) ?? null, mrLineId: l.mrLineId, mrLabel: l.mrLine ? `${l.mrLine.lineNo}. ${l.mrLine.description}` : undefined, maxQty: l.mrLine ? Number(l.mrLine.netQtyToOrder) : undefined, qtyOrdered: String(Number(l.qtyOrdered)), unitPrice: l.unitPrice == null ? "" : String(Number(l.unitPrice)), notes: l.notes ?? "" })) }} />
      </>
    );
  }

  const total = po.lines.reduce((a, l) => a + Number(l.qtyOrdered) * Number(l.unitPrice ?? 0), 0);
  const receivable = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
  return (
    <>
      <PrintHeader title="Purchase Order" number={po.poNumber} />
      <PageHeader
        title={`PO ${po.poNumber}`}
        subtitle={<span className="flex items-center gap-2"><PoStatusBadge status={po.status} /> {po.supplier.name}</span>}
        crumbs={[{ href: "/po", label: "Satınalma sifarişləri" }, { label: po.poNumber }]}
        actions={<>
          <PrintButton />
          {po.status === "DRAFT" && can(user.role, "po.manage") && <Link className="btn" href={`/po/${po.id}?edit=1`}>Düzəliş</Link>}
          {(po.status === "DRAFT" || po.status === "CANCELLED") && can(user.role, "po.manage") && <DeleteButton type="purchaseOrder" id={po.id} label={po.poNumber} />}
          {po.status === "DRAFT" && can(user.role, "po.manage") && <ActionButton className="btn" action={setPOStatusAction.bind(null, po.id, "SUBMITTED")}>Göndər</ActionButton>}
          {(po.status === "DRAFT" || po.status === "SUBMITTED") && can(user.role, "po.approve") && <ActionButton className="btn btn-primary" action={setPOStatusAction.bind(null, po.id, "APPROVED")} confirm="PO təsdiqlənsin? Təsdiq qalığı artırmır — mal qəbulu (GRN) gözlənilir.">Təsdiqlə</ActionButton>}
          {receivable && can(user.role, "grn.edit") && <Link className="btn btn-brand" href={`/grn/new?po=${po.id}`}>Mal qəbulu (GRN)</Link>}
          {!["CANCELLED", "RECEIVED"].includes(po.status) && can(user.role, "po.manage") && <ActionButton className="btn btn-danger" action={setPOStatusAction.bind(null, po.id, "CANCELLED")} confirm="PO ləğv edilsin?" reason={{ label: "Ləğv səbəbi", required: true }}>Ləğv et</ActionButton>}
        </>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Sifariş">
          <dl className="kv">
            <dt>Tədarükçü</dt><dd>{po.supplier.name}{po.supplier.phone ? ` · ${po.supplier.phone}` : ""}</dd>
            <dt>MR</dt><dd>{po.mr ? <Link className="link" href={`/mr/${po.mr.id}`}>{po.mr.mrNumber} Rev.{po.mr.revision}</Link> : "—"}</dd>
            <dt>Sifariş tarixi</dt><dd>{fmtDate(po.orderDate)}</dd>
            <dt>Gözlənilən</dt><dd>{fmtDate(po.expectedDate)}</dd>
            <dt>Dəyər</dt><dd className="font-semibold">{fmtMoney(total, po.currency)}</dd>
            <dt>Təsdiq</dt><dd>{po.approvedAt ? fmtDateTime(po.approvedAt) : "—"}</dd>
            {po.overrideReason && <><dt>İstisna (audit)</dt><dd className="text-warn">{po.overrideReason}</dd></>}
            {po.cancelReason && <><dt>Ləğv səbəbi</dt><dd>{po.cancelReason}</dd></>}
            {po.notes && <><dt>Qeyd</dt><dd>{po.notes}</dd></>}
          </dl>
        </Card>
        <Card title="Sətirlər və qəbul" className="xl:col-span-2" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>SKU</th><th>Material</th><th>Ölçü</th><th className="num">Sifariş</th><th className="num">Qəbul</th><th className="num">Açıq</th><th className="num">Qiymət</th><th className="num">Məbləğ</th></tr></thead>
              <tbody>{po.lines.map((l) => { const v = opts.get(l.variantId); const open = Math.max(0, Number(l.qtyOrdered) - Number(l.qtyReceived)); return (
                <tr key={l.id}><td>{l.lineNo}</td><td>{v?.sku}</td><td>{v?.name}</td><td>{v?.size || "—"}</td><td className="num">{fmtQty(l.qtyOrdered)}</td><td className="num">{fmtQty(l.qtyReceived)}</td><td className={`num font-semibold ${open > 0 ? "text-warn" : "text-ok"}`}>{fmtQty(open)}</td><td className="num">{l.unitPrice == null ? "—" : fmtQty(l.unitPrice, 2)}</td><td className="num">{l.unitPrice == null ? "—" : fmtQty(Number(l.unitPrice) * Number(l.qtyOrdered), 2)}</td></tr>
              ); })}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Mal qəbulları (GRN)" className="xl:col-span-2" pad={false}>
          {po.receipts.length === 0 ? <p className="p-4 text-sm text-muted">Qəbul yoxdur.</p> : (
            <table className="tbl"><thead><tr><th>GRN</th><th>Tarix</th><th>Qəbul edən</th><th>Status</th></tr></thead>
              <tbody>{po.receipts.map((g) => <tr key={g.id}><td><Link className="link" href={`/grn/${g.id}`}>{g.grnNumber}</Link></td><td>{fmtDate(g.receivedDate)}</td><td>{g.receiverName}</td><td><DocStatusBadge status={g.status} /></td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="Status tarixçəsi" pad={false}>
          <ul className="divide-y divide-line text-sm">{history.map((h) => <li key={String(h.id)} className="px-4 py-2"><b>{az.poStatus[h.toStatus as keyof typeof az.poStatus] ?? h.toStatus}</b><span className="block text-xs text-muted">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ""}</span></li>)}</ul>
        </Card>
      </div>
      <Signatures roles={["Hazırlayan (Satınalma)", "Təsdiq edən", "Tədarükçü"]} />
    </>
  );
}
