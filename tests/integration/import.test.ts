import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/server/audit";
import { commitBatch, parseBatch, rollbackBatch, sheetPreview, suggestMapping, uploadImport, type RowIssue } from "@/server/import/service";
import { projectionMismatches } from "@/server/services/reports";
import { baseData, makeUser, resetDb } from "./helpers";

const SRC = path.resolve("ANBAR 21.07.2026 - Amir.xlsm");
const has = existsSync(SRC);
process.env.UPLOAD_DIR = path.resolve("test-results/uploads");

describe.skipIf(!has)("Excel import (real source workbook, read-only)", () => {
  let wm: Actor;
  let B: Awaited<ReturnType<typeof baseData>>;
  let batchId: string;

  beforeAll(async () => {
    await resetDb();
    B = await baseData();
    wm = await makeUser("WAREHOUSE_MANAGER");
    const b = await uploadImport(wm, "ANBAR 21.07.2026 - Amir.xlsm", readFileSync(SRC));
    batchId = b.id;
    expect(b.sheetNames).toContain("Total");
  });

  it("summary sheets (Common) are detected and never become stock or history", async () => {
    const p = await sheetPreview(batchId, "Common");
    expect(p.warnings.join(" ")).toMatch(/xülasə/);
  });

  it("10. Total history preview flags text dates, blank rows are skipped; nothing touches stock", async () => {
    const p = await sheetPreview(batchId, "Total");
    const columns = suggestMapping("HISTORICAL_ISSUES", p.headers);
    expect(columns.employeeName).toBe(1);
    expect(columns.date).toBe(7);
    await parseBatch(wm, batchId, { sheetName: "Total", dataType: "HISTORICAL_ISSUES", headerRow: p.headerRow, lastRow: 0, columns, sizeColumns: [], fillDown: [], defaults: {} });
    const rows = await db.importRow.findMany({ where: { batchId } });
    expect(rows.length).toBe(394); // 454 non-empty numbered rows minus 60 blank numbered rows
    const issues = rows.flatMap((r) => r.issues as unknown as RowIssue[]).map((i) => i.msg);
    expect(issues.some((m) => /mətn kimi/.test(m))).toBe(true);
    expect(await db.stockLedgerEntry.count()).toBe(0);
  });

  it("9. committing history twice is refused; history never creates ledger entries; rollback works", async () => {
    const r = await commitBatch(wm, batchId);
    expect(r.created).toBe(394);
    expect(await db.historicalIssue.count()).toBe(394);
    expect(await db.stockLedgerEntry.count()).toBe(0);
    expect((await commitBatch(wm, batchId)).alreadyCommitted).toBe(true);
    // Same file uploaded again and committed as the same type → refused
    const b2 = await uploadImport(wm, "copy.xlsm", readFileSync(SRC));
    const p = await sheetPreview(b2.id, "Total");
    await parseBatch(wm, b2.id, { sheetName: "Total", dataType: "HISTORICAL_ISSUES", headerRow: p.headerRow, lastRow: 0, columns: suggestMapping("HISTORICAL_ISSUES", p.headers), sizeColumns: [], fillDown: [], defaults: {} });
    await expect(commitBatch(wm, b2.id)).rejects.toThrow(/artıq/);
    await rollbackBatch(wm, batchId);
    expect(await db.historicalIssue.count()).toBe(0);
  });

  it("PPE List (wide size columns) → opening balance becomes a DRAFT count only; N/A codes never merge", async () => {
    const b = await uploadImport(wm, "ANBAR.xlsm", readFileSync(SRC));
    const p = await sheetPreview(b.id, "PPE List Engineers");
    expect(p.warnings.join(" ")).toMatch(/təkrarlanır/);
    await parseBatch(wm, b.id, {
      sheetName: "PPE List Engineers",
      dataType: "OPENING_BALANCE",
      headerRow: 1,
      lastRow: 58,
      columns: { name: 2, model: 3, originalCode: 4, size: 5, qty: 7, group: 1 },
      sizeColumns: p.sizeColumns,
      fillDown: ["group"],
      defaults: { categoryId: B.uniform.id, warehouseId: B.wh.id, unitCode: "PCS", countDate: "2026-07-21" },
    });
    const rows = await db.importRow.findMany({ where: { batchId: b.id } });
    const msgs = rows.flatMap((r) => r.issues as unknown as RowIssue[]).map((i) => i.msg);
    expect(msgs.some((m) => /Şübhəli cəm/.test(m))).toBe(true);
    expect(msgs.some((m) => /mətn var/.test(m))).toBe(true); // "1600 paçka"
    // skip rows with errors, commit the rest
    await db.importRow.updateMany({ where: { batchId: b.id, action: "ERROR" }, data: { action: "SKIP" } });
    await commitBatch(wm, b.id);
    const hardHats = await db.material.count({ where: { nameAz: "Hard Hat", originalCode: null } });
    expect(hardHats).toBe(3); // rows 29–31 stay separate products (row 28 has no qty → error → skipped)
    const counts = await db.inventoryCount.findMany();
    expect(counts).toHaveLength(1);
    expect(counts[0].status).toBe("DRAFT");
    expect(await db.stockLedgerEntry.count()).toBe(0); // no stock without approval
    expect(await projectionMismatches()).toHaveLength(0);
  });
});
