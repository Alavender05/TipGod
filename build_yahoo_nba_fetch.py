from __future__ import annotations

import argparse
import logging
from datetime import datetime
from pathlib import Path

from scrape_yahoo import ScrapeYahoo, configure_logging
from yahoo_nba_config import DEFAULT_CONFIG


def raw_range_dir(start: str, end: str) -> Path:
    if start == end:
        return DEFAULT_CONFIG.raw_data_dir / start
    return DEFAULT_CONFIG.raw_data_dir / f"{start}_to_{end}"


def validate_date(value: str) -> str:
    datetime.strptime(value, "%Y-%m-%d")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch raw Yahoo NBA odds payloads into data/raw.")
    parser.add_argument("--start", required=True, type=validate_date, help="Start date in YYYY-MM-DD format")
    parser.add_argument("--end", type=validate_date, help="End date in YYYY-MM-DD format; defaults to --start")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Optional output directory. Defaults to data/raw/<date> or data/raw/<start>_to_<end>.",
    )
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    configure_logging(getattr(logging, args.log_level.upper(), logging.INFO))

    end = args.end or args.start
    output_dir = Path(args.output_dir) if args.output_dir else raw_range_dir(args.start, end)
    output_dir.mkdir(parents=True, exist_ok=True)

    scraper = ScrapeYahoo()
    summary = scraper.fetch_yahoo_data(
        fetch_dir=str(output_dir),
        start=datetime.strptime(args.start, "%Y-%m-%d"),
        end=datetime.strptime(end, "%Y-%m-%d"),
    )

    print(f"raw_output_dir: {output_dir}")
    print(f"fetched: {summary['fetched']}")
    print(f"cached: {summary['cached']}")
    print(f"fetch_failures: {len(summary['fetch_failures'])}")


if __name__ == "__main__":
    main()
