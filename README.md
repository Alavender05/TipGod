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

## Scannable Control Groups

Only control groups that can reveal different betting content, picks, games, or analysis should be scanned.

### High priority

- `Date picker`
  - matters because it fetches a different slate of NBA best bets by date
  - expected states: bounded date window
  - iterate: current date and adjacent game dates
  - interaction: set date input directly and wait for refresh
  - stop: date window exhausted or repeated no-change states

- `Category tabs`
  - matters because it reveals different subsets of recommendations
  - expected states: `4`
  - iterate: `Elite`, `Strong`, `Opportunistic`, `All`
  - interaction: click each tab
  - stop: all tabs visited

- `Prop threshold sliders`
  - matters because threshold changes alter recommended plays
  - expected states: sampled, not exhaustive
  - iterate: sampled values for `Points`, `Assists`, `Rebounds`
  - interaction: move one slider at a time, wait for debounced refresh
  - stop: additional sampled values no longer produce meaningful changes

- `Bet cards`
  - matters because each card opens detailed player-level analysis
  - expected states: one per visible card
  - iterate: each visible card once
  - interaction: click card, extract visible modal/sheet content, close
  - stop: all visible cards in the current parent state opened

### Medium priority

- `Lookback period`
  - expected states: `3`
  - iterate: `Last 7 Days`, `Last 14 Days`, `Last 30 Days`

- `Position filter`
  - expected states: `6`
  - iterate: `All Positions`, `PG`, `SG`, `SF`, `PF`, `C`

- `Team filter`
  - expected states: `1 + available teams`
  - iterate: `All Teams` plus each team option

- `Include Opponent toggle`
  - expected states: `2`
  - iterate: unchecked, checked
  - note: only available when a specific team is selected

- `Minimum confidence`
  - expected states: `6`
  - iterate: `60%+`, `65%+`, `70%+`, `75%+`, `80%+`, `85%+`

### Low priority

- `Injury filter`
  - matters because it can reveal or hide picks by injury status
  - expected states: bounded meaningful states only
  - iterate: default, `Show All`, and relevant single-status exclusions such as `Out` and `DTD`
  - interaction: open compact dropdown and toggle visible checkbox states
  - stop: default + meaningful alternates covered

### Excluded from sequential scanning

- `Sort by`
  - reorders the same records instead of reliably revealing new betting content

- `Refresh analysis`
  - refreshes the current state but is not a meaningful state dimension by itself

## Extraction Target

The smallest repeatable meaningful betting unit on the page is the individual recommendation card.

- `unit_name`: `NBA best bet card`
- `container selector`: `.nba-best-bets-grid .nba-best-bet-card`
- repeated as: `grid`
- duplicate suppression needed: `yes`

### Child fields to extract

- `player_name`
- `team`
- `opponent`
- `matchup`
- `position`
- `is_home`
- `market_type` / `prop_type`
- `recommended_play`
- `line`
- `pick_side`
- `hit_rate`
- `confidence`
- `average_stat`
- `opponent_allowed_stat`
- `edge_reason`
- `tier`
- `games_analyzed`
- `injury_status`
- `detail_notes` / modal analysis when opened

### Field selectors

- `player_name`: `.nba-best-bet-card .player-name`
- `position`: `.nba-best-bet-card .position-badge`
- `matchup`: `.nba-best-bet-card .team-matchup`
- `minutes`: `.nba-best-bet-card .minutes-badge`
- `confidence`: `.nba-best-bet-card .confidence-value`
- `recommended_play label`: `.nba-best-bet-card .threshold-label`
- `recommended_play value`: `.nba-best-bet-card .threshold-value`
- `edge_reason`: `.nba-best-bet-card .edge-reason`
- `tier`: `.nba-best-bet-card .tier-badge`
- `games_analyzed`: `.nba-best-bet-card .games-analyzed`
- `detail modal root`: `.nba-modal-overlay .nba-modal-content` or `.ios-bottom-sheet`
- `detail insights`: `.nba-insights-section`, `.nba-insight-item`

### Duplicate suppression rule

Use a stable item fingerprint such as:

- `player_name + matchup + recommended_play + tier`

