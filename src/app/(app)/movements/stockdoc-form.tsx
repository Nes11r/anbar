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
  employees: { id: string; name: string; label: string; group: "ENGINEER" | "WORKER"; projectId: string | null }[];
  suppliers: { id: string; label: string }[];
  canOverride: boolean;
  /** Project-limited users may only take material out of these warehouses (their site + quarantine). */
  sourceWarehouseIds?: string[];
  /** creates requests (drafts) that the warehouse approves */
  requestOnly?: boolean;
}
export interface StockDocInitial {
  kind: Kind; warehouseId: string; toWarehouseId?: string | null; projectId?: string | null; employeeId?: string | null; employeeName?: string | null; employeeGroup?: "ENGINEER" | "WORKER" | null; supplierId?: string | null;
  recipientName?: string | null; purpose?: string | null; reason?: string | null; externalRef?: string | null; docDate: string; notes?: string | null; lines: EditorLine[];
}

const OUTBOUND: Kind[] = ["ISSUE_PROJECT", "ISSUE_EMPLOYEE", "RETURN_TO_SUPPLIER", "TRANSFER"];

export function StockDocForm({ kind, options, initial, id, version, preset }: { kind: Kind; options: StockDocOptions; initial?: StockDocInitial; id?: string; version?: number; preset?: { warehouseId?: string; toWarehouseId?: string; employeeId?: string } }) {
  const normal = options.warehouses.filter((w) => w.type === "NORMAL");
  const quarantine = options.warehouses.filter((w) => w.type === "QUARANTINE");
  const siteOf = (projectId?: string | null) => (projectId ? options.warehouses.find((w) => w.projectId === projectId)?.id : undefined);
  const presetEmp = preset?.employeeId ? options.employees.find((e) => e.id === preset.employeeId) : undefined;
  const [h, setH] = useState<Omit<StockDocInitial, "lines">>(
    (initial ? { ...initial, employeeName: initial.employeeName ?? options.employees.find((e) => e.id === initial.employeeId)?.name ?? null } : null) ?? {
      kind,
      warehouseId: preset?.warehouseId && options.warehouses.some((w) => w.id === preset.warehouseId)
        ? preset.warehouseId
        : kind === "ISSUE_PROJECT"
        ? options.warehouses.find((w) => w.projectId && (!options.sourceWarehouseIds || options.sourceWarehouseIds.includes(w.id)) && options.sourceWarehouseIds)?.id ?? ""
        : siteOf(presetEmp?.projectId) ?? (options.sourceWarehouseIds ? normal.find((w) => options.sourceWarehouseIds!.includes(w.id))?.id : undefined) ?? normal.find((w) => !w.projectId)?.id ?? normal[0]?.id ?? "",
      toWarehouseId: preset?.toWarehouseId ?? null,
      employeeId: presetEmp?.id ?? null,
      employeeName: presetEmp?.name ?? null,
      projectId: presetEmp?.projectId ?? (kind === "ISSUE_PROJECT" || kind === "RETURN_FROM_PROJECT" ? options.warehouses.find((w) => w.id === preset?.warehouseId || (kind === "ISSUE_PROJECT" && options.sourceWarehouseIds?.includes(w.id) && w.projectId))?.projectId ?? null : null),
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
  const whProject = options.warehouses.find((w) => w.id === h.warehouseId)?.projectId ?? null;
  const knownNames = useMemo(
    () => [...new Set(options.employees.filter((e) => !whProject || e.projectId === whProject).map((e) => e.name))].sort((a, b) => a.localeCompare(b, "az")),
    [options.employees, whProject],
  );
  const holders = options.employees.filter((e) => !whProject || e.projectId === whProject);
  const isNewWorker = kind === "ISSUE_EMPLOYEE" && !!h.employeeName?.trim() && !emp;
  const issueGroup = emp?.group ?? (isNewWorker ? h.employeeGroup ?? "WORKER" : undefined);
  const onWorkerName = (name: string) => {
    const n = name.replace(/\s+/g, " ").trim().toLocaleLowerCase("az");
    const match = n ? options.employees.find((e) => e.name.toLocaleLowerCase("az") === n && (!whProject || e.projectId === whProject)) : undefined;
    setH((x) => ({ ...x, employeeName: name, employeeId: match?.id ?? null, projectId: match?.projectId ?? whProject ?? null }));
  };
  const projectLabel = (pid: string) => options.projects.find((p) => p.id === pid)?.label;
  const siteTargets = options.warehouses
    .filter((w) => w.projectId && w.id !== h.warehouseId && !options.warehouses.find((x) => x.id === h.warehouseId)?.projectId)
    .map((w) => ({ id: w.id, label: projectLabel(w.projectId!) ?? w.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "az"));
  const otherTargets = options.warehouses.filter((w) => !w.projectId && w.id !== h.warehouseId);
  const allowedSrc = (w: { id: string }) => !options.sourceWarehouseIds || options.sourceWarehouseIds.includes(w.id);
  const srcWarehouses = (kind === "ISSUE_PROJECT"
    ? options.warehouses.filter((w) => w.projectId)
    : kind === "TRANSFER" || kind === "ADJUSTMENT" || kind === "RETURN_TO_SUPPLIER" ? options.warehouses : normal
  ).filter(allowedSrc);
  const fromSite = !!whProject;

  const submit = () => {
    const filled = lines.filter((l) => l.variant);
    if (!filled.length) { toast("bad", "Ən azı bir material seçin."); return; }
    if (filled.some((l) => !(Number(l.qty) > 0))) { toast("bad", "Hər sətirdə miqdar 0-dan böyük olmalıdır."); return; }
    if (kind === "ISSUE_EMPLOYEE" && !h.employeeId && (h.employeeName?.trim().length ?? 0) < 3) {
      setErrors({ employeeName: "İşçinin adını və soyadını yazın" }); toast("bad", "İşçinin adını və soyadını yazın."); return;
    }
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
      employeeName: kind === "ISSUE_EMPLOYEE" && !h.employeeId ? h.employeeName?.trim() || null : null,
      employeeGroup: kind === "ISSUE_EMPLOYEE" && !h.employeeId ? h.employeeGroup ?? "WORKER" : null,
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
          <span className="req">{kind === "TRANSFER" ? "Haradan" : kind.startsWith("RETURN_FROM") ? "Qəbul edən anbar" : kind === "ISSUE_PROJECT" ? "Hansı sahədə istifadə olundu" : "Anbar"}</span>
          <select className="select" value={h.warehouseId} onChange={(e) => { const v = e.target.value; const pid = options.warehouses.find((w) => w.id === v)?.projectId ?? null; setH((x) => (kind === "ISSUE_EMPLOYEE" ? { ...x, warehouseId: v, employeeId: null, projectId: null } : kind === "ISSUE_PROJECT" ? { ...x, warehouseId: v, projectId: pid } : { ...x, warehouseId: v })); }}>
            {kind === "ISSUE_PROJECT" && <option value="">— layihənin sahəsini seçin —</option>}
            {srcWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        {kind === "TRANSFER" && (
          <label className="label md:col-span-2"><span className="req">{fromSite ? "Hara qaytarılır" : "Hansı layihəyə göndərilir"}</span>
            <select className="select" value={h.toWarehouseId ?? ""} onChange={(e) => set("toWarehouseId", e.target.value)} aria-invalid={!!errors.toWarehouseId}>
              <option value="">— seçin —</option>
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
        {kind === "RETURN_FROM_PROJECT" && (
          <label className="label md:col-span-2"><span className="req">Layihə</span>
            <select className="select" value={h.projectId ?? ""} onChange={(e) => set("projectId", e.target.value)} aria-invalid={!!errors.projectId}>
              <option value="">— seçin —</option>
              {options.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        {kind === "ISSUE_EMPLOYEE" && (
          <div className="label md:col-span-2">
            <label className="grid gap-1"><span className="req">İşçinin adı, soyadı</span>
              <input className="input" list="known-workers" value={h.employeeName ?? ""} onChange={(e) => onWorkerName(e.target.value)} placeholder="məs. Elvin Məmmədov" autoComplete="off" aria-invalid={!!errors.employeeName} maxLength={200} />
            </label>
            <datalist id="known-workers">{knownNames.map((n) => <option key={n} value={n} />)}</datalist>
            {errors.employeeName ? <span className="field-err">{errors.employeeName}</span> : emp ? (
              <span className="text-[11px] font-normal text-muted">Bu işçiyə əvvəl də material verilib ({az.employeeGroup[emp.group]}).</span>
            ) : isNewWorker ? (
              <span className="flex flex-wrap items-center gap-2 text-[11px] font-normal text-muted">Yeni ad — yadda saxlanılacaq.
                {(["WORKER", "ENGINEER"] as const).map((g) => (
                  <label key={g} className={`chip cursor-pointer ${(h.employeeGroup ?? "WORKER") === g ? "!bg-brand !text-brand-ink !border-brand" : ""}`}>
                    <input type="radio" className="sr-only" name="employeeGroup" checked={(h.employeeGroup ?? "WORKER") === g} onChange={() => setH((x) => ({ ...x, employeeGroup: g }))} />{az.employeeGroup[g]}
                  </label>
                ))}
              </span>
            ) : <span className="text-[11px] font-normal text-muted">Adı yazın — əvvəl material verilmiş işçilər siyahıda çıxacaq.</span>}
          </div>
        )}
        {kind === "RETURN_FROM_EMPLOYEE" && (
          <label className="label md:col-span-2"><span className="req">Kimdən geri alınır</span>
            <select className="select" value={h.employeeId ?? ""} onChange={(e) => { const ee = options.employees.find((x) => x.id === e.target.value); setH((x) => ({ ...x, employeeId: e.target.value, projectId: ee?.projectId ?? x.projectId ?? null, warehouseId: id ? x.warehouseId : siteOf(ee?.projectId) ?? x.warehouseId })); }} aria-invalid={!!errors.employeeId}>
              <option value="">— işçini seçin —</option>
              {holders.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
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
          <label className="label"><span className={kind === "ISSUE_PROJECT" || kind === "TRANSFER" ? "req" : undefined}>{kind === "TRANSFER" ? "Daşıyan şəxs" : kind === "ISSUE_PROJECT" ? "Kim istifadə etdi (usta / briqada)" : "Təhvil alan"}</span><input className="input" value={h.recipientName ?? ""} onChange={(e) => set("recipientName", e.target.value)} aria-invalid={!!errors.recipientName} placeholder={kind === "TRANSFER" ? "Ad, soyad" : undefined} />{errors.recipientName && <span className="field-err">{errors.recipientName}</span>}</label>
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
          employeeGroup={kind === "ISSUE_EMPLOYEE" ? issueGroup : undefined}
          allowOverride={options.canOverride}
          errors={errors}
        />
      </section>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? (options.requestOnly ? "Göndərilir…" : "Təsdiqlənir…") : id ? "Dəyişiklikləri saxla" : options.requestOnly ? "Təsdiqə göndər" : "Təsdiqlə"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
      <p className="text-xs text-muted">
        {options.requestOnly ? "Bu sorğudur: anbardar və ya anbar müdiri təsdiqləyəndə qalıq dəyişəcək. Təsdiqə qədər sorğunu dəyişə və ya ləğv edə bilərsiniz." : id ? "Bu qaralamadır — saxladıqdan sonra sənəd səhifəsində “Təsdiqlə” düyməsini basın." : kind === "TRANSFER" ? "“Təsdiqlə” basanda materiallar dərhal seçilən layihənin sahə anbarına keçir və sahə anbarı səhifəsi açılır." : "“Təsdiqlə” basanda qalıq dərhal yenilənir. Səhv olarsa, sənəd səhifəsindən ləğv edə bilərsiniz."}
      </p>
    </form>
  );
}
