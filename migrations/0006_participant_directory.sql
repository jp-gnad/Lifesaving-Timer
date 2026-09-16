CREATE TABLE participant_directory (
  candidate_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('m', 'w')),
  organization TEXT NOT NULL DEFAULT '',
  search_name TEXT NOT NULL
);

CREATE INDEX idx_participant_directory_search ON participant_directory(search_name);
