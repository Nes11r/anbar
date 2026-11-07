import { requirePage } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../project-form";

export const metadata = { title: "Yeni layihə" };

export default async function NewProject() {
  await requirePage("project.manage");
  return (
    <>
      <PageHeader title="Yeni layihə" crumbs={[{ href: "/projects", label: "Layihələr" }, { label: "Yeni" }]} />
      <ProjectForm />
    </>
  );
}
