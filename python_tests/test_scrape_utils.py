from __future__ import annotations

import unittest

from scrape_utils import (
    american_to_decimal,
    american_to_implied_probability,
    normalize_probabilities,
    probability_to_american,
    probability_to_decimal,
)


class OddsMathTest(unittest.TestCase):
    def test_american_to_implied_probability(self) -> None:
        self.assertAlmostEqual(american_to_implied_probability(-110), 0.52380952)
        self.assertAlmostEqual(american_to_implied_probability(225), 0.30769231)

    def test_american_to_decimal(self) -> None:
        self.assertEqual(american_to_decimal(-110), 1.909091)
        self.assertEqual(american_to_decimal(225), 3.25)

    def test_normalize_probabilities(self) -> None:
        result = normalize_probabilities([0.52380952, 0.52380952])
        self.assertEqual(result, [0.5, 0.5])

    def test_probability_round_trip_helpers(self) -> None:
        fair_probability = 0.5
        self.assertEqual(probability_to_decimal(fair_probability), 2.0)
        self.assertEqual(probability_to_american(fair_probability), -100)


if __name__ == "__main__":
    unittest.main()
