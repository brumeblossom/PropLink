-- Row-Level Security (RLS) Policies and Custom Triggers for PropLink

-- ==========================================
-- 0. Helper Triggers & Constraints
-- ==========================================

-- Constraint: Prevent overlapping active leases for the same unit
-- Epic B, Story B1/AC2: "A unit cannot have two overlapping active leases..."
CREATE OR REPLACE FUNCTION check_lease_overlap()
RETURNS TRIGGER AS $$
BEGIN
  -- If the lease is terminated, we bypass overlap check
  IF NEW.terminated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM leases
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

DROP TRIGGER IF EXISTS check_lease_overlap_trigger ON leases;
CREATE TRIGGER check_lease_overlap_trigger
BEFORE INSERT OR UPDATE ON leases
FOR EACH ROW EXECUTE FUNCTION check_lease_overlap();


-- Columns Validation: Ensure tenants can only modify their reaction fields on payments
-- Epic C, Story C4: "Tenant can acknowledge or flag a payment my landlord logged..."
CREATE OR REPLACE FUNCTION enforce_payment_write_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user role is 'tenant', restrict update scope
  IF (SELECT role FROM users WHERE id = auth.uid()) = 'tenant' THEN
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

DROP TRIGGER IF EXISTS enforce_payment_write_rules_trigger ON payments;
CREATE TRIGGER enforce_payment_write_rules_trigger
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION enforce_payment_write_rules();


-- ==========================================
-- 1. Enable RLS on All Tables
-- ==========================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- 2. Row-Level Security Policies
-- ==========================================

-- USERS Table
DROP POLICY IF EXISTS user_self_policy ON users;
CREATE POLICY user_self_policy ON users
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- PROPERTIES Table
DROP POLICY IF EXISTS landlord_properties_policy ON properties;
CREATE POLICY landlord_properties_policy ON properties
  FOR ALL
  USING (landlord_id = auth.uid())
  WITH CHECK (landlord_id = auth.uid());

DROP POLICY IF EXISTS tenant_read_properties_policy ON properties;
CREATE POLICY tenant_read_properties_policy ON properties
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN leases l ON l.unit_id = u.id
      WHERE u.property_id = properties.id
        AND l.tenant_id = auth.uid()
    )
  );


-- UNITS Table
DROP POLICY IF EXISTS landlord_units_policy ON units;
CREATE POLICY landlord_units_policy ON units
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_units_policy ON units;
CREATE POLICY tenant_read_units_policy ON units
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.unit_id = units.id
        AND l.tenant_id = auth.uid()
    )
  );


-- LEASES Table
DROP POLICY IF EXISTS landlord_leases_policy ON leases;
CREATE POLICY landlord_leases_policy ON leases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_leases_policy ON leases;
CREATE POLICY tenant_read_leases_policy ON leases
  FOR SELECT
  USING (tenant_id = auth.uid());


-- PAYMENTS Table
DROP POLICY IF EXISTS landlord_read_payments_policy ON payments;
CREATE POLICY landlord_read_payments_policy ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_payments_policy ON payments;
CREATE POLICY tenant_read_payments_policy ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = payments.lease_id
        AND l.tenant_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS landlord_write_payments_policy ON payments;
CREATE POLICY landlord_write_payments_policy ON payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_insert_payments_policy ON payments;
CREATE POLICY tenant_insert_payments_policy ON payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = payments.lease_id
        AND l.tenant_id = auth.uid()
    )
    AND recorded_by = auth.uid()
    AND recorded_by_role = 'tenant'
    AND status = 'pending'
  );

DROP POLICY IF EXISTS tenant_update_payments_policy ON payments;
CREATE POLICY tenant_update_payments_policy ON payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = payments.lease_id
        AND l.tenant_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = payments.lease_id
        AND l.tenant_id = auth.uid()
    )
  );


-- NOTICES Table
DROP POLICY IF EXISTS landlord_notices_policy ON notices;
CREATE POLICY landlord_notices_policy ON notices
  FOR ALL
  USING (landlord_id = auth.uid())
  WITH CHECK (landlord_id = auth.uid());

DROP POLICY IF EXISTS tenant_read_notices_policy ON notices;
CREATE POLICY tenant_read_notices_policy ON notices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notice_recipients nr
      WHERE nr.notice_id = notices.id
        AND nr.tenant_id = auth.uid()
    )
  );


-- NOTICE_RECIPIENTS Table
DROP POLICY IF EXISTS landlord_notice_recipients_policy ON notice_recipients;
CREATE POLICY landlord_notice_recipients_policy ON notice_recipients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notices n
      WHERE n.id = notice_recipients.notice_id
        AND n.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notices n
      WHERE n.id = notice_recipients.notice_id
        AND n.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_notice_recipients_policy ON notice_recipients;
CREATE POLICY tenant_read_notice_recipients_policy ON notice_recipients
  FOR SELECT
  USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS tenant_update_notice_recipients_policy ON notice_recipients;
CREATE POLICY tenant_update_notice_recipients_policy ON notice_recipients
  FOR UPDATE
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());


-- CONVERSATIONS Table
DROP POLICY IF EXISTS landlord_conversations_policy ON conversations;
CREATE POLICY landlord_conversations_policy ON conversations
  FOR ALL
  USING (landlord_id = auth.uid())
  WITH CHECK (landlord_id = auth.uid());

DROP POLICY IF EXISTS tenant_conversations_policy ON conversations;
CREATE POLICY tenant_conversations_policy ON conversations
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());


-- MESSAGES Table
DROP POLICY IF EXISTS conversation_messages_read_policy ON messages;
CREATE POLICY conversation_messages_read_policy ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.landlord_id = auth.uid() OR c.tenant_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS conversation_messages_write_policy ON messages;
CREATE POLICY conversation_messages_write_policy ON messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.landlord_id = auth.uid() OR c.tenant_id = auth.uid())
    )
  );


-- INVITE_CODES Table
DROP POLICY IF EXISTS landlord_invite_codes_policy ON invite_codes;
CREATE POLICY landlord_invite_codes_policy ON invite_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = invite_codes.lease_id
        AND p.landlord_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = invite_codes.lease_id
        AND p.landlord_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_read_invite_codes_policy ON invite_codes;
CREATE POLICY tenant_read_invite_codes_policy ON invite_codes
  FOR SELECT
  USING (true);


-- NOTIFICATION_LOG Table
DROP POLICY IF EXISTS recipient_notification_log_policy ON notification_log;
CREATE POLICY recipient_notification_log_policy ON notification_log
  FOR ALL
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
