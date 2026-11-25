-- AlterTable
ALTER TABLE "leases" ALTER COLUMN "end_date" DROP NOT NULL;

-- Update trigger check_lease_overlap() to handle NULL end_date
CREATE OR REPLACE FUNCTION check_lease_overlap()
RETURNS TRIGGER AS $$
BEGIN
  -- If the lease is terminated, declined, cancelled, or expired, we bypass overlap check
  IF NEW.terminated_at IS NOT NULL 
     OR NEW.status IN ('declined', 'cancelled', 'expired')
     OR (NEW.status = 'pending' AND NEW.invitation_expires_at IS NOT NULL AND NEW.invitation_expires_at < NOW()) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM leases
    WHERE unit_id = NEW.unit_id
      AND id <> NEW.id
      AND terminated_at IS NULL
      AND (
        status = 'active'
        OR (status = 'pending' AND (invitation_expires_at IS NULL OR invitation_expires_at >= NOW()))
      )
      AND (
        (end_date IS NULL OR NEW.start_date <= end_date)
        AND (NEW.end_date IS NULL OR NEW.end_date >= start_date)
      )
  ) THEN
    RAISE EXCEPTION 'Lease overlaps with another active lease for this unit.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
