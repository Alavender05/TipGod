from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from yahoo_nba_config import DEFAULT_CONFIG


OPPORTUNITY_COLUMNS = [
    "event_id",
    "game_date",
    "matchup_key",
    "market_type",
    "period",
    "selection",
    "line",
    "odds_american",
    "odds_decimal",
    "edge_metric_name",
    "edge_metric_value",
    "rank_reason",
]


def load_rows(path: Path | str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError("Normalized dataset must be a JSON array of rows")
    return [row for row in data if isinstance(row, dict)]


def rank_opportunities(rows: Sequence[dict]) -> list[dict]:
    metric_candidates = ("edge", "edge_pct", "value", "value_pct")
    ranked = []
    for row in rows:
        metric_name = next((name for name in metric_candidates if isinstance(row.get(name), (int, float))), None)
        if metric_name is None:
            continue
        metric_value = row[metric_name]
        if metric_value <= 0:
            continue
        ranked.append(
            {
                "event_id": row.get("event_id"),
                "game_date": row.get("game_date"),
                "matchup_key": row.get("matchup_key"),
                "market_type": row.get("market_type"),
                "period": row.get("period"),
                "selection": row.get("selection"),
                "line": row.get("line"),
                "odds_american": row.get("odds_american"),
                "odds_decimal": row.get("odds_decimal"),
                "edge_metric_name": metric_name,
                "edge_metric_value": metric_value,
                "rank_reason": f"positive_{metric_name}",
            }
        )
    return sorted(ranked, key=lambda item: item["edge_metric_value"], reverse=True)


def build_run_summary(rows: Sequence[dict], diagnostics: Mapping[str, object] | None = None) -> dict:
    diagnostics = diagnostics or {}
    event_ids = {row.get("event_id") for row in rows if row.get("event_id")}
    rows_by_market = Counter()
    coverage_by_date = defaultdict(lambda: {"games": set(), "rows": 0})
    for row in rows:
        market_type = row.get("market_type") or "unknown"
        rows_by_market[market_type] += 1
        game_date = row.get("game_date") or "unknown"
        coverage_by_date[game_date]["rows"] += 1
        if row.get("event_id"):
            coverage_by_date[game_date]["games"].add(row["event_id"])

    ranked = rank_opportunities(rows)
    return {
        "dataset_file": str(DEFAULT_CONFIG.normalized_json_output),
        "generated_at": diagnostics.get("generated_at"),
        "report_generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "yahoo",
        "league": "NBA",
        "total_games_scraped": len(event_ids),
        "total_market_rows_parsed": len(rows),
        "rows_by_market_type": dict(rows_by_market),
        "coverage_by_date": {
            date: {"games": len(values["games"]), "rows": values["rows"]}
            for date, values in sorted(coverage_by_date.items())
        },
        "malformed_or_skipped_rows": diagnostics.get("skip_reasons", {}),
        "parse_failures": diagnostics.get("parse_failures", []),
        "fetch_failures": diagnostics.get("fetch_failures", []),
        "opportunity_count": len(ranked),
        "opportunity_ranking_available": bool(ranked),
        "notes": diagnostics.get("notes", []),
    }


def build_markdown_summary(summary: Mapping[str, object]) -> str:
    lines = [
        "# Yahoo NBA Run Summary",
        "",
        f"- Total games scraped: {summary['total_games_scraped']}",
        f"- Total market rows parsed: {summary['total_market_rows_parsed']}",
        f"- Opportunity ranking available: {summary['opportunity_ranking_available']}",
        "",
        "## Rows by Market Type",
    ]
    rows_by_market = summary.get("rows_by_market_type", {})
    if rows_by_market:
        for market_type, count in rows_by_market.items():
            lines.append(f"- {market_type}: {count}")
    else:
        lines.append("- none")

    lines.extend(["", "## Coverage by Date"])
    coverage = summary.get("coverage_by_date", {})
    if coverage:
        for game_date, values in coverage.items():
            lines.append(f"- {game_date}: {values['games']} games, {values['rows']} rows")
    else:
        lines.append("- none")

    lines.extend(["", "## Malformed / Skipped"])
    skipped = summary.get("malformed_or_skipped_rows", {})
    if skipped:
        for reason, count in skipped.items():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- none")

    lines.extend(["", "## Failures"])
    parse_failures = summary.get("parse_failures", [])
    fetch_failures = summary.get("fetch_failures", [])
    lines.append(f"- Parse failures: {len(parse_failures)}")
    lines.append(f"- Fetch failures: {len(fetch_failures)}")

    lines.extend(["", "## Opportunities"])
    if summary.get("opportunity_ranking_available"):
        lines.append(f"- Ranked opportunities: {summary['opportunity_count']}")
    else:
        lines.append("- No edge metrics were available, so no ranked opportunities were produced.")

    notes = summary.get("notes", [])
    if notes:
        lines.extend(["", "## Notes"])
        for note in notes:
            lines.append(f"- {note}")
    return "\n".join(lines) + "\n"


def write_run_summary_json(summary: Mapping[str, object], output_path: Path | str) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)


def write_markdown_summary(markdown: str, output_path: Path | str) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown, encoding="utf-8")


def write_opportunities_csv(opportunities: Iterable[Mapping[str, object]], output_path: Path | str) -> None:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OPPORTUNITY_COLUMNS)
        writer.writeheader()
        for opportunity in opportunities:
            writer.writerow({column: opportunity.get(column) for column in OPPORTUNITY_COLUMNS})
