"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/client/toast";
import { createReservationAction } from "./actions";

export function ReservationForm({ variantId, warehouses, projects }: { variantId: string; warehouses: { id: string; name: string }[]; projects: { id: string; code: string; name: string }[] }) {
  const [wh, setWh] = useState(warehouses[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [pr, setPr] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createReservationAction({ warehouseId: wh, variantId, qty: Number(qty), projectId: pr || null, reason: reason || null });
          if (r.ok) { toast("ok", r.message!); setQty(""); setReason(""); router.refresh(); } else toast("bad", r.error);
        });
      }}
    >
      <label className="label"><span>Anbar</span><select className="select" value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className="label w-28"><span className="req">Miqdar</span><input className="input" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
      <label className="label"><span>Layihə</span><select className="select" value={pr} onChange={(e) => setPr(e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
      <label className="label min-w-[160px] flex-1"><span>Səbəb</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
      <button className="btn btn-brand" disabled={pending || !qty}>{pending ? "…" : "Rezerv et"}</button>
    </form>
  );
}
