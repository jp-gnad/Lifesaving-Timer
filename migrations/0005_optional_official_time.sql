ALTER TABLE results ADD COLUMN official_centiseconds INTEGER CHECK(official_centiseconds IS NULL OR official_centiseconds > 0);

-- Vorhandene Ergebnisse behalten ihre bisher gespeicherte offizielle Zeit.
UPDATE results SET official_centiseconds = total_centiseconds;

CREATE INDEX idx_results_official_time ON results(event_id, discipline, official_centiseconds);
