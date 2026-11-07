"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ImportDataType } from "@prisma/client";
import { az } from "@/i18n/az";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import { parseAction } from "../actions";

interface Preview { sheetName: string; headerRow: number; totalRows: number; headers: { index: number; letter: string; label: string }[]; sample: string[][]; sizeColumns: { col: number; size: string }[]; warnings: string[] }
type Fields = Record<ImportDataType, { key: string; label: string; required?: boolean }[]>;

export function MappingForm({ batchId, preview, fields, suggestions, categories, warehouses, initial }: {
  batchId: string; preview: Preview; fields: Fields; suggestions: Record<string, Record<string, number>>;
  categories: { id: string; label: string; isUniform: boolean }[]; warehouses: { id: string; name: string }[];
  initial?: { dataType: ImportDataType; columns: Record<string, number>; sizeColumns: { col: number; size: string }[]; fillDown: string[]; lastRow: number; defaults: Record<string, string | null | undefined> };
}) {
  const [dataType, setDataType] = useState<ImportDataType | "">(initial?.dataType ?? "");
  const [columns, setColumns] = useState<Record<string, number>>(initial?.columns ?? {});
  const [useSizes, setUseSizes] = useState<boolean>((initial?.sizeColumns.length ?? 0) > 0);
  const [sizeCols, setSizeCols] = useState(initial?.sizeColumns.length ? initial.sizeColumns : preview.sizeColumns);
  const [fillDown, setFillDown] = useState<string[]>(initial?.fillDown ?? []);
  const [lastRow, setLastRow] = useState(String(initial?.lastRow ?? 0));
  const [def, setDef] = useState<Record<string, string>>({ categoryId: "", workerGroup: "", unitCode: "PCS", warehouseId: warehouses[0]?.id ?? "", countDate: todayIso(), ...(initial?.defaults as Record<string, string>) });
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const flds = dataType ? fields[dataType] : [];
  const opts = useMemo(() => [["-1", "— yoxdur —"], ...preview.headers.map((h) => [String(h.index), `${h.letter}: ${h.label || "(başlıqsız)"}`])], [preview.headers]);
  const needsCatalog = dataType === "CATALOG" || dataType === "OPENING_BALANCE";

  const chooseType = (t: ImportDataType) => {
    setDataType(t);
    setColumns(suggestions[t] ?? {});
  };

  const submit = () => {
    if (!dataType) { toast("bad", "Məlumat növünü seçin."); return; }
    start(async () => {
      const r = await parseAction(batchId, {
        sheetName: preview.sheetName, dataType, headerRow: preview.headerRow, lastRow: Number(lastRow) || 0,
        columns: Object.fromEntries(flds.map((f) => [f.key, columns[f.key] ?? -1])),
        sizeColumns: useSizes ? sizeCols : [], fillDown,
        defaults: { categoryId: def.categoryId || null, workerGroup: (def.workerGroup || null) as never, unitCode: def.unitCode || null, warehouseId: def.warehouseId || null, countDate: def.countDate || null },
      });
      if (r.ok) { toast("ok", r.message!); router.push(`/import/${batchId}?step=preview`); router.refresh(); } else toast("bad", r.error);
    });
  };

  return (
    <div className="grid gap-4">
      {preview.warnings.map((w, i) => <div key={i} className="alert alert-warn">{w}</div>)}
      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">3. Məlumat növü</h2>
        <p className="mb-3 text-xs text-muted">Sistem vərəq adına görə avtomatik qərar vermir — növü siz seçirsiniz.</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(az.importType) as ImportDataType[]).map((t) => (
            <label key={t} className={`chip cursor-pointer ${dataType === t ? "!bg-brand !text-brand-ink !border-brand" : ""}`}><input type="radio" className="sr-only" checked={dataType === t} onChange={() => chooseType(t)} />{az.importType[t]}</label>
          ))}
        </div>
      </section>
      {dataType && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold">4. Sütunların uyğunlaşdırılması (başlıq sətri: {preview.headerRow})</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {flds.map((f) => (
              <label key={f.key} className="label">
                <span className={f.required ? "req" : undefined}>{f.label}</span>
                <select className="select" value={String(columns[f.key] ?? -1)} onChange={(e) => setColumns((c) => ({ ...c, [f.key]: Number(e.target.value) }))}>
                  {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {(f.key === "group" || f.key === "employeeName") && (
                  <span className="flex items-center gap-1 text-[11px] font-normal"><input type="checkbox" checked={fillDown.includes(f.key)} onChange={(e) => setFillDown((x) => (e.target.checked ? [...x, f.key] : x.filter((k) => k !== f.key)))} /> boş xanalar yuxarıdakı dəyərlə doldurulsun</span>
                )}
              </label>
            ))}
            <label className="label"><span>Son sətir (0 = vərəqin sonu)</span><input className="input" type="number" min={0} value={lastRow} onChange={(e) => setLastRow(e.target.value)} /><span className="text-[11px] font-normal text-muted">Vərəqdə bir neçə cədvəl varsa, birincinin sonunu göstərin. Cəmi {preview.totalRows} sətir.</span></label>
          </div>
          {needsCatalog && (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="label"><span className="req">Kateqoriya (bütün sətirlər)</span><select className="select" value={def.categoryId} onChange={(e) => setDef({ ...def, categoryId: e.target.value })}><option value="">— seçin —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                <label className="label"><span>Standart təyinat (sütun boşdursa)</span><select className="select" value={def.workerGroup} onChange={(e) => setDef({ ...def, workerGroup: e.target.value })}><option value="">— boş: forma üçün “Hər ikisi” —</option>{Object.entries(az.workerGroup).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="label"><span>Standart vahid</span><select className="select" value={def.unitCode} onChange={(e) => setDef({ ...def, unitCode: e.target.value })}>{["PCS", "PAIR", "SET", "PACK", "BOX", "M", "KG", "L"].map((u) => <option key={u}>{u}</option>)}</select></label>
                {dataType === "OPENING_BALANCE" && <>
                  <label className="label"><span className="req">Anbar</span><select className="select" value={def.warehouseId} onChange={(e) => setDef({ ...def, warehouseId: e.target.value })}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                  <label className="label"><span className="req">Sayım tarixi</span><input className="input" type="date" value={def.countDate} onChange={(e) => setDef({ ...def, countDate: e.target.value })} /></label>
                </>}
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={useSizes} onChange={(e) => setUseSizes(e.target.checked)} /> Ölçülər ayrı sütunlardadır (enli cədvəl, məs. “PPE List”: 36, 37 … 62)</label>
                {useSizes && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {preview.headers.filter((h) => h.label).map((h) => {
                      const on = sizeCols.find((s) => s.col === h.index);
                      return <button key={h.index} type="button" className={`chip ${on ? "!bg-accent !text-accent-ink !border-accent" : ""}`} onClick={() => setSizeCols((x) => (on ? x.filter((s) => s.col !== h.index) : [...x, { col: h.index, size: h.label }]))}>{h.letter}:{h.label}</button>;
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="mt-4"><button className="btn btn-primary" onClick={submit} disabled={pending}>{pending ? "Oxunur…" : "Preview hazırla (5. yoxlama)"}</button></div>
        </section>
      )}
      <section className="card p-0">
        <h2 className="border-b border-line px-4 py-3 text-sm font-bold">Vərəqin ilk sətirləri (xam)</h2>
        <div className="tbl-wrap max-h-[420px]">
          <table className="tbl text-xs">
            <thead><tr><th>#</th>{preview.headers.map((h) => <th key={h.index}>{h.letter}</th>)}</tr></thead>
            <tbody>{preview.sample.map((r, i) => <tr key={i} className={i + 1 === preview.headerRow ? "bg-brand-soft font-semibold" : ""}><td className="text-muted">{i + 1}</td>{r.map((c, j) => <td key={j} className="max-w-[160px] truncate" title={c}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
