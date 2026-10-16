-- Additive, optional shift snapshots. Existing handovers stay unchanged.
-- PEEP is intentionally count-only: no sensitive guest details are stored here.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE hospitality_handovers
  ADD COLUMN occupancy_percent numeric(5,2),
  ADD COLUMN adr numeric(12,2),
  ADD COLUMN arrivals_count integer,
  ADD COLUMN departures_count integer,
  ADD COLUMN vip_guest_count integer,
  ADD COLUMN peep_guest_count integer;

ALTER TABLE hospitality_handovers
  ADD CONSTRAINT handover_metrics_check CHECK (
    (occupancy_percent IS NULL OR occupancy_percent BETWEEN 0 AND 100)
    AND (adr IS NULL OR adr >= 0)
    AND (arrivals_count IS NULL OR arrivals_count >= 0)
    AND (departures_count IS NULL OR departures_count >= 0)
    AND (vip_guest_count IS NULL OR vip_guest_count >= 0)
    AND (peep_guest_count IS NULL OR peep_guest_count >= 0)
  );
