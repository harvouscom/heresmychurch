-- Monthly impact and review % snapshots for reporting (national + per-state).
-- One row per (month, state_abbrev); state_abbrev '' = national row (PK cannot be NULL).
CREATE TABLE IF NOT EXISTS monthly_impact_snapshots (
  month DATE NOT NULL,
  state_abbrev TEXT NOT NULL DEFAULT '',
  total_churches INT NOT NULL DEFAULT 0,
  total_needs_review INT NOT NULL DEFAULT 0,
  pct_needs_review NUMERIC(5,2) NOT NULL DEFAULT 0,
  missing_address INT NOT NULL DEFAULT 0,
  missing_service_times INT NOT NULL DEFAULT 0,
  missing_denomination INT NOT NULL DEFAULT 0,
  total_corrections INT NOT NULL DEFAULT 0,
  churches_improved INT NOT NULL DEFAULT 0,
  population INT,
  people_per_church INT,
  churches_per_10k NUMERIC(10,4),
  PRIMARY KEY (month, state_abbrev)
);

CREATE INDEX IF NOT EXISTS idx_monthly_impact_month ON monthly_impact_snapshots(month);
CREATE INDEX IF NOT EXISTS idx_monthly_impact_state_month ON monthly_impact_snapshots(state_abbrev, month);

-- March 2026 baseline: 74% of churches needed review at launch (March 9, 2026).
INSERT INTO monthly_impact_snapshots (month, state_abbrev, total_churches, total_needs_review, pct_needs_review, missing_address, missing_service_times, missing_denomination, total_corrections, churches_improved, population, people_per_church, churches_per_10k)
VALUES ('2026-03-01', '', 0, 0, 74.0, 0, 0, 0, 0, 0, NULL, NULL, NULL)
ON CONFLICT (month, state_abbrev) DO NOTHING;
