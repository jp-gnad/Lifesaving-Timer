ALTER TABLE results ADD COLUMN submission_key TEXT;

CREATE UNIQUE INDEX idx_results_event_submission_key
  ON results(event_id, submission_key)
  WHERE submission_key IS NOT NULL;
