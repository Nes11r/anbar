import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { sp } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { variantOptionsByIds } from "@/server/services/catalog";
import { GRNForm } from "../grn-form";

export const metadata = { title: "Yeni mal qəbulu" };

export default async function NewGRN({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("grn.edit");
  const poId = sp((await searchParams).po);
  if (!/^[0-9a-f-]{36}$/i.test(poId)) notFound();
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: { orderBy: { lineNo: "asc" } }, mr: true } });
  if (!po) notFound();
  const [whs, opts] = await Promise.all([db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }), variantOptionsByIds(po.lines.map((l) => l.variantId))]);
  const receivable = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
  return (
    <>
      <PageHeader title={`Mal qəbulu: ${po.poNumber}`} crumbs={[{ href: "/grn", label: "Mal qəbulu" }, { href: `/po/${po.id}`, label: po.poNumber }, { label: "Yeni GRN" }]} subtitle="Qaralama qalığı dəyişmir. Təsdiq zamanı qəbul edilən miqdar avtomatik anbara mədaxil olunur — əl ilə təkrar mədaxil lazım deyil." />
      {!receivable ? <div className="alert alert-warn">Bu PO qəbul üçün açıq deyil (status: {po.status}).</div> : (
        <GRNForm poId={po.id} poNumber={po.poNumber} receiverName={user.name} warehouses={whs.map((w) => ({ id: w.id, name: w.name }))} defaultWarehouseId={po.mr?.deliveryWarehouseId ?? whs.find((w) => w.type === "NORMAL")?.id ?? ""}
          lines={po.lines.filter((l) => Number(l.qtyReceived) < Number(l.qtyOrdered)).map((l) => { const v = opts.get(l.variantId); return { poLineId: l.id, lineNo: l.lineNo, label: `${v?.sku} · ${v?.name}${v?.size ? ` (${v.size})` : ""}`, unit: v?.unit ?? "", ordered: Number(l.qtyOrdered), received: Number(l.qtyReceived) }; })} />
      )}
    </>
  );
}
