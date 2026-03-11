from __future__ import annotations

from pathlib import Path

from yahoo_nba_normalized import (
    discover_raw_files,
    normalize_files,
    summarize_rows,
    write_csv,
    write_json,
)


DEFAULT_JSON_OUTPUT = Path("data/normalized/yahoo_nba_game_markets.json")
DEFAULT_CSV_OUTPUT = Path("data/normalized/yahoo_nba_game_markets.csv")


def main():
    raw_files = discover_raw_files()
    rows, skipped = normalize_files(raw_files)

    write_json(rows, DEFAULT_JSON_OUTPUT)
    write_csv(rows, DEFAULT_CSV_OUTPUT)

    counts = summarize_rows(rows)
    print(f"Raw files scanned: {len(raw_files)}")
    print(f"Normalized rows written: {len(rows)}")
    for market_type in ("moneyline", "spread", "game_total"):
        print(f"{market_type}: {counts.get(market_type, 0)}")
    for reason, count in sorted(skipped.items()):
        print(f"skipped_{reason}: {count}")
    print(f"JSON output: {DEFAULT_JSON_OUTPUT}")
    print(f"CSV output: {DEFAULT_CSV_OUTPUT}")


if __name__ == "__main__":
    main()
