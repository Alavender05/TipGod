from __future__ import annotations

import unittest
from pathlib import Path

from yahoo_nba_prop_discovery import classify_prop_market, discover_from_files, discover_from_payload


FIXTURE_TEAM_SPECIAL = Path(__file__).parent / "fixtures" / "yahoo_nba_prop_team_special_sample.json"
FIXTURE_PLAYER_LIKE = Path(__file__).parent / "fixtures" / "yahoo_nba_prop_player_like_sample.json"


class YahooNBAPropDiscoveryTests(unittest.TestCase):
    def test_classify_player_like_from_players(self):
        classification = classify_prop_market({"players": [{"name": "Jayson Tatum"}], "options": []})
        self.assertEqual(classification, "player_like")

    def test_discover_team_special_from_existing_fixture(self):
        result = discover_from_files([FIXTURE_TEAM_SPECIAL])
        self.assertGreater(result["summary"]["markets_found"], 0)
        self.assertIn("team_special", result["summary"]["classifications"])

    def test_discover_player_like_fixture(self):
        result = discover_from_files([FIXTURE_PLAYER_LIKE])
        self.assertIn("player_like", result["summary"]["classifications"])
        self.assertEqual(result["samples"][0]["players_count"], 1)


if __name__ == "__main__":
    unittest.main()
