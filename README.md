# TipGod Workspace Context

This repository is now centered on an NBA-only, approved-source reader for multiple `capping.pro` NBA surfaces.

The current product state is no longer just a `nba-bestbets` audit. The repo now contains:

- a root-navigation Playwright scanner that starts at `https://capping.pro/`
- approved NBA surface validation and filtering
- a grouped JSON dataset consumed by the local static frontend
- a surface-aware results UI that reuses the existing outputs for:
  - `Best Bets`
  - `Edges`
  - `Props`
  - `Parlay`
  - `Degen`
  - `Exploits`

## Current Files That Matter

- scanner:
  - [scan-capping-pro-nba-surfaces.js](/workspaces/TipGod/scan-capping-pro-nba-surfaces.js)
- bookmaker adapters:
  - [adapters/shared.js](/workspaces/TipGod/adapters/shared.js) — shared utilities
  - [adapters/market-utils.js](/workspaces/TipGod/adapters/market-utils.js) — market normalization + item lookup helpers
  - [adapters/bookmakers/ladbrokes.js](/workspaces/TipGod/adapters/bookmakers/ladbrokes.js)
  - [adapters/bookmakers/sportsbet.js](/workspaces/TipGod/adapters/bookmakers/sportsbet.js)
  - [adapters/bookmakers/pointsbet.js](/workspaces/TipGod/adapters/bookmakers/pointsbet.js)
  - [adapters/bookmakers/bet365.js](/workspaces/TipGod/adapters/bookmakers/bet365.js)
  - [adapters/index.js](/workspaces/TipGod/adapters/index.js) — registry + orchestrator
- enrichment runner:
  - [enrich-moneyline.js](/workspaces/TipGod/enrich-moneyline.js)
- frontend:
  - [app.js](/workspaces/TipGod/app.js)
  - [index.html](/workspaces/TipGod/index.html)
  - [styles.css](/workspaces/TipGod/styles.css)
- source policy:
  - [config/source_policy.json](/workspaces/TipGod/config/source_policy.json)
- bookmaker config:
  - [config/au_sportsbooks.json](/workspaces/TipGod/config/au_sportsbooks.json) — master AU sportsbook registry (7 books)
  - [config/moneyline_bookmakers.json](/workspaces/TipGod/config/moneyline_bookmakers.json) — enrichment-only config (4 approved books)
- TypeScript types:
  - [types/moneyline-enrichment.ts](/workspaces/TipGod/types/moneyline-enrichment.ts)
- TypeScript toolchain:
  - [tsconfig.json](/workspaces/TipGod/tsconfig.json)
- summary helper:
  - [scripts/summarize.js](/workspaces/TipGod/scripts/summarize.js) — Node.js port (replaces archived Python script)
- tests:
  - [tests/normalize.test.js](/workspaces/TipGod/tests/normalize.test.js) — `normalizeText`, `parseDecimalOdds`
  - [tests/resolve.test.js](/workspaces/TipGod/tests/resolve.test.js) — `loadTeamAliases`, `resolveTeam`, `resolveMatchup`
  - [tests/scanner-utils.test.js](/workspaces/TipGod/tests/scanner-utils.test.js) — `sha1`, `slugify`, `parseNumber`, `parsePercent`
  - [tests/bookmaker-enrichment.test.js](/workspaces/TipGod/tests/bookmaker-enrichment.test.js) — market normalization, item lookup, generic bookmaker enrichment
- CI:
  - [.github/workflows/scan.yml](/workspaces/TipGod/.github/workflows/scan.yml) — automated cron scan via GitHub Actions
- demo enrichment generator:
  - [scripts/generate-demo-enrichment.js](/workspaces/TipGod/scripts/generate-demo-enrichment.js) — generates synthetic AU odds for UI display without requiring an AU IP
- generated artifacts:
  - [capping-pro-nba-surfaces.json](/workspaces/TipGod/capping-pro-nba-surfaces.json)
  - [capping-pro-nba-surfaces.run-summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.run-summary.json)
  - [capping-pro-nba-surfaces.summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.summary.json)
  - `capping-pro-nba-surfaces-enriched.json` *(written by `enrich:moneyline` or `demo:enrichment`)*
  - `moneyline-enrichment.run-summary.json` *(written by `enrich:moneyline` or `demo:enrichment`)*

## Current Architecture

### Generic bookmaker enrichment layer

The repo now includes a TypeScript-typed bookmaker enrichment layer that sits on top of the existing capping.pro NBA items.

Approved bookmakers (AU only, decimal odds, AUD) now use canonical capping-facing market names with bookmaker-native aliases configured per book:

| Slug | Name | Example native moneyline label |
|---|---|---|
| `ladbrokes` | Ladbrokes | Head To Head |
| `sportsbet` | Sportsbet | Head To Head |
| `pointsbet` | PointsBet | Match Winner |
| `bet365` | Bet365 | Match Betting |

Canonical output market types currently targeted:

- `moneyline`
- `spread`
- `game_total`
- `first_half_spread`
- `first_half_total`
- `second_half_spread`
- `second_half_total`
- `player_points`
- `player_rebounds`
- `player_assists`
- `player_blocks`
- `player_free_throws`

Key types exported from `types/moneyline-enrichment.ts`:

