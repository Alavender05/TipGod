"""Shared Yahoo odds collection primitives retained at the legacy path.

Despite the filename, this module now serves as the reusable Yahoo odds base layer.
The NBA pipeline builds on it from ``scrape_yahoo_nba.py``.
"""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

from scrape_rules import YAHOO_DATE_URL_TEMPLATE, YAHOO_GAME_URL_TEMPLATE
from scrape_utils import daterange, ensure_directory, save_json, utc_timestamp_slug

try:  # pragma: no cover - optional dependency
    import cloudscraper  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    cloudscraper = None


class YahooOddsBaseScraper:
    """Base Yahoo scraper with raw collection helpers and no sport-specific parsing."""

    BASE_DIR = Path("nba_scrapes")
    USER_AGENT = (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )

    def __init__(self, base_dir: str | Path | None = None, sleeper_seconds: float = 0.0):
        self.base_dir = Path(base_dir) if base_dir else self.BASE_DIR
        self.sleeper_seconds = sleeper_seconds
        self._cloudscraper = (
            cloudscraper.create_scraper() if cloudscraper is not None else None
        )

    def make_yahoo_json_url(self, game_id: str) -> str:
        """Build the Yahoo game-odds endpoint."""

        return YAHOO_GAME_URL_TEMPLATE.format(game_id=game_id)

    def make_date_url(self, yyyy_mm_dd: str) -> str:
        """Build the Yahoo date lookup endpoint."""

        return YAHOO_DATE_URL_TEMPLATE.format(date=yyyy_mm_dd)

    def fetch_text(self, url: str) -> str:
        """Fetch a text response using cloudscraper when available."""

        if self._cloudscraper is not None:  # pragma: no cover - network path
            response = self._cloudscraper.get(url)
            response.raise_for_status()
            return response.text

        request = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
        with urllib.request.urlopen(request) as response:  # pragma: no cover - network path
            return response.read().decode("utf-8")

    def fetch_json(self, url: str) -> dict:
        """Fetch and decode a JSON response."""

        return json.loads(self.fetch_text(url))

    def get_yahoo_ids_for_date(self, nice_date: str) -> set[str]:
        """Fetch game IDs for a single scoreboard date."""

        date_url = self.make_date_url(nice_date)
        date_html = self.fetch_text(date_url)
        return set(re.findall(r"nba\.g\.\d+", date_html))

    def raw_snapshot_dir(self, season: str, game_id: str) -> Path:
        """Return the per-game raw snapshot directory."""

        return self.base_dir / "raw" / season / game_id

    def save_raw_snapshot(
        self,
        payload: dict,
        *,
        game_id: str,
        season: str,
        snapshot_ts: str | None = None,
    ) -> Path:
        """Persist one raw Yahoo payload snapshot."""

        timestamp = snapshot_ts or utc_timestamp_slug()
        output_dir = ensure_directory(self.raw_snapshot_dir(season, game_id))
        output_path = output_dir / f"{timestamp}.json"
        save_json(output_path, payload)
        return output_path

    def fetch_game_snapshot(self, game_id: str) -> dict:
        """Fetch one game-level Yahoo odds payload."""

        return self.fetch_json(self.make_yahoo_json_url(game_id))

    def fetch_range(
        self,
        *,
        start: str | date | datetime,
        end: str | date | datetime,
        season: str | None = None,
    ) -> list[Path]:
        """Collect raw Yahoo snapshots for all dates in a range."""

        output_paths: list[Path] = []
        for game_date in daterange(start, end):
            date_key = game_date.strftime("%Y-%m-%d")
            resolved_season = season or self.season_from_calendar_date(game_date)
            for game_id in sorted(self.get_yahoo_ids_for_date(date_key)):
                payload = self.fetch_game_snapshot(game_id)
                snapshot_ts = utc_timestamp_slug(datetime.now(timezone.utc))
                output_paths.append(
                    self.save_raw_snapshot(
                        payload,
                        game_id=game_id,
                        season=resolved_season,
                        snapshot_ts=snapshot_ts,
                    )
                )
        return output_paths

    @staticmethod
    def season_from_calendar_date(game_date: date) -> str:
        """Map a calendar date into an NBA season key."""

        return str(game_date.year if game_date.month >= 7 else game_date.year - 1)


ScrapeYahoo = YahooOddsBaseScraper
