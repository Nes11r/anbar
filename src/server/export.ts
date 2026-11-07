import ExcelJS from "exceljs";

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  num?: boolean;
}

/** Excel/CSV formula injection guard: values starting with = + - @ TAB CR are prefixed with an apostrophe. */
export function safeCell(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? "Bəli" : "Xeyr";
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export async function buildXlsx(opts: { title: string; filters: [string, string][]; user: string; columns: ExportColumn[]; rows: Record<string, unknown>[] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HECOTEC WMS";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([`HECOTEC MMC — ${opts.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Hazırlanıb: ${new Date().toLocaleString("az-AZ", { timeZone: "Asia/Baku" })} · İstifadəçi: ${opts.user}`]);
  ws.addRow([`Filtrlər: ${opts.filters.length ? opts.filters.map(([k, v]) => `${k}: ${v}`).join("; ") : "yoxdur (bütün məlumat)"}`]);
  ws.addRow([`Sətir sayı: ${opts.rows.length}`]);
  ws.addRow([]);
  const header = ws.addRow(opts.columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF006381" } };
  });
  for (const r of opts.rows) {
    ws.addRow(opts.columns.map((c) => {
      const v = r[c.key];
      if (c.num && v != null && v !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : safeCell(v);
      }
      return safeCell(v);
    }));
  }
  opts.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.min(40, Math.max(10, c.header.length + 2));
    if (c.num) ws.getColumn(i + 1).numFmt = "#,##0.###";
  });
  ws.views = [{ state: "frozen", ySplit: 6 }];
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: opts.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(safeCell(v));
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.header)).join(";"), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(";"))];
  return "﻿" + lines.join("\r\n");
}
