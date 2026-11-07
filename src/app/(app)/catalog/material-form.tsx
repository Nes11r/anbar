"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { az } from "@/i18n/az";
import { useToast } from "@/components/client/toast";
import type { MaterialInput } from "@/server/services/catalog";
import { createMaterialAction, updateMaterialAction } from "./actions";

const PRESETS: Record<string, string[]> = {
  CLOTHING_NUMERIC: ["44", "46", "48", "50", "52", "54", "56", "58", "60", "62"],
  CLOTHING_LETTER: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
  SHOE_EU: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  OTHER: [],
};

type Opt = { id: string; label: string };
type Variant = { id?: string | null; size: string; color: string; sku?: string | null; barcode?: string | null; minStock?: number | null; isActive: boolean; used?: boolean };

export function MaterialForm({
  categories,
  units,
  suppliers,
  initial,
  id,
  version,
}: {
  categories: (Opt & { isUniform: boolean })[];
  units: { code: string; label: string }[];
  suppliers: Opt[];
  initial?: Partial<MaterialInput> & { variants: Variant[] };
  id?: string;
  version?: number;
}) {
  const [f, setF] = useState<Partial<MaterialInput>>(initial ?? { workerGroup: "NOT_APPLICABLE", sizeType: "NONE", unitCode: "PCS", minStock: 0 });
  const [variants, setVariants] = useState<Variant[]>(initial?.variants ?? [{ size: "", color: "", isActive: true }]);
  const [custom, setCustom] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const cat = useMemo(() => categories.find((c) => c.id === f.categoryId), [categories, f.categoryId]);
  const set = <K extends keyof MaterialInput>(k: K, v: MaterialInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const onCategory = (cid: string) => {
    const c = categories.find((x) => x.id === cid);
    setF((x) => ({ ...x, categoryId: cid, workerGroup: c?.isUniform ? (x.workerGroup === "NOT_APPLICABLE" ? undefined : x.workerGroup) : x.workerGroup ?? "NOT_APPLICABLE" } as Partial<MaterialInput>));
  };
  const onSizeType = (st: MaterialInput["sizeType"]) => {
    set("sizeType", st);
    if (st === "NONE") setVariants((vs) => (vs.some((v) => v.id) ? vs : [{ size: "", color: "", isActive: true }]));
    else setVariants((vs) => vs.filter((v) => v.size || v.id));
  };
  const toggleSize = (s: string) => {
    setVariants((vs) => {
      const ex = vs.find((v) => v.size === s);
      if (ex) return ex.id ? vs.map((v) => (v === ex ? { ...v, isActive: !v.isActive } : v)) : vs.filter((v) => v !== ex);
      return [...vs, { size: s, color: "", isActive: true }];
    });
  };

  const submit = () => {
    setErrors({});
    const e: Record<string, string> = {};
    if (!f.nameAz?.trim()) e.nameAz = "Ad məcburidir";
    if (!f.categoryId) e.categoryId = "Kateqoriya seçin";
    if (!f.workerGroup) e.workerGroup = "Forma/PPE üçün təyinat məcburidir";
    if (variants.length === 0) e.variants = "Ən azı bir ölçü seçin";
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = { ...f, variants: variants.map(({ used: _u, ...v }) => (void _u, v)) } as MaterialInput;
    start(async () => {
      const r = id ? await updateMaterialAction(id, version!, payload) : await createMaterialAction(payload);
      if (r.ok) {
        toast("ok", r.message ?? "Yadda saxlanıldı");
        router.push(`/catalog/${(r.data as { id: string }).id}`);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast("bad", r.error);
      }
    });
  };

  const presets = PRESETS[f.sizeType ?? "NONE"] ?? [];
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <section className="card grid gap-4 p-4 md:grid-cols-3">
        <label className="label md:col-span-2">
          <span className="req">Material adı (AZ)</span>
          <input className="input" value={f.nameAz ?? ""} onChange={(e) => set("nameAz", e.target.value)} aria-invalid={!!errors.nameAz} maxLength={300} />
          {errors.nameAz && <span className="field-err">{errors.nameAz}</span>}
        </label>
        <label className="label">
          <span>Ad (EN, orijinal)</span>
          <input className="input" value={f.nameEn ?? ""} onChange={(e) => set("nameEn", e.target.value)} maxLength={300} />
        </label>
        <label className="label">
          <span className="req">Kateqoriya</span>
          <select className="select" value={f.categoryId ?? ""} onChange={(e) => onCategory(e.target.value)} aria-invalid={!!errors.categoryId}>
            <option value="">— seçin —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isUniform ? " (forma/PPE)" : ""}</option>)}
          </select>
          {errors.categoryId && <span className="field-err">{errors.categoryId}</span>}
        </label>
        <fieldset className="label md:col-span-2">
          <legend className={cat?.isUniform ? "req mb-1" : "mb-1"}>Təyinat (peşə qrupu)</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(["ENGINEER", "WORKER", "BOTH", "NOT_APPLICABLE"] as const).filter((g) => !(cat?.isUniform && g === "NOT_APPLICABLE")).map((g) => (
              <label key={g} className={`chip cursor-pointer ${f.workerGroup === g ? "!bg-brand !text-brand-ink !border-brand" : ""}`}>
                <input type="radio" className="sr-only" name="workerGroup" checked={f.workerGroup === g} onChange={() => set("workerGroup", g)} />
                {az.workerGroup[g]}
              </label>
            ))}
          </div>
          {cat?.isUniform && <span className="text-[11px] font-normal text-muted">Forma/PPE kateqoriyasında təyinat məcburidir. “Hər ikisi” eyni nomenklatura mühəndis və fəhlə üçün paylaşıldıqda seçilir.</span>}
          {errors.workerGroup && <span className="field-err">{errors.workerGroup}</span>}
        </fieldset>
        <label className="label"><span>Orijinal məhsul kodu</span><input className="input" value={f.originalCode ?? ""} onChange={(e) => set("originalCode", e.target.value)} placeholder="məs. 1010-027-440" /></label>
        <label className="label"><span>Marka</span><input className="input" value={f.brand ?? ""} onChange={(e) => set("brand", e.target.value)} /></label>
        <label className="label"><span>Model</span><input className="input" value={f.model ?? ""} onChange={(e) => set("model", e.target.value)} /></label>
        <label className="label"><span>Altkateqoriya</span><input className="input" value={f.subcategory ?? ""} onChange={(e) => set("subcategory", e.target.value)} /></label>
        <label className="label"><span>Rəng</span><input className="input" value={f.color ?? ""} onChange={(e) => set("color", e.target.value)} /></label>
        <label className="label">
          <span className="req">Ölçü vahidi</span>
          <select className="select" value={f.unitCode ?? "PCS"} onChange={(e) => set("unitCode", e.target.value)}>
            {units.map((u) => <option key={u.code} value={u.code}>{u.label} ({u.code})</option>)}
          </select>
        </label>
        <label className="label">
          <span>Tədarükçü</span>
          <select className="select" value={f.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value || null)}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="label"><span>Minimum ehtiyat (hər variant üçün)</span><input className="input" type="number" min={0} step="any" value={f.minStock ?? 0} onChange={(e) => set("minStock", Number(e.target.value))} /></label>
        <label className="label md:col-span-3"><span>Təsvir</span><textarea className="textarea" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={2000} /></label>
        <label className="label md:col-span-3"><span>Qeyd</span><input className="input" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-bold">Ölçülər və variantlar</h2>
        <p className="mb-3 text-xs text-muted">Hər ölçü ayrıca SKU və ayrıca qalıqla saxlanılır. Hərəkəti olan variant silinmir — deaktiv edilir.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["NONE", "CLOTHING_NUMERIC", "CLOTHING_LETTER", "SHOE_EU", "OTHER"] as const).map((st) => (
            <label key={st} className={`chip cursor-pointer ${f.sizeType === st ? "!bg-brand !text-brand-ink !border-brand" : ""}`}>
              <input type="radio" className="sr-only" name="sizeType" checked={f.sizeType === st} onChange={() => onSizeType(st)} />
              {az.sizeType[st]}
            </label>
          ))}
        </div>
        {f.sizeType !== "NONE" && (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {presets.map((s) => {
                const v = variants.find((x) => x.size === s);
                return (
                  <button type="button" key={s} onClick={() => toggleSize(s)} className={`chip min-w-12 justify-center ${v && v.isActive ? "!bg-accent !text-accent-ink !border-accent" : v ? "line-through" : ""}`} aria-pressed={!!v && v.isActive}>
                    {s}
                  </button>
                );
              })}
              <span className="flex gap-1">
                <input className="input h-7 w-24" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="digər ölçü" aria-label="Digər ölçü" />
                <button type="button" className="btn btn-sm" onClick={() => { if (custom.trim()) toggleSize(custom.trim().toUpperCase()); setCustom(""); }}>Əlavə et</button>
              </span>
            </div>
          </>
        )}
        {errors.variants && <p className="field-err mb-2">{errors.variants}</p>}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Ölçü</th><th>Rəng</th><th>SKU (boş → avtomatik)</th><th>Barkod / QR</th><th>Min. ehtiyat</th><th>Aktiv</th></tr></thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.id ?? `n${i}`}>
                  <td className="font-semibold">{v.size || "—"}</td>
                  <td><input className="input h-8" value={v.color} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} disabled={!!v.used} /></td>
                  <td><input className="input h-8" value={v.sku ?? ""} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} disabled={!!v.id} /></td>
                  <td><input className="input h-8" value={v.barcode ?? ""} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))} /></td>
                  <td><input className="input h-8 w-24" type="number" min={0} step="any" value={v.minStock ?? ""} placeholder="ümumi" onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, minStock: e.target.value === "" ? null : Number(e.target.value) } : x)))} /></td>
                  <td><input type="checkbox" checked={v.isActive} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, isActive: e.target.checked } : x)))} aria-label="Aktiv" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Yadda saxlanılır…" : id ? "Dəyişiklikləri saxla" : "Materialı yarat"}</button>
        <button type="button" className="btn" onClick={() => router.back()}>İmtina</button>
      </div>
    </form>
  );
}
