import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sp } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { MRForm } from "../mr-form";
import { mrFormOptions } from "../options";

export const metadata = { title: "Yeni MR" };

export default async function NewMR({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("mr.create");
  const opts = await mrFormOptions();
  const project = sp((await searchParams).project);
  return (
    <>
      <PageHeader title="Yeni Material Request (MR)" subtitle="Form HEC-PRC-FRM-001 strukturu. Nömrə avtomatik: MR-[Layihə kodu]-[Disiplin]-[Ardıcıllıq]." crumbs={[{ href: "/mr", label: "Material tələbləri" }, { label: "Yeni" }]} />
      {opts.projects.length === 0 ? <div className="alert alert-warn">Əvvəlcə <Link className="link" href="/projects/new">layihə yaradın</Link>.</div> : <MRForm {...opts} defaults={{ requesterName: user.name, projectId: project || undefined }} />}
    </>
  );
}
