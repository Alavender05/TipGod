"""Compatibility helpers for spread-focused analysis on normalized NBA rows."""

from __future__ import annotations

from typing import Iterable


def filter_spread_rows(rows: Iterable[dict]) -> list[dict]:
    """Return spread-only rows from normalized market options or edges."""

    return [dict(row) for row in rows if row.get("market_type") == "spread"]


def add_spread_columns(rows: Iterable[dict]) -> list[dict]:
    """Compatibility helper for older notebooks expecting spread-derived fields."""

    enriched: list[dict] = []
    for row in rows:
        item = dict(row)
        if item.get("market_type") == "spread":
            item["spread_points"] = item.get("line")
            item["spread_side"] = item.get("selection_kind")
        enriched.append(item)
    return enriched
