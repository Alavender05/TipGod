from __future__ import annotations

import argparse
import logging

from scrape_yahoo import configure_logging
from yahoo_nba_config import DEFAULT_CONFIG
from yahoo_nba_normalized import (
    discover_raw_files,
    normalize_files_with_diagnostics,
    summarize_rows,
    write_csv,
    write_diagnostics,
    write_json,
)


def main():
    parser = argparse.ArgumentParser(description="Build long-form Yahoo NBA game-market outputs from cached raw files.")
    parser.add_argument(
        "--input-root",
        action="append",
        dest="input_roots",
        default=None,
        help="Optional raw root to scan. Can be passed multiple times. Defaults to configured cache roots.",
    )
    parser.add_argument("--json-output", default=str(DEFAULT_CONFIG.normalized_json_output))
    parser.add_argument("--csv-output", default=str(DEFAULT_CONFIG.normalized_csv_output))
    parser.add_argument("--run-summary-output", default=str(DEFAULT_CONFIG.normalized_run_summary_output))
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    configure_logging(getattr(logging, args.log_level.upper(), logging.INFO))

    raw_files = discover_raw_files(args.input_roots)
    rows, diagnostics = normalize_files_with_diagnostics(raw_files)

    write_json(rows, args.json_output)
    write_csv(rows, args.csv_output)
    write_diagnostics(diagnostics, args.run_summary_output)

    counts = summarize_rows(rows)
    print(f"Raw files scanned: {len(raw_files)}")
    print(f"Normalized rows written: {len(rows)}")
    for market_type in DEFAULT_CONFIG.supported_market_types:
        print(f"{market_type}: {counts.get(market_type, 0)}")
    for reason, count in sorted(diagnostics.get("skip_reasons", {}).items()):
        print(f"skipped_{reason}: {count}")
    print(f"JSON output: {args.json_output}")
    print(f"CSV output: {args.csv_output}")
    print(f"Run summary: {args.run_summary_output}")


if __name__ == "__main__":
    main()
