# TipGod

This repository is currently in a transition state.

It is NBA-only, but it contains two parallel histories:
- a legacy `capping.pro` scraping, enrichment, and UI flow in JavaScript
- a newer Yahoo-first Python pipeline for first-party NBA odds data

The current direction is to move away from `capping.pro` dependencies and build a maintainable Yahoo-backed NBA odds pipeline with raw payload retention, normalized long-form datasets, and follow-on analysis layers.

## Context / History

The original repo mixed several kinds of work:
- legacy `capping.pro` scanners and UI/reporting assets
- notebook experiments and exported artifacts
- Yahoo scraping code that existed, but was spread across inconsistent files and older parsing paths

The current refactor is incremental rather than a rewrite. The goal is to preserve any working Yahoo fetch behavior while introducing a cleaner Python path for normalized NBA game markets.

Recent Yahoo-focused changes in the repo introduced:
- [scrape_yahoo.py](/workspaces/TipGod/scrape_yahoo.py) for reusable Yahoo transport and cache helpers
- [yahoo_nba_normalized.py](/workspaces/TipGod/yahoo_nba_normalized.py) for long-form normalization of NBA game markets
- [build_yahoo_nba_longform.py](/workspaces/TipGod/build_yahoo_nba_longform.py) for rebuilding normalized outputs from cached Yahoo payloads
- [tests/test_yahoo_nba_normalized.py](/workspaces/TipGod/tests/test_yahoo_nba_normalized.py) for fixture-based Python tests

## Current Pipeline

The current Yahoo Python workflow is:
1. discover or fetch raw Yahoo NBA game odds payloads
2. read cached raw JSON files
3. normalize full-game `moneyline`, `spread`, and `game_total` markets into long-form rows
4. write normalized outputs to `data/normalized/`

Current normalized outputs:
- [yahoo_nba_game_markets.json](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.json)
- [yahoo_nba_game_markets.csv](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.csv)

Player props are not parsed yet. Current Yahoo work is limited to full-game NBA markets.

## Repository Map

- [scrape_yahoo.py](/workspaces/TipGod/scrape_yahoo.py): Yahoo transport, raw fetch helpers, cache enumeration, and legacy compatibility helpers
- [yahoo_nba_normalized.py](/workspaces/TipGod/yahoo_nba_normalized.py): long-form normalization for NBA game markets
- [build_yahoo_nba_longform.py](/workspaces/TipGod/build_yahoo_nba_longform.py): CLI for rebuilding normalized Yahoo outputs
- [tests/test_yahoo_nba_normalized.py](/workspaces/TipGod/tests/test_yahoo_nba_normalized.py): Python fixture tests for pure normalization helpers and exports
- [scan-capping-pro-nba-surfaces.js](/workspaces/TipGod/scan-capping-pro-nba-surfaces.js): legacy `capping.pro` scan pipeline still present in the repo
- [app.js](/workspaces/TipGod/app.js): legacy frontend/data consumption path still present in the repo

## Running Locally

Current local commands that exist in the repo today:

```bash
python3 -m unittest tests/test_yahoo_nba_normalized.py
python3 build_yahoo_nba_longform.py
```

Notes:
- normalized outputs write to `data/normalized/yahoo_nba_game_markets.json` and `data/normalized/yahoo_nba_game_markets.csv`
- live Yahoo fetching may require optional Python dependencies that are not installed in every environment
- raw cache directories such as `nba_scrapes/` or `yahoo_scrapes/` are not currently checked into this workspace
- the build command still runs without a checked-in cache, but it will produce empty normalized outputs

## Known Gaps / Next Steps

- there is no checked-in raw Yahoo cache in this workspace
- there is no player-prop parser yet
- edge calculation, reporting, and reliability improvements are still in progress
- some legacy files in the repo are notebook exports or data artifacts and are not part of the new Python path
- the legacy `capping.pro` JS flow still exists alongside the newer Yahoo-first Python work
