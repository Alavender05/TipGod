# TipGod Yahoo NBA Scraper

This repository contains an NBA-only Yahoo odds workflow that can run inside GitHub Codespaces. The supported Python path fetches raw Yahoo NBA game-market payloads, stores them under `data/raw`, parses supported full-game markets, and writes long-form outputs to `data/parsed`.

The repo also still contains separate Node/Playwright tooling for the `capping.pro` surface scanner. Codespaces bootstrap installs that tooling too, but the Yahoo NBA workflow remains Python-first.

Yahoo's live odds endpoint currently appears in more than one response shape. The supported parser path now handles both the older nested `data.data.games` layout used by fixtures and the live `data.games` layout seen during network fetches.

## Supported Yahoo NBA Scope

- league: NBA only
- source: Yahoo game odds endpoints
- supported markets:
  - full-game moneyline
  - full-game spread
  - full-game totals
- not supported:
  - player props and player-line parsing
  - unrelated sports

## Codespaces

### Open in Codespaces

1. Open the GitHub repository page.
2. Click `Code`.
3. Open the `Codespaces` tab.
4. Create a new Codespace.

The devcontainer uses:

- Python 3.11 on `mcr.microsoft.com/devcontainers/python:1-3.11-bullseye`
- one-step Python package install from `pyproject.toml`
- optional repo tooling bootstrap for Node/Playwright when `package.json` is present

Devcontainer config lives at [devcontainer.json](/workspaces/TipGod/.devcontainer/devcontainer.json).

## Install Dependencies

Inside the Codespace terminal:

```bash
python -m pip install -U pip
python -m pip install -e .
```

Compatibility install also works:

```bash
python -m pip install -r requirements.txt
```

Or use the Makefile:

```bash
make install
```

## Run the Yahoo NBA Scraper

Fetch raw Yahoo NBA odds for one date:

```bash
python build_yahoo_nba_fetch.py --start 2025-01-10
```

Fetch a date range:

```bash
python build_yahoo_nba_fetch.py --start 2025-01-10 --end 2025-01-12
```

Equivalent installed console script:

```bash
yahoo-nba-fetch --start 2025-01-10 --end 2025-01-12
```

Equivalent Makefile target:

```bash
make fetch START=2025-01-10 END=2025-01-12
```

Raw outputs are written to:

- `data/raw/<date>/...` for a single-date fetch
- `data/raw/<start>_to_<end>/...` for a range fetch

Each raw file is saved as a Yahoo payload JSON named by game id.

## Run the Parser

Parse all discovered raw Yahoo files into long-form outputs:

```bash
python build_yahoo_nba_longform.py
```

Parse from a specific raw root:

```bash
python build_yahoo_nba_longform.py --input-root data/raw
```

Equivalent installed console script:

```bash
yahoo-nba-parse
```

Equivalent Makefile target:

```bash
make parse
```

Parsed outputs are written to:

- `data/parsed/yahoo_nba_game_markets.csv`
- `data/parsed/yahoo_nba_game_markets.json`
- `data/parsed/yahoo_nba_game_markets.run-summary.json`

## Run Reports

Build the Markdown and CSV report outputs from parsed rows:

```bash
python build_yahoo_nba_report.py
```

Or:

```bash
yahoo-nba-report
```

Outputs are written to:

- `data/reports/`

## Yahoo NBA Dashboard

The primary dashboard entrypoint is now the root app on the original port. The default tab is still the existing approved-source capping.pro view, and Yahoo NBA is available as a second top-level tab in the same shell.

Required data files:

- `data/parsed/live_jsonl/normalized/games.jsonl`
- `data/parsed/live_jsonl/derived/edges.jsonl`

Generate them by running the Yahoo fetch and the patched live parser pipeline.

Serve the dashboard from repo root:

```bash
python3 -m http.server 8000
```

In a Codespace:

1. run the Yahoo fetch and parser pipeline
2. start the static server from repo root
3. open the forwarded port `8000`
4. open `/` or `/index.html`
5. click the `Yahoo NBA` tab

Primary dashboard URL:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/index.html`
- or the forwarded Codespaces port root URL

Compatibility URL:

- `/yahoo-dashboard.html` now redirects to `/index.html#yahoo`

The Yahoo tab is graphical and interactive:

- featured edge card
- ranked edge stack
- market, matchup, side, and edge-bucket filters
- market distribution
- matchup heatmap
- compact comparison table

The Yahoo tab auto-refreshes every 5 minutes in-browser. `Latest tipoff` means the latest scheduled game start across the full loaded slate, not the filtered rows and not the snapshot timestamp.

If you generate newer raw and parsed files while the page is open, the Yahoo tab will pick them up on the next poll or after a page reload.

Known dashboard limitations:

- it depends on the JSONL outputs from the live-compatible parser path, not the legacy CSV parser
- missing or stale JSONL files will show an empty/error state
- player props are not displayed
- all views remain NBA-only and game-market-only

## Tests

Run the Python tests:

```bash
python -m unittest discover -s tests -p 'test_*.py'
python -m unittest discover -s python_tests -p 'test_*.py'
```

Or:

```bash
make test
```

## Environment Variables

Optional environment overrides:

- `TIPGOD_RAW_DATA_DIR`
- `TIPGOD_PARSED_DATA_DIR`
- `TIPGOD_NORMALIZED_JSON_OUTPUT`
- `TIPGOD_NORMALIZED_CSV_OUTPUT`
- `TIPGOD_NORMALIZED_RUN_SUMMARY_OUTPUT`
- `TIPGOD_REPORT_DIR`
- `TIPGOD_DISCOVERY_DIR`
- `TIPGOD_FETCH_RETRY_ATTEMPTS`
- `TIPGOD_FETCH_RETRY_BACKOFF_SECONDS`
- `TIPGOD_FETCH_POLITE_SLEEP_SECONDS`
- `TIPGOD_REQUEST_TIMEOUT_SECONDS`

## Known Limitations

- Yahoo/network availability can still fail inside or outside Codespaces.
- `cloudscraper` is required for the live Yahoo fetch path.
- Yahoo can change payload structure again; the current parser explicitly supports both `data.games` and `data.data.games`.
- Player props are intentionally not parsed into supported outputs.
- The separate Node/Playwright tooling is installed in Codespaces for repo compatibility, but it is not part of the primary Yahoo NBA Python flow.
