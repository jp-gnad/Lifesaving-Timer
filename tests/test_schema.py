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
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json, frequencies_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("result-1", "event-1", "person-1", "rescue50", 6400, "[3100,3254]", "[60,48]"),
        )
        saved = self.db.execute(
            "SELECT total_centiseconds, segments_json, frequencies_json FROM results WHERE id = ?", ("result-1",)
        ).fetchone()
        self.assertEqual(saved, (6400, "[3100,3254]", "[60,48]"))

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


if __name__ == "__main__":
    unittest.main()