This is needed because the same underlying pick may reappear across:

- category tabs
- date states
- confidence thresholds
- team/position filters
- summary and detail views

## Interaction Plan

The scanner should iterate one control group at a time, wait for DOM stability after every interaction, and descend into nested controls only within the current parent state.

### 1. Initialize and capture baseline

- action: load page and capture baseline visible betting content
- selectors:
  - page root: `.nba-best-bets-container`
  - card root: `.nba-best-bets-grid .nba-best-bet-card`
- wait:
  - wait for root
  - wait for loading indicators to disappear
  - wait for short DOM quiet period
- success:
  - cards, no-results, or error state is visible
- fallback:
  - hard wait and continue with current visible state
- dedupe:
  - store page fingerprint from visible card fingerprints

### 2. Enumerate bounded state lists

- action: collect visible options before interacting
- selectors:
  - `.date-picker`
  - `.category-tabs .category-tab`
  - labeled selects for `Lookback Period`, `Position`, `Team`, `Min Confidence`
  - `.matchup-toggle input[type="checkbox"]`
  - `.injury-filter-compact`
  - `#points-threshold`, `#assists-threshold`, `#rebounds-threshold`
- wait:
  - confirm controls exist
- success:
  - finite candidate state lists exist
- fallback:
  - infer from labels or option values
- dedupe:
  - canonical state key: `group::value`

### 3. Scan date states

- action: iterate the date picker first
- wait:
  - after change, wait for refresh completion and grid stability
- success:
  - visible card set or empty state changes
- fallback:
  - set value directly and dispatch `input` / `change`
- dedupe:
  - stop when repeated fingerprints occur across attempted dates

### 4. Scan lookback states

- action: iterate `Last 7 Days`, `Last 14 Days`, `Last 30 Days`
- wait:
  - refresh completion plus DOM quiet
- success:
  - visible content changes meaningfully
- fallback:
  - assign select value directly
- dedupe:
  - skip if fingerprint already seen under the same date

### 5. Scan category tabs

- action: click `Elite`, `Strong`, `Opportunistic`, `All`
- wait:
  - active tab changes and grid stabilizes
- success:
  - card set or category description changes
- fallback:
  - retry with direct click on tab button
- dedupe:
  - skip categories with identical fingerprints in the current parent branch

### 6. Scan position filter

- action: iterate `All Positions`, `PG`, `SG`, `SF`, `PF`, `C`
- wait:
  - stable grid after selection
- success:
  - visible cards or no-results state changes
- fallback:
  - direct select assignment
- dedupe:
  - skip duplicate fingerprints under the same parent branch

### 7. Scan team filter

- action: iterate `All Teams` plus each available team
- wait:
  - refresh completion and DOM quiet
- success:
  - different visible recommendation set
- fallback:
  - direct select assignment
- dedupe:
  - state key includes `team`

### 8. Scan nested opponent toggle

- action: if present under a chosen team, scan unchecked and checked
- wait:
  - refresh completion and stable grid
- success:
  - visible cards differ between toggle states
- fallback:
  - toggle checkbox property and dispatch `change`
- dedupe:
  - if both states are identical, keep one and stop descending

### 9. Scan minimum confidence

- action: iterate all visible threshold values
- wait:
  - include extra buffer for debounced refresh
- success:
  - visible cards or count changes
- fallback:
  - direct select assignment, then blur
- dedupe:
  - stop early if adjacent thresholds repeatedly produce the same fingerprint

### 10. Scan injury filter

- action: open compact injury dropdown and scan bounded meaningful states
- wait:
  - dropdown appears, then grid stabilizes after each change
- success:
  - card visibility changes by injury status
- fallback:
  - if dropdown fails, keep default state only
- dedupe:
  - scan only default, `Show All`, and single-status exclusions

### 11. Scan threshold sliders

- action: sample slider values one slider at a time
- wait:
  - debounced refresh completion and DOM quiet
- success:
  - card set or recommended threshold text changes
- fallback:
  - set range value directly and dispatch `input` + `change`
- dedupe:
  - stop after consecutive sampled states yield the same fingerprint

### 12. Extract only visible betting content

