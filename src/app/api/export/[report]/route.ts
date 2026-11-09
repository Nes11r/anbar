import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { can, scopeProjectId, type Permission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { logServerError } from "@/lib/errors";
import { buildCsv, buildXlsx, type ExportColumn } from "@/server/export";
import { listMaterials } from "@/server/services/catalog";
import { employeeHistory, inventoryDifferences, ledgerJournal, lowStock, poReceiptStatusReport, ppeByGroup, projectReport, stockList, turnover } from "@/server/services/reports";

export const dynamic = "force-dynamic";

const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined);
const G = az.workerGroup as Record<string, string>;
const E = az.entryType as Record<string, string>;

type Report = { title: string; perm: Permission; run: (p: URLSearchParams) => Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; filters: [string, string][] }> };

const REPORTS: Record<string, Report> = {
  stock: {
    title: "Cari qalıq",
    perm: "stock.view",
    run: async (p) => {
      const r = await stockList({ q: p.get("q") ?? "", warehouseId: uuid(p.get("wh")), categoryId: uuid(p.get("cat")), group: p.get("group") ?? "", size: p.get("size") ?? "", onlyPositive: p.get("pos") === "1", status: (p.get("status") ?? "") as never, pageSize: 5000 });
      const wh = uuid(p.get("wh")) ? (await db.warehouse.findUnique({ where: { id: uuid(p.get("wh"))! } }))?.name : "Bütün normal anbarlar";
      return {
        filters: [["Anbar", wh ?? "—"], ...(p.get("q") ? [["Axtarış", p.get("q")!] as [string, string]] : []), ...(p.get("group") ? [["Təyinat", G[p.get("group")!] ?? ""] as [string, string]] : [])],
        columns: [{ key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 34 }, { key: "size", header: "Ölçü" }, { key: "category", header: "Kateqoriya", width: 22 }, { key: "group", header: "Təyinat" }, { key: "onhand", header: "Fiziki qalıq", num: true }, { key: "reserved", header: "Rezerv", num: true }, { key: "avail", header: "Mövcud", num: true }, { key: "min", header: "Minimum", num: true }, { key: "unit", header: "Vahid" }],
        rows: r.rows.map((x) => ({ ...x, group: G[x.workerGroup], avail: Number(x.onhand) - Number(x.reserved) })),
      };
    },
  },
  catalog: {
    title: "Material kataloqu",
    perm: "catalog.view",
    run: async (p) => {
      const r = await listMaterials({ q: p.get("q") ?? "", categoryId: uuid(p.get("cat")), group: (p.get("group") || undefined) as never, active: (p.get("active") || "1") as never, pageSize: 200, page: 1 });
      const all = [...r.rows];
      for (let page = 2; (page - 1) * 200 < r.total && page <= 50; page++) all.push(...(await listMaterials({ q: p.get("q") ?? "", categoryId: uuid(p.get("cat")), group: (p.get("group") || undefined) as never, active: (p.get("active") || "1") as never, pageSize: 200, page })).rows);
      return {
        filters: [],
        columns: [{ key: "code", header: "Kod" }, { key: "sku", header: "SKU", width: 22 }, { key: "nameAz", header: "Ad (AZ)", width: 30 }, { key: "nameEn", header: "Ad (EN)", width: 30 }, { key: "category", header: "Kateqoriya", width: 22 }, { key: "group", header: "Təyinat" }, { key: "originalCode", header: "Orijinal kod" }, { key: "brand", header: "Marka" }, { key: "model", header: "Model", width: 24 }, { key: "size", header: "Ölçü" }, { key: "color", header: "Rəng" }, { key: "unit", header: "Vahid" }, { key: "barcode", header: "Barkod" }, { key: "active", header: "Aktiv" }],
        rows: all.flatMap((m) => m.variants.map((v) => ({ code: m.code, sku: v.sku, nameAz: m.nameAz, nameEn: m.nameEn, category: m.category.nameAz, group: G[m.workerGroup], originalCode: m.originalCode, brand: m.brand, model: m.model, size: v.size, color: v.color || m.color, unit: m.unitCode, barcode: v.barcode, active: m.isActive && v.isActive }))),
      };
    },
  },
  journal: {
    title: "Hərəkət jurnalı",
    perm: "stock.view",
    run: async (p) => {
      const r = await ledgerJournal({ q: p.get("q") ?? "", type: p.get("type") || undefined, warehouseId: uuid(p.get("wh")), projectId: uuid(p.get("project")), variantId: uuid(p.get("variant")), from: date(p.get("from")), to: date(p.get("to")), limit: 20000 });
      return {
        filters: [["Dövr", `${p.get("from") ?? "…"} — ${p.get("to") ?? "…"}`], ...(p.get("type") ? [["Növ", E[p.get("type")!] ?? ""] as [string, string]] : [])],
        columns: [{ key: "movementDate", header: "Tarix" }, { key: "type", header: "Növ", width: 18 }, { key: "docNumber", header: "Sənəd", width: 20 }, { key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "warehouse", header: "Anbar", width: 18 }, { key: "project", header: "Layihə" }, { key: "employee", header: "İşçi", width: 22 }, { key: "qty", header: "Miqdar", num: true }, { key: "unit", header: "Vahid" }, { key: "userName", header: "İstifadəçi" }, { key: "reason", header: "Səbəb", width: 30 }],
        rows: r.rows.map((x) => ({ ...x, type: E[x.entryType] })),
      };
    },
  },
  project: {
    title: "Layihə üzrə verilənlər",
    perm: "project.view",
    run: async (p) => {
      const id = uuid(p.get("id"));
      if (!id) throw new Error("project id");
      const pr = await db.project.findUniqueOrThrow({ where: { id } });
      const rows = await projectReport(id, date(p.get("from")), date(p.get("to")));
      return {
        filters: [["Layihə", `${pr.code} — ${pr.name}`], ["Dövr", `${p.get("from") ?? "…"} — ${p.get("to") ?? "…"}`]],
        columns: [{ key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "category", header: "Kateqoriya", width: 22 }, { key: "group", header: "Təyinat" }, { key: "issuedProject", header: "Layihəyə verilən", num: true }, { key: "issuedEmployee", header: "İşçilərə PPE", num: true }, { key: "returned", header: "Qaytarılan", num: true }, { key: "net", header: "Xalis", num: true }, { key: "unit", header: "Vahid" }],
        rows: rows.map((x) => ({ ...x, group: G[x.workerGroup] })),
      };
    },
  },
  ppe: {
    title: "PPE mühəndis-fəhlə bölgüsü",
    perm: "report.view",
    run: async (p) => ({
      filters: [["Dövr", `${p.get("from") ?? "…"} — ${p.get("to") ?? "…"}`]],
      columns: [{ key: "group", header: "İşçi qrupu" }, { key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "net", header: "Xalis verilən", num: true }, { key: "unit", header: "Vahid" }],
      rows: (await ppeByGroup(date(p.get("from")), date(p.get("to")))).map((x) => ({ ...x, group: (az.employeeGroup as Record<string, string>)[x.employeeGroup] })),
    }),
  },
  employee: {
    title: "İşçi üzrə təhvil tarixçəsi",
    perm: "employee.view",
    run: async (p) => {
      const id = uuid(p.get("id"));
      if (!id) throw new Error("employee id");
      const e = await db.employee.findUniqueOrThrow({ where: { id } });
      const h = await employeeHistory(id);
      return {
        filters: [["İşçi", `${e.code} — ${e.fullName}`]],
        columns: [{ key: "source", header: "Mənbə" }, { key: "date", header: "Tarix" }, { key: "type", header: "Növ" }, { key: "doc", header: "Sənəd" }, { key: "item", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "qty", header: "Miqdar", num: true }, { key: "note", header: "Qeyd", width: 30 }],
        rows: [
          ...h.ledger.map((x) => ({ source: "Sistem", date: x.movementDate, type: E[x.entryType], doc: x.docNumber, item: `${x.sku} ${x.name}`, size: x.size, qty: x.qty, note: x.reason })),
          ...h.historical.map((x) => ({ source: "Tarixi Excel (qalığa təsir etmir)", date: x.issueDate ?? x.rawDate, type: "Tarixi məxaric", doc: "", item: [x.itemText, x.modelText].filter(Boolean).join(" "), size: x.sizeText, qty: x.qty?.toString(), note: x.comment })),
        ],
      };
    },
  },
  "po-status": {
    title: "Sifariş qəbul statusları",
    perm: "po.view",
    run: async () => ({
      filters: [],
      columns: [{ key: "poNumber", header: "PO", width: 18 }, { key: "status", header: "Status" }, { key: "supplier", header: "Tədarükçü", width: 24 }, { key: "orderDate", header: "Tarix" }, { key: "expectedDate", header: "Gözlənilən" }, { key: "lineNo", header: "Sətir" }, { key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "ordered", header: "Sifariş", num: true }, { key: "received", header: "Qəbul", num: true }, { key: "open", header: "Açıq qalıq", num: true }],
      rows: (await poReceiptStatusReport()).map((x) => ({ ...x, status: (az.poStatus as Record<string, string>)[x.status] })),
    }),
  },
  "inventory-diff": {
    title: "İnventar fərqləri",
    perm: "report.view",
    run: async (p) => ({
      filters: [["Dövr", `${p.get("from") ?? "…"} — ${p.get("to") ?? "…"}`]],
      columns: [{ key: "number", header: "Sənəd" }, { key: "mode", header: "Rejim" }, { key: "countDate", header: "Tarix" }, { key: "warehouse", header: "Anbar" }, { key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "system", header: "Sistem", num: true }, { key: "counted", header: "Sayılan", num: true }, { key: "diff", header: "Fərq", num: true }],
      rows: (await inventoryDifferences(date(p.get("from")), date(p.get("to")))).map((x) => ({ ...x, mode: (az.countMode as Record<string, string>)[x.mode] })),
    }),
  },
  "low-stock": {
    title: "Minimum stok",
    perm: "stock.view",
    run: async () => ({
      filters: [],
      columns: [{ key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "onhand", header: "Fiziki", num: true }, { key: "avail", header: "Mövcud", num: true }, { key: "min", header: "Minimum", num: true }, { key: "unit", header: "Vahid" }],
      rows: await lowStock(5000),
    }),
  },
  turnover: {
    title: "Dövriyyə",
    perm: "report.view",
    run: async (p) => {
      const from = date(p.get("from")) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const to = date(p.get("to")) ?? new Date();
      return {
        filters: [["Dövr", `${from.toISOString().slice(0, 10)} — ${to.toISOString().slice(0, 10)}`]],
        columns: [{ key: "sku", header: "SKU", width: 22 }, { key: "name", header: "Material", width: 30 }, { key: "size", header: "Ölçü" }, { key: "opening", header: "Dövrün əvvəli", num: true }, { key: "incoming", header: "Giriş", num: true }, { key: "outgoing", header: "Çıxış", num: true }, { key: "closing", header: "Dövrün sonu", num: true }, { key: "unit", header: "Vahid" }],
        rows: await turnover(from, to, uuid(p.get("wh"))),
      };
    },
  },
};

