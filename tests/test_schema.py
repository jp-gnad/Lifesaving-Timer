import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript((ROOT / "migrations" / "0001_initial.sql").read_text(encoding="utf-8"))

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
               (id, event_id, participant_id, discipline, total_centiseconds, segments_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("result-1", "event-1", "person-1", "rescue50", 6354, "[3100,3254]"),
        )
        saved = self.db.execute(
            "SELECT total_centiseconds, segments_json FROM results WHERE id = ?", ("result-1",)
        ).fetchone()
        self.assertEqual(saved, (6354, "[3100,3254]"))

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
