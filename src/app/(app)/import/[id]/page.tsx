import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import type { ImportDataType, Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { sp } from "@/lib/format";
import { Badge, Card, FilterChips, PageHeader, Pagination } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { FIELD_DEFS, sheetPreview, suggestMapping, type ImportMapping, type RowIssue } from "@/server/import/service";
import { commitAction, rollbackAction, rowAction } from "../actions";
import { MappingForm } from "./mapping-form";

export const dynamic = "force-dynamic";

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("import.run");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await db.importBatch.findUnique({ where: { id } });
  if (!b) notFound();
  const step = sp(s.step);
  const sheet = sp(s.sheet) || b.sheetName || "";
  const mapping = b.mapping as ImportMapping | null;
  const showPreview = (step === "preview" || b.status === "COMMITTED" || b.status === "ROLLED_BACK") && b.status !== "UPLOADED";

  const header = (
    <PageHeader
      title={`Import: ${b.fileName}`}
      subtitle={<span className="flex items-center gap-2"><Badge tone={b.status === "COMMITTED" ? "ok" : b.status === "ROLLED_BACK" ? "warn" : "info"}>{az.importStatus[b.status]}</Badge>{b.dataType && <>{az.importType[b.dataType]} · vərəq “{b.sheetName}”</>}</span>}
      crumbs={[{ href: "/import", label: "Excel importu" }, { label: b.fileName }]}
      actions={<>
        {b.status === "MAPPED" && showPreview && <Link className="btn" href={`/import/${b.id}?sheet=${encodeURIComponent(b.sheetName ?? "")}`}>← Uyğunlaşdırmaya qayıt</Link>}
        {b.status === "MAPPED" && showPreview && <ActionButton className="btn btn-primary" action={commitAction.bind(null, b.id)} confirm={b.dataType === "OPENING_BALANCE" ? "Təsdiq edilsin? Kataloq qeydləri və QARALAMA sayım sənədi yaradılacaq. Qalıq yalnız sayım təsdiqlənəndə dəyişəcək." : b.dataType === "HISTORICAL_ISSUES" ? "Tarixi qeydlər yazılsın? Anbar qalığı dəyişməyəcək." : b.dataType === "SUMMARY_REPORT" ? "Xülasə yalnız arxivləşdiriləcək — qalıq və tarixçə yaradılmayacaq. Davam edilsin?" : "Təsdiq edilsin?"}>7. Təsdiq et (commit)</ActionButton>}
        {b.status !== "COMMITTED" && <DeleteButton type="importBatch" id={b.id} label={b.fileName} />}
        {b.status === "COMMITTED" && <ActionButton className="btn btn-danger" action={rollbackAction.bind(null, b.id)} confirm="Bu import geri qaytarılsın? Yaradılmış qeydlər silinəcək (istifadə olunmayıbsa).">Geri qaytar</ActionButton>}
      </>}
    />
  );

  if (!showPreview) {
    // Step 2: sheet selection + mapping
    if (!sheet) {
      return (
        <>
          {header}
          <Card title="2. Vərəqi seçin">
            <div className="flex flex-wrap gap-2">{b.sheetNames.map((n) => <Link key={n} className="chip" href={`/import/${b.id}?sheet=${encodeURIComponent(n)}`}>{n}</Link>)}</div>
          </Card>
        </>
      );
    }
    const headerRow = Number(sp(s.header)) || (mapping?.sheetName === sheet ? mapping.headerRow : undefined);
    const [preview, cats, whs] = await Promise.all([
      sheetPreview(b.id, sheet, headerRow),
      db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    ]);
    const suggestions = Object.fromEntries((Object.keys(FIELD_DEFS) as ImportDataType[]).map((t) => [t, suggestMapping(t, preview.headers)]));
    return (
      <>
        {header}
        <Card title="2. Vərəq və başlıq sətri" className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {b.sheetNames.map((n) => <Link key={n} className="chip" aria-current={n === sheet ? "true" : undefined} href={`/import/${b.id}?sheet=${encodeURIComponent(n)}`}>{n}</Link>)}
          </div>
          <form className="mt-3 flex items-end gap-2">
            <input type="hidden" name="sheet" value={sheet} />
            <label className="label"><span>Başlıq sətri (təklif: {preview.headerRow})</span><input className="input w-28" type="number" name="header" min={1} max={50} defaultValue={preview.headerRow} /></label>
            <button className="btn">Yenilə</button>
          </form>
        </Card>
        <MappingForm
          key={`${sheet}-${preview.headerRow}`}
          batchId={b.id}
          preview={preview}
          fields={FIELD_DEFS}
          suggestions={suggestions}
          categories={cats.map((c) => ({ id: c.id, label: c.nameAz, isUniform: c.isUniform }))}
          warehouses={whs.filter((w) => w.type === "NORMAL").map((w) => ({ id: w.id, name: w.name }))}
          initial={mapping && mapping.sheetName === sheet && b.dataType ? { dataType: b.dataType, columns: mapping.columns, sizeColumns: mapping.sizeColumns, fillDown: mapping.fillDown, lastRow: mapping.lastRow, defaults: mapping.defaults } : undefined}
        />
      </>
    );
  }

  // Step 5–6: preview rows with issues; toggle skip/create
  const filter = sp(s.f);
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.ImportRowWhereInput = { batchId: id };
  if (filter === "error") where.action = "ERROR";
  if (filter === "skip") where.action = "SKIP";
  if (filter === "warn") where.issues = { array_contains: [{ level: "warn" }] };
  const [total, rows, counts] = await Promise.all([
    db.importRow.count({ where }),
    db.importRow.findMany({ where, orderBy: { sourceRow: "asc" }, skip: (page - 1) * 100, take: 100 }),
    db.importRow.groupBy({ by: ["action"], where: { batchId: id }, _count: true }),
  ]);
  const cnt = Object.fromEntries(counts.map((c) => [c.action, c._count]));
  const fieldDefs = b.dataType ? FIELD_DEFS[b.dataType] : [];
  const editable = b.status === "MAPPED";
  return (
    <>
      {header}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["CREATE", "Təsdiq ediləcək", "ok"], ["MATCH", "Mövcudla uyğunlaşdı", "info"], ["SKIP", "Atlanacaq", "muted"], ["ERROR", "Xətalı (atlanacaq)", "bad"]].map(([k, l, t]) => (
          <div key={k} className="card p-3"><div className="text-xs text-muted">{l}</div><div className={`text-xl font-bold text-${t === "muted" ? "muted" : t}`}>{cnt[k] ?? 0}</div></div>
        ))}
        <div className="card p-3"><div className="text-xs text-muted">Provenance</div><div className="text-xs">fayl, vərəq, sətir, xam dəyər və paket ID hər sətirdə saxlanılır</div></div>
      </div>
      {b.dataType === "OPENING_BALANCE" && <div className="alert alert-info mb-4">Təsdiqdən sonra <Link className="link" href="/inventory">İnventarlaşdırma</Link> bölməsində QARALAMA sayım sənədi yaranacaq. Onu yoxlayıb təsdiqləyənə qədər anbar qalığı dəyişmir.</div>}
      <Card pad={false}>
        <div className="border-b border-line p-3"><FilterChips name="f" value={filter} params={{ step: "preview", ...(filter ? { f: filter } : {}) }} options={[["", "Hamısı"], ["warn", "Xəbərdarlıqlı"], ["error", "Xətalı"], ["skip", "Atlanan"]]} /></div>
        <div className="tbl-wrap">
          <table className="tbl text-xs">
            <thead><tr><th>Sətir</th><th>Hərəkət</th>{fieldDefs.slice(0, 7).map((f) => <th key={f.key}>{f.label}</th>)}<th>Ölçülər</th><th>Xəbərdarlıqlar</th>{editable && <th></th>}</tr></thead>
            <tbody>{rows.map((r) => {
              const n = (r.normalized ?? {}) as Record<string, unknown>;
              const issues = r.issues as unknown as RowIssue[];
              return (
                <tr key={r.id} className={r.action === "ERROR" ? "bg-bad-soft" : r.action === "SKIP" ? "opacity-60" : ""}>
                  <td className="font-semibold">{r.sourceRow}</td>
                  <td><Badge tone={r.action === "CREATE" ? "ok" : r.action === "MATCH" ? "info" : r.action === "ERROR" ? "bad" : "muted"}>{r.action}</Badge></td>
                  {fieldDefs.slice(0, 7).map((f) => <td key={f.key} className="max-w-[180px] truncate" title={String(n[f.key] ?? "")}>{n[f.key] == null || n[f.key] === "" ? "—" : f.key === "group" ? az.workerGroup[n[f.key] as keyof typeof az.workerGroup] : String(n[f.key])}</td>)}
                  <td className="max-w-[200px]">{Array.isArray(n.sizes) ? (n.sizes as { size: string; qty: number }[]).map((x) => `${x.size}:${x.qty}`).join(", ") : "—"}</td>
                  <td className="max-w-[320px]">{issues.map((i, k) => <div key={k} className={i.level === "error" ? "text-bad" : i.level === "warn" ? "text-warn" : "text-muted"}>• {i.msg}</div>)}</td>
                  {editable && <td>{r.action === "CREATE" ? <ActionButton className="btn btn-sm" action={rowAction.bind(null, r.id, "SKIP")}>Atla</ActionButton> : r.action === "SKIP" ? <ActionButton className="btn btn-sm" action={rowAction.bind(null, r.id, "CREATE")}>Daxil et</ActionButton> : null}</td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={100} total={total} params={{ step: "preview", ...(filter ? { f: filter } : {}) }} />
      </Card>
    </>
  );
}