- `ApprovedBookmaker` — union type: `'ladbrokes' | 'sportsbet' | 'pointsbet' | 'bet365'`
- `APPROVED_BOOKMAKERS` — readonly const array of the four slugs
- `BookmakerConfig` — one entry in `moneyline_bookmakers.json`
- `MoneylineBookmakerPolicy` — shape of the full enrichment config file
- `CanonicalMarketType` — canonical capping-facing market names
- `PeriodScope` — `full_game`, `first_half`, `second_half`
- `BookmakerMarketQuote` — one bookmaker's normalized quote for a market selection
- `BestAvailableSelection` — best quote + source bookmaker for one selection
- `ItemMarketLookup` — normalized mapping from a scanner item into a market request
- `ItemMarketMatch` — matched market selection with per-book quotes
- `GameMarketBundle` — all normalized game-level selections for one matchup
- `PlayerMarketBundle` — all normalized selections for one player within a matchup
- `BookmakerEnrichment` — item-level enrichment block attached to scanner items
- `BookmakerCoverageStats` — per-surface enrichment coverage metrics
- `NBAItemMetric` — typed version of the existing `metrics[]` contract
- `NBANormalizedItem` — typed version of `makeItem()` output from the scanner
- `EnrichedNBAItem` — `NBANormalizedItem` + `bookmaker_enrichment: BookmakerEnrichment | null`
- `EnrichedNBASurface` — surface with enriched items + coverage stats
- `EnrichedNBADataset` — top-level enriched dataset shape

Type verification: `npm run typecheck` (`tsc --noEmit`, exits 0).

### Bookmaker adapters and market normalization

Four Playwright-based adapters now attempt a broader NBA market set from the approved AU bookmakers. Their output is normalized into canonical capping-facing market names while preserving bookmaker-native market labels on each quote.

Each adapter (`adapters/bookmakers/<slug>.js`) exports:

```js
{ slug, name, fetchOdds(page, config) → Promise<RawSelectionRow[]> }
```

`RawSelectionRow` shape: `{ home_team_raw, away_team_raw, player_name_raw, market_type_raw, market_name, selection_label_raw, line_raw, odds_raw, is_available }`

Adapter behaviour:
- Navigates to `config.base_url + config.nba_path`
- Settles with `waitForSettle()` (3 s for Ladbrokes/Sportsbet/PointsBet, 6 s for Bet365)
- Uses shared best-effort market-section extraction keyed by per-book `market_aliases`
- Wraps entirely in try/catch — returns `[]` on geo-block or any error
- Attempts all configured canonical market types in the first pass, even if some books/pages return sparse rows

Orchestrator (`adapters/index.js`):
- `runAllAdapters(browser, bookmakerConfigs)` — one fresh page per book, per-book errors caught; returns `{ oddsMap, marketMap, adapterHealth }`
- `normalizeRawSelectionsToMarketOffers(...)` — converts raw selection rows into canonical market offers
- `buildMarketIndex(marketMap, bookmakerConfigs)` — builds selection, game, player, and team-to-game indexes
- `buildItemEnrichment(item, marketIndex, aliasMap)` — maps one scanner item into `bookmaker_enrichment`
- `toLegacyMoneylineEnrichment(enrichment)` — temporary compatibility bridge for older moneyline-only UI/data consumers
- Shared utilities:
  - `adapters/shared.js` — `normalizeText`, `parseDecimalOdds`, `loadTeamAliases`, `resolveTeam`, `resolveMatchup`, `waitForSettle`, `dismissOverlays`
  - `adapters/market-utils.js` — player-name cleanup, stat-type normalization, matchup canonicalization, item lookup derivation

Geo-restriction behaviour: AU bookmaker sites require an AU IP. Geo-blocked books produce empty offer sets and unavailable quotes in matched selections; the run continues and coverage stats reflect the actual availability.

### Enrichment runner

`enrich-moneyline.js` (`npm run enrich:moneyline`):

1. Loads `capping-pro-nba-surfaces.json` + `config/moneyline_bookmakers.json`
2. Launches headless Chromium (1440×1800, matching the scanner)
3. Runs all 4 adapters via `runAllAdapters()` — returns `{ oddsMap, marketMap, adapterHealth }`
4. Logs per-book health: `OK (N games, N offers)` or `ERROR: <message>` per slug
5. Builds a generic market index from normalized offers
6. Attaches `bookmaker_enrichment` to every surface item via item-level lookup
7. Also writes `moneyline_enrichment` as a temporary compatibility field when a game bundle includes moneyline
8. Computes `BookmakerCoverageStats` per surface
9. Writes `capping-pro-nba-surfaces-enriched.json` (full `EnrichedNBADataset`)
10. Writes `moneyline-enrichment.run-summary.json` — includes `failed_adapters[]`, per-book `{ raw_games_found, normalized_offers_found, market_type_counts, adapter_success, error, started_at, finished_at }`, coverage %

Current live limitation:
- the adapters now attempt the expanded market list via generic extraction, but real bookmaker DOM coverage is still best-effort
- live spread/total/player-prop/half-market coverage depends on current bookmaker page structure and AU access, and was not fully validated from this environment

### Data source policy

The repo now treats `capping.pro` as a domain-level approved source with an NBA-only surface allowlist.

Approved surfaces:

- `best-bets`
  - route: `/nba-bestbets`
- `edges`
  - route: `/nba-edges`
- `props`
  - route: `/nba-propfinder`
- `parlay`
  - route: `/parlay-of-the-night`
- `degen`
  - route: `/degen-theory`
- `exploits`
  - route: `/nba-matchup-exploits`

Validation rules now enforce:

- `league_id: NBA`
- `sport: Basketball`
- active surface must match the approved surface registry
- wrong-league content rendered inside the app shell must be rejected

### Scanner behavior

