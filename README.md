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
- frontend:
  - [app.js](/workspaces/TipGod/app.js)
  - [index.html](/workspaces/TipGod/index.html)
  - [styles.css](/workspaces/TipGod/styles.css)
- source policy:
  - [config/source_policy.json](/workspaces/TipGod/config/source_policy.json)
- summary helper:
  - [scripts/summarize_capping_pro_nba_surfaces.py](/workspaces/TipGod/scripts/summarize_capping_pro_nba_surfaces.py)
- generated artifacts:
  - [capping-pro-nba-surfaces.json](/workspaces/TipGod/capping-pro-nba-surfaces.json)
  - [capping-pro-nba-surfaces.run-summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.run-summary.json)
  - [capping-pro-nba-surfaces.summary.json](/workspaces/TipGod/capping-pro-nba-surfaces.summary.json)

## Current Architecture

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

There are no fallback datasets. If a surface has zero valid approved-source NBA records, the UI shows the approved-source empty state for that surface.

## Current Data Contract

Primary dataset shape:

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
- `python3 -m py_compile scripts/summarize_capping_pro_nba_surfaces.py`
- live Playwright run of `scan-capping-pro-nba-surfaces.js`
- local browser smoke test against `python3 -m http.server`

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

## Change Log

### 2026-03-11

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
