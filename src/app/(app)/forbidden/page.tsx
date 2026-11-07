import Link from "next/link";

export const metadata = { title: "İcazə yoxdur" };

export default function Forbidden() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Bu bölməyə giriş icazəniz yoxdur</h1>
      <p className="mt-2 text-sm text-muted">Rolunuz bu əməliyyata icazə vermir. Lazımdırsa administratora müraciət edin.</p>
      <Link href="/" className="btn mt-4">İdarə paneli</Link>
    </div>
  );
}