The scanner no longer relies on deep-link-only scraping as the primary navigation model.

It now:

- opens `https://capping.pro/`
- switches the app into `NBA` mode
- enters each surface from the NBA dashboard quick-action tiles
- validates that the surface content is NBA and matches the expected route/context
- extracts grouped records per surface
- writes grouped output and run-summary artifacts

### Frontend behavior

The UI now reads grouped surface data rather than a flat best-bets list.

It renders:

- top-level surface tabs
- dynamic per-surface filters
- the existing outputs reused as generic surface-aware components:
  - summary strip
  - featured card
  - ranked stack
  - value chart
  - distribution chart
  - heatmap
  - compact table
- **Bookmaker Comparison section** on each card (when enriched data is present)

Filter state (active surface, primary/secondary filters, show-table toggle) is persisted to `localStorage` and restored on page load. Falls back gracefully if `localStorage` is unavailable (e.g. strict private browsing).

There are no fallback datasets. If a surface has zero valid approved-source NBA records, the UI shows the approved-source empty state for that surface.

#### Enriched data loading

`app.js` tries `capping-pro-nba-surfaces-enriched.json` first; falls back to the base `capping-pro-nba-surfaces.json` silently if the enriched file is absent. This means the UI works in both enriched and non-enriched modes with no code changes.

#### Bookmaker Comparison card section

Rendered by `renderBookmakerComparison(item)` inside `pickCardMarkup()` and `renderFeatured()`.

Behaviour:
- `bookmaker_enrichment === null` → renders nothing (base dataset mode, no UI regression)
- If `matched_market` exists → renders an item-centric comparison block:
  - header shows the canonical matched market type and coverage count
  - best available row shows the top quote for that exact item selection
  - detail rows show bookmaker, odds, and bookmaker-native market label in fixed order: Ladbrokes → Sportsbet → PointsBet → Bet365
- If only `game_bundle` exists → renders a compact bookmaker markets panel for that matchup
- A temporary legacy moneyline renderer remains as fallback for older enriched JSON carrying only `moneyline_enrichment`

## Current Data Contracts

### Base dataset shape

```json
{
  "generated_at": "ISO timestamp",
  "source_domain": "capping.pro",
  "league_id": "NBA",
  "sport": "Basketball",
  "surfaces": [
    {
      "id": "best-bets",
      "label": "Best Bets",
      "source_url": "https://capping.pro/nba-bestbets",
      "scan_summary": {},
      "items": []
    }
  ]
}
```

Normalized item contract:

- `surface`
- `source_url`
- `league_id`
- `sport`
- `item_id`
- `title`
- `subtitle`
- `matchup`
- `selection`
- `market_type`
- `team`
- `player_name`
- `sportsbook_name`
- `odds_decimal`
- `updated_at`
- `reason`
- `detail_notes[]`
- `metrics[]`
- `tags[]`
- `raw_context`

Important note:

- `metrics[]` is the main cross-surface abstraction used by the UI
- different surfaces populate different metric keys
- the UI should not assume sportsbook, odds, or matchup are always present

### Enriched dataset shape

`capping-pro-nba-surfaces-enriched.json` extends the base shape with enrichment fields:

```json
{
  "generated_at": "ISO timestamp",
  "enriched_at": "ISO timestamp",
  "source_domain": "capping.pro",
  "league_id": "NBA",
  "sport": "Basketball",
  "approved_bookmakers": ["ladbrokes", "sportsbet", "pointsbet", "bet365"],
  "surfaces": [
    {
      "id": "best-bets",
      "label": "Best Bets",
      "source_url": "...",
      "scan_summary": {},
      "bookmaker_coverage": {
        "surface_id": "best-bets",
        "total_items": 94,
        "enrichable_items": 94,
        "enriched_items": 94,
        "books_with_coverage": ["ladbrokes", "sportsbet", "bet365"],
        "market_type_counts": { "player_assists": 12, "player_points": 48 },
        "coverage_pct": 100
      },
      "items": [
        {
          "...existing item fields...",
          "bookmaker_enrichment": {
            "lookup": {
              "matchup": "Houston Rockets vs Denver Nuggets",
              "home_team": "Houston Rockets",
              "away_team": "Denver Nuggets",
              "market_type": "player_assists",
              "market_family": "player_prop",
              "period": "full_game",
              "market_key": "player_assists:5",
              "selection_key": "alt_over",
              "selection_label": "5+ assists",
              "player_name": "Amen Thompson",
              "line": 5,
              "team_context": "Houston Rockets"
            },
            "matched_market": {
              "market_type": "player_assists",
              "market_family": "player_prop",
              "period": "full_game",
              "market_key": "player_assists:5",
              "selection_key": "alt_over",
              "selection_label": "5+ assists",
              "best_available": {
                "odds": 2.79,
                "bookmaker": "sportsbet",
                "bookmaker_name": "Sportsbet",
                "selection_key": "alt_over",
                "selection_label": "5+ assists"
              }
            },
            "game_bundle": { "...": "game-level selections for the matchup" },
            "enriched_at": "..."
          },
          "moneyline_enrichment": { "...": "temporary legacy compatibility block" }
        }
      ]
    }
  ]
}
```

Items that cannot be mapped to a canonical market request keep `bookmaker_enrichment: null`.

## npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `scan:nba-surfaces` | `node scan-capping-pro-nba-surfaces.js` | Run Playwright scanner against capping.pro |
| `enrich:moneyline` | `node enrich-moneyline.js` | Run bookmaker adapters, write enriched dataset (requires AU IP) |
| `demo:enrichment` | `node scripts/generate-demo-enrichment.js` | Generate synthetic generic bookmaker enrichment for UI display (no AU IP required) |
| `summarize:nba-surfaces` | `node scripts/summarize.js capping-pro-nba-surfaces.json` | Summarize grouped scan output |
| `test` | `node --test tests/*.test.js` | Run unit tests (4 test files, zero dependencies) |
| `typecheck` | `tsc --noEmit` | Verify TypeScript interfaces compile cleanly |

Typical run order (live AU IP):
1. `npm run scan:nba-surfaces` → generates base dataset
2. `npm run enrich:moneyline` → scrapes live bookmaker odds, writes enriched dataset
3. Serve `index.html` — UI auto-detects enriched file and shows bookmaker comparison sections

Typical run order (no AU IP / local dev):
1. `npm run scan:nba-surfaces` → generates base dataset
2. `npm run demo:enrichment` → generates synthetic odds in same format as live enrichment
3. Serve `index.html` — bookmaker comparison sections render with demo data

## Current Runtime Status

Last verified live grouped scan on `2026-03-11` produced:

- total items:
  - `440`
- per surface:
  - `Best Bets: 94`
  - `Edges: 27`
  - `Props: 120`
  - `Parlay: 54`
  - `Degen: 120`
  - `Exploits: 25`

Verification completed for:

- `node --check app.js`
- `node --check scan-capping-pro-nba-surfaces.js`
- `node --check enrich-moneyline.js`
- `node --check adapters/index.js adapters/shared.js adapters/bookmakers/*.js`
- `node -e "require('./adapters/index')"` (module loads cleanly)
- `npm test` — all current test files pass (no extra dependencies, uses `node:test`)
- `node scripts/summarize.js capping-pro-nba-surfaces.json` — produces correct 440-item summary
- live Playwright run of `scan-capping-pro-nba-surfaces.js`
- local browser smoke test against `python3 -m http.server`
- `npm run typecheck` (TypeScript interfaces, 0 errors)
- enrichment logic smoke test (generic lookup, matched-market, game-bundle, legacy moneyline compatibility)

## Prompt History Context

This section is intended to preserve the prompt-driven evolution of the repo so future prompts can build on the latest intent instead of older assumptions.

### Prompt phase 7

Enable the Moneyline Comparison UI section that was already built but rendering nothing.

Two root causes identified and fixed:
1. **CSS bug**: `--text-muted` CSS variable used throughout the moneyline section was never defined in `:root`; added it pointing to `#475569` (same as `--muted`)
2. **No enriched data**: `capping-pro-nba-surfaces-enriched.json` didn't exist because live enrichment requires an AU IP. Created `scripts/generate-demo-enrichment.js` to produce synthetic odds in the exact enrichment output shape — no Playwright, no network access required.

The demo generator reuses `loadTeamAliases()` and `resolveMatchup()` from `adapters/shared.js`. It handles both matchup string formats in the scan data (`"HOU vs DEN"` and `"TOR@NOP"`). Odds are seeded by matchup string for reproducibility. The output carries a `demo_enrichment: true` flag so it's distinguishable from live enrichment and can be safely overwritten by `npm run enrich:moneyline`.

No changes to `app.js`, `index.html`, or the adapter layer — the rendering pipeline was already correct.

### Prompt phase 8

Fix the `resolveTeam()` word-boundary bug and expose best available bookmaker odds more prominently in the UI.

Outcome:
- `adapters/shared.js` now uses whole-word regex matching for fallback alias resolution, preventing short aliases such as `"no"` from matching inside unrelated strings like `"unknown"`
- `tests/resolve.test.js` now includes a regression case for `"unknown"`
- the legacy moneyline comparison UI gained a highlighted best-available summary row

### Prompt phase 9

Generalize bookmaker output from a moneyline-only block into a market-centric enrichment layer that can represent item-level player props, single-leg items, and game-level bundles that mirror `capping.pro` outputs.

Outcome:
- added `adapters/market-utils.js` for:
  - player-name normalization
  - stat-type normalization
  - matchup canonicalization
  - item lookup derivation from scanner fields (`matchup`, `selection`, `market_type`, `team`, `player_name`)
- reworked `adapters/index.js` into a generic market orchestrator:
  - `runAllAdapters()` now returns `{ oddsMap, marketMap, adapterHealth }`
  - live moneyline games are normalized into generic market offers
  - added market indexing and item-level enrichment assembly
  - added temporary `toLegacyMoneylineEnrichment()` compatibility bridge
- reworked `enrich-moneyline.js` to attach:
  - `bookmaker_enrichment`
  - temporary `moneyline_enrichment` compatibility field
  - `bookmaker_coverage` per surface
- expanded `types/moneyline-enrichment.ts` into a generic bookmaker contract
- updated `app.js` to render item-centric bookmaker comparisons and collapsible game-market bundles
- updated `scripts/generate-demo-enrichment.js` to generate generic item-level enrichment for props, single-leg items, and matchup-driven cards
- added `tests/bookmaker-enrichment.test.js`
- important current limitation: live adapters now attempt multiple markets, but real bookmaker DOM coverage is still best-effort and not fully validated across all listed markets

### Prompt phase 10

Expand bookmaker markets and normalize output names to match capping.pro-facing market concepts.

Outcome:
- replaced single-market bookmaker config with per-book `market_aliases` keyed by canonical market types
- expanded canonical market coverage to:
  - `moneyline`
  - `spread`
  - `game_total`
  - `first_half_spread`
  - `first_half_total`
  - `second_half_spread`
  - `second_half_total`
  - `player_points`
  - `player_rebounds`
  - `player_assists`
  - `player_blocks`
  - `player_free_throws`
