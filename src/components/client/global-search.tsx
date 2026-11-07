"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Global search → stock page (covers SKU, material, model, code). Document numbers jump to the journal. */
export function GlobalSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      role="search"
      className="hidden max-w-md flex-1 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        const isDoc = /^(MR|PO|GRN|IS[PE]|RT[PES]|TRF|ADJ|INV0?)-/i.test(v);
        router.push(isDoc ? `/journal?q=${encodeURIComponent(v)}` : `/stock?q=${encodeURIComponent(v)}`);
      }}
    >
      <input type="search" className="input" placeholder="Material, SKU və ya sənəd № (Enter)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qlobal axtarış" />
    </form>
  );
}
