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
  - [scripts/summarize_capping_pro_nba_surfaces.py](/workspaces/TipGod/scripts/summarize_capping_pro_nba_surfaces.py)
- generated artifacts:
  - [capping-pro-nba-surfaces.json](/workspaces/TipGod/capping-pro-nba-surfaces.json)
  - [capping-pro-nba-surfaces.run-summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.run-summary.json)
  - [capping-pro-nba-surfaces.summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.summary.json)
  - `capping-pro-nba-surfaces-enriched.json` *(written by `enrich:moneyline`)*
  - `moneyline-enrichment.run-summary.json` *(written by `enrich:moneyline`)*

## Current Architecture

### Moneyline enrichment layer

The repo now includes a TypeScript-typed enrichment layer that sits on top of the existing capping.pro NBA items.

Approved bookmakers (AU only, decimal odds, AUD):

| Slug | Name | Moneyline market name |
|---|---|---|
| `ladbrokes` | Ladbrokes | Head To Head |
| `sportsbet` | Sportsbet | Head To Head |
| `pointsbet` | PointsBet | Match Winner |
| `bet365` | Bet365 | Match Betting |

Key types exported from `types/moneyline-enrichment.ts`:

- `ApprovedBookmaker` — union type: `'ladbrokes' | 'sportsbet' | 'pointsbet' | 'bet365'`
- `APPROVED_BOOKMAKERS` — readonly const array of the four slugs
- `BookmakerConfig` — one entry in `moneyline_bookmakers.json`
- `MoneylineBookmakerPolicy` — shape of the full enrichment config file
- `BookmakerMoneylineQuote` — one book's home/away decimal prices + `is_available` flag
- `BestAvailableMoneyline` — best odds + source bookmaker across all four books
- `MoneylineEnrichment` — full enrichment block: `quotes` keyed record + best available
- `MoneylineCoverageStats` — per-surface enrichment coverage metrics
- `NBAItemMetric` — typed version of the existing `metrics[]` contract
- `NBANormalizedItem` — typed version of `makeItem()` output from the scanner
- `EnrichedNBAItem` — `NBANormalizedItem` + `moneyline_enrichment: MoneylineEnrichment | null`
- `EnrichedNBASurface` — surface with enriched items + coverage stats
- `EnrichedNBADataset` — top-level enriched dataset shape

Type verification: `npm run typecheck` (`tsc --noEmit`, exits 0).

### Bookmaker adapters

Four Playwright-based adapters scrape NBA head-to-head odds from the approved AU bookmakers and return standardised `BookmakerMoneylineQuote` objects.

Each adapter (`adapters/bookmakers/<slug>.js`) exports:

```js
{ slug, name, fetchOdds(page, config) → Promise<RawGameOdds[]> }
```

`RawGameOdds` shape: `{ home_team_raw, away_team_raw, home_odds, away_odds, market_name, is_available }`

Adapter behaviour:
- Navigates to `config.base_url + config.nba_path`
- Settles with `waitForSettle()` (3 s for Ladbrokes/Sportsbet/PointsBet, 6 s for Bet365)
- Uses text-content matching to locate the correct market section (`moneyline_market_name`) — avoids brittle obfuscated class selectors
- Wraps entirely in try/catch — returns `[]` on geo-block or any error
- Bet365 uses a dual-strategy extraction (text-content first, class-pattern fallback) because its class names are obfuscated and change frequently

Orchestrator (`adapters/index.js`):
- `runAllAdapters(browser, bookmakerConfigs)` — one fresh page per book, per-book errors caught
- `buildEnrichment(matchupStr, bookOddsMap, aliasMap, bookmakerConfigs)` — resolves canonical team names, detects home/away ordering swap (some AU books list away team first), computes `best_available` across all 4 books
- Shared utilities (`adapters/shared.js`) mirror the patterns in the main scanner: `normalizeText`, `parseDecimalOdds`, `loadTeamAliases`, `resolveTeam`, `resolveMatchup`, `waitForSettle`, `dismissOverlays`

Geo-restriction behaviour: AU bookmaker sites require an AU IP. Geo-blocked books produce `is_available: false` for all their quotes — the run continues and coverage stats reflect the actual availability.

### Enrichment runner

`enrich-moneyline.js` (`npm run enrich:moneyline`):

