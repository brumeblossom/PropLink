-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'pending';

-- DropIndex
DROP INDEX "notices_landlord_id_created_at_idx";

-- DropIndex
DROP INDEX "notifications_recipient_id_created_at_idx";

-- CreateIndex
CREATE INDEX "conversations_landlord_id_idx" ON "conversations"("landlord_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_idx" ON "conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "invite_codes_lease_id_idx" ON "invite_codes"("lease_id");

-- CreateIndex
CREATE INDEX "leases_unit_id_idx" ON "leases"("unit_id");

-- CreateIndex
CREATE INDEX "leases_tenant_id_idx" ON "leases"("tenant_id");

-- CreateIndex
CREATE INDEX "leases_unit_id_terminated_at_idx" ON "leases"("unit_id", "terminated_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "notice_recipients_notice_id_idx" ON "notice_recipients"("notice_id");

-- CreateIndex
CREATE INDEX "notice_recipients_tenant_id_idx" ON "notice_recipients"("tenant_id");

-- CreateIndex
CREATE INDEX "notices_landlord_id_idx" ON "notices"("landlord_id");

-- CreateIndex
CREATE INDEX "notices_landlord_id_created_at_idx" ON "notices"("landlord_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_log_recipient_id_idx" ON "notification_log"("recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_idx" ON "notifications"("recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_lease_id_idx" ON "payments"("lease_id");

-- CreateIndex
CREATE INDEX "payments_lease_id_status_idx" ON "payments"("lease_id", "status");

-- CreateIndex
CREATE INDEX "properties_landlord_id_idx" ON "properties"("landlord_id");

-- CreateIndex
CREATE INDEX "units_property_id_idx" ON "units"("property_id");
