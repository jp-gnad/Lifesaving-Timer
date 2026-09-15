PRAGMA foreign_keys = ON;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  event_date TEXT,
  location TEXT NOT NULL DEFAULT '' CHECK(length(location) <= 120),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  birth_year INTEGER NOT NULL CHECK(birth_year BETWEEN 1900 AND 2200),
  age_group TEXT NOT NULL CHECK(length(age_group) BETWEEN 1 AND 40),
  gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
  organization TEXT NOT NULL CHECK(length(organization) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  discipline TEXT NOT NULL,
  total_centiseconds INTEGER NOT NULL CHECK(total_centiseconds > 0),
  segments_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE INDEX idx_participants_event ON participants(event_id);
CREATE INDEX idx_results_event_discipline_gender ON results(event_id, discipline, total_centiseconds);
CREATE INDEX idx_results_participant ON results(participant_id);
