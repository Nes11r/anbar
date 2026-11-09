"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MR_LISTS } from "@/i18n/az";
import { VariantPicker, type VariantOption } from "@/components/client/variant-picker";
import { useToast } from "@/components/client/toast";
import { todayIso } from "@/lib/format";
import type { MRInput } from "@/server/services/procurement";
import { createMRAction, submitMRAction, updateMRAction } from "./actions";

export interface MRLineState { key: string; variant: VariantOption | null; materialCode: string; description: string; size: string; gradeStandard: string; uomCode: string; qtyRequired: string; surplusPct: string; estUnitPrice: string; requiredDate: string; remarks: string }
export interface MRHeaderState {
  projectId: string; discipline: string; disciplineOther: string; projectPhase: string; requestType: MRInput["requestType"]; priority: MRInput["priority"]; supplyCategory: string; procurementRoute: string;
  supersedesMrNumber: string; revisionReason: string; dateRaised: string; requiredOnSiteDate: string; requesterName: string; requesterPosition: string; justification: string; notes: string; currency: string; deliveryWarehouseId: string;
  referenceDocs: { docType: string; docNumber: string; revision: string; title: string }[];
}

const blankLine = (): MRLineState => ({ key: Math.random().toString(36).slice(2), variant: null, materialCode: "", description: "", size: "", gradeStandard: "", uomCode: "PCS", qtyRequired: "", surplusPct: "0", estUnitPrice: "", requiredDate: "", remarks: "" });

