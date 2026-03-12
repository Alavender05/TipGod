from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scrape_yahoo_nba import ScrapeYahooNBA


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "yahoo_nba_game_snapshot.json"


class ScrapeYahooNBATest(unittest.TestCase):
    def setUp(self) -> None:
        self.scraper = ScrapeYahooNBA(base_dir="nba_scrapes_test")

    def test_url_builders_preserve_existing_yahoo_patterns(self) -> None:
        self.assertEqual(
            self.scraper.make_yahoo_json_url("nba.g.2025011020"),
            "https://sports.yahoo.com/site/api/resource/"
            "sports.graphite.gameOdds;dataType=graphite;endpoint=graphite;"
            "gameIds=nba.g.2025011020",
        )
        self.assertEqual(
            self.scraper.make_date_url("2025-01-10"),
            "https://graphite.sports.yahoo.com/v1/query/shangrila/"
            "leagueGameIdsByDate?startRange=2025-01-10&endRange=2025-01-10&leagues=nba",
        )

    def test_parse_raw_snapshot_keeps_supported_game_markets_only(self) -> None:
        parsed = self.scraper.parse_raw_snapshot(FIXTURE_PATH)
        self.assertEqual(parsed["game"]["game_id"], "nba.g.2025011020")
        self.assertEqual(parsed["game"]["season"], "2024")
        self.assertEqual(len(parsed["markets"]), 3)
        self.assertEqual([market["market_type"] for market in parsed["markets"]], ["total", "moneyline", "spread"])
        self.assertEqual(len(parsed["player_lines"]), 1)

    def test_normalize_and_calculate_edges(self) -> None:
        parsed = self.scraper.parse_raw_snapshot(FIXTURE_PATH)
        bundle = self.scraper.normalize_markets([parsed])

        self.assertEqual(len(bundle.games), 1)
        self.assertEqual(len(bundle.market_options), 6)
        self.assertEqual(len(bundle.edges), 6)

        first_total = next(row for row in bundle.edges if row["market_type"] == "total" and row["selection_kind"] == "over")
        self.assertEqual(first_total["line"], 219.5)
        self.assertAlmostEqual(first_total["implied_probability"], 0.52380952)
        self.assertAlmostEqual(first_total["no_vig_probability"], 0.5)
        self.assertAlmostEqual(first_total["overround"], 1.04761904)
        self.assertFalse(first_total["is_value_opportunity"])

    def test_pipeline_writes_expected_output_groups(self) -> None:
        parsed = self.scraper.parse_raw_snapshot(FIXTURE_PATH)
        bundle = self.scraper.normalize_markets([parsed])
        writes: list[tuple[Path, int]] = []

        def capture_writer(path: Path, records: list[dict]) -> Path:
            writes.append((Path(path), len(records)))
            return Path(path)

        with tempfile.TemporaryDirectory() as tempdir:
            outputs = self.scraper.write_dataset_bundle(
                bundle,
                output_root=tempdir,
                writer=capture_writer,
                file_extension=".parquet",
            )

        self.assertEqual(set(outputs), {"games", "market_options", "edges"})
        self.assertEqual([path.suffix for path, _ in writes], [".parquet", ".parquet", ".parquet"])
        self.assertEqual([count for _, count in writes], [1, 6, 6])


if __name__ == "__main__":
    unittest.main()
