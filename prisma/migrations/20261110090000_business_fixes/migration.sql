-- Consumables (gloves, electrodes…) are used up when handed to a worker: they never count as "held by worker".
ALTER TABLE "materials" ADD COLUMN "isConsumable" BOOLEAN NOT NULL DEFAULT false;

-- Simpler MR approval route: submitted → project manager → (director above threshold) → procurement.
UPDATE "approval_step_config" SET "isActive" = false WHERE "step" IN (2, 3, 4, 5);
UPDATE "approval_step_config" SET "condition" = 'ALWAYS', "labelAz" = 'Layihə rəhbəri', "responsibility" = 'Ehtiyac, miqdar və tarix düzgündür' WHERE "step" = 6;

-- Every project now has its own site warehouse: the old shared, project-less "Sahə anbarı" is retired when empty.
UPDATE "warehouses" w SET "isActive" = false
WHERE w."code" = 'SAHE' AND w."projectId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "stock_balances" b WHERE b."warehouseId" = w."id" AND b."onHand" <> 0);
