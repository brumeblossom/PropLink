-- Create auth schema and stub uid() for shadow database compatibility (wrapped to catch Supabase permission errors)
DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS 'SELECT null::uuid;' LANGUAGE sql;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('landlord', 'tenant');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('residential', 'commercial', 'mixed');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('flat', 'shop', 'office');

-- CreateEnum
CREATE TYPE "RentFrequency" AS ENUM ('monthly', 'quarterly', 'annually');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('confirmed', 'pending', 'disputed');

-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('rent_reminder', 'maintenance', 'general', 'rent_increment');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'whatsapp');

-- CreateEnum
CREATE TYPE "RelatedType" AS ENUM ('notice', 'reminder');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT,
    "role" "Role" NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "landlord_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_number" TEXT NOT NULL,
    "unit_type" "UnitType" NOT NULL,
    "size_sqm" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "rent_frequency" "RentFrequency" NOT NULL,
    "deposit_amount" DECIMAL(12,2),
    "renewal_window_days" INTEGER NOT NULL DEFAULT 60,
    "document_url" TEXT,
    "terminated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_by_role" "Role" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "dispute_reason" TEXT,
    "proof_url" TEXT,
    "counter_verified_by" UUID,
    "counter_verified_at" TIMESTAMPTZ,
    "disputed_by_tenant" BOOLEAN NOT NULL DEFAULT false,
    "disputed_by_reason" TEXT,
    "disputed_by_resolved_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gateway_provider" TEXT,
    "gateway_reference" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "landlord_id" UUID NOT NULL,
    "property_id" UUID,
    "unit_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NoticeType" NOT NULL,
    "channels" "NotificationChannel"[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_recipients" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "in_app_delivered_at" TIMESTAMPTZ,
    "email_status" "DeliveryStatus",
    "whatsapp_status" "DeliveryStatus",
    "read_at" TIMESTAMPTZ,

    CONSTRAINT "notice_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "landlord_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_url" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "redeemed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "related_type" "RelatedType" NOT NULL,
    "related_id" UUID NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_unit_id_tenant_id_key" ON "conversations"("unit_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_counter_verified_by_fkey" FOREIGN KEY ("counter_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==========================================
-- Custom Trigger: Prevent Overlapping Leases
-- ==========================================
CREATE OR REPLACE FUNCTION check_lease_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.terminated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "leases"
    WHERE unit_id = NEW.unit_id
      AND id <> NEW.id
      AND terminated_at IS NULL
      AND (
        (NEW.start_date <= end_date AND NEW.end_date >= start_date)
      )
  ) THEN
    RAISE EXCEPTION 'Lease overlaps with another active lease for this unit.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_lease_overlap_trigger ON "leases";
CREATE TRIGGER check_lease_overlap_trigger
BEFORE INSERT OR UPDATE ON "leases"
FOR EACH ROW EXECUTE FUNCTION check_lease_overlap();

-- ==========================================
-- Custom Trigger: Payments Modifications Check
-- ==========================================
CREATE OR REPLACE FUNCTION enforce_payment_write_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT role FROM "users" WHERE id = auth.uid()) = 'tenant' THEN
    IF OLD.amount <> NEW.amount OR
       OLD.payment_date <> NEW.payment_date OR
       OLD.period_start <> NEW.period_start OR
       OLD.period_end <> NEW.period_end OR
       OLD.method <> NEW.method OR
       OLD.recorded_by <> NEW.recorded_by OR
       OLD.recorded_by_role <> NEW.recorded_by_role OR
       OLD.status <> NEW.status OR
       OLD.confirmed_by IS DISTINCT FROM NEW.confirmed_by OR
       OLD.confirmed_at IS DISTINCT FROM NEW.confirmed_at
    THEN
      RAISE EXCEPTION 'Tenants cannot modify core payment details or landlord confirmation status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_payment_write_rules_trigger ON "payments";
CREATE TRIGGER enforce_payment_write_rules_trigger
BEFORE UPDATE ON "payments"
FOR EACH ROW EXECUTE FUNCTION enforce_payment_write_rules();

-- ==========================================
-- Enable Row-Level Security
-- ==========================================
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notice_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invite_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS Policies Setup
-- ==========================================

-- USERS Policies
CREATE POLICY user_self_policy ON "users" FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- PROPERTIES Policies
CREATE POLICY landlord_properties_policy ON "properties" FOR ALL USING (landlord_id = auth.uid()) WITH CHECK (landlord_id = auth.uid());
CREATE POLICY tenant_read_properties_policy ON "properties" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "units" u JOIN "leases" l ON l.unit_id = u.id WHERE u.property_id = "properties".id AND l.tenant_id = auth.uid())
);

