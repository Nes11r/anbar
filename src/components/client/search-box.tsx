"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** URL-driven search (server renders the result). Debounced. */
export function SearchBox({ name = "q", placeholder = "Axtar…" }: { name?: string; placeholder?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [v, setV] = useState(params.get(name) ?? "");
  const [pending, start] = useTransition();
  useEffect(() => {
    const h = setTimeout(() => {
      if ((params.get(name) ?? "") === v) return;
      const p = new URLSearchParams(params.toString());
      if (v) p.set(name, v); else p.delete(name);
      p.delete("page");
      start(() => router.replace(`${path}?${p.toString()}`));
    }, 300);
    return () => clearTimeout(h);
  }, [v, name, params, path, router]);
  return (
    <div className="relative min-w-[200px] flex-1">
      <input type="search" className="input pr-8" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} aria-label={placeholder} />
      {pending && <span className="absolute right-2 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />}
    </div>
  );
}

/** <select> that writes to the URL. */
export function UrlSelect({ name, options, label, value }: { name: string; options: [string, string][]; label: string; value: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  return (
    <select
      className="select w-auto min-w-[160px]"
      aria-label={label}
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set(name, e.target.value); else p.delete(name);
        p.delete("page");
        router.replace(`${path}?${p.toString()}`);
      }}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
