# TipGod

## Project Status

This repository is in an active transition from a legacy `capping.pro`-driven NBA workflow to a first-party Yahoo-backed NBA odds pipeline.

The repo is NBA-only for the current direction of work, but it still contains two materially different code paths:
- a legacy JavaScript path built around `capping.pro` scanning, enrichment, and frontend presentation
- a newer Python path built around Yahoo odds payload collection and long-form normalization

An LLM or engineer opening this repo cold should treat it as a mixed-history codebase. Not every file is equally authoritative. Some files are active implementation paths, some are legacy production artifacts, and some are notebook or export references.

## Why This Repo Exists

The practical goal of the current project is to build a maintainable NBA odds data pipeline that:
- uses Yahoo as the initial upstream source
- preserves raw payloads for replay/debugging/history
- normalizes game markets into analysis-ready long-form datasets
- supports later additions such as edge/value calculations, reporting, and eventually player-prop discovery and parsing

The repo is not yet fully in that end state. It is partway through the transition.

## Context History

This repo did not begin as a clean Yahoo pipeline.

Historically, it accumulated several layers of work:
- JavaScript scanners and data products tied to `capping.pro`
- frontend files that consume those JS-generated datasets
- notebooks and scratch files used to inspect Yahoo data and derive parsing approaches
- older Python scraping logic that existed, but was spread across inconsistent or misleading filenames
- generated artifacts and archived experiments left in the tree for reference

`capping.pro` was the older primary surface/UI path. That path is still present in the repo and still matters for understanding the frontend, but it is not the long-term direction of the data pipeline.

Yahoo scraping logic existed before the current cleanup, but it was fragmented. Some logic lived in notebook exports. Some files had names that suggested executable modules but were actually notebook JSON or artifact dumps. Some responsibilities were mixed together, such as transport, parsing, exports, and exploratory helpers.

The current Yahoo-first work is intentionally incremental. The repo is not being rebuilt from scratch. The strategy has been:
- preserve any working Yahoo fetch behavior that already existed
- create clearer source-of-truth Python files for current work
- add testable, long-form normalization for core game markets
- leave legacy `capping.pro` assets intact until the Yahoo path is mature enough to replace them

As of the current repo state, both histories still coexist:
- the legacy JS data products and frontend are still in the tree and still useful for historical context
- the newer Python Yahoo normalization path is the preferred direction for future NBA odds pipeline work

This means an LLM should not assume the largest or oldest files are the most authoritative. The preferred implementation path is now concentrated in a small number of Python files described below.

## Current Source of Truth

For Yahoo NBA work, the current source of truth is:

- [scrape_yahoo.py](/workspaces/TipGod/scrape_yahoo.py)
  Yahoo transport and cache entrypoint. This is the preferred starting point for Yahoo raw fetch behavior, URL construction, and raw cache enumeration.

- [yahoo_nba_normalized.py](/workspaces/TipGod/yahoo_nba_normalized.py)
  Current source of truth for normalized Yahoo NBA game-market parsing. This is the preferred file for understanding the long-form market row schema and current extraction logic.

- [build_yahoo_nba_longform.py](/workspaces/TipGod/build_yahoo_nba_longform.py)
  Current CLI entrypoint for rebuilding normalized Yahoo outputs from cached raw payloads.

- [tests/test_yahoo_nba_normalized.py](/workspaces/TipGod/tests/test_yahoo_nba_normalized.py)
  Current Python verification path for helper functions, normalization behavior, and output writing.

If future Yahoo NBA work is being resumed, these are the preferred files to inspect first.

## What Works Today

What is currently implemented and usable:
- fixture-backed normalization for Yahoo NBA full-game `moneyline`, `spread`, and `game_total`
- JSON and CSV writing for normalized long-form output
- pure-function tests for key helpers and normalization behavior
- rebuild of normalized outputs from cache, if raw Yahoo files exist in expected directories

What does not currently work end-to-end in this workspace:
- there is no checked-in raw Yahoo cache
- live Yahoo fetch execution is not confirmed in the current environment
- there is no player-prop parser
- there is no completed edge/reporting layer in the Yahoo Python path yet

The current normalized outputs do exist in the repo:
- [yahoo_nba_game_markets.json](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.json)
- [yahoo_nba_game_markets.csv](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.csv)

Because no raw cache is checked in, those outputs may be empty unless rebuilt from available fixtures or future cached Yahoo payloads.

## How Data Flows

The intended current Yahoo pipeline is:

`Yahoo date lookup -> Yahoo game ids -> raw Yahoo game odds JSON payloads -> cached raw files -> long-form normalized market rows -> downstream analysis/reporting layers`

In current implementation terms:
- Yahoo transport and cache access are handled in [scrape_yahoo.py](/workspaces/TipGod/scrape_yahoo.py)
- long-form parsing of supported full-game markets is handled in [yahoo_nba_normalized.py](/workspaces/TipGod/yahoo_nba_normalized.py)
- normalization rebuilds are orchestrated by [build_yahoo_nba_longform.py](/workspaces/TipGod/build_yahoo_nba_longform.py)

The implemented pipeline currently stops at normalized long-form game-market outputs. Player props, edge calculations, and reporting layers are planned but not completed in the active Yahoo Python path.

## Repository Map

### Active Yahoo Python Path

