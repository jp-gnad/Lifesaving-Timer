CREATE TABLE participant_directory_staging (
  candidate_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('m', 'w')),
  organization TEXT NOT NULL DEFAULT '',
  search_name TEXT NOT NULL
);