export function MRForm({ projects, warehouses, units, defaults, initial, id, version, lockProject, presetLines }: {
  projects: { id: string; label: string }[]; warehouses: { id: string; name: string }[]; units: { code: string; label: string }[];
  defaults: { requesterName: string; projectId?: string }; initial?: { h: MRHeaderState; lines: MRLineState[] }; id?: string; version?: number; lockProject?: boolean;
  /** e.g. low-stock items pre-filled from the dashboard */
  presetLines?: Omit<MRLineState, "key">[];
}) {
  const [h, setH] = useState<MRHeaderState>(initial?.h ?? {
    projectId: defaults.projectId ?? "", discipline: "", disciplineOther: "", projectPhase: "", requestType: "NEW", priority: "NORMAL", supplyCategory: "", procurementRoute: "", supersedesMrNumber: "", revisionReason: "",
    dateRaised: todayIso(), requiredOnSiteDate: todayIso(), requesterName: defaults.requesterName, requesterPosition: "", justification: "", notes: "", currency: "AZN", deliveryWarehouseId: warehouses[0]?.id ?? "", referenceDocs: [],
  });
  const [lines, setLines] = useState<MRLineState[]>(initial?.lines ?? (presetLines?.length ? presetLines.map((l) => ({ ...l, key: Math.random().toString(36).slice(2) })) : [blankLine()]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (k: keyof MRHeaderState, v: string) => setH((x) => ({ ...x, [k]: v }));
  const upd = (key: string, p: Partial<MRLineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.qtyRequired) || 0) * (1 + (Number(l.surplusPct) || 0) / 100) * (Number(l.estUnitPrice) || 0), 0);

  const submit = (send: boolean) => {
    const filled = lines.filter((l) => l.description.trim() || l.variant);
    const payload = {
      ...h,
      referenceDocs: h.referenceDocs.filter((r) => r.docNumber.trim()),
      dateRaised: new Date(h.dateRaised), requiredOnSiteDate: new Date(h.requiredOnSiteDate), formData: {},
      lines: filled.map((l) => ({ variantId: l.variant?.id ?? null, materialCode: l.materialCode || l.variant?.sku || null, description: l.description || (l.variant ? `${l.variant.name}${l.variant.model ? " " + l.variant.model : ""}` : ""), size: l.size || l.variant?.size || null, gradeStandard: l.gradeStandard || null, uomCode: l.uomCode, qtyRequired: Number(l.qtyRequired), surplusPct: Number(l.surplusPct) || 0, estUnitPrice: l.estUnitPrice === "" ? null : Number(l.estUnitPrice), requiredDate: l.requiredDate ? new Date(l.requiredDate) : null, remarks: l.remarks || null })),
    } as unknown as MRInput;
    start(async () => {
      const r = id ? await updateMRAction(id, version!, payload) : await createMRAction(payload);
      if (r.ok) {
        const mrId = (r.data as { id: string }).id;
        if (send) {
          const sub = await submitMRAction(mrId);
          toast(sub.ok ? "ok" : "bad", sub.ok ? sub.message! : `Saxlanıldı, amma göndərilmədi: ${sub.error}`);
        } else toast("ok", r.message!);
        router.push(`/mr/${mrId}`);
        router.refresh();
      }
      else { setErrors(r.fieldErrors ?? {}); toast("bad", r.error); }
    });
  };
  const E = (k: string) => errors[k] && <span className="field-err">{errors[k]}</span>;

  const setRef = (i: number, p: Partial<MRHeaderState["referenceDocs"][number]>) => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.map((y, j) => (j === i ? { ...y, ...p } : y)) }));

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(true); }}>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold">Nə, hara, nə vaxt lazımdır</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="label md:col-span-2"><span className="req">Layihə</span><select className="select" value={h.projectId} disabled={lockProject} onChange={(e) => set("projectId", e.target.value)} aria-invalid={!!errors.projectId}><option value="">— seçin —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>{E("projectId")}</label>
          <label className="label"><span className="req">İş sahəsi (disiplin)</span><select className="select" value={h.discipline} disabled={lockProject} onChange={(e) => set("discipline", e.target.value)} aria-invalid={!!errors.discipline}><option value="">— seçin —</option>{MR_LISTS.DISCIPLINE.map(([c, l]) => <option key={c} value={c}>{l} ({c})</option>)}</select>{E("discipline")}</label>
          {h.discipline === "OTH" && <label className="label"><span className="req">Disiplin (digər)</span><input className="input" value={h.disciplineOther} onChange={(e) => set("disciplineOther", e.target.value)} />{E("disciplineOther")}</label>}
          <label className="label"><span className="req">Nə vaxt lazımdır</span><input className="input" type="date" value={h.requiredOnSiteDate} min={h.dateRaised} onChange={(e) => set("requiredOnSiteDate", e.target.value)} aria-invalid={!!errors.requiredOnSiteDate} />{E("requiredOnSiteDate")}</label>
          <label className="label"><span className="req">Tələb edən</span><input className="input" value={h.requesterName} onChange={(e) => set("requesterName", e.target.value)} /></label>
          <label className="label"><span className="req">Təcililik</span><select className="select" value={h.priority} onChange={(e) => set("priority", e.target.value)}><option value="NORMAL">Normal</option><option value="URGENT">Təcili</option><option value="EMERGENCY">Fövqəladə</option></select></label>
          {h.priority !== "NORMAL" && <label className="label md:col-span-2"><span className="req">Niyə təcilidir</span><input className="input" value={h.justification} onChange={(e) => set("justification", e.target.value)} aria-invalid={!!errors.justification} />{E("justification")}</label>}
        </div>
        {lockProject && <p className="mt-2 text-xs text-muted">MR nömrəsi layihə və disiplinə bağlıdır, ona görə dəyişdirilmir.</p>}
        <details className="mt-3 rounded-md border border-line p-3">
          <summary className="cursor-pointer text-xs font-bold text-muted">Əlavə məlumat (istəyə görə): MR növü, tarix, qəbul anbarı, valyuta, istinad sənədləri…</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-4">
            <label className="label"><span>Tələb növü</span><select className="select" value={h.requestType} onChange={(e) => set("requestType", e.target.value)}><option value="NEW">Yeni</option><option value="REVISION">Reviziya</option><option value="REPLACEMENT">Əvəzləmə</option><option value="CANCELLATION">Ləğv</option></select></label>
            <label className="label"><span>MR tarixi</span><input className="input" type="date" value={h.dateRaised} onChange={(e) => set("dateRaised", e.target.value)} /></label>
            <label className="label"><span>Qəbul anbarı</span><select className="select" value={h.deliveryWarehouseId} onChange={(e) => set("deliveryWarehouseId", e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label className="label"><span>Valyuta</span><select className="select" value={h.currency} onChange={(e) => set("currency", e.target.value)}>{MR_LISTS.CURRENCY.map(([c, l]) => <option key={c} value={c}>{c} — {l}</option>)}</select></label>
            <label className="label"><span>Vəzifə</span><input className="input" value={h.requesterPosition} onChange={(e) => set("requesterPosition", e.target.value)} /></label>
            <label className="label"><span>Layihə fazası</span><select className="select" value={h.projectPhase} onChange={(e) => set("projectPhase", e.target.value)}><option value="">—</option>{MR_LISTS.PROJECT_PHASE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
            <label className="label"><span>Tədarük kateqoriyası</span><select className="select" value={h.supplyCategory} onChange={(e) => set("supplyCategory", e.target.value)}><option value="">—</option>{MR_LISTS.SUPPLY_CATEGORY.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
            <label className="label"><span>Tədarük yolu</span><select className="select" value={h.procurementRoute} onChange={(e) => set("procurementRoute", e.target.value)}><option value="">—</option>{MR_LISTS.PROCUREMENT_ROUTE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
            <label className="label"><span>Əvəz etdiyi MR №</span><input className="input" value={h.supersedesMrNumber} onChange={(e) => set("supersedesMrNumber", e.target.value)} /></label>
            <label className="label md:col-span-3"><span className={h.requestType === "REVISION" || h.requestType === "CANCELLATION" ? "req" : undefined}>Reviziya / ləğv səbəbi</span><input className="input" value={h.revisionReason} onChange={(e) => set("revisionReason", e.target.value)} aria-invalid={!!errors.revisionReason} />{E("revisionReason")}</label>
          </div>
          <h3 className="mb-2 mt-4 text-xs font-bold text-muted">İstinad sənədləri (çertyoj, MTO…)</h3>
          {h.referenceDocs.map((r, i) => (
            <div key={i} className="mb-2 grid gap-2 md:grid-cols-[180px_1fr_100px_2fr_auto]">
              <select className="select" value={r.docType} onChange={(e) => setRef(i, { docType: e.target.value })}>{MR_LISTS.REF_DOC_TYPE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
              <input className="input" placeholder="Sənəd №" value={r.docNumber} onChange={(e) => setRef(i, { docNumber: e.target.value })} />
              <input className="input" placeholder="Rev." value={r.revision} onChange={(e) => setRef(i, { revision: e.target.value })} />
              <input className="input" placeholder="Başlıq" value={r.title} onChange={(e) => setRef(i, { title: e.target.value })} />
              <button type="button" className="btn btn-ghost text-bad" onClick={() => setH((x) => ({ ...x, referenceDocs: x.referenceDocs.filter((_, j) => j !== i) }))} aria-label="Sil">✕</button>
            </div>
          ))}
          {h.referenceDocs.length < 10 && <button type="button" className="btn btn-sm" onClick={() => setH((x) => ({ ...x, referenceDocs: [...x.referenceDocs, { docType: "DRAWING", docNumber: "", revision: "", title: "" }] }))}>+ İstinad sənədi</button>}
        </details>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">Materiallar</h2>
        <p className="mb-3 text-xs text-muted">Materialı kataloqdan seçin və miqdarı yazın. Ofisdə və bu layihənin sahəsində olan qalıq avtomatik çıxılır — yalnız çatışmayan sifariş olunur.</p>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-muted">Sətir {i + 1}</span><button type="button" className="btn btn-sm btn-ghost text-bad" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}>Sil</button></div>
              <div className="grid gap-2 md:grid-cols-6">
                <div className="md:col-span-3"><span className="label mb-1">Material (kataloqdan)</span><VariantPicker value={l.variant} onChange={(v) => upd(l.key, { variant: v, uomCode: v ? v.unit : l.uomCode, size: v?.size ?? l.size, description: l.description || (v ? `${v.name}${v.model ? " " + v.model : ""}` : "") })} /></div>
                <label className="label md:col-span-3"><span className="req">Təsvir</span><input className="input" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} aria-invalid={!!errors[`lines.${i}.description`]} placeholder="Kataloqda yoxdursa, burada yazın" /></label>
                <label className="label"><span className="req">Miqdar</span><input className="input text-right" type="number" min={0} step="any" value={l.qtyRequired} onChange={(e) => upd(l.key, { qtyRequired: e.target.value })} aria-invalid={!!errors[`lines.${i}.qtyRequired`]} />{l.variant && <span className="text-[11px] font-normal text-muted">anbarda: {Number(l.variant.available).toLocaleString("az-AZ")}</span>}</label>
                <label className="label"><span className="req">Vahid</span><select className="select" value={l.uomCode} onChange={(e) => upd(l.key, { uomCode: e.target.value })}>{units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select></label>
                <label className="label md:col-span-4"><span>Qeyd</span><input className="input" value={l.remarks} onChange={(e) => upd(l.key, { remarks: e.target.value })} /></label>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-muted">Əlavə: kod, ölçü, standart, ehtiyat %, qiymət, tarix</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-6">
                  <label className="label"><span>Material / tag kodu</span><input className="input" value={l.materialCode} onChange={(e) => upd(l.key, { materialCode: e.target.value })} /></label>
                  <label className="label"><span>Ölçü</span><input className="input" value={l.size} onChange={(e) => upd(l.key, { size: e.target.value })} /></label>
                  <label className="label"><span>Grade / standart</span><input className="input" value={l.gradeStandard} onChange={(e) => upd(l.key, { gradeStandard: e.target.value })} /></label>
                  <label className="label"><span>Ehtiyat %</span><input className="input text-right" type="number" min={0} max={100} step="any" value={l.surplusPct} onChange={(e) => upd(l.key, { surplusPct: e.target.value })} /></label>
                  <label className="label"><span>Təxmini vahid qiymət</span><input className="input text-right" type="number" min={0} step="any" value={l.estUnitPrice} onChange={(e) => upd(l.key, { estUnitPrice: e.target.value })} /></label>
                  <label className="label"><span>Lazım olma tarixi</span><input className="input" type="date" value={l.requiredDate} onChange={(e) => upd(l.key, { requiredDate: e.target.value })} /></label>
                </div>
              </details>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Material əlavə et</button>
          {total > 0 && <span className="text-sm">Təxmini dəyər: <b className="tabular-nums">{total.toLocaleString("az-AZ", { maximumFractionDigits: 2 })} {h.currency}</b></span>}
        </div>
        <label className="label mt-3"><span>Ümumi qeyd</span><input className="input" value={h.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Göndərilir…" : "Təsdiqə göndər"}</button>
        <button type="button" className="btn" disabled={pending} onClick={() => submit(false)}>Qaralama kimi saxla</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>İmtina</button>
      </div>
    </form>
  );
}
