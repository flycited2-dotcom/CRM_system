-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ClientContactType" AS ENUM ('phone', 'email', 'telegram', 'max', 'whatsapp', 'other');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ClientType" NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "kpp" TEXT,
    "ogrn" TEXT,
    "legal_address" TEXT,
    "actual_address" TEXT,
    "city" TEXT,
    "source" TEXT,
    "responsible_user_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "contact_type" "ClientContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "user_id" UUID,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_responsible_user_id_idx" ON "clients"("responsible_user_id");

-- CreateIndex
CREATE INDEX "clients_status_type_idx" ON "clients"("status", "type");

-- CreateIndex
CREATE INDEX "clients_source_idx" ON "clients"("source");

-- CreateIndex
CREATE INDEX "clients_city_idx" ON "clients"("city");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_contact_type_idx" ON "client_contacts"("client_id", "contact_type");

-- CreateIndex
CREATE INDEX "client_contacts_value_idx" ON "client_contacts"("value");

-- CreateIndex
CREATE INDEX "client_comments_client_id_created_at_idx" ON "client_comments"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "client_comments_user_id_idx" ON "client_comments"("user_id");

-- CreateIndex
CREATE INDEX "client_files_client_id_created_at_idx" ON "client_files"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "client_files_uploaded_by_id_idx" ON "client_files"("uploaded_by_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_comments" ADD CONSTRAINT "client_comments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_comments" ADD CONSTRAINT "client_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
