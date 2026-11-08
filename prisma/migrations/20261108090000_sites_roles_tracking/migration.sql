-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('EMPLOYEE', 'COMPANY', 'CLIENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_SET', 'PENDING', 'PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'EMPLOYEE';
ALTER TYPE "UserRole" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_SET',
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNo" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employeeId" UUID,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "pendingApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "requestedType" "AccountType";

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "projectId" UUID;

-- CreateTable
CREATE TABLE "site_reports" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "reportDate" DATE NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_report_lines" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "stockQty" DECIMAL(18,3) NOT NULL,
    "withWorkersQty" DECIMAL(18,3) NOT NULL,
    "systemStock" DECIMAL(18,3) NOT NULL,
    "systemWithWorkers" DECIMAL(18,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "site_report_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_reports_projectId_reportDate_idx" ON "site_reports"("projectId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "site_report_lines_reportId_variantId_key" ON "site_report_lines"("reportId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_projectId_key" ON "warehouses"("projectId");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_report_lines" ADD CONSTRAINT "site_report_lines_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════ Hand-written ════
CREATE INDEX IF NOT EXISTS site_report_lines_variant ON "site_report_lines" ("variantId");
ALTER TABLE "site_report_lines" ADD CONSTRAINT srl_qty_nonneg CHECK ("stockQty" >= 0 AND "withWorkersQty" >= 0);

-- Every existing project gets its own site warehouse (new projects get one automatically in the app)
INSERT INTO "warehouses" ("id", "code", "name", "type", "location", "isActive", "projectId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), LEFT('SAHE-' || UPPER(p."code"), 40), 'Sahə anbarı — ' || p."code", 'NORMAL', p."location", TRUE, p."id", now(), now()
FROM "projects" p
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" w WHERE w."projectId" = p."id")
ON CONFLICT ("code") DO NOTHING;
