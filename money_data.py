"""Compatibility helpers for moneyline-focused analysis on normalized NBA rows."""

from __future__ import annotations

from typing import Iterable


def filter_moneyline_rows(rows: Iterable[dict]) -> list[dict]:
    """Return moneyline-only rows from normalized market options or edges."""

    return [dict(row) for row in rows if row.get("market_type") == "moneyline"]


def add_money_columns(rows: Iterable[dict]) -> list[dict]:
    """Compatibility helper for older notebooks expecting money-derived fields."""

    enriched: list[dict] = []
    for row in rows:
        item = dict(row)
        if item.get("market_type") == "moneyline":
            item["money_side"] = item.get("selection_kind")
            item["money_team"] = item.get("team")
        enriched.append(item)
    return enriched