-- UNITS Policies
CREATE POLICY landlord_units_policy ON "units" FOR ALL USING (
  EXISTS (SELECT 1 FROM "properties" p WHERE p.id = "units".property_id AND p.landlord_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "properties" p WHERE p.id = "units".property_id AND p.landlord_id = auth.uid())
);
CREATE POLICY tenant_read_units_policy ON "units" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "leases" l WHERE l.unit_id = "units".id AND l.tenant_id = auth.uid())
);

-- LEASES Policies
CREATE POLICY landlord_leases_policy ON "leases" FOR ALL USING (
  EXISTS (SELECT 1 FROM "units" u JOIN "properties" p ON p.id = u.property_id WHERE u.id = "leases".unit_id AND p.landlord_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "units" u JOIN "properties" p ON p.id = u.property_id WHERE u.id = "leases".unit_id AND p.landlord_id = auth.uid())
);
CREATE POLICY tenant_read_leases_policy ON "leases" FOR SELECT USING (tenant_id = auth.uid());

-- PAYMENTS Policies
CREATE POLICY landlord_read_payments_policy ON "payments" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "leases" l JOIN "units" u ON u.id = l.unit_id JOIN "properties" p ON p.id = u.property_id WHERE l.id = "payments".lease_id AND p.landlord_id = auth.uid())
);
CREATE POLICY tenant_read_payments_policy ON "payments" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "leases" l WHERE l.id = "payments".lease_id AND l.tenant_id = auth.uid())
);
CREATE POLICY landlord_write_payments_policy ON "payments" FOR ALL USING (
  EXISTS (SELECT 1 FROM "leases" l JOIN "units" u ON u.id = l.unit_id JOIN "properties" p ON p.id = u.property_id WHERE l.id = "payments".lease_id AND p.landlord_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "leases" l JOIN "units" u ON u.id = l.unit_id JOIN "properties" p ON p.id = u.property_id WHERE l.id = "payments".lease_id AND p.landlord_id = auth.uid())
);
CREATE POLICY tenant_insert_payments_policy ON "payments" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM "leases" l WHERE l.id = "payments".lease_id AND l.tenant_id = auth.uid())
  AND recorded_by = auth.uid() AND recorded_by_role = 'tenant' AND status = 'pending'
);
CREATE POLICY tenant_update_payments_policy ON "payments" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM "leases" l WHERE l.id = "payments".lease_id AND l.tenant_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "leases" l WHERE l.id = "payments".lease_id AND l.tenant_id = auth.uid())
);

-- NOTICES Policies
CREATE POLICY landlord_notices_policy ON "notices" FOR ALL USING (landlord_id = auth.uid()) WITH CHECK (landlord_id = auth.uid());
CREATE POLICY tenant_read_notices_policy ON "notices" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "notice_recipients" nr WHERE nr.notice_id = "notices".id AND nr.tenant_id = auth.uid())
);

-- NOTICE_RECIPIENTS Policies
CREATE POLICY landlord_notice_recipients_policy ON "notice_recipients" FOR ALL USING (
  EXISTS (SELECT 1 FROM "notices" n WHERE n.id = "notice_recipients".notice_id AND n.landlord_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "notices" n WHERE n.id = "notice_recipients".notice_id AND n.landlord_id = auth.uid())
);
CREATE POLICY tenant_read_notice_recipients_policy ON "notice_recipients" FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY tenant_update_notice_recipients_policy ON "notice_recipients" FOR UPDATE USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

-- CONVERSATIONS Policies
CREATE POLICY landlord_conversations_policy ON "conversations" FOR ALL USING (landlord_id = auth.uid()) WITH CHECK (landlord_id = auth.uid());
CREATE POLICY tenant_conversations_policy ON "conversations" FOR ALL USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

-- MESSAGES Policies
CREATE POLICY conversation_messages_read_policy ON "messages" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "conversations" c WHERE c.id = "messages".conversation_id AND (c.landlord_id = auth.uid() OR c.tenant_id = auth.uid()))
);
CREATE POLICY conversation_messages_write_policy ON "messages" FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM "conversations" c WHERE c.id = "messages".conversation_id AND (c.landlord_id = auth.uid() OR c.tenant_id = auth.uid()))
);

-- INVITE_CODES Policies
CREATE POLICY landlord_invite_codes_policy ON "invite_codes" FOR ALL USING (
  EXISTS (SELECT 1 FROM "leases" l JOIN "units" u ON u.id = l.unit_id JOIN "properties" p ON p.id = u.property_id WHERE l.id = "invite_codes".lease_id AND p.landlord_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM "leases" l JOIN "units" u ON u.id = l.unit_id JOIN "properties" p ON p.id = u.property_id WHERE l.id = "invite_codes".lease_id AND p.landlord_id = auth.uid())
);
CREATE POLICY tenant_read_invite_codes_policy ON "invite_codes" FOR SELECT USING (true);

-- NOTIFICATION_LOG Policies
CREATE POLICY recipient_notification_log_policy ON "notification_log" FOR ALL USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

