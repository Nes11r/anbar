"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import { createGRNAction } from "./actions";

export interface GRNLineInfo { poLineId: string; lineNo: number; label: string; unit: string; ordered: number; received: number }

export function GRNForm({ poId, poNumber, warehouses, defaultWarehouseId, lines, receiverName }: { poId: string; poNumber: string; warehouses: { id: string; name: string }[]; defaultWarehouseId: string; lines: GRNLineInfo[]; receiverName: string }) {
  const [wh, setWh] = useState(defaultWarehouseId);
  const [date, setDate] = useState(todayIso());
  const [recv, setRecv] = useState(receiverName);
  const [dn, setDn] = useState("");
  const [notes, setNotes] = useState("");
  const [vals, setVals] = useState<Record<string, { q: string; rej: string; qs: "ACCEPTED" | "ACCEPTED_WITH_NCR" | "REJECTED"; note: string }>>(
    Object.fromEntries(lines.map((l) => [l.poLineId, { q: String(Math.max(0, l.ordered - l.received)), rej: "0", qs: "ACCEPTED", note: "" }])),
  );
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (id: string, p: Partial<(typeof vals)[string]>) => setVals((v) => ({ ...v, [id]: { ...v[id], ...p } }));

  const submit = () => {
    start(async () => {
      const r = await createGRNAction({
        poId, warehouseId: wh, receivedDate: new Date(date), receiverName: recv, deliveryNoteNo: dn || null, notes: notes || null,
        lines: lines.map((l) => ({ poLineId: l.poLineId, qtyReceived: Number(vals[l.poLineId].q) || 0, qtyRejected: Number(vals[l.poLineId].rej) || 0, qualityStatus: vals[l.poLineId].qs, note: vals[l.poLineId].note || null })),
      } as never);
      if (r.ok) { toast("ok", r.message!); router.push(`/grn/${(r.data as { id: string }).id}`); router.refresh(); } else toast("bad", r.error);
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card grid gap-4 p-4 md:grid-cols-4">
        <div className="label"><span>PO</span><div className="text-sm font-semibold text-ink">{poNumber}</div></div>
        <label className="label"><span className="req">Qəbul anbarı</span><select className="select" value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="label"><span className="req">Qəbul tarixi</span><input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label"><span className="req">Qəbul edən</span><input className="input" value={recv} onChange={(e) => setRecv(e.target.value)} /></label>
        <label className="label"><span>Qaimə / yol vərəqəsi №</span><input className="input" value={dn} onChange={(e) => setDn(e.target.value)} /></label>
        <label className="label md:col-span-3"><span>Qeyd</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </section>
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">Həqiqi sayılmış miqdar</h2>
        <p className="mb-3 text-xs text-muted">Qismən qəbul mümkündür. Rədd edilən miqdar anbara daxil olmur. Sifarişdən artıq qəbul təsdiq zamanı bloklanır.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Material</th><th className="num">Sifariş</th><th className="num">Əvvəl qəbul</th><th className="num">Açıq</th><th className="w-28">Gələn</th><th className="w-28">Rədd</th><th>Keyfiyyət</th><th>Qeyd</th></tr></thead>
            <tbody>{lines.map((l) => {
              const v = vals[l.poLineId];
              const open = l.ordered - l.received;
              const accepted = (Number(v.q) || 0) - (v.qs === "REJECTED" ? Number(v.q) || 0 : Number(v.rej) || 0);
              return (
                <tr key={l.poLineId} className="align-top">
                  <td className="pt-3">{l.lineNo}</td><td className="pt-3">{l.label}</td>
                  <td className="num pt-3">{l.ordered}</td><td className="num pt-3">{l.received}</td><td className="num pt-3 font-semibold">{open}</td>
                  <td><input className="input text-right" type="number" min={0} step="any" value={v.q} onChange={(e) => set(l.poLineId, { q: e.target.value })} />
                    {accepted > open && <div className="field-err">Artıq mal: +{accepted - open}</div>}
                    {accepted > 0 && accepted < open && <div className="text-[11px] text-warn">Qismən: {open - accepted} qalacaq</div>}
                  </td>
                  <td><input className="input text-right" type="number" min={0} step="any" value={v.rej} disabled={v.qs === "REJECTED"} onChange={(e) => set(l.poLineId, { rej: e.target.value })} /></td>
                  <td><select className="select" value={v.qs} onChange={(e) => set(l.poLineId, { qs: e.target.value as never })}><option value="ACCEPTED">Qəbul</option><option value="ACCEPTED_WITH_NCR">NCR ilə qəbul</option><option value="REJECTED">Tam rədd</option></select></td>
                  <td><input className="input" value={v.note} onChange={(e) => set(l.poLineId, { note: e.target.value })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Yadda saxlanılır…" : "Qaralama kimi saxla"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
    </form>
  );
}
