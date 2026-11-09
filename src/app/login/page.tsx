import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Giriş" };

export default async function LoginPage() {
  const u = await getSessionUser().catch(() => null);
  if (u) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#031a22] p-4" style={{ backgroundImage: "linear-gradient(160deg,#04303d 0%,#006381 55%,#0b3a47 100%)" }}>
      <div className="card w-full max-w-sm border-t-4 border-t-accent p-6">
        <div className="mb-4 inline-flex rounded bg-white px-2 py-1">
          <Image src="/hecotec-logo.png" alt="HECOTEC Industrial Development Company" width={170} height={48} priority />
        </div>
        <h1 className="text-lg font-bold">Anbar Sistemi</h1>
        <p className="mb-4 text-sm text-muted">Şirkət əməkdaşlarının girişi.</p>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-muted">Hesabınız yoxdur? <Link className="link" href="/register">Hesab yaradın</Link></p>
      </div>
      <p className="fixed bottom-3 left-0 right-0 text-center text-xs font-semibold tracking-wide text-[#d9eaee]/80">HECOTEC MMC · Industrial Development Company</p>
    </main>
  );
}
