import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">Səhifə və ya qeyd tapılmadı</h1>
        <p className="mt-2 text-sm text-muted">Keçid köhnə ola bilər və ya qeyd arxivlənib.</p>
        <Link href="/" className="btn btn-primary mt-4">İdarə panelinə qayıt</Link>
      </div>
    </main>
  );
}