- normalized bookmaker-native aliases such as `head_to_head`, `match_betting`, and `handicap` into canonical output names while preserving native labels in quote metadata
- reworked adapters to emit raw selection rows and use shared best-effort section extraction for the broader market set
- reworked market normalization and matching so scanner items map directly to canonical output market types
- updated run summaries to include `market_type_counts`
- updated demo enrichment so generated quotes use canonical market types and realistic native market labels per bookmaker
- updated UI labels so cards show canonical capping-facing market types as the primary label

### Prompt phase 6

Codebase review and improvement pass. Goal: identify and implement the highest-value reliability, developer-experience, and frontend improvements without changing the core architecture.

Outcome:
- Added unit tests (`tests/`) using Node.js built-in `node:test` — 53 tests, zero new dependencies:
  - `tests/normalize.test.js` — `normalizeText`, `parseDecimalOdds`
  - `tests/resolve.test.js` — `loadTeamAliases`, `resolveTeam`, `resolveMatchup`
  - `tests/scanner-utils.test.js` — `sha1`, `slugify`, `parseNumber`, `parsePercent`
  - Tests exposed a real partial-match bug in `resolveTeam`: short aliases (e.g. `"no"` for New Orleans) match as substrings inside unrelated strings like `"unknown"`. Documented in test comments.
- Improved adapter health tracking in `adapters/index.js`:
  - `runAllAdapters()` now returns `{ oddsMap, adapterHealth }` (was just `oddsMap`)
  - `adapterHealth` carries `{ raw_games, error, started_at, finished_at }` per slug
  - `enrich-moneyline.js` logs `OK (N games)` or `ERROR: <message>` per adapter at runtime
  - `moneyline-enrichment.run-summary.json` now includes `failed_adapters[]` and per-book `error` + timestamps
- Archived legacy files — `Scan-NBAbestbets.js`, `Scan_NBAbestbets.py`, and 6 old JSON artifacts moved to `archive/`
- Replaced Python summarize script with Node.js equivalent (`scripts/summarize.js`) — removes Python dependency; output is identical
- Added `localStorage` UI state persistence to `app.js` — active surface, filters, and show-table toggle are saved on every change and restored on load
- Added GitHub Actions cron workflow (`.github/workflows/scan.yml`) — runs scanner + summarize + tests every 6 hours, commits updated JSON artifacts; supports manual dispatch
- Added `test` script to `package.json`; updated `summarize:nba-surfaces` to use Node.js

### Prompt phase 1

Original repo context focused on:

- auditing `https://capping.pro/nba-bestbets`
- documenting its controls
- building a scanner for the single `nba-bestbets` route
- validating whether that route actually served NBA content

### Prompt phase 2

Later prompts expanded the goal to:

- derive data from `https://capping.pro/`
- illustrate:
  - `Best Bets`
  - `Edges`
  - `Props`
  - `Parlay`
  - `Degen`
  - `Exploits`
- display those categories on the existing outputs rather than inventing a separate app

### Prompt phase 3

The implementation prompt finalized the current direction:

- NBA only
- approved source only
- top-level category tabs
- `Props` mapped to NBA `PropFinder` / prop-tracking style surface
- root-app navigation treated as canonical because direct deep links could hydrate into the wrong league shell

### Prompt phase 4

Extend the NBA-approved-source architecture by adding a bookmaker moneyline enrichment layer for Ladbrokes, Sportsbet, PointsBet, and bet365 only.

Create TypeScript interfaces for bookmaker moneyline enrichment using only Ladbrokes, Sportsbet, PointsBet, and bet365.

Outcome:
- Created `types/moneyline-enrichment.ts` with 13 exported types/interfaces covering the full enrichment contract
- Created `config/moneyline_bookmakers.json` as a focused enrichment-only config (4 books, NBA head-to-head specific fields)
- Added PointsBet to `config/au_sportsbooks.json` (was the only approved book missing from the master registry)
- Added `tsconfig.json` (strict, noEmit, targets `types/**/*`)
- Added `typescript@^5` devDep and `typecheck` script to `package.json`
- `npm run typecheck` exits 0 with no errors

### Prompt phase 5

Build bookmaker adapters for Ladbrokes, Sportsbet, PointsBet, and bet365 that return standardised NBA moneyline quotes.

Extend the UI card layout to include a Moneyline Comparison section showing bookmaker odds, best book, coverage count, and no-data messaging across 4 bookmakers only.

Outcome:
- Created `adapters/shared.js` — shared utilities mirroring scanner patterns (normalizeText, parseDecimalOdds, loadTeamAliases, resolveTeam, resolveMatchup, waitForSettle, dismissOverlays)
- Created 4 bookmaker adapters: `adapters/bookmakers/ladbrokes.js`, `sportsbet.js`, `pointsbet.js`, `bet365.js`
  - Each exports `{ slug, name, fetchOdds(page, config) }`
  - Text-content-based market section detection (resilient to DOM changes)
  - Full try/catch — returns `[]` on geo-block or error
  - Bet365 uses 6 s settle time + dual-strategy extraction (text-content first, class fallback)
- Created `adapters/index.js` — registry + orchestrator
  - `runAllAdapters(browser, bookmakerConfigs)` — one page per book, per-book errors caught
  - `buildEnrichment()` — canonical team resolution, home/away swap detection, best_available computation
