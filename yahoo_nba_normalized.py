"""
Normalize Yahoo NBA game odds into long-form market rows.
"""

from __future__ import annotations

import csv
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from scrape_yahoo import ScrapeYahoo

SOURCE_NAME = "yahoo"
LEAGUE_NAME = "NBA"
FULL_GAME_PERIOD = "full_game"
OUTPUT_COLUMNS = [
    "source",
    "league",
    "event_id",
    "game_date",
    "scraped_at",
    "home_team",
    "away_team",
    "matchup_key",
    "market_type",
    "period",
    "selection",
    "line",
    "odds_american",
    "odds_decimal",
]

NBA_TEAMS = {
    "Atlanta",
    "Boston",
    "Brooklyn",
    "Charlotte",
    "Chicago",
    "Cleveland",
    "Dallas",
    "Denver",
    "Detroit",
    "Golden State",
    "Houston",
    "Indiana",
    "LA Clippers",
    "LA Lakers",
    "Memphis",
    "Miami",
    "Milwaukee",
    "Minnesota",
    "New Orleans",
    "New York",
    "Oklahoma City",
    "Orlando",
    "Philadelphia",
    "Phoenix",
    "Portland",
    "Sacramento",
    "San Antonio",
    "Toronto",
    "Utah",
    "Washington",
}

TEAM_ALIASES = {
    "Atlanta Hawks": "Atlanta",
    "Boston Celtics": "Boston",
    "Brooklyn Nets": "Brooklyn",
    "Charlotte Hornets": "Charlotte",
    "Chicago Bulls": "Chicago",
    "Cleveland Cavaliers": "Cleveland",
    "Dallas Mavericks": "Dallas",
    "Denver Nuggets": "Denver",
    "Detroit Pistons": "Detroit",
    "Golden State Warriors": "Golden State",
    "Houston Rockets": "Houston",
    "Indiana Pacers": "Indiana",
    "Los Angeles Clippers": "LA Clippers",
    "LA Clippers": "LA Clippers",
    "Los Angeles Lakers": "LA Lakers",
    "LA Lakers": "LA Lakers",
    "Memphis Grizzlies": "Memphis",
    "Miami Heat": "Miami",
    "Milwaukee Bucks": "Milwaukee",
    "Minnesota Timberwolves": "Minnesota",
    "New Orleans Pelicans": "New Orleans",
    "New York Knicks": "New York",
    "Oklahoma City Thunder": "Oklahoma City",
    "Orlando Magic": "Orlando",
    "Philadelphia 76ers": "Philadelphia",
    "Phoenix Suns": "Phoenix",
    "Portland Trail Blazers": "Portland",
    "Sacramento Kings": "Sacramento",
    "San Antonio Spurs": "San Antonio",
    "Toronto Raptors": "Toronto",
    "Utah Jazz": "Utah",
    "Washington Wizards": "Washington",
}


def american_to_decimal(odds_american) -> Optional[float]:
    odds = parse_american_odds(odds_american)
    if odds in (None, 0):
        return None
    if odds > 0:
        return round(1 + (odds / 100), 3)
    return round(1 + (100 / abs(odds)), 3)


def canonical_matchup_key(away_team: str, home_team: str) -> str:
    return f"{away_team}@{home_team}"


def normalize_team_name(raw_name) -> Optional[str]:
    if raw_name is None:
        return None
    value = " ".join(str(raw_name).split())
    if not value:
        return None
    canonical = TEAM_ALIASES.get(value, value)
    return canonical if canonical in NBA_TEAMS else None


def is_valid_nba_matchup(home_team: Optional[str], away_team: Optional[str]) -> bool:
    if not home_team or not away_team:
        return False
    if home_team == away_team:
        return False
    return home_team in NBA_TEAMS and away_team in NBA_TEAMS


def parse_decimal_odds(value) -> Optional[float]:
    if value is None:
        return None
    try:
        decimal = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return decimal if decimal > 1 else None


