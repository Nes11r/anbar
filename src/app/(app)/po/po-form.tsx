"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MR_LISTS } from "@/i18n/az";
import { VariantPicker, type VariantOption } from "@/components/client/variant-picker";
import { useToast } from "@/components/client/toast";
import type { POInput } from "@/server/services/procurement";
import { createPOAction, updatePOAction } from "./actions";

export interface POLineState { key: string; variant: VariantOption | null; mrLineId: string | null; mrLabel?: string; maxQty?: number; qtyOrdered: string; unitPrice: string; notes: string }

export function POForm({ suppliers, mr, canOverride, initial, id, version }: {
  suppliers: { id: string; name: string }[];
  mr: { id: string; label: string; approved: boolean } | null;
  canOverride: boolean;
  initial: { supplierId: string; orderDate: string; expectedDate: string; currency: string; notes: string; overrideReason: string; lines: POLineState[] };
  id?: string; version?: number;
}) {
  const [h, setH] = useState(initial);
  const [lines, setLines] = useState<POLineState[]>(initial.lines.length ? initial.lines : [{ key: "n0", variant: null, mrLineId: null, qtyOrdered: "", unitPrice: "", notes: "" }]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const needOverride = !mr || !mr.approved;
  const upd = (key: string, p: Partial<POLineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.qtyOrdered) || 0) * (Number(l.unitPrice) || 0), 0);

  const submit = () => {
    const filled = lines.filter((l) => Number(l.qtyOrdered) > 0);
    if (filled.some((l) => !l.variant)) { toast("bad", "Hər PO sətri kataloq variantına bağlanmalıdır. Kataloqda olmayan material üçün əvvəlcə material kartı yaradın."); return; }
    const payload: POInput = {
      supplierId: h.supplierId, mrId: mr?.id ?? null, orderDate: new Date(h.orderDate), expectedDate: h.expectedDate ? new Date(h.expectedDate) : null, currency: h.currency, notes: h.notes || null, overrideReason: h.overrideReason || null,
      lines: filled.map((l) => ({ variantId: l.variant!.id, mrLineId: l.mrLineId, qtyOrdered: Number(l.qtyOrdered), unitPrice: l.unitPrice === "" ? null : Number(l.unitPrice), notes: l.notes || null })),
    };
    start(async () => {
      const r = id ? await updatePOAction(id, version!, payload) : await createPOAction(payload);
      if (r.ok) { toast("ok", r.message!); router.push(`/po/${(r.data as { id: string }).id}`); router.refresh(); } else toast("bad", r.error);
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card grid gap-4 p-4 md:grid-cols-4">
        <div className="label md:col-span-4"><span>Əsas MR</span><div className="text-sm text-ink">{mr ? mr.label : "MR-siz (xüsusi səlahiyyət)"}</div></div>
        <label className="label md:col-span-2"><span className="req">Tədarükçü</span><select className="select" value={h.supplierId} onChange={(e) => setH({ ...h, supplierId: e.target.value })}><option value="">— seçin —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="label"><span className="req">Sifariş tarixi</span><input className="input" type="date" value={h.orderDate} onChange={(e) => setH({ ...h, orderDate: e.target.value })} /></label>
        <label className="label"><span>Gözlənilən tarix</span><input className="input" type="date" value={h.expectedDate} min={h.orderDate} onChange={(e) => setH({ ...h, expectedDate: e.target.value })} /></label>
        <label className="label"><span>Valyuta</span><select className="select" value={h.currency} onChange={(e) => setH({ ...h, currency: e.target.value })}>{MR_LISTS.CURRENCY.map(([c]) => <option key={c}>{c}</option>)}</select></label>
        <label className="label md:col-span-3"><span>Qeyd</span><input className="input" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></label>
        {needOverride && (
          canOverride ? (
            <label className="label md:col-span-4"><span className="req">İstisna səbəbi (MR təsdiqlənməyib / yoxdur — audit edilir)</span><input className="input" value={h.overrideReason} onChange={(e) => setH({ ...h, overrideReason: e.target.value })} /></label>
          ) : (
            <div className="alert alert-warn md:col-span-4">PO yalnız təsdiqlənmiş MR əsasında yaradıla bilər.</div>
          )
        )}
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">Sətirlər</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th className="min-w-[320px]">Kataloq variantı</th><th>MR sətri</th><th className="w-32">Miqdar</th><th className="w-32">Vahid qiymət</th><th>Qeyd</th><th></th></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={l.key} className="align-top">
                <td className="pt-3">{i + 1}</td>
                <td><VariantPicker value={l.variant} onChange={(v) => upd(l.key, { variant: v })} /></td>
                <td className="max-w-[260px] text-xs">{l.mrLabel ?? "—"}{l.maxQty != null && <div className="text-muted">MR net: {l.maxQty}</div>}</td>
                <td><input className="input text-right" type="number" min={0} step="any" value={l.qtyOrdered} onChange={(e) => upd(l.key, { qtyOrdered: e.target.value })} />{l.maxQty != null && Number(l.qtyOrdered) > l.maxQty && <div className="field-err">MR-dən çox</div>}</td>
                <td><input className="input text-right" type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => upd(l.key, { unitPrice: e.target.value })} /></td>
                <td><input className="input" value={l.notes} onChange={(e) => upd(l.key, { notes: e.target.value })} /></td>
                <td><button type="button" className="btn btn-sm btn-ghost text-bad" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Sil">✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between">
          {!mr && <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { key: Math.random().toString(36), variant: null, mrLineId: null, qtyOrdered: "", unitPrice: "", notes: "" }])}>+ Sətir</button>}
          <span className="ml-auto text-sm">Cəmi: <b>{total.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {h.currency}</b></span>
        </div>
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || (needOverride && !canOverride)}>{pending ? "Yadda saxlanılır…" : "Qaralama kimi saxla"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
      <p className="text-xs text-muted">PO-nun yaradılması və təsdiqi qalığı artırmır. Qalıq yalnız mal qəbulu (GRN) təsdiqləndikdə artır.</p>
    </form>
  );
}
