"use client";
import { useEffect, useId, useRef, useState } from "react";

export interface VariantOption {
  id: string;
  sku: string;
  size: string;
  color: string;
  name: string;
  model: string | null;
  materialCode: string;
  workerGroup: string;
  unit: string;
  allowsDecimal: boolean;
  onHand: string;
  available: string;
}

const GROUP: Record<string, string> = { ENGINEER: "Mühəndis", WORKER: "Fəhlə", BOTH: "Hər ikisi", NOT_APPLICABLE: "" };

export function variantLabel(v: Pick<VariantOption, "sku" | "name" | "size">) {
  return `${v.sku} — ${v.name}${v.size ? ` · ${v.size}` : ""}`;
}

/** Accessible combobox with debounced server search (/api/variants, trigram indexed). */
export function VariantPicker({
  value,
  onChange,
  warehouseId,
  onlyInStock,
  group,
  invalid,
  placeholder = "SKU, ad, model və ya ölçü ilə axtar…",
}: {
  value: VariantOption | null;
  onChange: (v: VariantOption | null) => void;
  warehouseId?: string;
  onlyInStock?: boolean;
  group?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VariantOption[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      setError("");
      try {
        const p = new URLSearchParams({ q });
        if (warehouseId) p.set("warehouseId", warehouseId);
        if (onlyInStock) p.set("inStock", "1");
        if (group) p.set("group", group);
        const r = await fetch(`/api/variants?${p}`, { signal: c.signal });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as VariantOption[];
        setItems(data);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Axtarış alınmadı, yenidən cəhd edin.");
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(h);
  }, [q, open, warehouseId, onlyInStock, group]);

  if (value && !open) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" className="input flex min-w-0 items-center text-left" onClick={() => { setOpen(true); setQ(""); }} title="Dəyiş">
          <span className="truncate">{variantLabel(value)}</span>
        </button>
        <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">mövcud: {Number(value.available).toLocaleString("az-AZ")} {value.unit}</span>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <input
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={q}
        autoFocus={!!value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && items[active]) { e.preventDefault(); onChange(items[active]); setOpen(false); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[320px] overflow-auto rounded-md border border-line bg-surface shadow-[var(--shadow-lg)]">
          {loading && <li className="px-3 py-2 text-xs text-muted">Axtarılır…</li>}
          {error && <li className="px-3 py-2 text-xs text-bad">{error}</li>}
          {!loading && !error && items.length === 0 && <li className="px-3 py-2 text-xs text-muted">Nəticə yoxdur{onlyInStock ? " (yalnız stokda olanlar)" : ""}.</li>}
          {items.map((v, i) => (
            <li
              key={v.id}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-soft" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(v); setOpen(false); }}
              onMouseEnter={() => setActive(i)}
            >
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{v.sku}</span>
                <span className="tabular-nums text-xs text-muted">mövcud {Number(v.available).toLocaleString("az-AZ")} {v.unit}</span>
              </div>
              <div className="text-xs text-muted">
                {v.name}{v.size ? ` · ölçü ${v.size}` : ""}{v.model ? ` · ${v.model}` : ""}{GROUP[v.workerGroup] ? ` · ${GROUP[v.workerGroup]}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
