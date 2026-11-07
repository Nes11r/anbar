import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtQty, sp } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { ppeByGroup } from "@/server/services/reports";

export const metadata = { title: "Hesabatlar" };
export const dynamic = "force-dynamic";

const REPORTS: { key: string; title: string; desc: string; range?: boolean; wh?: boolean }[] = [
  { key: "stock", title: "Cari qalıq", desc: "Anbar, ölçü və kateqoriya üzrə fiziki qalıq, rezerv, mövcud.", wh: true },
  { key: "journal", title: "Material hərəkət jurnalı", desc: "Bütün təsdiqlənmiş giriş/çıxışlar (ledger).", range: true, wh: true },
  { key: "ppe", title: "PPE mühəndis / fəhlə bölgüsü", desc: "İşçilərə verilən PPE, peşə qrupu üzrə xalis.", range: true },
  { key: "po-status", title: "Sifariş qəbul statusları", desc: "PO sətirləri: sifariş, qəbul, açıq qalıq." },
  { key: "inventory-diff", title: "İnventar fərqləri", desc: "Təsdiqlənmiş sayımlar: sistem vs sayılan.", range: true },
  { key: "low-stock", title: "Minimum stok", desc: "Mövcud qalığı minimuma çatmış variantlar." },
  { key: "turnover", title: "Dövriyyə", desc: "Dövrün əvvəli, giriş, çıxış, dövrün sonu.", range: true, wh: true },
  { key: "catalog", title: "Material kataloqu", desc: "Bütün materiallar və variant SKU-ları." },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("report.view");
  const s = await searchParams;
  const from = sp(s.from), to = sp(s.to), wh = sp(s.wh);
  const [whs, ppe] = await Promise.all([db.warehouse.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }] }), ppeByGroup(from ? new Date(from) : undefined, to ? new Date(to) : undefined)]);
  const qs = (extra: Record<string, string> = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ from, to, wh, ...extra }).filter(([, v]) => v))).toString();
  const eng = ppe.filter((r) => r.employeeGroup === "ENGINEER").reduce((a, r) => a + Number(r.net), 0);
  const wrk = ppe.filter((r) => r.employeeGroup === "WORKER").reduce((a, r) => a + Number(r.net), 0);
  return (
    <>
      <PageHeader title="Hesabatlar və çıxarışlar" subtitle="Excel/CSV faylında hazırlanma vaxtı, istifadəçi, filtr və dövr göstərilir. Layihə və işçi hesabatları öz kartlarındadır." />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="label"><span>Başlanğıc</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label className="label"><span>Son</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <label className="label"><span>Anbar</span><select className="select" name="wh" defaultValue={wh}><option value="">Bütün normal anbarlar</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <button className="btn">Filtri tətbiq et</button>
      </form>
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {REPORTS.map((r) => (
          <Card key={r.key} title={r.title}>
            <p className="mb-3 min-h-10 text-sm text-muted">{r.desc}{(r.range || r.wh) && <span className="block text-xs">Filtr: {r.range ? "dövr" : ""}{r.range && r.wh ? ", " : ""}{r.wh ? "anbar" : ""}</span>}</p>
            <div className="flex gap-2">
              <a className="btn btn-sm btn-brand" href={`/api/export/${r.key}?${qs()}`}>Excel</a>
              <a className="btn btn-sm" href={`/api/export/${r.key}?${qs({ format: "csv" })}`}>CSV</a>
            </div>
          </Card>
        ))}
      </div>
      <Card title="PPE bölgüsü (seçilmiş dövr)" pad={false}>
        <div className="grid grid-cols-2 gap-3 p-4 md:w-1/2">
          <div className="card p-3"><div className="text-xs text-muted">Mühəndislərə</div><div className="text-xl font-bold">{fmtQty(eng)}</div></div>
          <div className="card p-3"><div className="text-xs text-muted">Fəhlələrə</div><div className="text-xl font-bold">{fmtQty(wrk)}</div></div>
        </div>
        {ppe.length > 0 && (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Qrup</th><th>SKU</th><th>Material</th><th>Ölçü</th><th className="num">Xalis</th></tr></thead>
            <tbody>{ppe.map((r, i) => <tr key={i}><td>{r.employeeGroup === "ENGINEER" ? "Mühəndis" : "Fəhlə"}</td><td>{r.sku}</td><td>{r.name}</td><td>{r.size || "—"}</td><td className="num">{fmtQty(r.net)} {r.unit}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