- Created `enrich-moneyline.js` — CLI runner
  - Writes `capping-pro-nba-surfaces-enriched.json` (EnrichedNBADataset)
  - Writes `moneyline-enrichment.run-summary.json`
- Added `enrich:moneyline` script to `package.json`
- Updated `app.js`:
  - Tries enriched dataset first, falls back to base silently
  - Added `APPROVED_BOOKMAKERS` and `BOOKMAKER_DISPLAY_NAMES` constants
  - Added `renderMoneylineComparison(item)` — null-safe, 3 rendering states (no data, all unavailable, available)
  - Best odds highlighted green; unavailable rows faded; coverage count in header
- Updated `styles.css` — `.moneyline-comparison` grid section styles
- All syntax checks pass; all module loads verified; enrichment logic smoke-tested

## Change Log

### 2026-03-11 — Generic bookmaker enrichment layer

- Added [adapters/market-utils.js](/workspaces/TipGod/adapters/market-utils.js) for market normalization and item lookup derivation
- Reworked [adapters/index.js](/workspaces/TipGod/adapters/index.js) from moneyline-only assembly into a generic market orchestrator
- Reworked [enrich-moneyline.js](/workspaces/TipGod/enrich-moneyline.js) to write `bookmaker_enrichment` and `bookmaker_coverage`
- Expanded [types/moneyline-enrichment.ts](/workspaces/TipGod/types/moneyline-enrichment.ts) into a generic bookmaker contract while retaining temporary legacy moneyline compatibility
- Updated [app.js](/workspaces/TipGod/app.js) and [styles.css](/workspaces/TipGod/styles.css) so cards render item-centric bookmaker comparisons plus collapsible game-market bundles
- Updated [scripts/generate-demo-enrichment.js](/workspaces/TipGod/scripts/generate-demo-enrichment.js) to generate generic item-level enrichment for props and single-leg items
- Added [tests/bookmaker-enrichment.test.js](/workspaces/TipGod/tests/bookmaker-enrichment.test.js)
- Current limitation: live adapters now attempt multiple markets, but real bookmaker DOM coverage is still best-effort and not fully validated across all listed markets

### 2026-03-11 — Canonical multi-market expansion

- Reworked [config/moneyline_bookmakers.json](/workspaces/TipGod/config/moneyline_bookmakers.json) to use per-book `market_aliases` instead of a single moneyline field
- Expanded canonical market support to spreads, totals, half markets, and selected player props
- Reworked all four bookmaker adapters to emit raw selection rows for the broader configured market list
- Reworked [adapters/index.js](/workspaces/TipGod/adapters/index.js) to normalize bookmaker-native aliases into canonical market names
- Updated [types/moneyline-enrichment.ts](/workspaces/TipGod/types/moneyline-enrichment.ts) with `CanonicalMarketType` and `PeriodScope`
- Updated [scripts/generate-demo-enrichment.js](/workspaces/TipGod/scripts/generate-demo-enrichment.js) so demo output carries canonical market types plus native bookmaker labels
- Updated [app.js](/workspaces/TipGod/app.js) so canonical market names are the primary UI label while bookmaker-native labels remain row metadata

### 2026-03-11 — Moneyline UI activation (demo enrichment + CSS fix)

- Fixed CSS variable bug: `--text-muted` was referenced throughout the moneyline section but never defined in `:root`. Added `--text-muted: #475569` — all bookmaker names, team labels, and coverage text now render correctly.
- Created `scripts/generate-demo-enrichment.js` — generates `capping-pro-nba-surfaces-enriched.json` with synthetic AU decimal odds (1.55–2.41 range) without requiring an AU IP:
  - Reuses `loadTeamAliases()` + `resolveMatchup()` from `adapters/shared.js`
  - Handles both matchup formats: `"HOU vs DEN"` (spaces) and `"TOR@NOP"` (no spaces)
  - Seeded per-matchup RNG for reproducible odds across re-runs
  - Simulates ~30% PointsBet unavailability (realistic geo-block pattern)
  - Output is byte-compatible with live `enrich:moneyline` output shape (`demo_enrichment: true` flag distinguishes it)
  - Coverage: Best Bets 87/94 (93%), Exploits 25/25 (100%) — Edges/Props/Parlay/Degen have no matchup fields (correct)
- Added `demo:enrichment` script to `package.json`

### 2026-03-11 — Reliability, testing, and DX improvements

- Added unit test suite (`tests/`) — 53 tests using `node:test`, covering all pure utility functions in `adapters/shared.js` and the scanner; `npm test` script added to `package.json`
- Upgraded `runAllAdapters()` in `adapters/index.js` to return `{ oddsMap, adapterHealth }` — per-adapter `error`, `raw_games`, `started_at`, `finished_at` now tracked explicitly
- `moneyline-enrichment.run-summary.json` now includes `failed_adapters[]` and per-book error detail
- Replaced `scripts/summarize_capping_pro_nba_surfaces.py` with `scripts/summarize.js` — identical output, no Python dependency
- Added `localStorage` persistence for active surface, filter selections, and show-table state in `app.js`
- Added `.github/workflows/scan.yml` — GitHub Actions cron (every 6 hours) runs scan + summarize + tests, auto-commits updated JSON artifacts
- Moved legacy files (`Scan-NBAbestbets.js`, `Scan_NBAbestbets.py`, old JSON artifacts) to `archive/`

### 2026-03-11 — Bookmaker adapters + UI Moneyline Comparison

