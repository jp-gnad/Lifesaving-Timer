ALTER TABLE events ADD COLUMN results_pause_generation INTEGER NOT NULL DEFAULT 0 CHECK(results_pause_generation >= 0);
ALTER TABLE results ADD COLUMN created_pause_generation INTEGER;

CREATE INDEX idx_results_event_pause_generation
ON results(event_id, created_pause_generation);
