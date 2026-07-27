-- Country namespace for worldwide support (ISO 3166-1 alpha-2).
-- Nullable so existing US rows stay valid; new writes can set country.
ALTER TABLE church_audit_log ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE monthly_impact_snapshots ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_country ON church_audit_log(country);
CREATE INDEX IF NOT EXISTS idx_monthly_impact_country ON monthly_impact_snapshots(country);
