import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty, sp } from "@/lib/format";
import { Card, Empty, PageHeader, Pagination } from "@/components/ui";
import { SearchBox, UrlSelect } from "@/components/client/search-box";
import { ledgerJournal } from "@/server/services/reports";

export const metadata = { title: "Hərəkət jurnalı" };
export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("journal.view");
  const s = await searchParams;
  const params = { q: sp(s.q), type: sp(s.type), wh: sp(s.wh), project: sp(s.project), from: sp(s.from), to: sp(s.to) };
  const page = Number(sp(s.page)) || 1;
  const pageSize = 100;
  const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const d = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined);
  const [data, whs, projects] = await Promise.all([
    ledgerJournal({ q: params.q, type: params.type && params.type in az.entryType ? params.type : undefined, warehouseId: uuid(params.wh), projectId: uuid(params.project), from: d(params.from), to: d(params.to), limit: pageSize, offset: (page - 1) * pageSize }),
    db.warehouse.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }] }),
    db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return (
    <>
      <PageHeader print={["Tərtib etdi", "Yoxladı", "Təsdiq etdi"]} title="Hərəkət jurnalı" subtitle="Dəyişməz (append-only) stok jurnalı. Səhv qeydlər silinmir — ləğv (reversal) qeydi ilə düzəldilir." actions={<a className="btn" href={`/api/export/journal?${new URLSearchParams(clean)}`}>Excel</a>} />
      <Card pad={false}>
        <form className="flex flex-wrap gap-2 border-b border-line p-3">
          <SearchBox placeholder="SKU, material, sənəd №" />
          <UrlSelect name="type" label="Növ" value={params.type} options={[["", "Bütün növlər"], ...Object.entries(az.entryType)]} />
          <UrlSelect name="wh" label="Anbar" value={params.wh} options={[["", "Bütün anbarlar"], ...whs.map((w) => [w.id, w.name] as [string, string])]} />
          <UrlSelect name="project" label="Layihə" value={params.project} options={[["", "Bütün layihələr"], ...projects.map((p) => [p.id, p.code] as [string, string])]} />
          <label className="label"><span>Başlanğıc</span><input type="date" name="from" defaultValue={params.from} className="input" /></label>
          <label className="label"><span>Son</span><input type="date" name="to" defaultValue={params.to} className="input" /></label>
          {Object.entries(clean).filter(([k]) => !["from", "to"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button className="btn self-end">Tətbiq et</button>
        </form>
        {data.rows.length === 0 ? <Empty title="Qeyd yoxdur" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>SKU</th><th>Material</th><th>Anbar</th><th>Layihə</th><th>İşçi</th><th className="num">Miqdar</th><th>İstifadəçi</th><th>Səbəb</th></tr></thead>
              <tbody>{data.rows.map((r) => {
                const out = ["ISSUE", "RETURN_OUT", "TRANSFER_OUT", "ADJUSTMENT_MINUS"].includes(r.entryType);
                return (
                  <tr key={String(r.id)}>
                    <td className="text-xs text-muted">{String(r.id)}{r.reversalOfId ? <span title="Ləğv qeydi"> ↺</span> : null}</td>
                    <td>{fmtDate(r.movementDate)}</td>
                    <td className={out ? "font-semibold text-bad" : r.entryType.startsWith("RESERV") ? "text-muted" : "font-semibold text-ok"}>{az.entryType[r.entryType as keyof typeof az.entryType]}</td>
                    <td className="font-semibold">{r.docNumber}</td>
                    <td>{r.sku}</td><td>{r.name}{r.size ? ` (${r.size})` : ""}</td><td>{r.warehouse}</td><td>{r.project ?? "—"}</td><td>{r.employee ?? "—"}</td>
                    <td className="num font-semibold">{out ? "−" : "+"}{fmtQty(r.qty)} {r.unit}</td>
                    <td>{r.userName}</td><td className="max-w-[240px] truncate text-xs" title={r.reason ?? ""}>{r.reason}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={data.total} params={clean} />
      </Card>
    </>
  );
}
