"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MR_LISTS } from "@/i18n/az";
import { VariantPicker, type VariantOption } from "@/components/client/variant-picker";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import type { MRInput } from "@/server/services/procurement";
import { createMRAction, updateMRAction } from "./actions";

export interface MRLineState { key: string; variant: VariantOption | null; materialCode: string; description: string; size: string; gradeStandard: string; uomCode: string; qtyRequired: string; surplusPct: string; estUnitPrice: string; requiredDate: string; remarks: string }
export interface MRHeaderState {
  projectId: string; discipline: string; disciplineOther: string; projectPhase: string; requestType: MRInput["requestType"]; priority: MRInput["priority"]; supplyCategory: string; procurementRoute: string;
  supersedesMrNumber: string; revisionReason: string; dateRaised: string; requiredOnSiteDate: string; requesterName: string; requesterPosition: string; justification: string; notes: string; currency: string; deliveryWarehouseId: string;
  referenceDocs: { docType: string; docNumber: string; revision: string; title: string }[];
}

const blankLine = (): MRLineState => ({ key: Math.random().toString(36).slice(2), variant: null, materialCode: "", description: "", size: "", gradeStandard: "", uomCode: "PCS", qtyRequired: "", surplusPct: "0", estUnitPrice: "", requiredDate: "", remarks: "" });

