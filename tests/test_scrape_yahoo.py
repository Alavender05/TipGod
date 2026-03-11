from __future__ import annotations

import unittest

from scrape_yahoo import backoff_seconds, validate_game_id


class ScrapeYahooTests(unittest.TestCase):
    def test_validate_game_id(self):
        self.assertTrue(validate_game_id("nba.g.2025011020"))
        self.assertFalse(validate_game_id("nfl.g.2025011020"))
        self.assertFalse(validate_game_id("nba.g.bad"))

    def test_backoff_seconds(self):
        self.assertEqual(backoff_seconds(1, base_seconds=2), 2)
        self.assertEqual(backoff_seconds(3, base_seconds=2), 6)
        self.assertEqual(backoff_seconds(0, base_seconds=2), 2)


if __name__ == "__main__":
    unittest.main()
