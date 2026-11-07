import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";

export const metadata = { title: "Yeni işçi" };

export default async function NewEmployee() {
  await requirePage("employee.manage");
  const projects = await db.project.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  return (
    <>
      <PageHeader title="Yeni işçi kartı" crumbs={[{ href: "/employees", label: "İşçilər" }, { label: "Yeni" }]} />
      <EmployeeForm projects={projects.map((p) => [p.id, `${p.code} — ${p.name}`])} />
    </>
  );
}
