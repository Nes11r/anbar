import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sp } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { MRForm } from "../mr-form";
import { mrFormOptions } from "../options";
import { lowStock } from "@/server/services/reports";
import { variantOptionsByIds } from "@/server/services/catalog";

export const metadata = { title: "Yeni MR" };

export default async function NewMR({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("mr.create");
  const opts = await mrFormOptions();
  const q = await searchParams;
  const project = sp(q.project);
  // "low=1": pre-fill every item at or below its minimum (qty = what is missing up to the minimum)
  let presetLines;
  if (sp(q.low) === "1") {
    const low = await lowStock(100);
    const vo = await variantOptionsByIds(low.map((l) => l.variantId));
    presetLines = low.map((l) => {
      const min = Number(l.min), avail = Math.max(Number(l.avail), 0);
      const qty = Math.max(min - avail, 0) || min;
      const v = vo.get(l.variantId) ?? null;
      return { variant: v, materialCode: l.sku, description: `${l.name}${l.size ? ` (${l.size})` : ""}`, size: l.size ?? "", gradeStandard: "", uomCode: l.unit, qtyRequired: String(qty), surplusPct: "0", estUnitPrice: "", requiredDate: "", remarks: `Aşağı qalıq: mövcud ${avail}, minimum ${min}` };
    });
  }
  return (
    <>
      <PageHeader title="Yeni Material Request (MR)" subtitle="Form HEC-PRC-FRM-001 strukturu. Nömrə avtomatik: MR-[Layihə kodu]-[Disiplin]-[Ardıcıllıq]." crumbs={[{ href: "/mr", label: "Material tələbləri" }, { label: "Yeni" }]} />
      {opts.projects.length === 0 ? <div className="alert alert-warn">Əvvəlcə <Link className="link" href="/projects/new">layihə yaradın</Link>.</div> : <>{presetLines && <div className="alert alert-info mb-3 text-sm">Minimuma çatmış {presetLines.length} material əlavə olundu. Lazım olmayanları silin, layihəni seçin və təsdiqə göndərin.</div>}<MRForm {...opts} defaults={{ requesterName: user.name, projectId: project || undefined }} presetLines={presetLines} /></>}
    </>
  );
}
