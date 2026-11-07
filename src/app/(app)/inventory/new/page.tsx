import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CountForm } from "../count-form";

export const metadata = { title: "Yeni sayım" };

export default async function NewCount() {
  await requirePage("inventory.edit");
  const whs = await db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] });
  return (
    <>
      <PageHeader title="Yeni sayım sənədi" crumbs={[{ href: "/inventory", label: "İnventarlaşdırma" }, { label: "Yeni" }]} />
      <CountForm warehouses={whs.map((w) => ({ id: w.id, name: w.name }))} />
    </>
  );
}