def parse_american_odds(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"[-+]?\d+", text)
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def parse_numeric_line(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def load_raw_yahoo_json(path: os.PathLike[str] | str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def infer_scraped_at(payload: dict, source_path: os.PathLike[str] | str | None = None) -> Optional[str]:
    meta_headers = payload.get("meta", {}).get("headers", {})
    for key in ("date", "Date", "last-modified", "Last-Modified"):
        value = meta_headers.get(key)
        if value:
            return str(value)

    if source_path:
        timestamp = os.path.getmtime(source_path)
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
    return None


def find_games(payload: dict) -> List[dict]:
    data = payload.get("data", {})
    if isinstance(data, dict):
        nested = data.get("data", {})
        if isinstance(nested, dict):
            games = nested.get("games")
            if isinstance(games, list):
                return [game for game in games if isinstance(game, dict)]
    return []


def extract_team_name(team_data: Optional[dict]) -> Optional[str]:
    if not isinstance(team_data, dict):
        return None
    for key in ("displayName", "name", "location"):
        value = team_data.get(key)
        normalized = normalize_team_name(value)
        if normalized:
            return normalized

    display = team_data.get("displayName")
    nickname = team_data.get("nickname")
    full_name = " ".join(part for part in [display, nickname] if part)
    return normalize_team_name(full_name)


def extract_game_context(game: dict, source_path: os.PathLike[str] | str | None = None) -> Optional[dict]:
    league = game.get("league", {}).get("shortName")
    if league and str(league).upper() != LEAGUE_NAME:
        return None

    away_team = extract_team_name(game.get("awayTeam"))
    home_team = extract_team_name(game.get("homeTeam"))
    if not is_valid_nba_matchup(home_team, away_team):
        return None

    event_id = game.get("gameId")
    if not event_id:
        return None

    game_date = game.get("startDate") or game.get("startTime")
    scraped_at = infer_scraped_at({"meta": game.get("meta", {})}, source_path)

    return {
        "source": SOURCE_NAME,
        "league": LEAGUE_NAME,
        "event_id": event_id,
        "game_date": game_date,
        "scraped_at": scraped_at,
        "home_team": home_team,
        "away_team": away_team,
        "matchup_key": canonical_matchup_key(away_team, home_team),
    }


def market_priority(market: dict) -> Tuple[int, int]:
    event_state = str(market.get("eventState") or "").upper()
    status = str(market.get("status") or "").upper()
    pregame_rank = 0 if event_state == "PREGAME" else 1
    status_rank = 0 if status in {"OPEN", "CLOSED"} else 1
    return (pregame_rank, status_rank)


def choose_market(game: dict, market_type: str, base_category: str) -> Optional[dict]:
    six_pack = game.get("gameLineSixPack") or []
    candidates = []
    for market in six_pack:
        if not isinstance(market, dict):
            continue
        if str(market.get("period") or "").upper() != "FULL_GAME":
            continue
        if str(market.get("eventState") or "").upper() != "PREGAME":
            continue
        if str(market.get("type") or "").upper() != market_type:
            continue
        if str(market.get("baseCategory") or "").upper() != base_category:
            continue
        candidates.append(market)

    if not candidates:
        return None
    return sorted(candidates, key=market_priority)[0]


def option_detail_value(option: dict, *keys: str) -> Optional[str]:
    details = option.get("optionDetails") or []
    for detail in details:
        if not isinstance(detail, dict):
            continue
        key = str(detail.get("key") or "").lower()
        if key in keys:
            value = detail.get("value")
            return None if value is None else str(value)
    return None


def infer_selection_from_option(option: dict, game_context: dict) -> Optional[str]:
    team_ids = option.get("teamIds") or []
    away_team_id = (
        option.get("_away_team_id")
        or game_context.get("_away_team_id")
    )
    home_team_id = (
        option.get("_home_team_id")
        or game_context.get("_home_team_id")
    )
    if away_team_id and away_team_id in team_ids:
        return "away"
    if home_team_id and home_team_id in team_ids:
        return "home"

    option_name = str(option.get("name") or "")
    if normalize_team_name(option_name) == game_context["away_team"]:
        return "away"
    if normalize_team_name(option_name) == game_context["home_team"]:
        return "home"
    return None


def build_row(game_context: dict, market_type: str, selection: str, line, odds_american, odds_decimal) -> dict:
    return {
        "source": game_context["source"],
        "league": game_context["league"],
        "event_id": game_context["event_id"],
        "game_date": game_context["game_date"],
        "scraped_at": game_context["scraped_at"],
        "home_team": game_context["home_team"],
        "away_team": game_context["away_team"],
        "matchup_key": game_context["matchup_key"],
        "market_type": market_type,
        "period": FULL_GAME_PERIOD,
        "selection": selection,
        "line": line,
        "odds_american": odds_american,
        "odds_decimal": odds_decimal,
    }


def extract_moneyline_rows(game: dict, game_context: dict) -> List[dict]:
    market = choose_market(game, "MONEY_LINE", "MONEY_LINE")
    if not market:
        return []

    rows = []
    for option in market.get("options") or []:
        if not isinstance(option, dict):
            continue
        selection = infer_selection_from_option(option, game_context)
        american = parse_american_odds(option.get("americanOdds"))
        decimal = parse_decimal_odds(option.get("decimalOdds")) or american_to_decimal(american)
        if selection and american is not None and decimal is not None:
            rows.append(build_row(game_context, "moneyline", selection, None, american, decimal))
    return rows if len(rows) == 2 else []


def extract_spread_rows(game: dict, game_context: dict) -> List[dict]:
    market = choose_market(game, "SPREAD", "SPREAD")
    if not market:
        return []

    rows = []
    for option in market.get("options") or []:
        if not isinstance(option, dict):
            continue
        selection = infer_selection_from_option(option, game_context)
        line = parse_numeric_line(option_detail_value(option, "points")) or parse_numeric_line(option.get("displayName")) or parse_numeric_line(option.get("name"))
        american = parse_american_odds(option.get("americanOdds"))
        decimal = parse_decimal_odds(option.get("decimalOdds")) or american_to_decimal(american)
        if selection and line is not None and american is not None and decimal is not None:
            rows.append(build_row(game_context, "spread", selection, line, american, decimal))
    return rows if len(rows) == 2 else []


def infer_total_selection(option: dict) -> Optional[str]:
    detail = option_detail_value(option, "over", "under")
    if detail is not None:
        keys = {str(d.get("key") or "").lower() for d in option.get("optionDetails") or [] if isinstance(d, dict)}
        if "over" in keys:
            return "over"
        if "under" in keys:
            return "under"

    option_name = str(option.get("name") or "").lower()
    if option_name.startswith("over"):
        return "over"
    if option_name.startswith("under"):
        return "under"
    display_name = str(option.get("displayName") or "").lower()
    if display_name.startswith("o "):
        return "over"
    if display_name.startswith("u "):
        return "under"
    return None


def extract_total_rows(game: dict, game_context: dict) -> List[dict]:
    market = choose_market(game, "OVER_UNDER", "TOTALS")
    if not market:
        return []

    rows = []
    for option in market.get("options") or []:
        if not isinstance(option, dict):
            continue
        selection = infer_total_selection(option)
        line = (
            parse_numeric_line(option_detail_value(option, "over", "under"))
            or parse_numeric_line(option.get("displayName"))
            or parse_numeric_line(option.get("name"))
        )
        american = parse_american_odds(option.get("americanOdds"))
        decimal = parse_decimal_odds(option.get("decimalOdds")) or american_to_decimal(american)
        if selection and line is not None and american is not None and decimal is not None:
            rows.append(build_row(game_context, "game_total", selection, line, american, decimal))
    return rows if len(rows) == 2 else []


def normalize_game_payload(payload: dict, source_path: os.PathLike[str] | str | None = None) -> List[dict]:
    rows: List[dict] = []
    for game in find_games(payload):
        game_context = extract_game_context(game, source_path=source_path)
        if not game_context:
            continue

        away_team_id = game.get("awayTeam", {}).get("teamId")
        home_team_id = game.get("homeTeam", {}).get("teamId")
        game_context["_away_team_id"] = away_team_id
        game_context["_home_team_id"] = home_team_id

        rows.extend(extract_moneyline_rows(game, game_context))
        rows.extend(extract_spread_rows(game, game_context))
        rows.extend(extract_total_rows(game, game_context))
    return rows


def normalize_file(path: os.PathLike[str] | str) -> List[dict]:
    payload = load_raw_yahoo_json(path)
    return normalize_game_payload(payload, source_path=path)


def discover_raw_files(base_dirs: Optional[Sequence[os.PathLike[str] | str]] = None) -> List[str]:
    if base_dirs:
        roots = [str(path) for path in base_dirs]
    else:
        roots = [ScrapeYahoo.BASE_DIR, "yahoo_scrapes"]

    files: List[str] = []
    for root in roots:
        if os.path.isdir(root):
            files.extend(ScrapeYahoo.enumerate_cached_filenames(root))
    return sorted(set(files))


def normalize_files(paths: Iterable[os.PathLike[str] | str]) -> Tuple[List[dict], Counter]:
    rows: List[dict] = []
    skipped = Counter()

    for path in paths:
        try:
            file_rows = normalize_file(path)
        except Exception:
            skipped["parse_error"] += 1
            continue

        if not file_rows:
            skipped["no_supported_markets"] += 1
            continue

        rows.extend(file_rows)

    return rows, skipped


def to_dataframe(rows: Sequence[dict]):
    try:
        import pandas as pd
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("pandas is required for DataFrame export") from exc
    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)


def write_json(rows: Sequence[dict], output_path: os.PathLike[str] | str):
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        json.dump(list(rows), handle, indent=2)


def write_csv(rows: Sequence[dict], output_path: os.PathLike[str] | str):
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column) for column in OUTPUT_COLUMNS})


def summarize_rows(rows: Sequence[dict]) -> Counter:
    counts = Counter()
    for row in rows:
        counts[row["market_type"]] += 1
    return counts