export function MRForm({ projects, warehouses, units, defaults, initial, id, version, lockProject }: {
  projects: { id: string; label: string }[]; warehouses: { id: string; name: string }[]; units: { code: string; label: string }[];
  defaults: { requesterName: string; projectId?: string }; initial?: { h: MRHeaderState; lines: MRLineState[] }; id?: string; version?: number; lockProject?: boolean;
}) {
  const [h, setH] = useState<MRHeaderState>(initial?.h ?? {
    projectId: defaults.projectId ?? "", discipline: "", disciplineOther: "", projectPhase: "", requestType: "NEW", priority: "NORMAL", supplyCategory: "", procurementRoute: "", supersedesMrNumber: "", revisionReason: "",
    dateRaised: todayIso(), requiredOnSiteDate: todayIso(), requesterName: defaults.requesterName, requesterPosition: "", justification: "", notes: "", currency: "AZN", deliveryWarehouseId: warehouses[0]?.id ?? "", referenceDocs: [],
  });
  const [lines, setLines] = useState<MRLineState[]>(initial?.lines ?? [blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (k: keyof MRHeaderState, v: string) => setH((x) => ({ ...x, [k]: v }));
  const upd = (key: string, p: Partial<MRLineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.qtyRequired) || 0) * (1 + (Number(l.surplusPct) || 0) / 100) * (Number(l.estUnitPrice) || 0), 0);

  const submit = () => {
    const filled = lines.filter((l) => l.description.trim() || l.variant);
    const payload = {
      ...h,
      referenceDocs: h.referenceDocs.filter((r) => r.docNumber.trim()),
      dateRaised: new Date(h.dateRaised), requiredOnSiteDate: new Date(h.requiredOnSiteDate), formData: {},
      lines: filled.map((l) => ({ variantId: l.variant?.id ?? null, materialCode: l.materialCode || l.variant?.sku || null, description: l.description || (l.variant ? `${l.variant.name}${l.variant.model ? " " + l.variant.model : ""}` : ""), size: l.size || l.variant?.size || null, gradeStandard: l.gradeStandard || null, uomCode: l.uomCode, qtyRequired: Number(l.qtyRequired), surplusPct: Number(l.surplusPct) || 0, estUnitPrice: l.estUnitPrice === "" ? null : Number(l.estUnitPrice), requiredDate: l.requiredDate ? new Date(l.requiredDate) : null, remarks: l.remarks || null })),
    } as unknown as MRInput;
    start(async () => {
      const r = id ? await updateMRAction(id, version!, payload) : await createMRAction(payload);
      if (r.ok) { toast("ok", r.message!); router.push(`/mr/${(r.data as { id: string }).id}`); router.refresh(); }
      else { setErrors(r.fieldErrors ?? {}); toast("bad", r.error); }
    });
  };
  const E = (k: string) => errors[k] && <span className="field-err">{errors[k]}</span>;

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">1. Tələbin identifikasiyası</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="label"><span className="req">Tələb növü</span><select className="select" value={h.requestType} onChange={(e) => set("requestType", e.target.value)}><option value="NEW">New / Yeni</option><option value="REVISION">Revision / Reviziya</option><option value="REPLACEMENT">Replacement / Əvəzləmə</option><option value="CANCELLATION">Cancellation / Ləğv</option></select></label>
          <label className="label"><span className="req">Prioritet</span><select className="select" value={h.priority} onChange={(e) => set("priority", e.target.value)}><option value="NORMAL">Normal</option><option value="URGENT">Urgent / Təcili</option><option value="EMERGENCY">Emergency / Fövqəladə</option></select></label>
          <label className="label"><span>Supply category</span><select className="select" value={h.supplyCategory} onChange={(e) => set("supplyCategory", e.target.value)}><option value="">—</option>{MR_LISTS.SUPPLY_CATEGORY.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
          <label className="label"><span>Procurement route</span><select className="select" value={h.procurementRoute} onChange={(e) => set("procurementRoute", e.target.value)}><option value="">—</option>{MR_LISTS.PROCUREMENT_ROUTE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
          <label className="label"><span className="req">MR tarixi</span><input className="input" type="date" value={h.dateRaised} onChange={(e) => set("dateRaised", e.target.value)} /></label>
          <label className="label"><span className="req">Sahəyə tələb tarixi (RoS)</span><input className="input" type="date" value={h.requiredOnSiteDate} min={h.dateRaised} onChange={(e) => set("requiredOnSiteDate", e.target.value)} aria-invalid={!!errors.requiredOnSiteDate} />{E("requiredOnSiteDate")}</label>
          <label className="label"><span>Əvəz etdiyi MR №</span><input className="input" value={h.supersedesMrNumber} onChange={(e) => set("supersedesMrNumber", e.target.value)} /></label>
          <label className="label"><span className={h.requestType === "REVISION" || h.requestType === "CANCELLATION" ? "req" : undefined}>Reviziya / ləğv səbəbi</span><input className="input" value={h.revisionReason} onChange={(e) => set("revisionReason", e.target.value)} aria-invalid={!!errors.revisionReason} />{E("revisionReason")}</label>
        </div>
        <h3 className="mb-2 mt-4 text-xs font-bold text-muted">İstinad sənədləri</h3>
        {h.referenceDocs.map((r, i) => (
          <div key={i} className="mb-2 grid gap-2 md:grid-cols-[180px_1fr_100px_2fr_auto]">
            <select className="select" value={r.docType} onChange={(e) => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.map((y, j) => (j === i ? { ...y, docType: e.target.value } : y)) }))}>{MR_LISTS.REF_DOC_TYPE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
            <input className="input" placeholder="Sənəd №" value={r.docNumber} onChange={(e) => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.map((y, j) => (j === i ? { ...y, docNumber: e.target.value } : y)) }))} />
            <input className="input" placeholder="Rev." value={r.revision} onChange={(e) => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.map((y, j) => (j === i ? { ...y, revision: e.target.value } : y)) }))} />
            <input className="input" placeholder="Başlıq" value={r.title} onChange={(e) => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)) }))} />
            <button type="button" className="btn btn-ghost text-bad" onClick={() => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.filter((_, j) => j !== i) }))} aria-label="Sil">✕</button>
          </div>
        ))}
        {h.referenceDocs.length < 10 && <button type="button" className="btn btn-sm" onClick={() => setH((x) => ({ ...x, referenceDocs: [...x.referenceDocs, { docType: "DRAWING", docNumber: "", revision: "", title: "" }] }))}>+ İstinad sənədi</button>}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">2. Layihə və tələb edən</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="label md:col-span-2"><span className="req">Layihə</span><select className="select" value={h.projectId} disabled={lockProject} onChange={(e) => set("projectId", e.target.value)} aria-invalid={!!errors.projectId}><option value="">— seçin —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>{E("projectId")}</label>
          <label className="label"><span className="req">Disiplin</span><select className="select" value={h.discipline} disabled={lockProject} onChange={(e) => set("discipline", e.target.value)} aria-invalid={!!errors.discipline}><option value="">— seçin —</option>{MR_LISTS.DISCIPLINE.map(([c, l]) => <option key={c} value={c}>{l} ({c})</option>)}</select>{E("discipline")}</label>
          {h.discipline === "OTH" && <label className="label"><span className="req">Disiplin (digər)</span><input className="input" value={h.disciplineOther} onChange={(e) => set("disciplineOther", e.target.value)} />{E("disciplineOther")}</label>}
          <label className="label"><span>Layihə fazası</span><select className="select" value={h.projectPhase} onChange={(e) => set("projectPhase", e.target.value)}><option value="">—</option>{MR_LISTS.PROJECT_PHASE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
          <label className="label"><span className="req">Tələb edən</span><input className="input" value={h.requesterName} onChange={(e) => set("requesterName", e.target.value)} /></label>
          <label className="label"><span>Vəzifə</span><input className="input" value={h.requesterPosition} onChange={(e) => set("requesterPosition", e.target.value)} /></label>
          <label className="label"><span>Qəbul anbarı</span><select className="select" value={h.deliveryWarehouseId} onChange={(e) => set("deliveryWarehouseId", e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label className="label"><span>Valyuta</span><select className="select" value={h.currency} onChange={(e) => set("currency", e.target.value)}>{MR_LISTS.CURRENCY.map(([c, l]) => <option key={c} value={c}>{c} — {l}</option>)}</select></label>
        </div>
        {lockProject && <p className="mt-2 text-xs text-muted">MR nömrəsi layihə və disiplinə bağlıdır, ona görə dəyişdirilmir.</p>}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">3. Material cədvəli</h2>
        <p className="mb-3 text-xs text-muted">Hər sətirdə bir material. Kataloqdan seçsəniz anbardakı mövcud qalıq avtomatik çıxılır (Net = Tələb × (1+surplus%) − stok). Kataloqda olmayan material üçün təsviri yazın; PO-dan əvvəl kataloqa əlavə edilməlidir.</p>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-muted">Sətir {i + 1}</span><button type="button" className="btn btn-sm btn-ghost text-bad" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}>Sil</button></div>
              <div className="grid gap-2 md:grid-cols-6">
                <div className="md:col-span-3"><span className="label mb-1">Kataloq (ixtiyari)</span><VariantPicker value={l.variant} onChange={(v) => upd(l.key, { variant: v, uomCode: v ? v.unit : l.uomCode, size: v?.size ?? l.size, description: l.description || (v ? `${v.name}${v.model ? " " + v.model : ""}` : "") })} /></div>
                <label className="label md:col-span-3"><span className="req">Təsvir və texniki spesifikasiya</span><input className="input" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} aria-invalid={!!errors[`lines.${i}.description`]} /></label>
                <label className="label"><span>Material / tag kodu</span><input className="input" value={l.materialCode} onChange={(e) => upd(l.key, { materialCode: e.target.value })} /></label>
                <label className="label"><span>Ölçü</span><input className="input" value={l.size} onChange={(e) => upd(l.key, { size: e.target.value })} /></label>
                <label className="label"><span>Grade / standart</span><input className="input" value={l.gradeStandard} onChange={(e) => upd(l.key, { gradeStandard: e.target.value })} /></label>
                <label className="label"><span className="req">UoM</span><select className="select" value={l.uomCode} onChange={(e) => upd(l.key, { uomCode: e.target.value })}>{units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select></label>
                <label className="label"><span className="req">Tələb olunan</span><input className="input text-right" type="number" min={0} step="any" value={l.qtyRequired} onChange={(e) => upd(l.key, { qtyRequired: e.target.value })} aria-invalid={!!errors[`lines.${i}.qtyRequired`]} />{l.variant && <span className="text-[11px] font-normal text-muted">stokda mövcud: {Number(l.variant.available).toLocaleString("az-AZ")}</span>}</label>
                <label className="label"><span>Surplus %</span><input className="input text-right" type="number" min={0} max={100} step="any" value={l.surplusPct} onChange={(e) => upd(l.key, { surplusPct: e.target.value })} /></label>
                <label className="label"><span>Təxmini vahid qiymət</span><input className="input text-right" type="number" min={0} step="any" value={l.estUnitPrice} onChange={(e) => upd(l.key, { estUnitPrice: e.target.value })} /></label>
                <label className="label"><span>Lazım olma tarixi</span><input className="input" type="date" value={l.requiredDate} onChange={(e) => upd(l.key, { requiredDate: e.target.value })} /></label>
                <label className="label md:col-span-3"><span>Qeyd</span><input className="input" value={l.remarks} onChange={(e) => upd(l.key, { remarks: e.target.value })} /></label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Sətir</button>
          <span className="text-sm">Təxmini dəyər (stok çıxılmadan): <b className="tabular-nums">{total.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {h.currency}</b></span>
        </div>
      </section>

      <section className="card grid gap-4 p-4 md:grid-cols-2">
        <label className="label"><span className={h.priority !== "NORMAL" ? "req" : undefined}>Əsaslandırma</span><textarea className="textarea" value={h.justification} onChange={(e) => set("justification", e.target.value)} aria-invalid={!!errors.justification} placeholder="Təcili / fövqəladə, tək mənbə və ya büdcədən kənar tələblər üçün məcburidir" />{E("justification")}</label>
        <label className="label"><span>Qeyd</span><textarea className="textarea" value={h.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </section>

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Yadda saxlanılır…" : "Qaralama kimi saxla"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
    </form>
  );
}
