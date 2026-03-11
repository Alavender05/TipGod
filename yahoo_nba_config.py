from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Tuple


LOGGER_NAME = "tipgod.yahoo_nba"


@dataclass(frozen=True)
class YahooNBAConfig:
    cache_roots: Tuple[str, ...] = ("nba_scrapes", "yahoo_scrapes")
    normalized_json_output: Path = Path("data/normalized/yahoo_nba_game_markets.json")
    normalized_csv_output: Path = Path("data/normalized/yahoo_nba_game_markets.csv")
    normalized_run_summary_output: Path = Path("data/normalized/yahoo_nba_game_markets.run-summary.json")
    report_dir: Path = Path("data/reports")
    discovery_dir: Path = Path("data/discovery")
    fetch_retry_attempts: int = 3
    fetch_retry_backoff_seconds: float = 2.0
    fetch_polite_sleep_seconds: float = 2.0
    request_timeout_seconds: int = 30
    supported_market_types: Tuple[str, ...] = ("moneyline", "spread", "game_total")
    discovery_prop_sections: Tuple[str, ...] = ("activePropBets", "closedPropBets")


DEFAULT_CONFIG = YahooNBAConfig()
