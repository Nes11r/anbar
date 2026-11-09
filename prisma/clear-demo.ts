/**
 * Removes ALL demo data (everything created by prisma/seed-demo.ts, plus anything people created while
 * trying the system that touches demo materials / demo projects / demo suppliers).
 *
 *   npm run db:clear:demo -- --i-understand-this-is-demo
 *
 * Demo = material code "DEMO…", project code "DEMO…", supplier code "DEMO…", employee code/name "DEMO…",
 * plus workers, site warehouses and documents of demo projects. Real records are not touched.
 * The ledger is append-only (DB trigger) — this script lifts that guard only inside its own transaction,
 * deletes the demo rows, rebuilds stock balances from the remaining ledger and checks they match.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const GUARDED = ["stock_ledger", "audit_log", "status_history", "grn_lines", "stock_doc_lines", "inventory_count_lines"];

const STEPS: [label: string, sql: string][] = [
  ["d_proj", `CREATE TEMP TABLE d_proj ON COMMIT DROP AS SELECT id FROM projects WHERE code LIKE 'DEMO%'`],
  ["d_mat", `CREATE TEMP TABLE d_mat ON COMMIT DROP AS SELECT id FROM materials WHERE code LIKE 'DEMO%'`],
  ["d_var", `CREATE TEMP TABLE d_var ON COMMIT DROP AS SELECT id FROM material_variants WHERE "materialId" IN (SELECT id FROM d_mat)`],
  ["d_sup", `CREATE TEMP TABLE d_sup ON COMMIT DROP AS SELECT id FROM suppliers WHERE code LIKE 'DEMO%'`],
  ["d_wh", `CREATE TEMP TABLE d_wh ON COMMIT DROP AS SELECT id FROM warehouses WHERE "projectId" IN (SELECT id FROM d_proj)`],
  ["d_emp", `CREATE TEMP TABLE d_emp ON COMMIT DROP AS SELECT id FROM employees WHERE code LIKE 'DEMO%' OR "fullName" LIKE 'DEMO %' OR "projectId" IN (SELECT id FROM d_proj)`],
  ["d_sd", `CREATE TEMP TABLE d_sd ON COMMIT DROP AS SELECT id FROM stock_documents s WHERE "projectId" IN (SELECT id FROM d_proj) OR "employeeId" IN (SELECT id FROM d_emp)
      OR "supplierId" IN (SELECT id FROM d_sup) OR "warehouseId" IN (SELECT id FROM d_wh) OR "toWarehouseId" IN (SELECT id FROM d_wh)
      OR EXISTS (SELECT 1 FROM stock_doc_lines l WHERE l."docId" = s.id AND (l."variantId" IN (SELECT id FROM d_var) OR l."targetWarehouseId" IN (SELECT id FROM d_wh)))`],
  ["d_mr", `CREATE TEMP TABLE d_mr ON COMMIT DROP AS SELECT id FROM material_requests r WHERE "projectId" IN (SELECT id FROM d_proj) OR "deliveryWarehouseId" IN (SELECT id FROM d_wh)
      OR EXISTS (SELECT 1 FROM mr_lines l WHERE l."mrId" = r.id AND l."variantId" IN (SELECT id FROM d_var))`],
  ["d_po", `CREATE TEMP TABLE d_po ON COMMIT DROP AS SELECT id FROM purchase_orders p WHERE "supplierId" IN (SELECT id FROM d_sup) OR "mrId" IN (SELECT id FROM d_mr)
      OR EXISTS (SELECT 1 FROM po_lines l WHERE l."poId" = p.id AND l."variantId" IN (SELECT id FROM d_var))`],
  ["d_grn", `CREATE TEMP TABLE d_grn ON COMMIT DROP AS SELECT id FROM goods_receipts WHERE "poId" IN (SELECT id FROM d_po) OR "warehouseId" IN (SELECT id FROM d_wh)`],
  ["d_cnt", `CREATE TEMP TABLE d_cnt ON COMMIT DROP AS SELECT id FROM inventory_counts c WHERE "warehouseId" IN (SELECT id FROM d_wh)
      OR EXISTS (SELECT 1 FROM inventory_count_lines l WHERE l."countId" = c.id AND l."variantId" IN (SELECT id FROM d_var))`],
  ["d_res", `CREATE TEMP TABLE d_res ON COMMIT DROP AS SELECT id FROM reservations WHERE "variantId" IN (SELECT id FROM d_var) OR "projectId" IN (SELECT id FROM d_proj) OR "warehouseId" IN (SELECT id FROM d_wh)`],
  ["d_rep", `CREATE TEMP TABLE d_rep ON COMMIT DROP AS SELECT id FROM site_reports WHERE "projectId" IN (SELECT id FROM d_proj)`],
  ["d_ids", `CREATE TEMP TABLE d_ids ON COMMIT DROP AS
      SELECT id::text AS id FROM d_proj UNION SELECT id::text FROM d_mat UNION SELECT id::text FROM d_sup UNION SELECT id::text FROM d_wh UNION SELECT id::text FROM d_emp
      UNION SELECT id::text FROM d_sd UNION SELECT id::text FROM d_mr UNION SELECT id::text FROM d_po UNION SELECT id::text FROM d_grn UNION SELECT id::text FROM d_cnt
      UNION SELECT id::text FROM d_res UNION SELECT id::text FROM d_rep`],
  // ledger: every entry of a demo document, demo variant, demo project/worker or demo site warehouse
  ["ledger", `DELETE FROM stock_ledger WHERE "docId"::text IN (SELECT id FROM d_ids) OR "variantId" IN (SELECT id FROM d_var)
      OR "projectId" IN (SELECT id FROM d_proj) OR "employeeId" IN (SELECT id FROM d_emp) OR "warehouseId" IN (SELECT id FROM d_wh)`],
  ["balances", `DELETE FROM stock_balances WHERE "variantId" IN (SELECT id FROM d_var) OR "warehouseId" IN (SELECT id FROM d_wh)`],
  ["reservations", `DELETE FROM reservations WHERE id IN (SELECT id FROM d_res)`],
  ["site reports", `DELETE FROM site_reports WHERE id IN (SELECT id FROM d_rep)`],
  ["GRN", `DELETE FROM goods_receipts WHERE id IN (SELECT id FROM d_grn)`],
  ["PO", `DELETE FROM purchase_orders WHERE id IN (SELECT id FROM d_po)`],
  ["MR", `DELETE FROM material_requests WHERE id IN (SELECT id FROM d_mr)`],
  ["stock docs", `DELETE FROM stock_documents WHERE id IN (SELECT id FROM d_sd)`],
  ["counts", `DELETE FROM inventory_counts WHERE id IN (SELECT id FROM d_cnt)`],
  ["attachments", `DELETE FROM attachments WHERE "entityId" IN (SELECT id FROM d_ids)`],
  ["historical", `UPDATE historical_issues SET "employeeId" = NULL WHERE "employeeId" IN (SELECT id FROM d_emp)`],
  ["historical v", `UPDATE historical_issues SET "variantId" = NULL WHERE "variantId" IN (SELECT id FROM d_var)`],
  ["users", `UPDATE users SET "employeeId" = NULL WHERE "employeeId" IN (SELECT id FROM d_emp)`],
  ["users p", `UPDATE users SET "projectId" = NULL WHERE "projectId" IN (SELECT id FROM d_proj)`],
  ["variants", `DELETE FROM material_variants WHERE id IN (SELECT id FROM d_var)`],
  ["materials", `DELETE FROM materials WHERE id IN (SELECT id FROM d_mat)`],
  ["employees", `DELETE FROM employees WHERE id IN (SELECT id FROM d_emp)`],
  ["warehouses", `DELETE FROM warehouses WHERE id IN (SELECT id FROM d_wh)`],
  ["projects", `DELETE FROM projects WHERE id IN (SELECT id FROM d_proj)`],
  ["suppliers", `DELETE FROM suppliers WHERE id IN (SELECT id FROM d_sup)`],
  ["status history", `DELETE FROM status_history WHERE "entityId"::text IN (SELECT id FROM d_ids)`],
  ["audit", `DELETE FROM audit_log WHERE "entityId" IN (SELECT id FROM d_ids)`],
  // rebuild balances of everything that is left from the ledger (single source of truth)
  ["rebuild", `UPDATE stock_balances b SET "onHand" = COALESCE(x.on_hand, 0), reserved = COALESCE(x.reserved, 0), "updatedAt" = now()
      FROM stock_balances b2 LEFT JOIN (
        SELECT "warehouseId", "variantId",
          SUM(CASE WHEN "entryType" IN ('OPENING','RECEIPT','RETURN_IN','TRANSFER_IN','ADJUSTMENT_PLUS') THEN qty
                   WHEN "entryType" IN ('ISSUE','RETURN_OUT','TRANSFER_OUT','ADJUSTMENT_MINUS') THEN -qty ELSE 0 END) AS on_hand,
          SUM(CASE WHEN "entryType" = 'RESERVATION' THEN qty WHEN "entryType" = 'RESERVATION_RELEASE' THEN -qty ELSE 0 END) AS reserved
        FROM stock_ledger GROUP BY 1, 2) x ON x."warehouseId" = b2."warehouseId" AND x."variantId" = b2."variantId"
      WHERE b."warehouseId" = b2."warehouseId" AND b."variantId" = b2."variantId"`],
];

async function main() {
  if (!process.argv.includes("--i-understand-this-is-demo")) throw new Error("Təsdiq bayrağı yoxdur: --i-understand-this-is-demo");
  const before = await db.material.count({ where: { code: { startsWith: "DEMO" } } });
  const beforeP = await db.project.count({ where: { code: { startsWith: "DEMO" } } });
  if (!before && !beforeP) return console.log("Silinəcək DEMO məlumat yoxdur.");

  await db.$transaction(
    async (tx) => {
      for (const t of GUARDED) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
      for (const [label, sql] of STEPS) {
        const n = await tx.$executeRawUnsafe(sql);
        if (!label.startsWith("d_")) console.log(`  ${label}: ${n}`);
      }
      for (const t of GUARDED) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
      // safety net: balances must equal the ledger, and nothing may go negative
      const bad = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM stock_balances WHERE "onHand" < 0 OR reserved < 0 OR reserved > "onHand"`);
      if (Number(bad[0].n) > 0) throw new Error("Silmədən sonra qalıqlar uyğunsuz olardı — heç nə silinmədi.");
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  console.log(`DEMO məlumatlar silindi (${before} material, ${beforeP} layihə və onlarla bağlı bütün sənədlər).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
