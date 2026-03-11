from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from scrape_yahoo import configure_logging
from yahoo_nba_config import DEFAULT_CONFIG
from yahoo_nba_reporting import (
    build_markdown_summary,
    build_run_summary,
    load_rows,
    rank_opportunities,
    write_markdown_summary,
    write_opportunities_csv,
    write_run_summary_json,
)


def main():
    parser = argparse.ArgumentParser(description="Build Yahoo NBA run reports from normalized rows.")
    parser.add_argument("--input", default=str(DEFAULT_CONFIG.normalized_json_output))
    parser.add_argument("--diagnostics", default=str(DEFAULT_CONFIG.normalized_run_summary_output))
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    configure_logging(getattr(logging, args.log_level.upper(), logging.INFO))

    rows = load_rows(args.input)
    diagnostics = {}
    diagnostics_path = Path(args.diagnostics)
    if diagnostics_path.exists():
        diagnostics = json.loads(diagnostics_path.read_text(encoding="utf-8"))

    summary = build_run_summary(rows, diagnostics)
    markdown = build_markdown_summary(summary)
    opportunities = rank_opportunities(rows)

    stem = Path(args.input).stem
    report_dir = DEFAULT_CONFIG.report_dir
    write_run_summary_json(summary, report_dir / f"{stem}.run-summary.json")
    write_markdown_summary(markdown, report_dir / f"{stem}.summary.md")
    write_opportunities_csv(opportunities, report_dir / f"{stem}.opportunities.csv")

    print(f"rows: {summary['total_market_rows_parsed']}")
    print(f"games: {summary['total_games_scraped']}")
    print(f"opportunities: {summary['opportunity_count']}")


if __name__ == "__main__":
    main()
