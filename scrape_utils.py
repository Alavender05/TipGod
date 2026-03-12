"""Shared utilities for the NBA Yahoo odds pipeline."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Iterator, Mapping, Sequence

try:  # pragma: no cover - optional dependency
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError:  # pragma: no cover - optional dependency
    pa = None
    pq = None


class ParquetDependencyError(RuntimeError):
    """Raised when parquet output is requested without an installed backend."""


@dataclass(frozen=True)
class DatasetBundle:
    """In-memory output of the normalized Yahoo pipeline."""

    games: list[dict]
    market_options: list[dict]
    edges: list[dict]


def ensure_directory(path: Path) -> Path:
    """Create a directory if it does not already exist."""

    path.mkdir(parents=True, exist_ok=True)
    return path


def parse_iso_date(value: str | date | datetime) -> date:
    """Normalize supported date inputs into a ``date`` instance."""

    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()


def daterange(start: str | date | datetime, end: str | date | datetime) -> Iterator[date]:
    """Yield calendar dates from ``start`` to ``end`` inclusive."""

    current = parse_iso_date(start)
    final = parse_iso_date(end)
    while current <= final:
        yield current
        current += timedelta(days=1)


def utc_timestamp_slug(now: datetime | None = None) -> str:
    """Return a filesystem-safe UTC timestamp."""

    current = now or datetime.now(timezone.utc)
    return current.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def json_dumps(payload: object) -> str:
    """Write stable JSON for fixtures and raw snapshots."""

    return json.dumps(payload, indent=2, sort_keys=True)


def load_json(path: str | Path) -> dict:
    """Load a JSON file into a Python dictionary."""

    return json.loads(Path(path).read_text())


def save_json(path: str | Path, payload: object) -> Path:
    """Write JSON data to disk."""

    output_path = Path(path)
    ensure_directory(output_path.parent)
    output_path.write_text(json_dumps(payload) + "\n")
    return output_path


def coerce_float(value: object) -> float | None:
    """Convert supported numeric input into ``float``."""

    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def coerce_int(value: object) -> int | None:
    """Convert supported numeric input into ``int``."""

    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(str(value)))
        except (TypeError, ValueError):
            return None


def american_to_decimal(american_odds: int | float | None) -> float | None:
    """Convert American odds into decimal odds."""

    if american_odds in (None, 0):
        return None
    american = float(american_odds)
    if american > 0:
        return round(1.0 + (american / 100.0), 6)
    return round(1.0 + (100.0 / abs(american)), 6)


def decimal_to_implied_probability(decimal_odds: float | None) -> float | None:
    """Convert decimal odds into implied probability."""

    if decimal_odds is None or decimal_odds <= 1.0:
        return None
    return round(1.0 / decimal_odds, 8)


def american_to_implied_probability(american_odds: int | float | None) -> float | None:
    """Convert American odds directly into implied probability."""

    if american_odds in (None, 0):
        return None
    american = float(american_odds)
    if american > 0:
        return round(100.0 / (american + 100.0), 8)
    return round(abs(american) / (abs(american) + 100.0), 8)


def implied_probability(
    american_odds: int | float | None = None,
    decimal_odds: float | None = None,
) -> float | None:
    """Return implied probability using whichever price is available."""

    if american_odds not in (None, 0):
        return american_to_implied_probability(american_odds)
    return decimal_to_implied_probability(decimal_odds)


def normalize_probabilities(probabilities: Sequence[float | None]) -> list[float | None]:
    """Remove vig by normalizing a probability pair or set."""

    valid = [value for value in probabilities if value is not None]
    if not valid:
        return [None for _ in probabilities]
    total = sum(valid)
    if total <= 0:
        return [None for _ in probabilities]
    return [
        round((value / total), 8) if value is not None else None
        for value in probabilities
    ]


def probability_to_decimal(probability: float | None) -> float | None:
    """Convert a fair probability into decimal odds."""

    if probability is None or probability <= 0:
        return None
    return round(1.0 / probability, 6)


def probability_to_american(probability: float | None) -> int | None:
    """Convert a fair probability into American odds."""

    if probability is None or probability <= 0 or probability >= 1:
        return None
    if probability >= 0.5:
        return int(round(-(probability / (1.0 - probability)) * 100))
    return int(round(((1.0 - probability) / probability) * 100))


def extract_option_detail(details: Sequence[Mapping[str, object]], key: str) -> str | None:
    """Get an option detail value by key from Yahoo's detail array."""

    for detail in details:
        if detail.get("key") == key:
            value = detail.get("value")
            return str(value) if value is not None else None
    return None


def season_for_game_date(start_date: str | None) -> str:
    """Map a Yahoo game date string to an NBA season bucket."""

    if not start_date:
        return "unknown"
    parsed = datetime.strptime(start_date[:10], "%Y-%m-%d")
    if parsed.month >= 7:
        return str(parsed.year)
    return str(parsed.year - 1)


def records_to_columns(records: Sequence[Mapping[str, object]]) -> dict[str, list[object]]:
    """Convert row-oriented records into column arrays for parquet serialization."""

    keys: list[str] = []
    seen: set[str] = set()
    for row in records:
        for key in row:
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return {key: [row.get(key) for row in records] for key in keys}


def write_parquet(path: str | Path, records: Sequence[Mapping[str, object]]) -> Path:
    """Persist records as parquet using pyarrow when available."""

    if pa is None or pq is None:
        raise ParquetDependencyError(
            "Parquet output requires pyarrow. Install it before writing .parquet datasets."
        )
    output_path = Path(path)
    ensure_directory(output_path.parent)
    table = pa.table(records_to_columns(records))
    pq.write_table(table, output_path)
    return output_path


def write_jsonl(path: str | Path, records: Sequence[Mapping[str, object]]) -> Path:
    """Persist records as newline-delimited JSON."""

    output_path = Path(path)
    ensure_directory(output_path.parent)
    with output_path.open("w", encoding="utf-8") as handle:
        for row in records:
            handle.write(json.dumps(row, sort_keys=True))
            handle.write("\n")
    return output_path


def flatten_market_groups(records: Iterable[Sequence[Mapping[str, object]]]) -> list[dict]:
    """Flatten a nested iterable of records."""

    flattened: list[dict] = []
    for group in records:
        for row in group:
            flattened.append(dict(row))
    return flattened


def rounded(value: float | None, digits: int = 8) -> float | None:
    """Round floats while preserving ``None``."""

    if value is None:
        return None
    if math.isnan(value):
        return None
    return round(value, digits)
