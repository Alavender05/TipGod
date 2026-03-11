"""
Yahoo odds transport helpers.

This module keeps the existing Yahoo game-id lookup and odds payload fetch
behavior, while avoiding hard failures when optional scraping dependencies are
not installed. The legacy wide-format parsing path remains available only when
its optional dependencies can be imported successfully.
"""

from __future__ import annotations

import datetime
import glob
import json
import os
import re
import time
from typing import Iterable, List, Optional

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


def numericize(df):
    """
    Backward-compatible helper for older dataframe-based notebooks.
    """
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
    """
    Convert American odds to implied win probability.
    """
    if line < 0:
        return abs(line) / (abs(line) + 100)
    return 100 / (100 + line)


def payout(line: int) -> float:
    """
    Calculate profit on a winning $100 stake at American odds.
    """
    return (100 / convert_line(line)) - 100


class ScrapeYahoo:
    """
    Yahoo NBA odds transport and cache helpers.

    The raw fetch path is reusable without the old JSONPath parser. The
    rule-based wide parser remains for backward compatibility only.
    """

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

    def make_yahoo_json_url(self, game_id: str) -> str:
        return (
            "https://sports.yahoo.com/site/api/resource/"
            "sports.graphite.gameOdds;dataType=graphite;endpoint=graphite;"
            f"gameIds={game_id}"
        )

    def get_some_json(self, url: str):
        scraper = self._create_scraper()
        if scraper is None:  # pragma: no cover - network dependency
            raise RuntimeError("cloudscraper is required for Yahoo fetch operations")
        some_html = scraper.get(url).text
        return json.loads(some_html)

    def make_date_url(self, yyyy_mm_dd: str) -> str:
        return (
            "https://graphite.sports.yahoo.com/v1/query/shangrila/"
            f"leagueGameIdsByDate?startRange={yyyy_mm_dd}&endRange={yyyy_mm_dd}&leagues=nba"
        )

    def get_yahoo_ids_for_date(self, nice_date: str):
        self._require_scraper()
        date_url = self.make_date_url(nice_date)
        date_html = self.scraper.get(date_url).text
        return set(re.findall(r"nba\.g\.202[\d]+", date_html))

    def fetch_yahoo_data(self, fetch_dir: str = "nba_scrapes/2024", start=START_DATE, end=END_DATE):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for fetch_yahoo_data() date range handling")

        os.makedirs(fetch_dir, exist_ok=True)
        date_range = pd.date_range(start, end).strftime("%Y-%m-%d")

        for date in date_range:
            print(f"STARTING {date}")
            yahoo_ids = self.get_yahoo_ids_for_date(date)
            time.sleep(2)

            for yahoo_game_id in yahoo_ids:
                cache_path = f"{fetch_dir}/{yahoo_game_id}.json"
                if os.path.exists(cache_path):
                    continue

                game_url = self.make_yahoo_json_url(yahoo_game_id)
                try:
                    game_json = self.get_some_json(game_url)
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(game_json, f)
                except Exception:
                    print(f"failed on {game_url}")
                    time.sleep(10)
                time.sleep(2)

            print(f"DONE WITH {date}")

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
                print(f"file: {filename} failed on {jsonpath_expression}")
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
        for season_name, season_range in self.SEASONS.items():
            base_dir = f"{self.BASE_DIR}/{season_name}"
            self.fetch_yahoo_data(base_dir, season_range[0], season_range[1])

    def rebuild_summary_csv(self):
        if pd is None:  # pragma: no cover - optional dependency
            raise RuntimeError("pandas is required for rebuild_summary_csv()")

        all_seasons = []
        for year in self.SEASONS.keys():
            print(f"doing {year}")
            start_time = time.time()

            year_dir = f"{self.BASE_DIR}/{year}"
            filenames = self.get_cached_filenames(year_dir)
            df = self.make_dataframe(filenames)
            df.to_csv(f"{self.BASE_DIR}/csv/{year}_odds.csv")

            print(f"took {time.time() - start_time}")
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
