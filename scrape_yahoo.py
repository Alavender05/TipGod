"""
Yahoo odds transport helpers.

This module keeps the existing Yahoo game-id lookup and odds payload fetch
behavior while improving reliability, diagnostics, and local execution clarity.
The legacy wide-format parsing path remains available only when its optional
dependencies can be imported successfully.
"""

from __future__ import annotations

import datetime
import glob
import json
import logging
import os
import re
import time
from typing import Iterable, List, Optional

from yahoo_nba_config import DEFAULT_CONFIG, LOGGER_NAME

try:
    import pandas as pd
except ImportError:  # pragma: no cover - optional dependency
    pd = None

try:
    import cloudscraper
except ImportError:  # pragma: no cover - optional dependency
    cloudscraper = None

try:
    from jsonpath_ng.ext import parse as jsonpath_parse
except ImportError:  # pragma: no cover - optional dependency
    jsonpath_parse = None

try:
    import scrape_rules
except Exception:  # pragma: no cover - invalid/missing in current repo state
    scrape_rules = None


logger = logging.getLogger(LOGGER_NAME)


def configure_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")


def numericize(df):
    if pd is None:  # pragma: no cover - guarded by environment
        raise RuntimeError("pandas is required for numericize()")

    points = df.columns[df.columns.str.contains("points")]
    percentages = df.columns[df.columns.str.contains("percentage")]
    to_numeric = list(points) + list(percentages)
    df[to_numeric] = df[to_numeric].apply(pd.to_numeric)

    to_bools = df.columns[df.columns.str.contains("won")]
    for col in to_bools:
        df[col] = df[col].astype(bool)

    return df


def convert_line(line: int) -> float:
    if line < 0:
        return abs(line) / (abs(line) + 100)
    return 100 / (100 + line)


def payout(line: int) -> float:
    return (100 / convert_line(line)) - 100


def validate_game_id(game_id: str) -> bool:
    return bool(re.fullmatch(r"nba\.g\.20\d{8}", str(game_id)))


def backoff_seconds(attempt: int, base_seconds: float | None = None) -> float:
    base = DEFAULT_CONFIG.fetch_retry_backoff_seconds if base_seconds is None else max(base_seconds, 0)
    return base * max(attempt, 1)


