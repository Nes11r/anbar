import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Hesab yarat" };

export default async function RegisterPage() {
  const u = await getSessionUser().catch(() => null);
  if (u) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#031a22] p-4" style={{ backgroundImage: "linear-gradient(160deg,#04303d 0%,#006381 55%,#0b3a47 100%)" }}>
      <div className="card w-full max-w-md border-t-4 border-t-accent p-6">
        <div className="mb-4 inline-flex rounded bg-white px-2 py-1">
          <Image src="/hecotec-logo.png" alt="HECOTEC" width={150} height={42} priority />
        </div>
        <h1 className="text-lg font-bold">Hesab yarat</h1>
        <p className="mb-4 text-sm text-muted">Hesab növünü seçin. Hesab administrator təsdiq etdikdən sonra aktiv olur.</p>
        <RegisterForm />
        <p className="mt-4 text-center text-sm text-muted">Hesabınız var? <Link className="link" href="/login">Daxil olun</Link></p>
      </div>
    </main>
  );
}
