-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'PROCUREMENT', 'PROJECT_MANAGER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "WorkerGroup" AS ENUM ('ENGINEER', 'WORKER', 'BOTH', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EmployeeGroup" AS ENUM ('ENGINEER', 'WORKER');

-- CreateEnum
CREATE TYPE "SizeType" AS ENUM ('NONE', 'CLOTHING_NUMERIC', 'CLOTHING_LETTER', 'SHOE_EU', 'OTHER');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('NORMAL', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('OPENING', 'RECEIPT', 'ISSUE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS', 'RESERVATION', 'RESERVATION_RELEASE');

-- CreateEnum
CREATE TYPE "LedgerDocType" AS ENUM ('INVENTORY_COUNT', 'GOODS_RECEIPT', 'STOCK_DOCUMENT', 'RESERVATION');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockDocKind" AS ENUM ('ISSUE_PROJECT', 'ISSUE_EMPLOYEE', 'RETURN_FROM_PROJECT', 'RETURN_FROM_EMPLOYEE', 'RETURN_TO_SUPPLIER', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DEFECTIVE');

-- CreateEnum
CREATE TYPE "InventoryCountMode" AS ENUM ('OPENING', 'CYCLE');

-- CreateEnum
CREATE TYPE "MRRequestType" AS ENUM ('NEW', 'REVISION', 'REPLACEMENT', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "MRPriority" AS ENUM ('NORMAL', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "MRStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'IN_SOURCING', 'PARTIALLY_ORDERED', 'FULLY_ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ApprovalCondition" AS ENUM ('ALWAYS', 'URGENT_OR_PM_THRESHOLD', 'GD_THRESHOLD');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QualityStatus" AS ENUM ('ACCEPTED', 'ACCEPTED_WITH_NCR', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ImportDataType" AS ENUM ('CATALOG', 'OPENING_BALANCE', 'HISTORICAL_ISSUES', 'OPEN_ORDERS', 'SUMMARY_REPORT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('CREATE', 'MATCH', 'SKIP', 'ERROR');

-- CreateEnum
CREATE TYPE "SourceConfidence" AS ENUM ('MANUAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'NORMAL',
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAz" TEXT NOT NULL,
    "nameEn" TEXT,
    "isUniform" BOOLEAN NOT NULL DEFAULT false,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "code" TEXT NOT NULL,
    "labelAz" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "allowsDecimal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "units_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "originalCode" TEXT,
    "nameAz" TEXT NOT NULL,
    "nameEn" TEXT,
    "categoryId" UUID NOT NULL,
    "subcategory" TEXT,
    "workerGroup" "WorkerGroup" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "brand" TEXT,
    "model" TEXT,
    "description" TEXT,
    "sizeType" "SizeType" NOT NULL DEFAULT 'NONE',
    "color" TEXT,
    "unitCode" TEXT NOT NULL,
    "supplierId" UUID,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "photoId" UUID,
    "notes" TEXT,
    "sourceConfidence" "SourceConfidence" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" UUID,
    "importRowId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_variants" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "barcode" TEXT,
    "minStock" DECIMAL(18,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "importBatchId" UUID,
    "importRowId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "managerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "group" "EmployeeGroup" NOT NULL,
    "position" TEXT,
    "department" TEXT,
    "projectId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" BIGSERIAL NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "docType" "LedgerDocType" NOT NULL,
    "docId" UUID NOT NULL,
    "docLineId" UUID,
    "docNumber" TEXT NOT NULL,
    "projectId" UUID,
    "employeeId" UUID,
    "movementDate" DATE NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reversalOfId" BIGINT,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "onHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("warehouseId","variantId")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "projectId" UUID,
    "mrLineId" UUID,
    "qty" DECIMAL(18,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "mode" "InventoryCountMode" NOT NULL,
    "warehouseId" UUID NOT NULL,
    "countDate" DATE NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "countedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" UUID NOT NULL,
    "countId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "countedQty" DECIMAL(18,3) NOT NULL,
    "systemQty" DECIMAL(18,3),
    "note" TEXT,
    "importBatchId" UUID,
    "importRowId" UUID,

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_requests" (
    "id" UUID NOT NULL,
    "mrNumber" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT '00',
    "projectId" UUID NOT NULL,
    "discipline" TEXT NOT NULL,
    "disciplineOther" TEXT,
    "projectPhase" TEXT,
    "requestType" "MRRequestType" NOT NULL DEFAULT 'NEW',
    "priority" "MRPriority" NOT NULL DEFAULT 'NORMAL',
    "supplyCategory" TEXT,
    "procurementRoute" TEXT,
    "supersedesMrNumber" TEXT,
    "revisionReason" TEXT,
    "dateRaised" DATE NOT NULL,
    "requiredOnSiteDate" DATE NOT NULL,
    "requesterId" UUID NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterPosition" TEXT,
    "justification" TEXT,
    "notes" TEXT,
    "estimatedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "deliveryWarehouseId" UUID,
    "referenceDocs" JSONB NOT NULL DEFAULT '[]',
    "formData" JSONB NOT NULL DEFAULT '{}',
    "status" "MRStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mr_lines" (
    "id" UUID NOT NULL,
    "mrId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "variantId" UUID,
    "materialCode" TEXT,
    "description" TEXT NOT NULL,
    "size" TEXT,
    "gradeStandard" TEXT,
    "uomCode" TEXT NOT NULL,
    "qtyRequired" DECIMAL(18,3) NOT NULL,
    "qtyInStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "surplusPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "netQtyToOrder" DECIMAL(18,3) NOT NULL,
    "estUnitPrice" DECIMAL(18,2),
    "requiredDate" DATE,
    "remarks" TEXT,

    CONSTRAINT "mr_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mr_approvals" (
    "id" UUID NOT NULL,
    "mrId" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "allowedRoles" "UserRole"[],
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "approverId" UUID,
    "approverName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "mr_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_step_config" (
    "step" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,
    "labelAz" TEXT NOT NULL,
    "responsibility" TEXT,
    "condition" "ApprovalCondition" NOT NULL DEFAULT 'ALWAYS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedRoles" "UserRole"[],

    CONSTRAINT "approval_step_config_pkey" PRIMARY KEY ("step")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "mrId" UUID,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "notes" TEXT,
    "overrideReason" TEXT,
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_lines" (
    "id" UUID NOT NULL,
    "poId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "variantId" UUID NOT NULL,
    "mrLineId" UUID,
    "qtyOrdered" DECIMAL(18,3) NOT NULL,
    "qtyReceived" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2),
    "notes" TEXT,

    CONSTRAINT "po_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "poId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "receivedDate" DATE NOT NULL,
    "receiverName" TEXT NOT NULL,
    "deliveryNoteNo" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "grnId" UUID NOT NULL,
    "poLineId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "qtyReceived" DECIMAL(18,3) NOT NULL,
    "qtyRejected" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'ACCEPTED',
    "note" TEXT,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "StockDocKind" NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouseId" UUID NOT NULL,
    "toWarehouseId" UUID,
    "projectId" UUID,
    "employeeId" UUID,
    "supplierId" UUID,
    "recipientName" TEXT,
    "purpose" TEXT,
    "reason" TEXT,
    "externalRef" TEXT,
    "docDate" DATE NOT NULL,
    "notes" TEXT,
    "reversalOfId" UUID,
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "stock_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_doc_lines" (
    "id" UUID NOT NULL,
    "docId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "variantId" UUID NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "direction" INTEGER NOT NULL DEFAULT -1,
    "condition" "ReturnCondition",
    "targetWarehouseId" UUID,
    "overrideReason" TEXT,
    "note" TEXT,

    CONSTRAINT "stock_doc_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_issues" (
    "id" UUID NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeId" UUID,
    "itemText" TEXT NOT NULL,
    "modelText" TEXT,
    "productCode" TEXT,
    "sizeText" TEXT,
    "qty" DECIMAL(18,3),
    "issueDate" DATE,
    "rawDate" TEXT,
    "comment" TEXT,
    "variantId" UUID,
    "importBatchId" UUID NOT NULL,
    "importRowId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sheetName" TEXT,
    "sheetNames" TEXT[],
    "dataType" "ImportDataType",
    "headerRow" INTEGER,
    "mapping" JSONB,
    "options" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "stats" JSONB,
    "storagePath" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "committedAt" TIMESTAMP(3),
    "committedBy" UUID,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "sourceValue" JSONB NOT NULL,
    "normalized" JSONB,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "action" "ImportRowAction" NOT NULL DEFAULT 'CREATE',
    "targetType" TEXT,
    "targetId" TEXT,
    "rowHash" TEXT NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "userId" UUID,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_sequences" (
    "key" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "doc_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE INDEX "materials_categoryId_idx" ON "materials"("categoryId");

-- CreateIndex
CREATE INDEX "materials_workerGroup_idx" ON "materials"("workerGroup");

-- CreateIndex
CREATE INDEX "materials_isActive_idx" ON "materials"("isActive");

-- CreateIndex
CREATE INDEX "materials_originalCode_idx" ON "materials"("originalCode");

-- CreateIndex
CREATE UNIQUE INDEX "material_variants_sku_key" ON "material_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "material_variants_barcode_key" ON "material_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "material_variants_materialId_size_color_key" ON "material_variants"("materialId", "size", "color");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE INDEX "employees_fullName_idx" ON "employees"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_idempotencyKey_key" ON "stock_ledger"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_reversalOfId_key" ON "stock_ledger"("reversalOfId");

-- CreateIndex
CREATE INDEX "stock_ledger_variantId_warehouseId_idx" ON "stock_ledger"("variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "stock_ledger_warehouseId_idx" ON "stock_ledger"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_ledger_projectId_variantId_idx" ON "stock_ledger"("projectId", "variantId");

-- CreateIndex
CREATE INDEX "stock_ledger_employeeId_idx" ON "stock_ledger"("employeeId");

-- CreateIndex
CREATE INDEX "stock_ledger_docType_docId_idx" ON "stock_ledger"("docType", "docId");

-- CreateIndex
CREATE INDEX "stock_ledger_movementDate_idx" ON "stock_ledger"("movementDate");

-- CreateIndex
CREATE INDEX "stock_ledger_entryType_movementDate_idx" ON "stock_ledger"("entryType", "movementDate");

-- CreateIndex
CREATE INDEX "stock_balances_variantId_idx" ON "stock_balances"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_number_key" ON "reservations"("number");

-- CreateIndex
CREATE INDEX "reservations_variantId_warehouseId_status_idx" ON "reservations"("variantId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_number_key" ON "inventory_counts"("number");

-- CreateIndex
CREATE INDEX "inventory_counts_status_idx" ON "inventory_counts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_countId_variantId_key" ON "inventory_count_lines"("countId", "variantId");

-- CreateIndex
CREATE INDEX "material_requests_status_idx" ON "material_requests"("status");

-- CreateIndex
CREATE INDEX "material_requests_projectId_idx" ON "material_requests"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_mrNumber_revision_key" ON "material_requests"("mrNumber", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "mr_lines_mrId_lineNo_key" ON "mr_lines"("mrId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "mr_approvals_mrId_step_key" ON "mr_approvals"("mrId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "approval_step_config_roleCode_key" ON "approval_step_config"("roleCode");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "po_lines_poId_lineNo_key" ON "po_lines"("poId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_grnNumber_key" ON "goods_receipts"("grnNumber");

-- CreateIndex
CREATE INDEX "goods_receipts_poId_idx" ON "goods_receipts"("poId");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "grn_lines_grnId_poLineId_key" ON "grn_lines"("grnId", "poLineId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_number_key" ON "stock_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_reversalOfId_key" ON "stock_documents"("reversalOfId");

-- CreateIndex
CREATE INDEX "stock_documents_kind_status_idx" ON "stock_documents"("kind", "status");

-- CreateIndex
CREATE INDEX "stock_documents_projectId_idx" ON "stock_documents"("projectId");

-- CreateIndex
CREATE INDEX "stock_documents_employeeId_idx" ON "stock_documents"("employeeId");

-- CreateIndex
CREATE INDEX "stock_documents_docDate_idx" ON "stock_documents"("docDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_doc_lines_docId_lineNo_key" ON "stock_doc_lines"("docId", "lineNo");

-- CreateIndex
CREATE INDEX "historical_issues_employeeName_idx" ON "historical_issues"("employeeName");

-- CreateIndex
CREATE INDEX "historical_issues_importBatchId_idx" ON "historical_issues"("importBatchId");

-- CreateIndex
CREATE INDEX "import_batches_fileHash_idx" ON "import_batches"("fileHash");

-- CreateIndex
CREATE INDEX "import_rows_batchId_sourceRow_idx" ON "import_rows"("batchId", "sourceRow");

-- CreateIndex
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "status_history_entityType_entityId_idx" ON "status_history"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_unitCode_fkey" FOREIGN KEY ("unitCode") REFERENCES "units"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_variants" ADD CONSTRAINT "material_variants_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "material_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mr_lines" ADD CONSTRAINT "mr_lines_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mr_approvals" ADD CONSTRAINT "mr_approvals_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "material_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_mrLineId_fkey" FOREIGN KEY ("mrLineId") REFERENCES "mr_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_doc_lines" ADD CONSTRAINT "stock_doc_lines_docId_fkey" FOREIGN KEY ("docId") REFERENCES "stock_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- HECOTEC integrity layer (hand-written). The database itself refuses
-- invalid stock states, so no application bug can corrupt balances.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Quantities
ALTER TABLE "stock_ledger"      ADD CONSTRAINT stock_ledger_qty_pos      CHECK (qty > 0);
ALTER TABLE "stock_balances"    ADD CONSTRAINT stock_bal_onhand_nonneg   CHECK ("onHand" >= 0);
ALTER TABLE "stock_balances"    ADD CONSTRAINT stock_bal_reserved_nonneg CHECK (reserved >= 0);
ALTER TABLE "stock_balances"    ADD CONSTRAINT stock_bal_reserved_le     CHECK (reserved <= "onHand");
ALTER TABLE "reservations"      ADD CONSTRAINT reservation_qty_pos       CHECK (qty > 0);
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT icl_qty_nonneg        CHECK ("countedQty" >= 0);
ALTER TABLE "mr_lines"          ADD CONSTRAINT mrl_qty_pos               CHECK ("qtyRequired" > 0 AND "netQtyToOrder" >= 0);
ALTER TABLE "po_lines"          ADD CONSTRAINT pol_qty_pos               CHECK ("qtyOrdered" > 0 AND "qtyReceived" >= 0);
ALTER TABLE "grn_lines"         ADD CONSTRAINT grnl_qty                  CHECK ("qtyReceived" >= 0 AND "qtyRejected" >= 0 AND "qtyRejected" <= "qtyReceived" AND "qtyReceived" > 0);
ALTER TABLE "stock_doc_lines"   ADD CONSTRAINT sdl_qty_pos               CHECK (qty > 0 AND direction IN (-1, 1));
ALTER TABLE "materials"         ADD CONSTRAINT mat_min_nonneg            CHECK ("minStock" >= 0);
ALTER TABLE "material_variants" ADD CONSTRAINT var_min_nonneg            CHECK ("minStock" IS NULL OR "minStock" >= 0);
ALTER TABLE "material_requests" ADD CONSTRAINT mr_ros_after_raised       CHECK ("requiredOnSiteDate" >= "dateRaised");
ALTER TABLE "stock_documents"   ADD CONSTRAINT sd_transfer_distinct      CHECK ("toWarehouseId" IS NULL OR "toWarehouseId" <> "warehouseId");
ALTER TABLE "doc_sequences"     ADD CONSTRAINT seq_pos                   CHECK (next > 0);

-- Append-only ledger, audit log and status history
CREATE OR REPLACE FUNCTION hec_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HEC_APPEND_ONLY: % on % is not allowed (create a reversal instead)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_ledger_no_update BEFORE UPDATE OR DELETE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION hec_block_mutation();
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION hec_block_mutation();
CREATE TRIGGER status_history_no_update BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION hec_block_mutation();
CREATE TRIGGER stock_ledger_no_truncate BEFORE TRUNCATE ON "stock_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION hec_block_mutation();

-- Posted documents keep their lines frozen
CREATE OR REPLACE FUNCTION hec_freeze_posted_lines() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF TG_TABLE_NAME = 'grn_lines' THEN
    SELECT status INTO st FROM goods_receipts WHERE id = COALESCE(OLD."grnId", NEW."grnId");
  ELSIF TG_TABLE_NAME = 'stock_doc_lines' THEN
    SELECT status INTO st FROM stock_documents WHERE id = COALESCE(OLD."docId", NEW."docId");
  ELSIF TG_TABLE_NAME = 'inventory_count_lines' THEN
    -- systemQty snapshot is written inside the approval transaction while status is still DRAFT
    SELECT status INTO st FROM inventory_counts WHERE id = COALESCE(OLD."countId", NEW."countId");
  END IF;
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    RAISE EXCEPTION 'HEC_POSTED_LOCKED: lines of a % document cannot be changed', st USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grn_lines_freeze BEFORE INSERT OR UPDATE OR DELETE ON "grn_lines"
  FOR EACH ROW EXECUTE FUNCTION hec_freeze_posted_lines();
CREATE TRIGGER stock_doc_lines_freeze BEFORE INSERT OR UPDATE OR DELETE ON "stock_doc_lines"
  FOR EACH ROW EXECUTE FUNCTION hec_freeze_posted_lines();
CREATE TRIGGER inventory_count_lines_freeze BEFORE INSERT OR UPDATE OR DELETE ON "inventory_count_lines"
  FOR EACH ROW EXECUTE FUNCTION hec_freeze_posted_lines();

-- Idempotent import: one committed batch per (file, sheet, type)
CREATE UNIQUE INDEX import_batch_committed_once
  ON "import_batches" ("fileHash", "sheetName", "dataType") WHERE status = 'COMMITTED';

-- Fast fuzzy search (Azerbaijani / English / codes)
CREATE INDEX materials_name_trgm  ON "materials" USING gin ("nameAz" gin_trgm_ops);
CREATE INDEX materials_nameen_trgm ON "materials" USING gin ("nameEn" gin_trgm_ops);
CREATE INDEX materials_code_trgm  ON "materials" USING gin (code gin_trgm_ops);
CREATE INDEX materials_model_trgm ON "materials" USING gin (model gin_trgm_ops);
CREATE INDEX variants_sku_trgm    ON "material_variants" USING gin (sku gin_trgm_ops);
CREATE INDEX employees_name_trgm  ON "employees" USING gin ("fullName" gin_trgm_ops);
CREATE INDEX hist_name_trgm       ON "historical_issues" USING gin ("employeeName" gin_trgm_ops);

-- Partial indexes for hot dashboard queries
CREATE INDEX reservations_active ON "reservations" ("variantId", "warehouseId") WHERE status = 'ACTIVE';
CREATE INDEX po_open ON "purchase_orders" ("expectedDate") WHERE status IN ('APPROVED', 'PARTIALLY_RECEIVED', 'SUBMITTED');