- action: after every accepted state, extract visible `.nba-best-bet-card` items only
- wait:
  - extract only after stability passes
- success:
  - each item contains at least a player identifier and recommended play
- fallback:
  - capture partial visible fields if some selectors fail
- dedupe:
  - per-state item fingerprint: `player_name + matchup + recommended_play + tier`

### 13. Scan nested card details

- action: open each visible bet card once
- selectors:
  - card: `.nba-best-bet-card`
  - detail: `.nba-modal-overlay .nba-modal-content` or `.ios-bottom-sheet`
- wait:
  - detail container appears and loading state clears
- success:
  - detail analysis or insight content becomes visible
- fallback:
  - retry once, then keep summary-only extraction
- dedupe:
  - open each card once per parent state

### 14. Close detail and restore parent state

- action: close modal/sheet before continuing
- selectors:
  - `.nba-modal-close-btn`
  - `.nba-modal-close-x`
  - sheet close button or backdrop if supported
- wait:
  - modal disappears and the original grid is stable again
- success:
  - parent grid fingerprint matches pre-open state
- fallback:
  - use Escape or rebuild parent state from control path
- dedupe:
  - do not reopen the same card in the same branch

### 15. Global loop guards

- action: enforce branch-level stopping rules
- strategy:
  - maintain hierarchical path:
    - `date -> lookback -> category -> position -> team -> include_opponent -> min_confidence -> injury_filter -> slider_sample -> card_detail`
- wait:
  - before each interaction, confirm page is stable
- success:
  - scanner only progresses to unseen state keys
- fallback:
  - if unstable or cyclic, back out to last stable parent branch
- dedupe:
  - keep:
    - `visited_control_states`
    - `visible_content_fingerprints`
  - stop descending when either repeats at the same hierarchy level

## Implementation

A production-style Playwright scanner has been added to the workspace:

- script: [scan-nba-bestbets.js](C:/Users/AlecLavender/OneDrive%20-%20StoreLocal/codex%20test/scan-nba-bestbets.js)
- output: `nba-bestbets-scan.json`

### What the script does

- loads `https://capping.pro/nba-bestbets`
- dismisses common cookie / modal overlays when present
- detects meaningful control groups
- traverses nested states in depth-first order
- waits for visible content stabilization after each interaction
- extracts only visible betting cards
- opens active card detail panels and extracts visible supporting analysis
- tracks `scan_path`
- deduplicates repeated items and repeated state fingerprints
- writes clean JSON output

### Traversal implemented

The script follows this practical nested order:

- `Date`
- `Lookback Period`
- `Category`
- `Position`
- `Team`
- `Include Opponent` when available
- `Min Confidence`
- `Injury Filter` using bounded meaningful states
- sampled threshold sliders:
  - `Points`
  - `Assists`
  - `Rebounds`
- visible bet cards and their active detail panels

### Production behaviors included

- retry logic for click failures
- semantic/structural selector preference where possible
- direct DOM fallback for difficult selects and range inputs
- content-change detection using visible-content hashing
- bounded traversal to avoid infinite loops
- duplicate suppression for both states and items
- extraction of visible content only unless a hidden panel becomes active

### Current caveat

The script was added and reviewed in the workspace, but runtime verification could not be performed here because `node` was not available in the current environment.

## Change Log

This section is intended to act as the running history log for the project so future updates can build on prior work.

### 2026-03-11

- Audited `https://capping.pro/nba-bestbets` and documented the page as a:
  - `repeating card feed`
  - `dynamic dashboard`
  - `mixed layout`

- Identified the page’s meaningful content-changing controls:
  - `Date`
  - `Lookback Period`
  - `Category`
  - `Position`
  - `Team`
  - `Include Opponent`
  - `Min Confidence`
  - `Injury Filter`
  - threshold sliders for:
    - `Points`
    - `Assists`
    - `Rebounds`
  - visible bet cards with nested detail panels

- Documented which control groups should be scanned sequentially and which should be excluded:
  - excluded from state traversal:
    - `Sort By`
    - `Refresh Analysis`

- Defined the extraction target as the smallest meaningful repeatable unit:
  - `NBA best bet card`
  - container:
    - `.nba-best-bets-grid .nba-best-bet-card`

