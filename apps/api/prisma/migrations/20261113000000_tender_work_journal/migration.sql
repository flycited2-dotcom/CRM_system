-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'tender_tracker';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenderStatus" ADD VALUE 'not_held';
ALTER TYPE "TenderStatus" ADD VALUE 'missed';

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN     "journal_json" JSONB,
ADD COLUMN     "procedure_type" TEXT,
ADD COLUMN     "taken_at" TIMESTAMP(3);

