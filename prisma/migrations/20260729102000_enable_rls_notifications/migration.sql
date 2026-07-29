-- Migration: enable_rls_notifications
-- Enforces Row-Level Security on the notifications table and adds the recipient restriction policy.

-- 1. Enable Row-Level Security
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policy
CREATE POLICY "recipient_notifications_policy" ON "notifications"
  FOR ALL
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
