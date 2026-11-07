import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type ImportDataType, type WorkerGroup } from "@prisma/client";
import { z } from "zod";
import { db, withTx } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { audit, type Actor } from "../audit";
import { createMaterial, variantSku } from "../services/catalog";
import { nextNumber } from "../stock/ledger";
import { D } from "../stock/rules";
import { colLetter, detectHeaderRow, readWorkbook, sheetToGrid, type Cell, type Grid } from "./excel";
import { cleanText, guessSizeType, isNA, normalizeSize, parseDate, parseMultiSizeCell, parseQty } from "./normalize";

const UPLOAD_DIR = () => path.resolve(process.env.UPLOAD_DIR ?? "./uploads", "imports");
const MAX_BYTES = 25 * 1024 * 1024;

export const FIELD_DEFS: Record<ImportDataType, { key: string; label: string; required?: boolean }[]> = {
  CATALOG: [
    { key: "name", label: "Material adı", required: true },
    { key: "model", label: "Model" },
    { key: "originalCode", label: "Orijinal məhsul kodu" },
    { key: "size", label: "Ölçü" },
    { key: "qty", label: "Miqdar (yalnız məlumat üçün)" },
    { key: "group", label: "Mühəndis / Fəhlə" },
    { key: "unit", label: "Ölçü vahidi" },
    { key: "color", label: "Rəng" },
    { key: "brand", label: "Marka" },
    { key: "supplier", label: "Tədarükçü" },
    { key: "notes", label: "Qeyd" },
  ],
  OPENING_BALANCE: [
    { key: "name", label: "Material adı", required: true },
    { key: "model", label: "Model" },
    { key: "originalCode", label: "Orijinal məhsul kodu" },
    { key: "size", label: "Ölçü" },
    { key: "qty", label: "Sayılmış miqdar", required: true },
    { key: "group", label: "Mühəndis / Fəhlə" },
    { key: "unit", label: "Ölçü vahidi" },
    { key: "color", label: "Rəng" },
    { key: "notes", label: "Qeyd" },
  ],
  HISTORICAL_ISSUES: [
    { key: "employeeName", label: "İşçinin adı", required: true },
    { key: "item", label: "Material", required: true },
    { key: "model", label: "Model / rəng" },
    { key: "productCode", label: "Məhsul kodu" },
    { key: "size", label: "Ölçü" },
    { key: "qty", label: "Ədəd" },
    { key: "date", label: "Tarix" },
    { key: "comment", label: "Şərh" },
  ],
  OPEN_ORDERS: [
    { key: "name", label: "Material / model", required: true },
    { key: "originalCode", label: "Məhsul kodu" },
    { key: "qty", label: "Miqdar" },
    { key: "notes", label: "Qeyd" },
  ],
  SUMMARY_REPORT: [{ key: "name", label: "Sətir başlığı", required: true }],
};

const SYNONYMS: Record<string, string[]> = {
  name: ["item", "material", "ad", "name", "məhsul", "mehsul", "model"],
  model: ["model"],
  originalCode: ["product code", "item code", "kod", "code"],
  size: ["size", "ölçü", "olcu", "razmer"],
  qty: ["pcs", "quantity", "qty", "total", "miqdar", "say", "ədəd"],
  group: ["res.", "res", "kateqoriya", "group"],
  unit: ["unit", "vahid", "uom"],
  color: ["color", "rəng", "reng"],
  supplier: ["supplayer", "supplier", "tədarükçü"],
  notes: ["comment", "qeyd", "note"],
  employeeName: ["ad", "name", "işçi", "name surname"],
  item: ["item", "material"],
  productCode: ["product code", "kod"],
  date: ["time", "tarix", "date"],
  comment: ["comet", "comment", "şərh", "qeyd"],
};