- [scrape_yahoo.py](/workspaces/TipGod/scrape_yahoo.py): Yahoo transport, raw fetch helpers, cache enumeration, and compatibility helpers
- [yahoo_nba_normalized.py](/workspaces/TipGod/yahoo_nba_normalized.py): long-form game-market normalization
- [build_yahoo_nba_longform.py](/workspaces/TipGod/build_yahoo_nba_longform.py): normalization CLI
- [tests/test_yahoo_nba_normalized.py](/workspaces/TipGod/tests/test_yahoo_nba_normalized.py): Python fixture tests
- [tests/fixtures/yahoo_nba_game_sample.json](/workspaces/TipGod/tests/fixtures/yahoo_nba_game_sample.json): local fixture for normalization tests

### Legacy JS / Frontend Path

- [scan-capping-pro-nba-surfaces.js](/workspaces/TipGod/scan-capping-pro-nba-surfaces.js): legacy `capping.pro` scan/data generation path
- [enrich-moneyline.js](/workspaces/TipGod/enrich-moneyline.js): legacy enrichment path for bookmaker-related outputs
- [app.js](/workspaces/TipGod/app.js): frontend data consumption and UI state logic for legacy datasets
- [types/moneyline-enrichment.ts](/workspaces/TipGod/types/moneyline-enrichment.ts): TypeScript contracts for the legacy frontend/enrichment layer

### Notebooks / Archive / Reference Material

- [scrape_yahoo_nba.py](/workspaces/TipGod/scrape_yahoo_nba.py): notebook/export-style reference, not current source of truth
- [scrape_yahoo.ipynb](/workspaces/TipGod/scrape_yahoo.ipynb): exploratory Yahoo inspection notebook
- [explore_nba_2026.ipynb](/workspaces/TipGod/explore_nba_2026.ipynb): exploratory analysis notebook
- [archive](/workspaces/TipGod/archive): older scans and summaries kept for reference

### Generated Outputs

- [yahoo_nba_game_markets.json](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.json): normalized Yahoo rows in JSON format
- [yahoo_nba_game_markets.csv](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.csv): normalized Yahoo rows in CSV format
- [capping-pro-nba-surfaces.json](/workspaces/TipGod/capping-pro-nba-surfaces.json): legacy generated dataset for the JS/frontend path

## Legacy / Ignore For Now

Warning: several files in this repo are useful historical references but should not be treated as the authoritative implementation path for current Yahoo NBA work.

Treat the following as reference-only unless there is a specific reason to inspect them:
- [scrape_yahoo_nba.py](/workspaces/TipGod/scrape_yahoo_nba.py)
  This is historically useful for understanding Yahoo payload examples, but it is not the preferred executable source-of-truth path.

- notebook exports and exploratory notebooks
  These can contain valuable payload fragments and prior reasoning, but they are not the current maintained pipeline.

- legacy `capping.pro` JS scanner/frontend files when working on Yahoo normalization
  These remain relevant for the old frontend and data products, but they are not the preferred implementation path for first-party Yahoo normalization work.

- archived output files and summaries
  These may help reconstruct prior behavior, but they should not drive current implementation decisions unless the active path is missing something.

When resuming Yahoo NBA work, start from the `Current Source of Truth` section above, not from the largest legacy file in the repo.

## Running Locally

Current commands that exist and are valid in this repo today:

```bash
python3 -m unittest tests/test_yahoo_nba_normalized.py
python3 build_yahoo_nba_longform.py
```

Important local execution notes:
- live Yahoo fetching may require optional Python dependencies that are not installed in every environment
- no checked-in raw Yahoo cache exists in this workspace
- rebuilds can therefore produce empty normalized outputs even when the command itself succeeds
- the Python test path is fixture-based and does not require live Yahoo access

## Expected Inputs and Outputs

### Expected Raw Inputs

The current Yahoo normalization path expects cached raw Yahoo payloads in directories such as:
- `nba_scrapes/`
- `yahoo_scrapes/`

Those directories are expected to contain per-game JSON payload files when available.

### Current Generated Outputs

- [yahoo_nba_game_markets.json](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.json)
- [yahoo_nba_game_markets.csv](/workspaces/TipGod/data/normalized/yahoo_nba_game_markets.csv)

### Current Normalized Row Shape

The active Yahoo normalized row model currently includes:
- `source`
- `league`
- `event_id`
- `game_date`
- `scraped_at`
- `home_team`
- `away_team`
- `matchup_key`
- `market_type`
- `period`
- `selection`
- `line`
- `odds_american`
- `odds_decimal`

This is the current interface an LLM should assume when reasoning about downstream Yahoo game-market data in the repo.

## Known Gaps

- no checked-in raw Yahoo cache is present in this workspace
- live Yahoo fetches are not documented as fully verified in the current environment
- no player-prop parser exists in the active Yahoo Python path
- no completed edge/value layer exists in the active Yahoo Python path
- no completed reporting layer exists in the active Yahoo Python path
- some repo files still have mixed historical responsibilities or exist mainly as references

## Immediate Next Steps

The likely next layers of Yahoo NBA work are:
- player-prop discovery against Yahoo payloads
- edge and odds-math expansion beyond basic normalized rows
- reporting outputs and run summaries for the Yahoo path
- reliability and developer-experience cleanup around config, logging, validation, and retries

Those next steps should continue from the current source-of-truth Python files rather than reopening older notebook/export-based parsing paths.