- Created 4 Playwright-based bookmaker adapters:
  - [adapters/bookmakers/ladbrokes.js](/workspaces/TipGod/adapters/bookmakers/ladbrokes.js)
  - [adapters/bookmakers/sportsbet.js](/workspaces/TipGod/adapters/bookmakers/sportsbet.js)
  - [adapters/bookmakers/pointsbet.js](/workspaces/TipGod/adapters/bookmakers/pointsbet.js)
  - [adapters/bookmakers/bet365.js](/workspaces/TipGod/adapters/bookmakers/bet365.js)
- Created shared adapter utilities:
  - [adapters/shared.js](/workspaces/TipGod/adapters/shared.js)
- Created adapter registry and orchestrator:
  - [adapters/index.js](/workspaces/TipGod/adapters/index.js)
- Created CLI enrichment runner:
  - [enrich-moneyline.js](/workspaces/TipGod/enrich-moneyline.js)
- Added `enrich:moneyline` script to [package.json](/workspaces/TipGod/package.json)
- Updated frontend to support enriched dataset (auto-detect, graceful fallback):
  - [app.js](/workspaces/TipGod/app.js) — `renderMoneylineComparison()`, enriched JSON loading
  - [styles.css](/workspaces/TipGod/styles.css) — `.moneyline-comparison` section styles
- Verified: all syntax checks, module loads, enrichment logic smoke test

### 2026-03-11 — Moneyline enrichment layer

- Added TypeScript interfaces for moneyline enrichment in:
  - [types/moneyline-enrichment.ts](/workspaces/TipGod/types/moneyline-enrichment.ts)
- Created focused enrichment bookmaker config (Ladbrokes, Sportsbet, PointsBet, Bet365):
  - [config/moneyline_bookmakers.json](/workspaces/TipGod/config/moneyline_bookmakers.json)
- Added PointsBet to the master AU sportsbook registry:
  - [config/au_sportsbooks.json](/workspaces/TipGod/config/au_sportsbooks.json) (now 7 entries)
- Added TypeScript toolchain:
  - [tsconfig.json](/workspaces/TipGod/tsconfig.json)
  - `typescript@^5` devDependency
  - `typecheck` script in [package.json](/workspaces/TipGod/package.json)
- Verified `npm run typecheck` exits 0

### 2026-03-11 — Multi-surface NBA scanner

- Preserved the earlier `nba-bestbets` control audit as historical context rather than the active system description.
- Replaced the single-route approved-source model with a domain-level NBA surface registry in:
  - [config/source_policy.json](/workspaces/TipGod/config/source_policy.json)
- Added a new grouped multi-surface scanner in:
  - [scan-capping-pro-nba-surfaces.js](/workspaces/TipGod/scan-capping-pro-nba-surfaces.js)
- Added grouped data artifacts:
  - [capping-pro-nba-surfaces.json](/workspaces/TipGod/capping-pro-nba-surfaces.json)
  - [capping-pro-nba-surfaces.run-summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.run-summary.json)
  - [capping-pro-nba-surfaces.summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.summary.json)
- Refactored the frontend to consume grouped surface data and render surface-aware filters and views in:
  - [app.js](/workspaces/TipGod/app.js)
  - [index.html](/workspaces/TipGod/index.html)
  - [styles.css](/workspaces/TipGod/styles.css)
- Added a new summary helper for grouped scans:
  - [scripts/summarize_capping_pro_nba_surfaces.py](/workspaces/TipGod/scripts/summarize_capping_pro_nba_surfaces.py)
- Added package scripts for grouped scanning and summarization in:
  - [package.json](/workspaces/TipGod/package.json)
- Verified live NBA surface extraction counts:
  - `Best Bets: 94`
  - `Edges: 27`
  - `Props: 120`
  - `Parlay: 54`
  - `Degen: 120`
  - `Exploits: 25`
- Verified the local UI renders:
  - all six surface tabs
  - dynamic filter chips
  - existing output modules bound to grouped surface data

## Historical Context: Original Single-Route Audit

The material below is preserved so future prompts still have the detailed original `nba-bestbets` control audit available if work returns to route-specific scanning or parity work.

---

# capping.pro `nba-bestbets` Control Audit

## Page

- URL: `https://capping.pro/nba-bestbets`
- Classification:
  - `repeating card feed`
  - `dynamic dashboard`
  - `mixed layout`

## Summary

The page is a client-rendered React view. The initial HTML contains only the app shell, and the visible controls/content are rendered by JavaScript. Most controls update content in place on the same route. Some controls filter already-loaded state, while others trigger fresh API requests.

## Control Groups

### 1. Date picker

- `group_name`: `Date picker`
- `control_type`: `filter`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.date-picker`
- `visible labels`:
  - `Date`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `loaded dynamically via /api/nba/best-bets?date=...`
- `confidence score`: `0.99`
- `reasoning`: Bound to `input[type="date"]`; changing it updates state and refetches best-bet data.

### 2. Lookback period

- `group_name`: `Lookback period`
- `control_type`: `dropdown`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.nba-best-bets-controls select`
- `visible labels`:
  - `Last 7 Days`
  - `Last 14 Days`
  - `Last 30 Days`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `loaded dynamically via /api/nba/best-bets?lookbackDays=...`
- `confidence score`: `0.98`
- `reasoning`: Included directly in the best-bets API query.

### 3. Category tabs

- `group_name`: `Category tabs`
- `control_type`: `tab`
- `parent container selector`: `.category-tabs`
- `child control selectors`:
  - `.category-tabs .category-tab`
