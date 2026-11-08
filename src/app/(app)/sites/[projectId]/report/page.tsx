import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { scopeProjectId } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { siteMaterials } from "@/server/services/sites";
import { SiteReportForm } from "./report-form";

export const metadata = { title: "Gündəlik sahə hesabatı" };
export const dynamic = "force-dynamic";

export default async function SiteReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePage("site.report");
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const scope = scopeProjectId(user);
  if (scope && scope !== projectId) notFound();
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p) notFound();
  const mats = await siteMaterials(projectId);
  return (
    <>
      <PageHeader title={`Gündəlik sahə hesabatı — ${p.code}`} subtitle="Sahə anbardarının bildirdiyi “stokda” və “işçilərdə” rəqəmlərini daxil edin. Sistem fərqləri avtomatik göstərir." crumbs={[{ href: "/sites", label: "Sahə anbarları" }, { href: `/sites/${p.id}`, label: p.code }, { label: "Hesabat" }]} />
      <SiteReportForm
        projectId={p.id}
        reporter={user.name}
        rows={mats.map((m) => ({ variantId: m.variantId, label: `${m.sku} · ${m.name}${m.size ? ` (${m.size})` : ""}`, unit: m.unit, sysStock: m.inStock.toNumber(), sysWorkers: m.withWorkers.toNumber(), stock: "", workers: "", note: "" }))}
      />
    </>
  );
}
