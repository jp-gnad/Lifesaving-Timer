PRAGMA foreign_keys = ON;

CREATE TABLE result_members (
  result_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 4),
  PRIMARY KEY (result_id, position),
  UNIQUE (result_id, participant_id),
  FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE INDEX idx_result_members_participant ON result_members(participant_id);
