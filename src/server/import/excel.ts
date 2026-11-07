import ExcelJS from "exceljs";
import { cleanText } from "./normalize";

export type Cell = string | number | Date | null;
export type Grid = Cell[][];

const MAX_ROWS = 20000;
const MAX_COLS = 200;

/** Reads an .xlsx / .xlsm buffer. Macros are never executed (ExcelJS ignores vbaProject.bin). */
export async function readWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("NOT_XLSX");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer, { ignoreNodes: ["dataValidations", "conditionalFormatting", "hyperlinks"] } as never);
  return wb;
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; error?: string };
    if ("formula" in (v as object) || "sharedFormula" in (v as object)) {
      const r = o.result;
      if (r == null) return null;
      if (typeof r === "number" || r instanceof Date) return r as number | Date;
      if (typeof r === "object" && (r as { error?: string }).error) return null;
      return cleanText(r);
    }
    if (o.error) return null;
    const t = cleanText(v);
    return t || null;
  }
  return String(v);
}

export function sheetToGrid(ws: ExcelJS.Worksheet): Grid {
  const grid: Grid = [];
  const maxRow = Math.min(ws.actualRowCount ? ws.rowCount : 0, MAX_ROWS);
  const maxCol = Math.min(ws.columnCount, MAX_COLS);
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const out: Cell[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const v = cellValue(row.getCell(c).value);
      out.push(typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() || null : v);
    }
    grid.push(out);
  }
  // trim trailing empty rows
  while (grid.length && grid[grid.length - 1].every((c) => c == null)) grid.pop();
  return grid;
}

/** First row (within first 15) with ≥3 text cells — a suggestion only; the user confirms it. */
export function detectHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const texts = grid[i].filter((c) => typeof c === "string" && c.length > 0 && c.length < 60).length;
    if (texts >= 3) return i + 1;
  }
  return 1;
}

export function colLetter(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
