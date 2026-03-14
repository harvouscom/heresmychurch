-- Add church name and location to audit log for display like review cards
ALTER TABLE church_audit_log
  ADD COLUMN IF NOT EXISTS church_name TEXT,
  ADD COLUMN IF NOT EXISTS church_city_state TEXT;