export const mappingSchema = z.object({
  sheetName: z.string().min(1),
  dataType: z.enum(["CATALOG", "OPENING_BALANCE", "HISTORICAL_ISSUES", "OPEN_ORDERS", "SUMMARY_REPORT"]),
  headerRow: z.coerce.number().int().min(1).max(50),
  lastRow: z.coerce.number().int().min(0).max(20000).default(0),
  columns: z.record(z.string(), z.coerce.number().int().min(-1).max(199)),
  /** wide layout: column index → size label (e.g. PPE List "48" columns) */
  sizeColumns: z.array(z.object({ col: z.coerce.number().int(), size: z.string() })).default([]),
  fillDown: z.array(z.string()).default([]),
  defaults: z.object({
    categoryId: z.string().uuid().optional().nullable(),
    workerGroup: z.enum(["ENGINEER", "WORKER", "BOTH", "NOT_APPLICABLE"]).optional().nullable(),
    unitCode: z.string().optional().nullable(),
    warehouseId: z.string().uuid().optional().nullable(),
    countDate: z.string().optional().nullable(),
  }).default({}),
});
export type ImportMapping = z.infer<typeof mappingSchema>;

export interface RowIssue {
  level: "error" | "warn" | "info";
  msg: string;
}

// ───────────────────────── 1. Upload ─────────────────────────

export async function uploadImport(actor: Actor, fileName: string, buf: Buffer) {
  if (!can(actor.role, "import.run")) throw new ForbiddenError();
  if (!/\.(xlsx|xlsm)$/i.test(fileName)) throw new AppError("Yalnız .xlsx və .xlsm faylları qəbul edilir.", "VALIDATION");
  if (buf.length === 0) throw new AppError("Fayl boşdur.", "VALIDATION");
  if (buf.length > MAX_BYTES) throw new AppError("Fayl 25 MB-dan böyükdür.", "VALIDATION");
  let wb;
  try {
    wb = await readWorkbook(buf);
  } catch {
    throw new AppError("Fayl oxuna bilmədi. Excel faylı (xlsx/xlsm) olduğundan və zədələnmədiyindən əmin olun.", "BAD_FILE");
  }
  const sheetNames = wb.worksheets.map((w) => w.name);
  const fileHash = createHash("sha256").update(buf).digest("hex");
  await mkdir(UPLOAD_DIR(), { recursive: true });
  const storagePath = path.join(UPLOAD_DIR(), `${fileHash}.bin`);
  await writeFile(storagePath, buf);
  const safeName = path.basename(fileName).replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 200);
  const batch = await db.importBatch.create({
    data: { fileName: safeName, fileHash, fileSize: buf.length, sheetNames, storagePath, createdById: actor.id },
  });
  await db.auditLog.create({ data: { userId: actor.id, userEmail: actor.email, action: "IMPORT_UPLOAD", entityType: "ImportBatch", entityId: batch.id, summary: `${safeName} (${sheetNames.length} vərəq)` } });
  return batch;
}

async function loadGrid(batchId: string, sheetName: string): Promise<Grid> {
  const b = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!b) throw new NotFoundError("Import paketi");
  const buf = await readFile(b.storagePath).catch(() => {
    throw new AppError("Yüklənmiş fayl serverdə tapılmadı. Faylı yenidən yükləyin.");
  });
  const wb = await readWorkbook(buf);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new AppError(`Vərəq tapılmadı: ${sheetName}`);
  return sheetToGrid(ws);
}

// ───────────────────────── 2. Sheet preview + auto mapping suggestion ─────────────────────────

