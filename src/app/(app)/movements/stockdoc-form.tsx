"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { az } from "@/i18n/az";
import { LinesEditor, newLine, type EditorLine } from "@/components/client/lines-editor";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import type { StockDocInput } from "@/server/services/stockdocs";
import { createAndPostStockDocAction, updateStockDocAction } from "./actions";

type Kind = StockDocInput["kind"];
export interface StockDocOptions {
  warehouses: { id: string; name: string; type: string; projectId?: string | null }[];
  projects: { id: string; label: string }[];
  employees: { id: string; label: string; group: "ENGINEER" | "WORKER"; projectId: string | null }[];
  suppliers: { id: string; label: string }[];
  canOverride: boolean;
}
export interface StockDocInitial {
  kind: Kind; warehouseId: string; toWarehouseId?: string | null; projectId?: string | null; employeeId?: string | null; supplierId?: string | null;
  recipientName?: string | null; purpose?: string | null; reason?: string | null; externalRef?: string | null; docDate: string; notes?: string | null; lines: EditorLine[];
}

const OUTBOUND: Kind[] = ["ISSUE_PROJECT", "ISSUE_EMPLOYEE", "RETURN_TO_SUPPLIER", "TRANSFER"];

export function StockDocForm({ kind, options, initial, id, version, preset }: { kind: Kind; options: StockDocOptions; initial?: StockDocInitial; id?: string; version?: number; preset?: { warehouseId?: string; toWarehouseId?: string; employeeId?: string } }) {
  const normal = options.warehouses.filter((w) => w.type === "NORMAL");
  const quarantine = options.warehouses.filter((w) => w.type === "QUARANTINE");
  const siteOf = (projectId?: string | null) => (projectId ? options.warehouses.find((w) => w.projectId === projectId)?.id : undefined);
  const presetEmp = preset?.employeeId ? options.employees.find((e) => e.id === preset.employeeId) : undefined;
  const [h, setH] = useState<Omit<StockDocInitial, "lines">>(
    initial ?? {
      kind,
      warehouseId: preset?.warehouseId && options.warehouses.some((w) => w.id === preset.warehouseId) ? preset.warehouseId : siteOf(presetEmp?.projectId) ?? normal[0]?.id ?? "",
      toWarehouseId: preset?.toWarehouseId ?? null,
      employeeId: presetEmp?.id ?? null,
      projectId: presetEmp?.projectId ?? null,
      docDate: todayIso(),
    },
  );
  const [lines, setLinesState] = useState<EditorLine[]>(initial?.lines?.length ? initial.lines : [newLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (k: keyof StockDocInitial, v: string | null) => setH((x) => ({ ...x, [k]: v }));
  const emp = useMemo(() => options.employees.find((e) => e.id === h.employeeId), [options.employees, h.employeeId]);
  const projectLabel = (pid: string) => options.projects.find((p) => p.id === pid)?.label;
  const siteTargets = options.warehouses
    .filter((w) => w.projectId && w.id !== h.warehouseId)
    .map((w) => ({ id: w.id, label: projectLabel(w.projectId!) ?? w.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "az"));
  const otherTargets = options.warehouses.filter((w) => !w.projectId && w.id !== h.warehouseId);
  const srcWarehouses =kind === "TRANSFER" || kind === "ADJUSTMENT" || kind === "RETURN_TO_SUPPLIER" ? options.warehouses : normal;

  const submit = () => {
    const filled = lines.filter((l) => l.variant);
    if (!filled.length) { toast("bad", "Ən azı bir material seçin."); return; }
    if (filled.some((l) => !(Number(l.qty) > 0))) { toast("bad", "Hər sətirdə miqdar 0-dan böyük olmalıdır."); return; }
    if (kind === "TRANSFER") {
      const errs: Record<string, string> = {};
      if (!h.toWarehouseId) errs.toWarehouseId = "Hansı layihəyə (anbara) göndərildiyini seçin";
      if (!h.recipientName?.trim()) errs.recipientName = "Daşıyan şəxsi yazın";
      if (Object.keys(errs).length) { setErrors(errs); toast("bad", Object.values(errs)[0]); return; }
    }
    const payload: StockDocInput = {
      kind,
      warehouseId: h.warehouseId,
      toWarehouseId: kind === "TRANSFER" ? h.toWarehouseId ?? null : null,
      projectId: kind === "TRANSFER" ? null : h.projectId || null,
      employeeId: h.employeeId || null,
      supplierId: h.supplierId || null,
      recipientName: h.recipientName || null,
      purpose: h.purpose || null,
      reason: h.reason || null,
      externalRef: h.externalRef || null,
      docDate: new Date(h.docDate),
      notes: h.notes || null,
      lines: filled.map((l) => ({ variantId: l.variant!.id, qty: Number(l.qty), direction: (l.direction === 1 ? 1 : -1) as 1 | -1, condition: l.condition ?? null, targetWarehouseId: l.condition === "DEFECTIVE" ? l.targetWarehouseId ?? quarantine[0]?.id ?? null : null, overrideReason: l.overrideReason || null, note: l.note || null })),
    };
    start(async () => {
      const r = id ? await updateStockDocAction(id, version!, payload) : await createAndPostStockDocAction(payload);
      if (r.ok) {
        const d = r.data as { id: string; redirect?: string };
        toast("ok", r.message!);
        router.push(d.redirect ?? `/movements/${d.id}`);
        router.refresh();
      }
      else { setErrors(r.fieldErrors ?? {}); toast("bad", r.error); }
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card grid gap-4 p-4 md:grid-cols-4">
        <label className="label">
          <span className="req">{kind === "TRANSFER" ? "Haradan (mənbə anbar)" : kind.startsWith("RETURN_FROM") ? "Qəbul edən anbar" : "Anbar"}</span>
          <select className="select" value={h.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}>
            {srcWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        {kind === "TRANSFER" && (
          <label className="label md:col-span-2"><span className="req">Hansı layihəyə göndərilir</span>
            <select className="select" value={h.toWarehouseId ?? ""} onChange={(e) => set("toWarehouseId", e.target.value)} aria-invalid={!!errors.toWarehouseId}>
              <option value="">— layihəni seçin —</option>
              <optgroup label="Layihənin sahə anbarı">
                {siteTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
              {otherTargets.length > 0 && (
                <optgroup label="Digər anbarlar">
                  {otherTargets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </optgroup>
              )}
            </select>
            {errors.toWarehouseId && <span className="field-err">{errors.toWarehouseId}</span>}
          </label>
        )}
        {(kind === "ISSUE_PROJECT" || kind === "RETURN_FROM_PROJECT") && (
          <label className="label md:col-span-2"><span className="req">Layihə</span>
            <select className="select" value={h.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)} aria-invalid={!!errors.projectId}>
              <option value="">— seçin —</option>
              {options.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        {(kind === "ISSUE_EMPLOYEE" || kind === "RETURN_FROM_EMPLOYEE") && (
          <>
            <label className="label md:col-span-2"><span className="req">İşçi</span>
              <select className="select" value={h.employeeId ?? ""} onChange={(e) => { const ee = options.employees.find((x) => x.id === e.target.value); setH((x) => ({ ...x, employeeId: e.target.value, projectId: ee?.projectId ?? x.projectId ?? null, warehouseId: id ? x.warehouseId : siteOf(ee?.projectId) ?? x.warehouseId })); }} aria-invalid={!!errors.employeeId}>
                <option value="">— seçin —</option>
                {options.employees.map((e) => <option key={e.id} value={e.id}>{e.label} · {az.employeeGroup[e.group]}</option>)}
              </select>
            </label>
            <label className="label"><span>Layihə (hesabat üçün)</span>
              <select className="select" value={h.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">İşçinin layihəsi</option>
                {options.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </>
        )}
        {kind === "RETURN_TO_SUPPLIER" && (
          <label className="label md:col-span-2"><span className="req">Tədarükçü</span>
            <select className="select" value={h.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">— seçin —</option>
              {options.suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label className="label"><span className="req">Tarix</span><input className="input" type="date" value={h.docDate} max={todayIso()} onChange={(e) => set("docDate", e.target.value)} /></label>
        {(kind === "ISSUE_PROJECT" || kind === "ISSUE_EMPLOYEE" || kind === "TRANSFER") && (
          <label className="label"><span className={kind === "ISSUE_PROJECT" || kind === "TRANSFER" ? "req" : undefined}>{kind === "TRANSFER" ? "Daşıyan şəxs" : "Təhvil alan"}</span><input className="input" value={h.recipientName ?? ""} onChange={(e) => set("recipientName", e.target.value)} aria-invalid={!!errors.recipientName} placeholder={kind === "TRANSFER" ? "Ad, soyad" : undefined} />{errors.recipientName && <span className="field-err">{errors.recipientName}</span>}</label>
        )}
        {(kind === "ADJUSTMENT" || kind.startsWith("RETURN")) && (
          <label className="label md:col-span-2"><span className={kind === "ADJUSTMENT" ? "req" : undefined}>Səbəb</span><input className="input" value={h.reason ?? ""} onChange={(e) => set("reason", e.target.value)} aria-invalid={!!errors.reason} placeholder={kind === "ADJUSTMENT" ? "məs. zədələnmə, itki, sayım fərqi" : ""} /></label>
        )}
        <label className="label md:col-span-4"><span>Qeyd</span><input className="input" value={h.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">Materiallar</h2>
        <LinesEditor
          lines={lines}
          setLines={(f) => setLinesState(f)}
          warehouseId={h.warehouseId}
          onlyInStock={OUTBOUND.includes(kind)}
          showDirection={kind === "ADJUSTMENT"}
          showCondition={kind === "RETURN_FROM_PROJECT" || kind === "RETURN_FROM_EMPLOYEE"}
          quarantineWarehouses={quarantine}
          employeeGroup={kind === "ISSUE_EMPLOYEE" ? emp?.group : undefined}
          allowOverride={options.canOverride}
          errors={errors}
        />
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Təsdiqlənir…" : id ? "Dəyişiklikləri saxla" : "Təsdiqlə"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
      <p className="text-xs text-muted">
        {id ? "Bu qaralamadır — saxladıqdan sonra sənəd səhifəsində “Təsdiqlə” düyməsini basın." : kind === "TRANSFER" ? "“Təsdiqlə” basanda materiallar dərhal seçilən layihənin sahə anbarına keçir və sahə anbarı səhifəsi açılır." : "“Təsdiqlə” basanda qalıq dərhal yenilənir. Səhv olarsa, sənəd səhifəsindən ləğv edə bilərsiniz."}
      </p>
    </form>
  );
}
