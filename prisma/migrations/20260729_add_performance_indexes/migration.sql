-- Migration: add_performance_indexes
-- Adds indexes identified in the performance audit for PropLink.
-- Each index is named explicitly so it can be referenced in EXPLAIN ANALYZE output.

-- 1. Active-lease date range filter on leases
--    Every active-lease check uses: WHERE start_date <= now AND end_date >= now
--    Without this, Postgres must seq-scan all non-terminated leases for a unit.
CREATE INDEX IF NOT EXISTS "leases_start_date_end_date_idx" ON "leases"("start_date", "end_date");

-- 2. Compound sort index on notices for notices.listSent
--    Query: WHERE landlord_id = ? ORDER BY created_at DESC
--    Postgres can satisfy both the filter and the ORDER BY from this one index.
CREATE INDEX IF NOT EXISTS "notices_landlord_id_created_at_idx" ON "notices"("landlord_id", "created_at" DESC);

-- 3. Compound sort index on notifications for notifications.listReceived
--    Polled every 10s by the NotificationBell.
--    Query: WHERE recipient_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at" DESC);

-- 4. Compound period filter index on payments for payments.getBillingSummary
--    Query: WHERE lease_id = ? AND period_start = ? AND period_end = ?
--    The existing (lease_id, status) index only helps when status is also in the filter.
--    This index covers the period-specific lookup used in getBillingSummary.
CREATE INDEX IF NOT EXISTS "payments_lease_id_period_start_period_end_idx" ON "payments"("lease_id", "period_start", "period_end");