export async function sheetPreview(batchId: string, sheetName: string, headerRowIn?: number) {
  const grid = await loadGrid(batchId, sheetName);
  const headerRow = headerRowIn ?? detectHeaderRow(grid);
  const headers = (grid[headerRow - 1] ?? []).map((h, i) => ({ index: i, letter: colLetter(i), label: h == null ? "" : cleanText(h) }));
  const width = Math.max(1, ...grid.slice(0, 60).map((r) => {
    let last = -1;
    r.forEach((c, i) => { if (c != null) last = i; });
    return last + 1;
  }));
  const sizeLike = headers.filter((h) => /^\d{2}$/.test(h.label) || /^(XS|S|M|L|XL|\dXL|XXL)$/i.test(h.label));
  const looksSummary = grid.slice(0, 20).some((r) => typeof r[0] === "string" && /^(total|socar|norm)$/i.test(String(r[0]).trim()));
  const warnings: string[] = [];
  if (looksSummary) warnings.push("Bu vərəq xülasə cədvəlinə bənzəyir (Socar / Norm / Total sətirləri). Onu stok və ya tarixçə kimi import etməyin — \"Hesabat xülasəsi\" növünü seçin.");
  const dup = new Map<string, number>();
  for (const h of sizeLike) dup.set(h.label, (dup.get(h.label) ?? 0) + 1);
  const dups = [...dup.entries()].filter(([, n]) => n > 1).map(([l]) => l);
  if (dups.length) warnings.push(`Eyni ölçü başlığı bir neçə sütunda təkrarlanır (${dups.slice(0, 8).join(", ")}…). Hər sütunun mənasını yoxlayın; eyni ölçülü sütunların dəyərləri toplanacaq.`);
  return {
    sheetName,
    headerRow,
    totalRows: grid.length,
    width: Math.min(width, 80),
    headers: headers.slice(0, Math.min(width, 80)),
    sample: grid.slice(0, Math.min(grid.length, headerRow + 25)).map((r) => r.slice(0, Math.min(width, 80)).map(displayCell)),
    sizeColumns: sizeLike.map((h) => ({ col: h.index, size: normalizeSize(h.label) })),
    warnings,
  };
}

export function suggestMapping(dataType: ImportDataType, headers: { index: number; label: string }[]) {
  const out: Record<string, number> = {};
  for (const f of FIELD_DEFS[dataType]) {
    const syn = SYNONYMS[f.key] ?? [];
    const h = headers.find((x) => {
      const l = x.label.toLowerCase().replace(/\s+/g, " ").trim();
      return syn.some((s) => l === s || l.startsWith(s + " ") || l.startsWith(s + "\n"));
    });
    if (h && !Object.values(out).includes(h.index)) out[f.key] = h.index;
  }
  return out;
}

function displayCell(c: Cell): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).slice(0, 80);
}

// ───────────────────────── 3. Parse rows → ImportRow (preview) ─────────────────────────

interface Normalized {
  name?: string;
  model?: string;
  originalCode?: string;
  size?: string;
  qty?: number | null;
  sizes?: { size: string; qty: number }[];
  group?: WorkerGroup | null;
  unitCode?: string | null;
  color?: string;
  brand?: string;
  supplier?: string;
  notes?: string;
  employeeName?: string;
  item?: string;
  productCode?: string;
  date?: string | null;
  rawDate?: string;
  comment?: string;
}

function mapGroup(v: string): WorkerGroup | null {
  const s = v.toLowerCase();
  if (!s) return null;
  if (/(engineer|mühəndis|muhendis)/.test(s)) return "ENGINEER";
  if (/(laborer|labourer|worker|fəhlə|fehle)/.test(s)) return "WORKER";
  if (/(both|hər ikisi|her ikisi)/.test(s)) return "BOTH";
  return null;
}

function mapUnit(v: string, units: Set<string>): string | null {
  const s = v.toLowerCase().trim();
  const m: Record<string, string> = { pcs: "PCS", pc: "PCS", ədəd: "PCS", eded: "PCS", pair: "PAIR", cüt: "PAIR", set: "SET", m: "M", metr: "M", kg: "KG", kq: "KG", l: "L", litr: "L", box: "BOX", qutu: "BOX", paçka: "PACK", packa: "PACK", pack: "PACK", roll: "ROLL" };
  const code = m[s] ?? s.toUpperCase();
  return units.has(code) ? code : null;
}

