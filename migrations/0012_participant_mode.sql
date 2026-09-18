ALTER TABLE events ADD COLUMN participant_mode TEXT NOT NULL DEFAULT 'edit'
CHECK(participant_mode IN ('edit', 'view', 'hidden'));
