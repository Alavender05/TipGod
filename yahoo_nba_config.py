from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Tuple
import os


LOGGER_NAME = "tipgod.yahoo_nba"


@dataclass(frozen=True)
class YahooNBAConfig:
    data_root: Path = Path(os.getenv("TIPGOD_DATA_ROOT", "data"))
    raw_data_dir: Path = field(default_factory=lambda: Path(os.getenv("TIPGOD_RAW_DATA_DIR", "data/raw")))
    parsed_data_dir: Path = field(default_factory=lambda: Path(os.getenv("TIPGOD_PARSED_DATA_DIR", "data/parsed")))
    cache_roots: Tuple[str, ...] = field(default_factory=lambda: tuple(
        filter(
            None,
            (
                os.getenv("TIPGOD_RAW_DATA_DIR", "data/raw"),
                "nba_scrapes",
                "yahoo_scrapes",
            ),
        )
    ))
    normalized_json_output: Path = field(
        default_factory=lambda: Path(os.getenv("TIPGOD_NORMALIZED_JSON_OUTPUT", "data/parsed/yahoo_nba_game_markets.json"))
    )
    normalized_csv_output: Path = field(
        default_factory=lambda: Path(os.getenv("TIPGOD_NORMALIZED_CSV_OUTPUT", "data/parsed/yahoo_nba_game_markets.csv"))
    )
    normalized_run_summary_output: Path = field(
        default_factory=lambda: Path(os.getenv("TIPGOD_NORMALIZED_RUN_SUMMARY_OUTPUT", "data/parsed/yahoo_nba_game_markets.run-summary.json"))
    )
    report_dir: Path = field(default_factory=lambda: Path(os.getenv("TIPGOD_REPORT_DIR", "data/reports")))
    discovery_dir: Path = field(default_factory=lambda: Path(os.getenv("TIPGOD_DISCOVERY_DIR", "data/discovery")))
    fetch_retry_attempts: int = int(os.getenv("TIPGOD_FETCH_RETRY_ATTEMPTS", "3"))
    fetch_retry_backoff_seconds: float = float(os.getenv("TIPGOD_FETCH_RETRY_BACKOFF_SECONDS", "2.0"))
    fetch_polite_sleep_seconds: float = float(os.getenv("TIPGOD_FETCH_POLITE_SLEEP_SECONDS", "2.0"))
    request_timeout_seconds: int = int(os.getenv("TIPGOD_REQUEST_TIMEOUT_SECONDS", "30"))
    supported_market_types: Tuple[str, ...] = ("moneyline", "spread", "game_total")
    discovery_prop_sections: Tuple[str, ...] = ("activePropBets", "closedPropBets")


DEFAULT_CONFIG = YahooNBAConfig()
