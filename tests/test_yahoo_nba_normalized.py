from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from yahoo_nba_normalized import (
    OUTPUT_COLUMNS,
    american_to_decimal,
    canonical_matchup_key,
    normalize_file,
    normalize_files,
    normalize_team_name,
    write_csv,
    write_json,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "yahoo_nba_game_sample.json"


class YahooNBANormalizedTests(unittest.TestCase):
    def test_american_to_decimal(self):
        self.assertAlmostEqual(american_to_decimal(-110), 1.909, places=3)
        self.assertEqual(american_to_decimal(150), 2.5)
        self.assertIsNone(american_to_decimal(0))
        self.assertIsNone(american_to_decimal(None))

    def test_matchup_key(self):
        self.assertEqual(canonical_matchup_key("Boston", "Miami"), "Boston@Miami")

    def test_team_normalization(self):
        self.assertEqual(normalize_team_name("Philadelphia 76ers"), "Philadelphia")
        self.assertEqual(normalize_team_name("Golden State Warriors"), "Golden State")
        self.assertIsNone(normalize_team_name("Team LeBron"))

    def test_normalize_fixture_file(self):
        rows = normalize_file(FIXTURE_PATH)
        self.assertEqual(len(rows), 6)
        self.assertEqual({row["market_type"] for row in rows}, {"moneyline", "spread", "game_total"})
        self.assertTrue(all(row["period"] == "full_game" for row in rows))
        self.assertTrue(all(row["matchup_key"] == "New Orleans@Philadelphia" for row in rows))

        moneyline_rows = [row for row in rows if row["market_type"] == "moneyline"]
        self.assertEqual(len(moneyline_rows), 2)
        self.assertTrue(all(row["line"] is None for row in moneyline_rows))
        self.assertEqual({row["selection"] for row in moneyline_rows}, {"away", "home"})

        spread_rows = [row for row in rows if row["market_type"] == "spread"]
        self.assertEqual({row["line"] for row in spread_rows}, {7.5, -7.5})

        total_rows = [row for row in rows if row["market_type"] == "game_total"]
        self.assertEqual({row["selection"] for row in total_rows}, {"over", "under"})
        self.assertEqual({row["line"] for row in total_rows}, {219.5})

    def test_export_helpers(self):
        rows, skipped = normalize_files([FIXTURE_PATH])
        self.assertFalse(skipped)

        with tempfile.TemporaryDirectory() as temp_dir:
            json_path = Path(temp_dir) / "yahoo.json"
            csv_path = Path(temp_dir) / "yahoo.csv"

            write_json(rows, json_path)
            write_csv(rows, csv_path)

            loaded_json = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(len(loaded_json), 6)
            self.assertEqual(list(loaded_json[0].keys()), OUTPUT_COLUMNS)

            with csv_path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                self.assertEqual(reader.fieldnames, OUTPUT_COLUMNS)
                csv_rows = list(reader)
                self.assertEqual(len(csv_rows), 6)


if __name__ == "__main__":
    unittest.main()
