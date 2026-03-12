# TipGod NBA Yahoo Odds Pipeline

This repo now contains an NBA-only Yahoo odds pipeline that keeps raw Yahoo responses, parses supported game markets, normalizes them into long-form datasets, and derives no-vig edge math.

## Scope

- Source: Yahoo game-odds endpoints
- League: NBA only
- Supported markets in v1:
  - full-game moneyline
  - full-game spread
  - full-game totals
- Deferred for later:
  - player lines and player props

## Layout

- [scrape_yahoo_nfl.py](/workspaces/TipGod/scrape_yahoo_nfl.py): shared Yahoo collection/base layer retained at the legacy path
- [scrape_yahoo_nba.py](/workspaces/TipGod/scrape_yahoo_nba.py): NBA parser, normalizer, edge calculations, and CLI
- [scrape_rules.py](/workspaces/TipGod/scrape_rules.py): NBA/Yahoo parsing constants
- [scrape_utils.py](/workspaces/TipGod/scrape_utils.py): odds math, JSON helpers, optional parquet writer
- [archive/notebooks_backup](/workspaces/TipGod/archive/notebooks_backup): preserved notebook/data artifacts that used to occupy runtime module paths

## Outputs

Raw snapshots are stored under:

- `nba_scrapes/raw/<season>/<game_id>/<timestamp>.json`

Normalized and derived outputs default to:

- `nba_scrapes/normalized/games.parquet`
- `nba_scrapes/normalized/market_options.parquet`
- `nba_scrapes/derived/edges.parquet`

If `pyarrow` is unavailable, the CLI can still write `.jsonl` datasets for local validation.

## Usage

Install Python dependencies when network access is available:

```bash
python -m pip install -r requirements.txt
```

Fetch raw Yahoo snapshots:

```bash
python scrape_yahoo_nba.py fetch --start 2025-01-10 --end 2025-01-10
```

Build datasets from saved raw snapshots:

```bash
python scrape_yahoo_nba.py build --format parquet
```

Or write JSONL when parquet dependencies are not installed:

```bash
python scrape_yahoo_nba.py build --format jsonl
```

## Tests

Run the offline Python tests with:

```bash
python -m unittest discover -s python_tests -p 'test_*.py'
```
