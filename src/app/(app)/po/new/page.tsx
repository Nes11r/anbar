import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { sp, todayIso } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { variantOptionsByIds } from "@/server/services/catalog";
import { POForm, type POLineState } from "../po-form";

export const metadata = { title: "Yeni PO" };
const ORDERABLE = ["APPROVED", "IN_SOURCING", "PARTIALLY_ORDERED", "PARTIALLY_DELIVERED"];

export default async function NewPO({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("po.manage");
  const mrId = sp((await searchParams).mr);
  const suppliers = await db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  let mr: { id: string; label: string; approved: boolean } | null = null;
  let lines: POLineState[] = [];
  let currency = "AZN";
  if (/^[0-9a-f-]{36}$/i.test(mrId)) {
    const m = await db.materialRequest.findUnique({ where: { id: mrId }, include: { lines: { orderBy: { lineNo: "asc" }, include: { poLines: { include: { po: { select: { status: true } } } } } } } });
    if (m) {
      currency = m.currency;
      mr = { id: m.id, label: `${m.mrNumber} Rev.${m.revision} (${m.status})`, approved: ORDERABLE.includes(m.status) };
      const opts = await variantOptionsByIds(m.lines.map((l) => l.variantId).filter(Boolean) as string[]);
      lines = m.lines
        .map((l) => {
          const ordered = l.poLines.filter((p) => p.po.status !== "CANCELLED").reduce((a, p) => a + Number(p.qtyOrdered), 0);
          const rest = Math.max(0, Number(l.netQtyToOrder) - ordered);
          return { key: l.id, variant: l.variantId ? opts.get(l.variantId) ?? null : null, mrLineId: l.id, mrLabel: `${l.lineNo}. ${l.description}${l.size ? ` (${l.size})` : ""}`, maxQty: rest, qtyOrdered: rest > 0 ? String(rest) : "", unitPrice: l.estUnitPrice == null ? "" : String(Number(l.estUnitPrice)), notes: "" };
        })
        .filter((l) => (l.maxQty ?? 0) > 0);
    }
  }
  return (
    <>
      <PageHeader title="Yeni satınalma sifarişi (PO)" crumbs={[{ href: "/po", label: "Satınalma sifarişləri" }, { label: "Yeni" }]} />
      {suppliers.length === 0 ? <div className="alert alert-warn">Əvvəlcə <Link className="link" href="/settings/suppliers">tədarükçü əlavə edin</Link>.</div> : mr && lines.length === 0 ? <div className="alert alert-info">Bu MR üzrə sifariş ediləcək qalıq miqdar yoxdur (hamısı sifariş edilib və ya stokda var).</div> : (
        <POForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} mr={mr} canOverride={can(user.role, "po.override")} initial={{ supplierId: "", orderDate: todayIso(), expectedDate: "", currency, notes: "", overrideReason: "", lines }} />
      )}
    </>
  );
}