export async function parseBatch(actor: Actor, batchId: string, mappingIn: ImportMapping) {
  if (!can(actor.role, "import.run")) throw new ForbiddenError();
  const mapping = mappingSchema.parse(mappingIn);
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Import paketi");
  if (batch.status === "COMMITTED") throw new AppError("Bu paket artıq təsdiqlənib. Dəyişmək üçün əvvəlcə geri qaytarın.");
  for (const f of FIELD_DEFS[mapping.dataType]) {
    if (f.required && !(mapping.columns[f.key] >= 0) && !(f.key === "qty" && mapping.sizeColumns.length)) {
      throw new AppError(`"${f.label}" sütunu seçilməlidir.`, "VALIDATION");
    }
  }
  const grid = await loadGrid(batchId, mapping.sheetName);
  const units = new Set((await db.unit.findMany({ select: { code: true } })).map((u) => u.code));
  const col = (row: Cell[], key: string) => (mapping.columns[key] >= 0 ? row[mapping.columns[key]] : null);
  const last = mapping.lastRow > 0 ? Math.min(mapping.lastRow, grid.length) : grid.length;
  const fill: Record<string, Cell> = {};
  const rows: Prisma.ImportRowCreateManyInput[] = [];
  const seen = new Map<string, number>();

  for (let r = mapping.headerRow; r < last; r++) {
    const raw = grid[r];
    if (!raw || raw.every((c) => c == null)) continue;
    const issues: RowIssue[] = [];
    for (const k of mapping.fillDown) {
      const v = col(raw, k);
      if (v != null && String(v).trim()) fill[k] = v;
    }
    const get = (k: string) => {
      const v = col(raw, k);
      return v == null && mapping.fillDown.includes(k) ? fill[k] ?? null : v;
    };
    const n: Normalized = {};
    const sourceValue: Record<string, string> = {};
    raw.forEach((c, i) => { if (c != null) sourceValue[colLetter(i)] = displayCell(c); });

    if (mapping.dataType === "HISTORICAL_ISSUES") {
      n.employeeName = cleanText(get("employeeName"));
      n.item = cleanText(get("item"));
      n.model = cleanText(get("model"));
      n.productCode = isNA(get("productCode")) ? "" : cleanText(get("productCode"));
      n.size = normalizeSize(get("size"));
      const q = parseQty(get("qty"));
      n.qty = q.qty;
      if (q.problem) issues.push({ level: "warn", msg: q.problem });
      const dRaw = get("date");
      const d = parseDate(dRaw);
      n.date = d.date ? d.date.toISOString().slice(0, 10) : null;
      n.rawDate = dRaw == null ? "" : displayCell(dRaw);
      if (d.problem) issues.push({ level: "warn", msg: d.problem });
      n.comment = cleanText(get("comment"));
      if (!n.employeeName && !n.item) continue; // blank numbered row
      if (!n.employeeName) issues.push({ level: "error", msg: "İşçinin adı boşdur" });
      if (!n.item) issues.push({ level: "error", msg: "Material adı boşdur" });
      if (n.qty == null) issues.push({ level: "warn", msg: "Ədəd boşdur" });
      if (!n.date) issues.push({ level: "warn", msg: "Tarix yoxdur" });
    } else if (mapping.dataType === "SUMMARY_REPORT") {
      n.name = cleanText(get("name"));
      issues.push({ level: "info", msg: "Xülasə sətri — yalnız arxiv üçün saxlanılır, qalıq və ya tarixçə yaratmır." });
    } else {
      n.name = cleanText(get("name"));
      if (!n.name) continue;
      n.model = cleanText(get("model"));
      const oc = get("originalCode");
      n.originalCode = isNA(oc) ? "" : cleanText(oc);
      if (mapping.columns.originalCode >= 0 && isNA(oc)) issues.push({ level: "info", msg: "Kod boş və ya N/A — dublikat yoxlaması kodsuz aparılır, avtomatik birləşdirmə edilmir" });
      n.color = cleanText(get("color"));
      n.brand = cleanText(get("brand"));
      n.supplier = isNA(get("supplier")) ? "" : cleanText(get("supplier"));
      n.notes = cleanText(get("notes"));
      const gRaw = cleanText(get("group"));
      n.group = mapGroup(gRaw) ?? mapping.defaults.workerGroup ?? null;
      if (gRaw && !mapGroup(gRaw)) issues.push({ level: "warn", msg: `Təyinat anlaşılmadı: "${gRaw}"` });
      const uRaw = cleanText(get("unit"));
      n.unitCode = uRaw ? mapUnit(uRaw, units) : mapping.defaults.unitCode ?? "PCS";
      if (uRaw && !n.unitCode) issues.push({ level: "warn", msg: `Ölçü vahidi tanınmadı: "${uRaw}" — standart vahid istifadə olunacaq` });

      // sizes: wide layout (size columns) or single size column (+ possibly multi-size cell)
      const sizes = new Map<string, number>();
      for (const sc of mapping.sizeColumns) {
        const v = raw[sc.col];
        if (v == null || v === "") continue;
        const q = parseQty(v);
        if (q.qty == null) { issues.push({ level: "warn", msg: `${colLetter(sc.col)} (${sc.size}) xanası anlaşılmadı: "${displayCell(v)}"` }); continue; }
        if (q.problem) issues.push({ level: "warn", msg: `${sc.size}: ${q.problem}` });
        sizes.set(normalizeSize(sc.size), (sizes.get(normalizeSize(sc.size)) ?? 0) + q.qty);
      }
      const qCell = get("qty");
      const multi = parseMultiSizeCell(qCell);
      if (multi && multi.pairs.length) {
        for (const p of multi.pairs) sizes.set(p.size, (sizes.get(p.size) ?? 0) + p.qty);
        issues.push({ level: "warn", msg: `Bir xanada bir neçə ölçü/ədəd: ${multi.pairs.map((p) => `${p.size}=${p.qty}`).join(", ")}${multi.leftover ? ` (artıq mətn: "${multi.leftover}")` : ""} — yoxlayın` });
        n.qty = null;
      } else {
        const q = parseQty(qCell);
        n.qty = q.qty;
        if (q.problem) issues.push({ level: q.qty != null && q.qty < 0 ? "error" : "warn", msg: q.problem });
      }
      const sizeCol = get("size");
      const sz = normalizeSize(sizeCol);
      if (sizeCol != null && /[/,]/.test(String(sizeCol))) issues.push({ level: "info", msg: `Ölçü sütunu ölçü siyahısıdır ("${displayCell(sizeCol)}") — variantlar ölçü sütunlarından götürülür` });
      else if (sz && !["EU", "LITR", "PAIR", "N/A"].includes(sz)) n.size = sz;
      if (sizes.size) {
        n.sizes = [...sizes.entries()].map(([size, qty]) => ({ size, qty }));
        const sum = n.sizes.reduce((a, b) => a + b.qty, 0);
        if (n.qty != null && Math.abs(sum - n.qty) > 1e-9) issues.push({ level: "warn", msg: `Şübhəli cəm: ölçülər üzrə cəm ${sum}, "cəmi" sütunu ${n.qty}` });
      }
      if (mapping.dataType === "OPENING_BALANCE") {
        const total = n.sizes ? n.sizes.reduce((a, b) => a + b.qty, 0) : n.qty;
        if (total == null) issues.push({ level: "error", msg: "Miqdar yoxdur" });
        if (total != null && total < 0) issues.push({ level: "error", msg: "Mənfi miqdar" });
        if (total === 0) issues.push({ level: "info", msg: "Miqdar 0 — sətir sayıma 0 kimi düşəcək" });
      }
      if (n.qty != null && n.qty < 0) issues.push({ level: "error", msg: "Mənfi miqdar" });
      if (n.name.length < 2) issues.push({ level: "error", msg: "Anlaşılmayan ad" });
      if (/^[\d\s.,-]+$/.test(n.name)) issues.push({ level: "warn", msg: "Ad yalnız rəqəmdən ibarətdir" });
    }

    const keyStr = JSON.stringify([n.name, n.model, n.originalCode, n.size, n.sizes, n.employeeName, n.item, n.date, n.qty, n.comment]);
    const rowHash = createHash("sha1").update(keyStr).digest("hex");
    const prev = seen.get(rowHash);
    if (prev) issues.push({ level: "warn", msg: `Təkrar sətir (sətir ${prev} ilə eyni)` });
    else seen.set(rowHash, r + 1);

    rows.push({
      batchId,
      sourceFile: batch.fileName,
      sourceSheet: mapping.sheetName,
      sourceRow: r + 1,
      sourceValue: sourceValue as Prisma.InputJsonValue,
      normalized: n as Prisma.InputJsonValue,
      issues: issues as unknown as Prisma.InputJsonValue,
      action: issues.some((i) => i.level === "error") ? "ERROR" : mapping.dataType === "SUMMARY_REPORT" ? "SKIP" : "CREATE",
      rowHash,
    });
  }

  await withTx(async (tx) => {
    await tx.importRow.deleteMany({ where: { batchId } });
    for (let i = 0; i < rows.length; i += 1000) await tx.importRow.createMany({ data: rows.slice(i, i + 1000) });
    const stats = {
      rows: rows.length,
      errors: rows.filter((r) => r.action === "ERROR").length,
      warnings: rows.filter((r) => (r.issues as unknown as RowIssue[]).some((i) => i.level === "warn")).length,
    };
    await tx.importBatch.update({
      where: { id: batchId },
      data: { sheetName: mapping.sheetName, dataType: mapping.dataType, headerRow: mapping.headerRow, mapping: mapping as unknown as Prisma.InputJsonValue, status: "MAPPED", stats },
    });
  });
  return { rows: rows.length };
}