class ScrapeYahoo:
    START_DATE = datetime.datetime(2024, 10, 22)
    END_DATE = datetime.datetime(2025, 4, 13)

    SEASONS = {
        "2021": (datetime.datetime(2021, 10, 19), datetime.datetime(2022, 6, 16)),
        "2022": (datetime.datetime(2022, 10, 18), datetime.datetime(2023, 6, 12)),
        "2023": (datetime.datetime(2023, 10, 24), datetime.datetime(2024, 6, 17)),
        "2024": (datetime.datetime(2024, 10, 22), datetime.datetime(2025, 6, 22)),
        "2025": (datetime.datetime(2025, 10, 21), datetime.datetime(2026, 2, 12)),
    }

    BASE_DIR = "nba_scrapes"

    def __init__(self):
        self.scraper = self._create_scraper()
        self.cache_dir = f"{self.BASE_DIR}/2024"

    def _create_scraper(self):
        if cloudscraper is None:  # pragma: no cover - network dependency
            return None
        return cloudscraper.create_scraper()

    def _require_scraper(self):
        if self.scraper is None:  # pragma: no cover - network dependency
            raise RuntimeError("cloudscraper is required for Yahoo fetch operations")

    def _fetch_text_with_retry(self, url: str, operation: str) -> str:
        self._require_scraper()
        last_error = None
        for attempt in range(1, DEFAULT_CONFIG.fetch_retry_attempts + 1):
            try:
                logger.info("%s attempt %s/%s: %s", operation, attempt, DEFAULT_CONFIG.fetch_retry_attempts, url)
                response = self.scraper.get(url, timeout=DEFAULT_CONFIG.request_timeout_seconds)
                response.raise_for_status()
                return response.text
            except Exception as exc:  # pragma: no cover - network dependency
                last_error = exc
                logger.warning("%s failed on attempt %s: %s", operation, attempt, exc)
                if attempt < DEFAULT_CONFIG.fetch_retry_attempts:
                    time.sleep(backoff_seconds(attempt))
        raise RuntimeError(f"{operation} failed after retries: {last_error}") from last_error

    def make_yahoo_json_url(self, game_id: str) -> str:
        if not validate_game_id(game_id):
            raise ValueError(f"Invalid Yahoo NBA game id: {game_id}")
        return (
            "https://sports.yahoo.com/site/api/resource/"
            "sports.graphite.gameOdds;dataType=graphite;endpoint=graphite;"
            f"gameIds={game_id}"
        )

    def get_some_json(self, url: str):
        some_html = self._fetch_text_with_retry(url, "game_payload_fetch")
        return json.loads(some_html)

    def make_date_url(self, yyyy_mm_dd: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(yyyy_mm_dd)):
            raise ValueError(f"Date must be YYYY-MM-DD, got {yyyy_mm_dd}")
        return (
            "https://graphite.sports.yahoo.com/v1/query/shangrila/"
            f"leagueGameIdsByDate?startRange={yyyy_mm_dd}&endRange={yyyy_mm_dd}&leagues=nba"
        )

    def get_yahoo_ids_for_date(self, nice_date: str):
        date_url = self.make_date_url(nice_date)
        date_html = self._fetch_text_with_retry(date_url, "game_id_fetch")
        return set(re.findall(r"nba\.g\.202[\d]+", date_html))

    def fetch_yahoo_data(self, fetch_dir: str = "nba_scrapes/2024", start=START_DATE, end=END_DATE):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for fetch_yahoo_data() date range handling")

        os.makedirs(fetch_dir, exist_ok=True)
        date_range = pd.date_range(start, end).strftime("%Y-%m-%d")
        summary = {"fetched": 0, "cached": 0, "fetch_failures": []}

        for date in date_range:
            logger.info("Starting Yahoo fetch for %s", date)
            yahoo_ids = self.get_yahoo_ids_for_date(date)
            time.sleep(DEFAULT_CONFIG.fetch_polite_sleep_seconds)

            for yahoo_game_id in yahoo_ids:
                cache_path = f"{fetch_dir}/{yahoo_game_id}.json"
                if os.path.exists(cache_path):
                    summary["cached"] += 1
                    continue

                game_url = self.make_yahoo_json_url(yahoo_game_id)
                try:
                    game_json = self.get_some_json(game_url)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(game_json, f)
                    summary["fetched"] += 1
                except Exception as exc:  # pragma: no cover - network dependency
                    logger.error("Failed to fetch %s: %s", game_url, exc)
                    summary["fetch_failures"].append({"game_id": yahoo_game_id, "url": game_url, "error": str(exc)})
                    time.sleep(backoff_seconds(1))
                time.sleep(DEFAULT_CONFIG.fetch_polite_sleep_seconds)

            logger.info("Done with %s", date)
        return summary

    def preparse_rules(self):
        if scrape_rules is None or jsonpath_parse is None:
            raise RuntimeError("Legacy scrape rules are unavailable in this workspace")

        parsed = {}
        for key, value in scrape_rules.RULES.items():
            parsed[key] = jsonpath_parse(value)
        return parsed

    def parse_yahoo_data(self, json_data, filename: str = "", parsed_rules=None):
        row = {}
        if not parsed_rules:
            parsed_rules = self.preparse_rules()

        for key, jsonpath_expression in parsed_rules.items():
            try:
                results = [item.value for item in jsonpath_expression.find(json_data)][0]
                row[key] = results
            except Exception:
                logger.warning("Legacy parse failed for %s on %s", filename, jsonpath_expression)
        return row

    @staticmethod
    def get_cached_filenames(cache_dir: str) -> List[str]:
        return list(glob.glob(f"{cache_dir}/*.json"))

    @classmethod
    def enumerate_cache_dirs(cls, base_dir: Optional[str] = None) -> List[str]:
        root = base_dir or cls.BASE_DIR
        if not os.path.isdir(root):
            return []

        candidates = []
        for entry in sorted(os.listdir(root)):
            path = os.path.join(root, entry)
            if os.path.isdir(path):
                candidates.append(path)
        return candidates

    @classmethod
    def enumerate_cached_filenames(cls, base_dir: Optional[str] = None) -> List[str]:
        filenames: List[str] = []
        for cache_dir in cls.enumerate_cache_dirs(base_dir):
            filenames.extend(cls.get_cached_filenames(cache_dir))
        return sorted(filenames)

    def make_dataframe(self, json_filenames: Iterable[str]):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for make_dataframe()")

        dataframes = []
        parsed_rules = self.preparse_rules()

        for filename in json_filenames:
            with open(filename, "r", encoding="utf-8") as f:
                json_data = json.load(f)
            parsed_data = self.parse_yahoo_data(json_data, filename, parsed_rules)
            if parsed_data:
                dataframes.append(pd.DataFrame({k: [v] for k, v in parsed_data.items()}))

        return pd.concat(dataframes) if dataframes else pd.DataFrame()

    def load_summary_csv(self):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for load_summary_csv()")

        dataframes = []
        for year in self.SEASONS.keys():
            df = pd.read_csv(f"{self.BASE_DIR}/csv/{year}_odds.csv")
            dataframes.append(df.set_index("game_id"))
        joined = pd.concat(dataframes)
        joined.drop("Unnamed: 0", axis=1, inplace=True)
        return joined

    def scrape_pages(self):
        summaries = []
        for season_name, season_range in self.SEASONS.items():
            base_dir = f"{self.BASE_DIR}/{season_name}"
            summaries.append(self.fetch_yahoo_data(base_dir, season_range[0], season_range[1]))
        return summaries

    def rebuild_summary_csv(self):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for rebuild_summary_csv()")

        all_seasons = []
        for year in self.SEASONS.keys():
            logger.info("Rebuilding legacy summary CSV for %s", year)
            start_time = time.time()

            year_dir = f"{self.BASE_DIR}/{year}"
            filenames = self.get_cached_filenames(year_dir)
            df = self.make_dataframe(filenames)
            df.to_csv(f"{self.BASE_DIR}/csv/{year}_odds.csv")

            logger.info("Finished %s in %.2fs", year, time.time() - start_time)
            all_seasons.append(df)

        all_seasons_df = pd.concat(all_seasons)
        all_seasons_df.to_csv(f"{self.BASE_DIR}/csv/all_odds.csv")

    def get_all_data(self):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for get_all_data()")

        dataframes = []
        for year in self.SEASONS.keys():
            filenames = self.get_cached_filenames(f"{self.BASE_DIR}/{year}")
            df = self.make_dataframe(filenames)
            df["season"] = year
            dataframes.append(df)

        return pd.concat(dataframes)
