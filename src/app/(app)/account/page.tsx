import { requirePage } from "@/lib/auth";
import { az } from "@/i18n/az";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Hesabım" };

export default async function AccountPage() {
  const u = await requirePage();
  return (
    <>
      <PageHeader title="Hesabım" />
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Card title="Profil"><dl className="kv"><dt>Ad</dt><dd>{u.name}</dd><dt>E-poçt</dt><dd>{u.email}</dd><dt>Rol</dt><dd>{az.role[u.role]}</dd></dl></Card>
        <Card title="Parolu dəyiş"><PasswordForm /></Card>
      </div>
    </>
  );
}