- Added a structured interaction plan for scanning:
  - depth-first traversal through nested parent/child state
  - DOM stability waiting after each interaction
  - visible-content-only extraction
  - duplicate suppression at both state and item level

- Added a JavaScript Playwright scanner:
  - file:
    - [scan-nba-bestbets.js](C:/Users/AlecLavender/OneDrive%20-%20StoreLocal/codex%20test/scan-nba-bestbets.js)
  - intended output:
    - `nba-bestbets-scan.json`
  - features:
    - control detection
    - nested traversal
    - visible item extraction
    - detail modal enrichment
    - content hashing
    - retry logic
    - deduplication

- Added a Python Playwright scanner:
  - file:
    - [scan_nba_bestbets.py](C:/Users/AlecLavender/OneDrive%20-%20StoreLocal/codex%20test/scan_nba_bestbets.py)
  - intended output:
    - `nba-bestbets-scan-python.json`
  - helper functions included:
    - `get_control_groups()`
    - `activate_control()`
    - `wait_for_content_change()`
    - `extract_visible_items()`
    - `normalize_item()`
    - `deduplicate_items()`

- Documented the nested traversal tree for the page:
  - `Date -> Lookback -> Category -> Position -> Team -> Include Opponent -> Min Confidence -> Injury Filter -> Threshold Sliders -> Bet Cards`

- Documented key failure modes for the reader design, including:
  - non-semantic controls
  - React re-render invalidation
  - hidden-but-present DOM content
  - duplicate cards across states
  - modal/bottom-sheet differences across layouts
  - sticky overlays intercepting clicks
  - stale selectors caused by class churn

- Current verification status:
  - JavaScript scanner was not runtime-verified because `node` was unavailable in the environment.
  - Python scanner was not runtime-verified because Python bootstrap/runtime installation failed in the environment.
  - No extracted JSON output file was present in the workspace at the time of review, so downstream data-summary analysis could not be completed against real scan results.

- Recommended next update:
  - run one of the scanners in an environment with working Playwright runtime support
  - save the resulting JSON to the workspace
  - add a new history entry summarizing:
    - total extracted items
    - strongest scan paths
    - duplicate rates
    - repeated matchups
    - any selector or traversal fixes needed after the first real run

- First verified runtime pass completed in the workspace on `2026-03-11` using:
  - JavaScript scanner:
    - `node v24.11.1`
    - output:
      - `nba-bestbets-scan.json`
      - `nba-bestbets-scan.run-summary.json`
      - `nba-bestbets-scan.summary.json`
  - Python parity scanner:
    - `python3`
    - output:
      - `nba-bestbets-scan-python.json`
      - `nba-bestbets-scan-python.run-summary.json`

- First real run summary:
  - total extracted items:
    - `0`
  - strongest scan paths:
    - none; the live route exposed no NBA best-bet states or cards
  - duplicate rate:
    - `0.0000`
  - repeated matchups:
    - none

- Live-site findings from the first real run:
  - `https://capping.pro/nba-bestbets` stayed on the `nba-bestbets` route but hydrated into an NFL dashboard shell instead of the expected NBA best-bets view.
  - observed network activity hit `capping.pro/api/nfl/*` endpoints rather than `capping.pro/api/nba/*`.
  - both scanners detected:
    - `0` control groups
    - `1` visited state
    - `0` visible extractable cards

- Selector and traversal fixes made after the first real run:
  - changed the page-root wait target from `.nba-best-bets-container` to `#root` so the scanners no longer fail before emitting artifacts when the upstream page shape is wrong
  - added run-summary sidecar files capturing:
    - raw extracted card count
    - unique item count
    - duplicate item count
    - visited state count
    - repeated content hash count
    - detail modal failures
    - selector activation failures
    - detected control groups
    - empty states after interaction
  - added a reproducible summary helper:
    - `python3 scripts/summarize_nba_bestbets_scan.py nba-bestbets-scan.json`

- Current parity status:
  - JavaScript and Python scanners now agree on the live result:
    - empty output caused by upstream route/content mismatch rather than scanner divergence
  - no additional selector fixes are justified until the site serves the NBA page again or a new NBA route is identified
