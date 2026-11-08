"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { VariantPicker, type VariantOption } from "@/components/client/variant-picker";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import { createSiteReportAction } from "../../actions";

export interface ReportRow { variantId: string; label: string; unit: string; sysStock: number; sysWorkers: number; stock: string; workers: string; note: string }

export function SiteReportForm({ projectId, rows: initial, reporter }: { projectId: string; rows: ReportRow[]; reporter: string }) {
  const [rows, setRows] = useState<ReportRow[]>(initial);
  const [date, setDate] = useState(todayIso());
  const [by, setBy] = useState(reporter);
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState<VariantOption | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const upd = (id: string, p: Partial<ReportRow>) => setRows((rs) => rs.map((r) => (r.variantId === id ? { ...r, ...p } : r)));

  const add = (v: VariantOption | null) => {
    setAdding(null);
    if (!v || rows.some((r) => r.variantId === v.id)) return;
    setRows((rs) => [...rs, { variantId: v.id, label: `${v.sku} · ${v.name}${v.size ? ` (${v.size})` : ""}`, unit: v.unit, sysStock: 0, sysWorkers: 0, stock: "", workers: "", note: "" }]);
  };

  const submit = () => {
    const filled = rows.filter((r) => r.stock !== "" || r.workers !== "");
    if (!filled.length) { toast("bad", "Ən azı bir materialın rəqəmlərini yazın."); return; }
    if (filled.some((r) => r.stock === "" || r.workers === "")) { toast("bad", "Doldurulan hər sətirdə həm “stokda”, həm “işçilərdə” rəqəmi yazılmalıdır (0 da ola bilər)."); return; }
    start(async () => {
      const r = await createSiteReportAction({ projectId, reportDate: new Date(date), reportedBy: by, notes: notes || null, lines: filled.map((x) => ({ variantId: x.variantId, stockQty: Number(x.stock), withWorkersQty: Number(x.workers), note: x.note || null })) });
      if (r.ok) { toast("ok", r.message!); router.push((r.data as { redirect: string }).redirect); router.refresh(); } else toast("bad", r.error);
    });
  };

  const diffCls = (rep: string, sys: number) => (rep === "" ? "" : Number(rep) === sys ? "text-ok" : "font-bold text-bad");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card grid gap-4 p-4 md:grid-cols-3">
        <label className="label"><span className="req">Hesabat tarixi</span><input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label"><span className="req">Hesabatı verən (sahə anbardarı)</span><input className="input" value={by} onChange={(e) => setBy(e.target.value)} /></label>
        <label className="label"><span>Qeyd</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </section>
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">Sahədən gələn rəqəmlər</h2>
        <p className="mb-3 text-xs text-muted">Hər material üçün sahə anbardarının bildirdiyi rəqəmləri yazın. Sistemin rəqəmi yanında göstərilir. Uyğun gələn rəqəm yaşıl, fərqli olan qırmızı görünür.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="num">Sistem: stokda</th><th>Sahə: stokda</th><th className="num">Sistem: işçilərdə</th><th>Sahə: işçilərdə</th><th>Qeyd</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId}>
                  <td className="font-semibold">{r.label}</td>
                  <td className="num">{r.sysStock} {r.unit}</td>
                  <td><input className={`input w-28 text-right ${diffCls(r.stock, r.sysStock)}`} type="number" min={0} step="any" inputMode="decimal" value={r.stock} onChange={(e) => upd(r.variantId, { stock: e.target.value })} aria-label={`${r.label} stokda`} /></td>
                  <td className="num">{r.sysWorkers} {r.unit}</td>
                  <td><input className={`input w-28 text-right ${diffCls(r.workers, r.sysWorkers)}`} type="number" min={0} step="any" inputMode="decimal" value={r.workers} onChange={(e) => upd(r.variantId, { workers: e.target.value })} aria-label={`${r.label} işçilərdə`} /></td>
                  <td><input className="input" value={r.note} onChange={(e) => upd(r.variantId, { note: e.target.value })} maxLength={500} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Siyahıda olmayan material:</span>
          <div className="min-w-[280px] flex-1"><VariantPicker value={adding} onChange={add} placeholder="Material əlavə et…" /></div>
          <button type="button" className="btn btn-sm" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, stock: String(r.sysStock), workers: String(r.sysWorkers) })))}>Hamısını sistem rəqəmi ilə doldur</button>
        </div>
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saxlanılır…" : "Hesabatı saxla"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
      <p className="text-xs text-muted">Hesabat qalığı avtomatik dəyişmir. Stok fərqi varsa, hesabat səhifəsində “Fərqi sayım sənədinə çevir” ilə anbar müdirinin təsdiqinə göndərilir. İşçilərdəki fərq isə qeyd olunmamış təhvil və ya qaytarma deməkdir.</p>
    </form>
  );
}
