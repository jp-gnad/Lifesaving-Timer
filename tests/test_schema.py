import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        for migration in sorted((ROOT / "migrations").glob("*.sql")):
            self.db.executescript(migration.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_result_and_laps_can_be_saved(self):
        self.db.execute(
            "INSERT INTO events (id, name, event_date, location) VALUES (?, ?, ?, ?)",
            ("event-1", "Testevent", "2026-09-15", "Berlin"),
        )
        self.db.execute(
            """INSERT INTO participants
               (id, event_id, name, birth_year, age_group, gender, organization)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("person-1", "event-1", "Erika Muster", 2008, "AK 17/18", "female", "Teststadt"),
        )
        self.db.execute(
            """INSERT INTO results
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json, frequencies_json, lap_groups_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("result-1", "event-1", "person-1", "rescue50", 6400, "[3100,3254]", "[60,48]", "[[1],[2]]"),
        )
        saved = self.db.execute(
            "SELECT total_centiseconds, segments_json, frequencies_json, lap_groups_json FROM results WHERE id = ?", ("result-1",)
        ).fetchone()
        self.assertEqual(saved, (6400, "[3100,3254]", "[60,48]", "[[1],[2]]"))

    def test_official_time_can_be_empty(self):
        columns = {row[1]: row for row in self.db.execute("PRAGMA table_info(results)").fetchall()}
        self.assertIn("official_centiseconds", columns)
        self.assertEqual(columns["official_centiseconds"][3], 0)

    def test_result_note_is_optional_and_limited(self):
        columns = {row[1]: row for row in self.db.execute("PRAGMA table_info(results)").fetchall()}
        self.assertIn("note", columns)
        self.assertEqual(columns["note"][3], 1)
        self.assertEqual(columns["note"][4], "''")

    def test_submission_key_prevents_duplicate_offline_result(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        self.db.execute(
            """INSERT INTO participants
               (id, event_id, name, birth_year, age_group, gender, organization)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("person-1", "event-1", "Erika Muster", 2008, "17/18", "female", "Teststadt"),
        )
        values = ("event-1", "person-1", "rescue50", 6400, "[3100,3300]", "offline-result-1")
        self.db.execute(
            """INSERT INTO results
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json, submission_key)
               VALUES ('result-1', ?, ?, ?, ?, ?, ?)""",
            values,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO results
                   (id, event_id, participant_id, discipline, total_centiseconds, segments_json, submission_key)
                   VALUES ('result-2', ?, ?, ?, ?, ?, ?)""",
                values,
            )

    def test_glued_adjacent_laps_can_be_saved(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        self.db.execute(
            """INSERT INTO participants
               (id, event_id, name, birth_year, age_group, gender, organization)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("person-1", "event-1", "Erika Muster", 2008, "AK 17/18", "female", "Teststadt"),
        )
        self.db.execute(
            """INSERT INTO results
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json, frequencies_json, lap_groups_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "result-1",
                "event-1",
                "person-1",
                "superLifesaver200",
                7000,
                "[1000,1000,2000,1000,1000,1000]",
                "[60,60,null,60,60,60]",
                "[[1],[2],[3,4],[5],[6],[7]]",
            ),
        )
        saved = self.db.execute(
            "SELECT segments_json, lap_groups_json FROM results WHERE id = ?", ("result-1",)
        ).fetchone()
        self.assertEqual(saved, ("[1000,1000,2000,1000,1000,1000]", "[[1],[2],[3,4],[5],[6],[7]]"))

    def test_deleting_event_cascades(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        self.db.execute(
            """INSERT INTO participants
               (id, event_id, name, birth_year, age_group, gender, organization)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("person-1", "event-1", "Max Muster", 2007, "AK 17/18", "male", "Teststadt"),
        )
        self.db.execute("DELETE FROM events WHERE id = ?", ("event-1",))
        count = self.db.execute("SELECT COUNT(*) FROM participants").fetchone()[0]
        self.assertEqual(count, 0)

    def test_team_result_has_four_ordered_members(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        for position in range(1, 5):
            self.db.execute(
                """INSERT INTO participants
                   (id, event_id, name, birth_year, age_group, gender, organization)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"person-{position}", "event-1", f"Person {position}", 2000, "Offen", "male", "Teststadt"),
            )
        self.db.execute(
            """INSERT INTO results
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("result-1", "event-1", "person-1", "manikinRelay4x25", 6000, "[1500,1500,1500,1500]"),
        )
        for position in range(1, 5):
            self.db.execute(
                "INSERT INTO result_members (result_id, participant_id, position) VALUES (?, ?, ?)",
                ("result-1", f"person-{position}", position),
            )
        members = self.db.execute(
            "SELECT participant_id, position FROM result_members WHERE result_id = ? ORDER BY position",
            ("result-1",),
        ).fetchall()
        self.assertEqual(members, [("person-1", 1), ("person-2", 2), ("person-3", 3), ("person-4", 4)])

    def test_invalid_gender_is_rejected(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO participants
                   (id, event_id, name, birth_year, age_group, gender, organization)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                ("person-1", "event-1", "Test", 2000, "Offen", "other", "Teststadt"),
            )

    def test_private_import_directory_is_available(self):
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(participant_directory)").fetchall()}
        self.assertEqual(
            columns,
            {"candidate_id", "name", "birth_year", "gender", "organization", "search_name"},
        )

    def test_event_settings_have_safe_defaults(self):
        self.db.execute("INSERT INTO events (id, name) VALUES (?, ?)", ("event-1", "Testevent"))
        settings = self.db.execute(
            """SELECT timer_enabled, results_mode, results_paused_at, pool_length,
                      custom_pool_length, enabled_disciplines_json, result_url
               FROM events WHERE id = ?""",
            ("event-1",),
        ).fetchone()
        self.assertEqual(settings[0:5], (1, "live", None, "25", None))
        self.assertIn('"rescue50"', settings[5])
        self.assertEqual(settings[6], "")

    def test_invalid_event_status_is_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO events (id, name, results_mode) VALUES (?, ?, ?)",
                ("event-1", "Testevent", "invalid"),
            )


if __name__ == "__main__":
    unittest.main()
