-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "fileData" BYTEA,
ALTER COLUMN "storagePath" SET DEFAULT '';

-- CreateTable
CREATE TABLE "import_chunks" (
    "batchId" UUID NOT NULL,
    "idx" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "import_chunks_pkey" PRIMARY KEY ("batchId","idx")
);

-- AddForeignKey
ALTER TABLE "import_chunks" ADD CONSTRAINT "import_chunks_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

