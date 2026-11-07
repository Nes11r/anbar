"use client";
import { VariantPicker, type VariantOption } from "./variant-picker";

export interface EditorLine {
  key: string;
  variant: VariantOption | null;
  qty: string;
  direction?: number;
  condition?: "GOOD" | "DEFECTIVE";
  targetWarehouseId?: string;
  overrideReason?: string;
  note?: string;
}

export function newLine(): EditorLine {
  return { key: Math.random().toString(36).slice(2), variant: null, qty: "", direction: -1, condition: "GOOD" };
}

const GROUP_LABEL: Record<string, string> = { ENGINEER: "mühəndis", WORKER: "fəhlə" };

export function LinesEditor({
  lines,
  setLines,
  warehouseId,
  onlyInStock,
  qtyLabel = "Miqdar",
  showDirection,
  showCondition,
  quarantineWarehouses = [],
  employeeGroup,
  allowOverride,
  errors = {},
}: {
  lines: EditorLine[];
  setLines: (f: (l: EditorLine[]) => EditorLine[]) => void;
  warehouseId?: string;
  onlyInStock?: boolean;
  qtyLabel?: string;
  showDirection?: boolean;
  showCondition?: boolean;
  quarantineWarehouses?: { id: string; name: string }[];
  employeeGroup?: "ENGINEER" | "WORKER";
  allowOverride?: boolean;
  errors?: Record<string, string>;
}) {
  const upd = (key: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const dupes = new Set<string>();
  const seen = new Set<string>();
  for (const l of lines) if (l.variant) { if (seen.has(l.variant.id)) dupes.add(l.variant.id); seen.add(l.variant.id); }
  return (
    <div className="flex flex-col gap-2">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th className="min-w-[320px]">Material / variant</th>
              {showDirection && <th>İstiqamət</th>}
              <th className="w-32">{qtyLabel}</th>
              {showCondition && <th>Vəziyyət</th>}
              <th className="min-w-[180px]">Qeyd</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const mismatch = employeeGroup && l.variant && (l.variant.workerGroup === "ENGINEER" || l.variant.workerGroup === "WORKER") && l.variant.workerGroup !== employeeGroup;
              const over = onlyInStock && l.variant && Number(l.qty) > Number(l.variant.available);
              const fraction = l.variant && !l.variant.allowsDecimal && l.qty && !Number.isInteger(Number(l.qty));
              return (
                <tr key={l.key} className="align-top">
                  <td className="pt-3 text-muted">{i + 1}</td>
                  <td>
                    <VariantPicker value={l.variant} onChange={(v) => upd(l.key, { variant: v })} warehouseId={warehouseId} onlyInStock={onlyInStock} invalid={!!errors[`lines.${i}.variantId`]} />
                    {l.variant && dupes.has(l.variant.id) && <p className="field-err mt-1">Bu variant artıq başqa sətirdə var — birləşdirin.</p>}
                    {mismatch && (
                      <div className="mt-1 rounded border border-warn bg-warn-soft p-2 text-xs">
                        <b>Təyinat uyğunsuzluğu:</b> material {GROUP_LABEL[l.variant!.workerGroup]} üçündür, işçi isə {GROUP_LABEL[employeeGroup!]}.
                        {allowOverride ? (
                          <input className="input mt-1 h-8" placeholder="Override səbəbi (məcburi)" value={l.overrideReason ?? ""} onChange={(e) => upd(l.key, { overrideReason: e.target.value })} />
                        ) : (
                          <span> Bu təhvil üçün anbar müdirinin icazəsi lazımdır.</span>
                        )}
                      </div>
                    )}
                  </td>
                  {showDirection && (
                    <td>
                      <select className="select" value={l.direction ?? -1} onChange={(e) => upd(l.key, { direction: Number(e.target.value) })}>
                        <option value={1}>+ artır</option>
                        <option value={-1}>− azalt</option>
                      </select>
                    </td>
                  )}
                  <td>
                    <input className="input text-right tabular-nums" type="number" min={0} step={l.variant && !l.variant.allowsDecimal ? 1 : "any"} inputMode="decimal" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} aria-label={`${qtyLabel} ${i + 1}`} aria-invalid={!!errors[`lines.${i}.qty`] || !!over || !!fraction} />
                    {l.variant && <div className="mt-0.5 text-[11px] text-muted">{l.variant.unit}{onlyInStock ? ` · mövcud ${Number(l.variant.available).toLocaleString("az-AZ")}` : ""}</div>}
                    {over && <div className="field-err">Mövcuddan çoxdur</div>}
                    {fraction && <div className="field-err">Tam ədəd olmalıdır</div>}
                  </td>
                  {showCondition && (
                    <td className="min-w-[200px]">
                      <select className="select" value={l.condition ?? "GOOD"} onChange={(e) => upd(l.key, { condition: e.target.value as "GOOD" | "DEFECTIVE", targetWarehouseId: e.target.value === "DEFECTIVE" ? quarantineWarehouses[0]?.id : undefined })}>
                        <option value="GOOD">Yararlı → anbara</option>
                        <option value="DEFECTIVE">Qüsurlu → karantin</option>
                      </select>
                      {l.condition === "DEFECTIVE" && quarantineWarehouses.length > 1 && (
                        <select className="select mt-1" value={l.targetWarehouseId ?? ""} onChange={(e) => upd(l.key, { targetWarehouseId: e.target.value })}>
                          {quarantineWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  <td><input className="input" value={l.note ?? ""} onChange={(e) => upd(l.key, { note: e.target.value })} maxLength={500} /></td>
                  <td><button type="button" className="btn btn-sm btn-ghost text-bad" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} aria-label={`Sətir ${i + 1} sil`}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div><button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, newLine()])}>+ Sətir əlavə et</button></div>
    </div>
  );
}
