# Workspace Categories

This file is a quick triage map for the current repo layout. It is intended to
reduce cold-start time when opening the workspace and to distinguish active code
from legacy/reference material.

## Active Yahoo Python Path

These files are the current source of truth for first-party Yahoo NBA work:

- `scrape_yahoo.py`
- `yahoo_nba_normalized.py`
- `build_yahoo_nba_longform.py`
- `tests/test_yahoo_nba_normalized.py`
- `tests/fixtures/yahoo_nba_game_sample.json`

## Legacy JS / Frontend Path

These files support the older `capping.pro`-driven workflow and frontend:

- `scan-capping-pro-nba-surfaces.js`
- `enrich-moneyline.js`
- `app.js`
- `adapters/`
- `types/`
- `config/`

## Generated Outputs

These are generated artifacts, not source code:

- `data/normalized/`
- `capping-pro-nba-surfaces*.json`
- `moneyline-enrichment.run-summary.json`
- `archive/*.json`
- `archive/*.summary.json`
- `archive/*.run-summary.json`

## Reference / Exploratory Material

These files can be useful for context, but they are not the preferred
implementation path:

- `scrape_yahoo_nba.py`
- `scrape_yahoo.ipynb`
- `explore*.ipynb`
- `push_charts.ipynb`
- `scrape_yahoo_odds-main.zip`
- `archive/Scan_NBAbestbets.py`
- `archive/Scan-NBAbestbets,js`

## Legacy / Ambiguous Artifacts

These files have misleading names or mixed historical purpose and should be
treated carefully before reuse:

- `money_data.py`
- `spread_data.py`
- `scrape_rules.py`
- `scrape_utils.py`
- `odds.csv`
- `odds (1).csv`
- `2021.csv`
- `2023.csv`
- `2024.csv`
- `2025.csv`

## Safe Cleanup Targets

These can usually be removed and regenerated without affecting repo logic:

- `__pycache__/`
- `tests/__pycache__/`
- `scripts/__pycache__/`
- `archive/__pycache__/`