export async function setRowAction(actor: Actor, rowId: string, action: "CREATE" | "SKIP", patch?: { group?: WorkerGroup | null; name?: string }) {
  if (!can(actor.role, "import.run")) throw new ForbiddenError();
  const row = await db.importRow.findUnique({ where: { id: rowId }, include: { batch: true } });
  if (!row) throw new NotFoundError("Sətir");
  if (row.batch.status !== "MAPPED") throw new AppError("Paket artıq təsdiqlənib və ya dəyişdirilə bilməz.");
  const n = (row.normalized ?? {}) as Normalized;
  if (patch?.group !== undefined) n.group = patch.group;
  if (patch?.name) n.name = patch.name.trim();
  const errors = (row.issues as unknown as RowIssue[]).filter((i) => i.level === "error");
  if (action === "CREATE" && errors.length && !patch?.name) throw new AppError("Xətalı sətir təsdiqlənə bilməz — düzəldin və ya atlayın.");
  await db.importRow.update({ where: { id: rowId }, data: { action, normalized: n as Prisma.InputJsonValue } });
}

// ───────────────────────── 4. Commit ─────────────────────────

export async function commitBatch(actor: Actor, batchId: string) {
  if (!can(actor.role, "import.run")) throw new ForbiddenError();
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError("Import paketi");
  if (batch.status === "COMMITTED") return { alreadyCommitted: true, created: 0 };
  if (batch.status !== "MAPPED" || !batch.dataType || !batch.mapping) throw new AppError("Əvvəlcə sütunları uyğunlaşdırın və preview-a baxın.");
  const dup = await db.importBatch.findFirst({ where: { fileHash: batch.fileHash, sheetName: batch.sheetName, dataType: batch.dataType, status: "COMMITTED" } });
  if (dup) throw new AppError(`Bu fayl/vərəq artıq bu növdə import edilib (paket ${dup.id.slice(0, 8)}, ${dup.committedAt?.toLocaleDateString("az-AZ")}). Təkrar import edilmir.`, "DUPLICATE_IMPORT");
  const mapping = batch.mapping as unknown as ImportMapping;
  const rows = await db.importRow.findMany({ where: { batchId, action: "CREATE" }, orderBy: { sourceRow: "asc" } });
  if (rows.length === 0 && batch.dataType !== "SUMMARY_REPORT") throw new AppError("Təsdiq ediləcək sətir yoxdur.");

  const result = await withTx(async (tx) => {
    let created = 0;
    if (batch.dataType === "HISTORICAL_ISSUES") {
      const emps = await tx.employee.findMany({ select: { id: true, fullName: true } });
      const byName = new Map(emps.map((e) => [e.fullName.toLowerCase(), e.id]));
      const data = rows.map((r) => {
        const n = r.normalized as Normalized;
        return {
          employeeName: n.employeeName!,
          employeeId: byName.get(n.employeeName!.toLowerCase()) ?? null,
          itemText: n.item!,
          modelText: n.model || null,
          productCode: n.productCode || null,
          sizeText: n.size || null,
          qty: n.qty == null ? null : D(n.qty),
          issueDate: n.date ? new Date(n.date) : null,
          rawDate: n.rawDate || null,
          comment: n.comment || null,
          importBatchId: batchId,
          importRowId: r.id,
        };
      });
      for (let i = 0; i < data.length; i += 1000) await tx.historicalIssue.createMany({ data: data.slice(i, i + 1000) });
      created = data.length;
    } else if (batch.dataType === "CATALOG" || batch.dataType === "OPENING_BALANCE") {
      if (!mapping.defaults.categoryId) throw new AppError("Kateqoriya seçilməlidir (import parametrləri).", "VALIDATION");
      const cat = await tx.category.findUniqueOrThrow({ where: { id: mapping.defaults.categoryId } });
      const countLines = new Map<string, Prisma.Decimal>();
      for (const r of rows) {
        const n = r.normalized as Normalized;
        const group: WorkerGroup = n.group ?? (cat.isUniform ? "BOTH" : "NOT_APPLICABLE");
        if (cat.isUniform && group === "NOT_APPLICABLE") throw new AppError(`Sətir ${r.sourceRow}: forma materialı üçün təyinat lazımdır.`);
        const sizes = n.sizes?.length ? n.sizes : [{ size: n.size ?? "", qty: n.qty ?? 0 }];
        // Matching: only when an original code exists — same code + same model + same name. Never by name alone.
        let material = n.originalCode
          ? await tx.material.findFirst({ where: { originalCode: n.originalCode, model: n.model || null, nameAz: n.name! }, include: { variants: true } })
          : null;
        if (!material) {
          const m = await createMaterial(
            actor,
            {
              nameAz: n.name!,
              nameEn: n.name!,
              model: n.model || null,
              originalCode: n.originalCode || null,
              categoryId: cat.id,
              workerGroup: group,
              brand: n.brand || null,
              color: n.color || null,
              sizeType: guessSizeType(sizes.map((s) => s.size)),
              unitCode: n.unitCode ?? "PCS",
              minStock: 0,
              notes: [n.notes, n.supplier ? `Tədarükçü (Excel): ${n.supplier}` : ""].filter(Boolean).join("; ") || null,
              variants: sizes.map((s) => ({ size: s.size, color: "", isActive: true })),
            } as never,
            { importBatchId: batchId, importRowId: r.id, confidence: n.originalCode ? "MEDIUM" : "LOW" },
            tx,
          );
          material = m;
          created++;
          await tx.importRow.update({ where: { id: r.id }, data: { targetType: "Material", targetId: m.id } });
        } else {
          for (const s of sizes) {
            const size = normalizeSize(s.size);
            if (!material.variants.find((v) => v.size === size)) {
              const v = await tx.materialVariant.create({ data: { materialId: material.id, size, sku: variantSku(material.code, size, ""), importBatchId: batchId, importRowId: r.id } });
              material.variants.push(v);
            }
          }
          await tx.importRow.update({ where: { id: r.id }, data: { action: "MATCH", targetType: "Material", targetId: material.id } });
        }
        if (batch.dataType === "OPENING_BALANCE") {
          for (const s of sizes) {
            const v = material.variants.find((x) => x.size === normalizeSize(s.size))!;
            countLines.set(v.id, (countLines.get(v.id) ?? D(0)).plus(s.qty ?? 0));
          }
        }
      }
      if (batch.dataType === "OPENING_BALANCE") {
        if (!mapping.defaults.warehouseId) throw new AppError("Açılış qalığı üçün anbar seçilməlidir.", "VALIDATION");
        const countDate = mapping.defaults.countDate ? new Date(mapping.defaults.countDate) : new Date();
        const number = await nextNumber(tx, "INV0", countDate);
        const c = await tx.inventoryCount.create({
          data: {
            number,
            mode: "OPENING",
            warehouseId: mapping.defaults.warehouseId,
            countDate,
            countedBy: `Excel import: ${batch.fileName}`,
            notes: `Import paketi ${batchId}. Təsdiq edilənə qədər qalıq dəyişmir.`,
            createdById: actor.id,
            lines: { create: [...countLines.entries()].map(([variantId, q]) => ({ variantId, countedQty: q, importBatchId: batchId })) },
          },
        });
        await audit(tx, actor, "CREATE", "InventoryCount", c.id, `${number} Excel-dən qaralama kimi yaradıldı (${countLines.size} sətir)`);
      }
    }
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "COMMITTED", committedAt: new Date(), committedBy: actor.id } });
    await audit(tx, actor, "IMPORT_COMMIT", "ImportBatch", batchId, `${batch.fileName} / ${batch.sheetName} / ${batch.dataType}: ${rows.length} sətir, ${created} yeni qeyd`);
    return { alreadyCommitted: false, created };
  }, { retries: 1 });
  return result;
}

