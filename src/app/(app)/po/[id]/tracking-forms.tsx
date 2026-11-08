"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/client/toast";
import { setPOPaymentAction, setPOShipmentAction } from "../actions";

/** Procurement records payment and shipment progress → visible in the order tracker. */
export function PoTrackingForms({ poId, paymentStatus, paymentRef, carrier, trackingNo, canShip }: { poId: string; paymentStatus: string; paymentRef: string | null; carrier: string | null; trackingNo: string | null; canShip: boolean }) {
  const [ref, setRef] = useState(paymentRef ?? "");
  const [c, setC] = useState(carrier ?? "");
  const [t, setT] = useState(trackingNo ?? "");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast("ok", r.message ?? "Yadda saxlanıldı"); router.refresh(); } else toast("bad", r.error ?? "Xəta");
    });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-muted">Ödəniş</h3>
        <input className="input" placeholder="Ödəniş tapşırığı / hesab-faktura №" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn btn-sm ${paymentStatus === "PENDING" ? "btn-brand" : ""}`} disabled={pending} onClick={() => run(() => setPOPaymentAction(poId, "PENDING", ref))}>Ödəniş gözləyir</button>
          <button type="button" className={`btn btn-sm ${paymentStatus === "PAID" ? "btn-brand" : ""}`} disabled={pending} onClick={() => run(() => setPOPaymentAction(poId, "PAID", ref))}>Ödənildi</button>
          {paymentStatus !== "NOT_SET" && <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => setPOPaymentAction(poId, "NOT_SET", ref))}>Sıfırla</button>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-muted">Göndərilmə (yoldadır)</h3>
        <div className="flex gap-2">
          <input className="input" placeholder="Daşıyıcı (məs. DHL, tədarükçünün maşını)" value={c} onChange={(e) => setC(e.target.value)} maxLength={100} />
          <input className="input" placeholder="İzləmə №" value={t} onChange={(e) => setT(e.target.value)} maxLength={100} />
        </div>
        <div><button type="button" className="btn btn-sm" disabled={pending || !canShip} onClick={() => run(() => setPOShipmentAction(poId, c, t))}>Yoldadır kimi qeyd et</button></div>
      </div>
    </div>
  );
}
