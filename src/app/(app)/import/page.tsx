import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { UploadForm } from "./upload-form";
import { DeleteButton } from "@/components/delete-button";

export const metadata = { title: "Excel importu" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requirePage("import.run");
  const batches = await db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Excel importu" subtitle="Fayl → vərəq → məlumat növü → sütun uyğunlaşdırma → preview və xəbərdarlıqlar → təsdiq. Təsdiqsiz heç nə dəyişmir, təsdiqlənmiş import geri qaytarıla bilər." />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="1. Fayl yüklə" className="lg:col-span-2"><UploadForm /></Card>
        <Card title="Vacib qaydalar">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            <li><b>Tarixi məxaric</b> (məs. “Total”) yalnız tarixçə kimi saxlanılır — qalığı dəyişmir.</li>
            <li><b>Hesabat xülasəsi</b> (“March/April/May/Common”) stok və ya tarixçə yaratmır — ikiqat sayılmır.</li>
            <li><b>İnventar qalığı</b> yalnız qaralama sayım sənədi yaradır; qalıq anbar müdirinin təsdiqi ilə yazılır.</li>
            <li>Boş / N/A kodlu sətirlər heç vaxt avtomatik birləşdirilmir.</li>
            <li>Eyni fayl/vərəq eyni növdə ikinci dəfə təsdiqlənmir.</li>
          </ul>
        </Card>
      </div>
      <Card title="Import paketləri" pad={false}>
        {batches.length === 0 ? <Empty title="Hələ import edilməyib" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fayl</th><th>Vərəq</th><th>Növ</th><th>Sətir</th><th>Status</th><th>Yüklənib</th><th></th></tr></thead>
              <tbody>{batches.map((b) => { const st = b.stats as { rows?: number; errors?: number; warnings?: number } | null; return (
                <tr key={b.id}><td><Link className="link" href={`/import/${b.id}`}>{b.fileName}</Link></td><td>{b.sheetName ?? "—"}</td><td>{b.dataType ? az.importType[b.dataType] : "—"}</td>
                  <td className="text-xs">{st ? `${st.rows ?? 0} (${st.errors ?? 0} xəta, ${st.warnings ?? 0} xəbərdarlıq)` : "—"}</td>
                  <td><Badge tone={b.status === "COMMITTED" ? "ok" : b.status === "ROLLED_BACK" ? "warn" : b.status === "FAILED" ? "bad" : "info"}>{az.importStatus[b.status]}</Badge></td><td>{fmtDateTime(b.createdAt)}</td><td>{b.status !== "COMMITTED" ? <DeleteButton small type="importBatch" id={b.id} label={b.fileName} /> : <span className="text-xs text-muted" title="Əvvəlcə paketi açıb “Geri qaytar” edin">geri qaytarın</span>}</td></tr>
              ); })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
