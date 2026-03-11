from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from yahoo_nba_reporting import (
    build_markdown_summary,
    build_run_summary,
    rank_opportunities,
    write_opportunities_csv,
)


class YahooNBAReportingTests(unittest.TestCase):
    def test_build_run_summary(self):
        rows = [
            {"event_id": "1", "game_date": "2025-01-01", "market_type": "moneyline"},
            {"event_id": "1", "game_date": "2025-01-01", "market_type": "spread"},
            {"event_id": "2", "game_date": "2025-01-02", "market_type": "moneyline"},
        ]
        summary = build_run_summary(rows, {"skip_reasons": {"invalid_matchup": 2}})
        self.assertEqual(summary["total_games_scraped"], 2)
        self.assertEqual(summary["total_market_rows_parsed"], 3)
        self.assertEqual(summary["rows_by_market_type"]["moneyline"], 2)
        self.assertEqual(summary["coverage_by_date"]["2025-01-01"]["games"], 1)
        self.assertEqual(summary["malformed_or_skipped_rows"]["invalid_matchup"], 2)

    def test_rank_opportunities_and_csv(self):
        rows = [
            {
                "event_id": "1",
                "game_date": "2025-01-01",
                "matchup_key": "A@B",
                "market_type": "moneyline",
                "period": "full_game",
                "selection": "away",
                "line": None,
                "odds_american": 150,
                "odds_decimal": 2.5,
                "edge": 0.07,
            },
            {"event_id": "2", "edge": -0.01},
        ]
        ranked = rank_opportunities(rows)
        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0]["edge_metric_name"], "edge")

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "opps.csv"
            write_opportunities_csv(ranked, output)
            with output.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)
            self.assertEqual(len(rows), 1)

    def test_build_markdown_summary_without_opportunities(self):
        summary = build_run_summary([], {})
        markdown = build_markdown_summary(summary)
        self.assertIn("No edge metrics were available", markdown)


if __name__ == "__main__":
    unittest.main()
