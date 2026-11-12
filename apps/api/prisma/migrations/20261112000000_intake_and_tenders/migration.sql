-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('site', 'app', 'avito', 'vk', 'telegram', 'email', 'tender_parser', 'parser', 'agent', 'onec', 'other');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('found', 'analysis', 'product_check', 'pricing', 'documents', 'submitted', 'awaiting_result', 'won', 'contract', 'delivery', 'closing', 'lost', 'declined');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "duplicate_of_id" UUID,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "integration_id" UUID;

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "description" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'incoming',
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request_json" JSONB,
    "response_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "tender_number" TEXT,
    "platform" TEXT,
    "url" TEXT,
    "customer_name" TEXT,
    "region" TEXT,
    "nmck" DECIMAL(18,2),
    "publish_date" TIMESTAMP(3),
    "submission_deadline" TIMESTAMP(3),
    "auction_date" TIMESTAMP(3),
    "procurement_law" TEXT,
    "category" TEXT,
    "priority" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'found',
    "responsible_user_id" UUID,
    "requirements" TEXT,
    "result" TEXT,
    "margin" DECIMAL(18,2),
    "comment" TEXT,
    "source" TEXT,
    "integration_id" UUID,
    "external_key" TEXT,
    "official_number" TEXT,
    "official_url" TEXT,
    "documents_url" TEXT,
    "payload_json" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_code_key" ON "integrations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_key_hash_key" ON "integrations"("key_hash");

-- CreateIndex
CREATE INDEX "integrations_status_idx" ON "integrations"("status");

-- CreateIndex
CREATE INDEX "integration_logs_integration_id_created_at_idx" ON "integration_logs"("integration_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_external_key_key" ON "tenders"("external_key");

-- CreateIndex
CREATE INDEX "tenders_status_idx" ON "tenders"("status");

-- CreateIndex
CREATE INDEX "tenders_submission_deadline_idx" ON "tenders"("submission_deadline");

-- CreateIndex
CREATE INDEX "tenders_responsible_user_id_idx" ON "tenders"("responsible_user_id");

-- CreateIndex
CREATE INDEX "tenders_deleted_at_idx" ON "tenders"("deleted_at");

-- CreateIndex
CREATE INDEX "tenders_official_number_idx" ON "tenders"("official_number");

-- CreateIndex
CREATE INDEX "tenders_priority_idx" ON "tenders"("priority");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_integration_id_external_id_key" ON "leads"("integration_id", "external_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

