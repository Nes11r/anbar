"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LinesEditor, newLine, type EditorLine } from "@/components/client/lines-editor";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import { createCountAction, updateCountAction } from "./actions";

export function CountForm({
  warehouses,
  initial,
  id,
  version,
}: {
  warehouses: { id: string; name: string }[];
  initial?: { mode: "OPENING" | "CYCLE"; warehouseId: string; countDate: string; countedBy: string; notes: string; lines: EditorLine[] };
  id?: string;
  version?: number;
}) {
  const [mode, setMode] = useState<"OPENING" | "CYCLE">(initial?.mode ?? "OPENING");
  const [wh, setWh] = useState(initial?.warehouseId ?? warehouses[0]?.id ?? "");
  const [date, setDate] = useState(initial?.countDate ?? todayIso());
  const [by, setBy] = useState(initial?.countedBy ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLinesState] = useState<EditorLine[]>(initial?.lines ?? [newLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const setLines = (f: (l: EditorLine[]) => EditorLine[]) => setLinesState(f);

  const submit = () => {
    const filled = lines.filter((l) => l.variant);
    if (!filled.length) { toast("bad", "Ən azı bir material seçin."); return; }
    if (filled.some((l) => l.qty === "")) { toast("bad", "Hər sətirdə sayılmış miqdarı yazın (0 da ola bilər)."); return; }
    const payload = { mode, warehouseId: wh, countDate: new Date(date), countedBy: by, notes, lines: filled.map((l) => ({ variantId: l.variant!.id, countedQty: Number(l.qty), note: l.note || null })) };
    start(async () => {
      const r = id ? await updateCountAction(id, version!, payload) : await createCountAction(payload);
      if (r.ok) { toast("ok", r.message!); router.push(`/inventory/${(r.data as { id: string }).id}`); router.refresh(); }
      else { setErrors(r.fieldErrors ?? {}); toast("bad", r.error); }
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card grid gap-4 p-4 md:grid-cols-4">
        <fieldset className="label md:col-span-4">
          <legend className="mb-1">Rejim</legend>
          <div className="flex flex-wrap gap-2">
            <label className={`chip cursor-pointer ${mode === "OPENING" ? "!bg-brand !text-brand-ink" : ""}`}><input type="radio" className="sr-only" checked={mode === "OPENING"} onChange={() => setMode("OPENING")} />İlkin qalıq (sistemə başlayanda, bir dəfə)</label>
            <label className={`chip cursor-pointer ${mode === "CYCLE" ? "!bg-brand !text-brand-ink" : ""}`}><input type="radio" className="sr-only" checked={mode === "CYCLE"} onChange={() => setMode("CYCLE")} />Dövri sayım (yoxlama, fərq düzəlişi)</label>
          </div>
          <span className="text-[11px] font-normal text-muted">
            {mode === "OPENING" ? "Yalnız anbarda heç bir hərəkəti olmayan variantlar üçün. Təsdiqdə sayılmış miqdar açılış qalığı kimi yazılır." : "Təsdiq anında sistem qalığı ilə sayılan arasındakı fərq düzəliş (+/−) kimi yazılır."}
          </span>
        </fieldset>
        <label className="label"><span className="req">Anbar</span><select className="select" value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="label"><span className="req">Sayım tarixi</span><input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="label md:col-span-2"><span className="req">Sayımı aparan(lar)</span><input className="input" value={by} onChange={(e) => setBy(e.target.value)} aria-invalid={!!errors.countedBy} />{errors.countedBy && <span className="field-err">{errors.countedBy}</span>}</label>
        <label className="label md:col-span-4"><span>Qeyd</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">Sayılmış materiallar</h2>
        <LinesEditor lines={lines} setLines={setLines} warehouseId={wh} qtyLabel="Sayılmış miqdar" errors={errors} />
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Yadda saxlanılır…" : "Qaralama kimi saxla"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
      <p className="text-xs text-muted">Qaralama qalığı dəyişmir. Qalıq yalnız “Təsdiqlə” düyməsi ilə (anbar müdiri) jurnala yazılır.</p>
    </form>
  );
}