export async function GET(req: Request, ctx: { params: Promise<{ report: string }> }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { report } = await ctx.params;
  const r = REPORTS[report];
  if (!r) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (!can(u.role, r.perm)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = new URL(req.url).searchParams;
  // project-limited accounts may export only their own project, never company-wide order lists
  const scope = scopeProjectId(u);
  if (scope && (report === "po-status" || (report === "project" && p.get("id") !== scope))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = await r.run(p);
    const stamp = new Date().toISOString().slice(0, 10);
    const fname = `hecotec_${report}_${stamp}`;
    await db.auditLog.create({ data: { userId: u.id, userEmail: u.email, action: "EXPORT", entityType: "Report", entityId: report, summary: `${r.title}: ${data.rows.length} sətir; ${data.filters.map(([k, v]) => `${k}=${v}`).join("; ")}` } });
    if (p.get("format") === "csv") {
      return new NextResponse(buildCsv(data.columns, data.rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fname}.csv"`, "Cache-Control": "no-store" } });
    }
    const buf = await buildXlsx({ title: r.title, filters: data.filters, user: `${u.name} (${u.email})`, columns: data.columns, rows: data.rows });
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fname}.xlsx"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    logServerError(`export/${report}`, e);
    return NextResponse.json({ error: "Export alınmadı" }, { status: 500 });
  }
}
