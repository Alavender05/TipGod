from __future__ import annotations

import logging

from scrape_yahoo import configure_logging
from yahoo_nba_config import DEFAULT_CONFIG
from yahoo_nba_normalized import discover_raw_files
from yahoo_nba_prop_discovery import discover_from_files, write_discovery_artifacts


def main():
    configure_logging(logging.INFO)
    raw_files = discover_raw_files()
    result = discover_from_files(raw_files)
    write_discovery_artifacts(result, DEFAULT_CONFIG.discovery_dir)
    print(f"raw_files: {len(raw_files)}")
    print(f"markets_found: {result['summary']['markets_found']}")


if __name__ == "__main__":
    main()
