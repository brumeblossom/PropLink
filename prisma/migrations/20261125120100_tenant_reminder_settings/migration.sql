-- Alter Enum RelatedType to add 'lease' and 'lease_expiry'
ALTER TYPE "RelatedType" ADD VALUE IF NOT EXISTS 'lease';
ALTER TYPE "RelatedType" ADD VALUE IF NOT EXISTS 'lease_expiry';

-- Create Table tenant_reminder_settings
CREATE TABLE IF NOT EXISTS "tenant_reminder_settings" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "expiry_enabled" BOOLEAN NOT NULL DEFAULT true,
  "expiry_start_mode" TEXT NOT NULL DEFAULT 'months' CHECK ("expiry_start_mode" IN ('months', 'date')),
  "expiry_months_before" INT NOT NULL DEFAULT 2 CHECK ("expiry_months_before" IN (1, 2, 3, 4, 6)),
  "expiry_start_date" DATE NULL,
  "expiry_frequency" TEXT NOT NULL DEFAULT 'monthly' CHECK ("expiry_frequency" IN ('once', 'weekly', 'monthly')),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE "tenant_reminder_settings" ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Tenants can select own reminder settings"
  ON "tenant_reminder_settings"
  FOR SELECT
  TO authenticated
  USING ("user_id" = auth.uid());

CREATE POLICY "Tenants can insert own reminder settings"
  ON "tenant_reminder_settings"
  FOR INSERT
  TO authenticated
  WITH CHECK ("user_id" = auth.uid());

CREATE POLICY "Tenants can update own reminder settings"
  ON "tenant_reminder_settings"
  FOR UPDATE
  TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
