-- AlterTable
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);