1. Loads `capping-pro-nba-surfaces.json` + `config/moneyline_bookmakers.json`
2. Collects unique matchup strings from all surface items
3. Launches headless Chromium (1440×1800, matching the scanner)
4. Runs all 4 adapters via `runAllAdapters()`
5. Builds `MoneylineEnrichment` blocks for each matchup via `buildEnrichment()`
6. Attaches `moneyline_enrichment` to every surface item
7. Computes `MoneylineCoverageStats` per surface
8. Writes `capping-pro-nba-surfaces-enriched.json` (full `EnrichedNBADataset`)
9. Writes `moneyline-enrichment.run-summary.json` (per-book counts, coverage %, errors)

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
- **Moneyline Comparison section** on each card (when enriched data is present)

There are no fallback datasets. If a surface has zero valid approved-source NBA records, the UI shows the approved-source empty state for that surface.

#### Enriched data loading

`app.js` tries `capping-pro-nba-surfaces-enriched.json` first; falls back to the base `capping-pro-nba-surfaces.json` silently if the enriched file is absent. This means the UI works in both enriched and non-enriched modes with no code changes.

#### Moneyline Comparison card section

Rendered by `renderMoneylineComparison(item)` inside `pickCardMarkup()` and `renderFeatured()`.

Behaviour:
- `moneyline_enrichment === null` → renders nothing (base dataset mode, no UI regression)
- All 4 books unavailable → renders "No moneyline data available" message
- Otherwise → renders a 3-column grid (book name | home odds | away odds) for all 4 books in fixed order: Ladbrokes → Sportsbet → PointsBet → Bet365
  - Best home and away odds highlighted green (`.best-odds`)
  - Unavailable book rows faded to 40% opacity with `—` placeholder
  - Coverage count shown in header: e.g. "3 of 4 books"

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
      "moneyline_coverage": {
        "surface_id": "best-bets",
        "total_items": 94,
        "enrichable_items": 60,
        "enriched_items": 48,
        "books_with_coverage": ["ladbrokes", "sportsbet", "bet365"],
        "coverage_pct": 80
      },
      "items": [
        {
          "...existing item fields...",
          "moneyline_enrichment": {
            "matchup": "LAL vs BOS",
            "home_team": "Los Angeles Lakers",
            "away_team": "Boston Celtics",
            "quotes": {
              "ladbrokes":  { "is_available": true,  "home_odds": 1.85, "away_odds": 1.95, "market_name": "Head To Head", "retrieved_at": "..." },
              "sportsbet":  { "is_available": true,  "home_odds": 1.82, "away_odds": 2.00, "market_name": "Head To Head", "retrieved_at": "..." },
              "pointsbet":  { "is_available": false, "home_odds": null,  "away_odds": null,  "market_name": "Match Winner",  "retrieved_at": null },
              "bet365":     { "is_available": true,  "home_odds": 1.87, "away_odds": 1.93, "market_name": "Match Betting", "retrieved_at": "..." }
            },
            "best_available": {
              "home_best_odds": 1.87, "home_best_bookmaker": "bet365",
              "away_best_odds": 2.00, "away_best_bookmaker": "sportsbet"
            },
            "enriched_at": "..."
          }
        }
      ]
    }
  ]
}
```

Items without a resolvable matchup have `moneyline_enrichment: null`.

## npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `scan:nba-surfaces` | `node scan-capping-pro-nba-surfaces.js` | Run Playwright scanner against capping.pro |
| `enrich:moneyline` | `node enrich-moneyline.js` | Run bookmaker adapters, write enriched dataset |
| `summarize:nba-surfaces` | `python3 scripts/summarize_capping_pro_nba_surfaces.py ...` | Summarize grouped scan output |
| `typecheck` | `tsc --noEmit` | Verify TypeScript interfaces compile cleanly |

Typical run order:
1. `npm run scan:nba-surfaces` → generates base dataset
2. `npm run enrich:moneyline` → attaches bookmaker odds to base dataset (requires AU IP)
3. Serve `index.html` — UI auto-detects enriched file and shows Moneyline Comparison section

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
- `python3 -m py_compile scripts/summarize_capping_pro_nba_surfaces.py`
- live Playwright run of `scan-capping-pro-nba-surfaces.js`
- local browser smoke test against `python3 -m http.server`
- `npm run typecheck` (TypeScript interfaces, 0 errors)
- enrichment logic smoke test (null enrichment, 3-of-4 coverage, all-unavailable scenarios)

## Prompt History Context

This section is intended to preserve the prompt-driven evolution of the repo so future prompts can build on the latest intent instead of older assumptions.

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