- `visible labels`:
  - `Elite`
  - `Strong`
  - `Opportunistic`
  - `All`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `already loaded in JS state; swapped in-place from categories/all_plays`
- `confidence score`: `0.99`
- `reasoning`: Custom button tabs with active state; not semantic tabs, but functionally tabbed content.

### 4. Position filter

- `group_name`: `Position filter`
- `control_type`: `dropdown`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.nba-best-bets-controls select`
- `visible labels`:
  - `All Positions`
  - `PG`
  - `SG`
  - `SF`
  - `PF`
  - `C`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `used in dynamic API query and local filtering`
- `confidence score`: `0.97`
- `reasoning`: Position is sent as a request param and also used when deriving visible cards.

### 5. Team filter

- `group_name`: `Team filter`
- `control_type`: `dropdown`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.nba-best-bets-controls select`
- `visible labels`:
  - `All Teams`
  - `dynamic team abbreviations`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `team options loaded from /api/nba/teams; results loaded via /api/nba/best-bets?team=...`
- `confidence score`: `0.97`
- `reasoning`: Team choices are fetched separately, then selection changes the best-bets request.

### 6. Include Opponent toggle

- `group_name`: `Include Opponent toggle`
- `control_type`: `filter`
- `parent container selector`: `.matchup-toggle`
- `child control selectors`:
  - `.matchup-toggle input[type="checkbox"]`
- `visible labels`:
  - `Include Opponent`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `conditionally rendered; affects dynamic API query with includeMatchup=true`
- `confidence score`: `0.95`
- `reasoning`: Only appears when a non-`ALL` team is selected and alters the fetch parameters.

### 7. Sort by

- `group_name`: `Sort by`
- `control_type`: `dropdown`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.nba-best-bets-controls select`
- `visible labels`:
  - `Confidence`
  - `Hit Rate`
  - `Avg Points`
  - `Minutes`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `already loaded data is re-sorted in place`
- `confidence score`: `0.98`
- `reasoning`: Reorders the visible recommendation cards without navigation.

### 8. Minimum confidence

- `group_name`: `Minimum confidence`
- `control_type`: `dropdown`
- `parent container selector`: `.nba-best-bets-controls .control-group`
- `child control selectors`:
  - `.nba-best-bets-controls select`
- `visible labels`:
  - `60%+`
  - `65%+`
  - `70%+`
  - `75%+`
  - `80%+`
  - `85%+`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `loaded dynamically via debounced /api/nba/best-bets?minConfidence=...`
- `confidence score`: `0.99`
- `reasoning`: Changing it updates state and triggers a debounced data refresh.

### 9. Injury filter

- `group_name`: `Injury filter`
- `control_type`: `dropdown`
- `parent container selector`: `.injury-filter-compact`
- `child control selectors`:
  - `.injury-filter-button`
  - `.injury-filter-dropdown .filter-action-btn`
  - `.injury-filter-dropdown .filter-checkbox-option input[type="checkbox"]`
- `visible labels`:
  - `Injury Filter`
  - `Show All`
  - `Hide All`
  - `Out`
  - `DTD`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `dropdown panel is conditionally rendered; filtering happens against loaded results`
- `confidence score`: `0.96`
- `reasoning`: Compact filter opens a dropdown and uses checkbox state to hide/show affected players.

### 10. Refresh analysis

- `group_name`: `Refresh analysis`
- `control_type`: `filter`
- `parent container selector`: `.nba-best-bets-controls`
- `child control selectors`:
  - `.refresh-btn`
- `visible labels`:
  - `Refresh Analysis`
  - `Refreshing...`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `explicit refetch of /api/nba/best-bets`
- `confidence score`: `0.94`
- `reasoning`: Calls the same fetch routine directly and shows a refresh overlay.

### 11. Prop threshold sliders

- `group_name`: `Prop threshold sliders`
- `control_type`: `filter`
- `parent container selector`: `.threshold-sliders-section .threshold-sliders`
- `child control selectors`:
  - `#points-threshold`
  - `#assists-threshold`
  - `#rebounds-threshold`
- `visible labels`:
  - `Points`
  - `Assists`
  - `Rebounds`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `loaded dynamically via debounced API query using threshold params`
- `confidence score`: `0.99`
- `reasoning`: Range inputs update thresholds and refetch filtered recommendations.

### 12. Bet cards

- `group_name`: `Bet cards`
- `control_type`: `accordion`
- `parent container selector`: `.nba-best-bets-grid`
- `child control selectors`:
  - `.nba-best-bets-grid .nba-best-bet-card`
- `visible labels`:
  - `dynamic player cards`
  - `Recommended Play`
  - `Hit Rate`
  - `Avg`
  - `Opp Allows`
- `changes content in-place`: `yes`
- `content hidden in DOM or loaded dynamically`: `detail view loaded dynamically via /api/nba/player-performance/{playerId}?propType=...`
- `confidence score`: `0.97`
- `reasoning`: Each card opens a detail modal/bottom sheet. Not a semantic accordion, but it is an expandable content control.

## Notes

- No reliable evidence of semantic `role="tab"` or `role="tabpanel"` was available from the server HTML.
- The route is rendered from a bundled React app, so analysis was based on the shipped client code for `nba-bestbets`.
- The strongest page-level content switches are:
  - category tabs
  - date/lookback filters
  - team/position/confidence filters
  - threshold sliders
  - card click-through into the detail modal

Additional older audit detail was intentionally trimmed from the top-level current context. If future prompts need the original long-form single-route traversal notes, regenerate them from git history rather than treating them as the active system description.