// ───────────────────────── 5. Rollback ─────────────────────────

export async function rollbackBatch(actor: Actor, batchId: string) {
  if (!can(actor.role, "import.run")) throw new ForbiddenError();
  return withTx(async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundError("Import paketi");
    if (batch.status !== "COMMITTED") throw new AppError("Yalnız təsdiqlənmiş paket geri qaytarıla bilər.");
    if (batch.dataType === "HISTORICAL_ISSUES") {
      await tx.historicalIssue.deleteMany({ where: { importBatchId: batchId } });
    }
    if (batch.dataType === "OPENING_BALANCE" || batch.dataType === "CATALOG") {
      const counts = await tx.inventoryCount.findMany({ where: { lines: { some: { importBatchId: batchId } } } });
      if (counts.some((c) => c.status === "POSTED")) throw new AppError("Bu importdan yaranan sayım artıq təsdiqlənib. Əvvəlcə dövri sayım ilə düzəliş edin — geri qaytarma qalığı dəyişməməlidir.");
      for (const c of counts) {
        // lines can only change while DRAFT (DB trigger) → remove them first, then cancel the header
        if (c.status === "DRAFT") await tx.inventoryCountLine.deleteMany({ where: { countId: c.id } });
        await tx.inventoryCount.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
      }
      const variants = await tx.materialVariant.findMany({ where: { importBatchId: batchId }, select: { id: true, materialId: true } });
      const vids = variants.map((v) => v.id);
      const used = await tx.stockLedgerEntry.count({ where: { variantId: { in: vids } } });
      const usedDocs = (await tx.stockDocLine.count({ where: { variantId: { in: vids } } })) + (await tx.pOLine.count({ where: { variantId: { in: vids } } }));
      if (used || usedDocs) throw new AppError("Bu importdan yaranan materiallar artıq sənədlərdə istifadə olunub. Geri qaytarmaq əvəzinə onları arxivləyin.");
      await tx.stockBalance.deleteMany({ where: { variantId: { in: vids } } });
      await tx.materialVariant.deleteMany({ where: { id: { in: vids } } });
      const mats = await tx.material.findMany({ where: { importBatchId: batchId }, include: { _count: { select: { variants: true } } } });
      await tx.material.deleteMany({ where: { id: { in: mats.filter((m) => m._count.variants === 0).map((m) => m.id) } } });
    }
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
    await audit(tx, actor, "IMPORT_ROLLBACK", "ImportBatch", batchId, `${batch.fileName} / ${batch.sheetName} geri qaytarıldı`);
  });
}
