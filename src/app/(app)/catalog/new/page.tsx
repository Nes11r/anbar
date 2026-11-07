import { requirePage } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MaterialForm } from "../material-form";
import { materialFormOptions } from "../form-data";

export const metadata = { title: "Yeni material" };

export default async function NewMaterial() {
  await requirePage("catalog.manage");
  const opts = await materialFormOptions();
  return (
    <>
      <PageHeader title="Yeni material" crumbs={[{ href: "/catalog", label: "Material kataloqu" }, { label: "Yeni" }]} subtitle="Əvvəlcə kateqoriya və təyinatı seçin, sonra ölçüləri qeyd edin. Qalıq burada yaradılmır — ilkin inventarlaşdırma və ya mal qəbulu ilə daxil olur." />
      <MaterialForm {...opts} />
    </>
  );
}
