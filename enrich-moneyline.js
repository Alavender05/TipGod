'use strict';

/**
 * enrich-moneyline.js
 *
 * CLI entry point for NBA moneyline enrichment.
 *
 * Usage:
 *   node enrich-moneyline.js
 *
 * Reads:
 *   capping-pro-nba-surfaces.json          — base NBA surface dataset
 *   config/moneyline_bookmakers.json       — approved bookmaker config
 *   config/source_policy.json              — NBA team alias registry (via adapters/shared)
 *
 * Writes:
 *   capping-pro-nba-surfaces-enriched.json — EnrichedNBADataset
 *   moneyline-enrichment.run-summary.json  — per-book counts, coverage, errors
 *
 * Process:
 *  1. Load input dataset and bookmaker config.
 *  2. Build alias map for canonical team name resolution.
 *  3. Collect all unique matchup strings from surface items.
 *  4. Launch headless Chromium (1440×1800 viewport, matching the scanner).
 *  5. Run all 4 bookmaker adapters via runAllAdapters().
 *  6. Build an enrichment cache: matchupStr → MoneylineEnrichment | null.
 *  7. For each surface item with a non-null matchup, attach enrichment.
 *  8. Compute MoneylineCoverageStats per surface.
 *  9. Write enriched dataset and run summary.
 *
 * Geo-restriction note:
 *   AU bookmaker sites require an AU IP address or VPN. Geo-blocked books
 *   will return is_available: false for all their quotes — the run continues.
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const { ADAPTERS, runAllAdapters, buildEnrichment, loadTeamAliases } = require('./adapters/index');

// ─── Paths ───────────────────────────────────────────────────────────────────

const INPUT_PATH           = path.join(__dirname, 'capping-pro-nba-surfaces.json');
const OUTPUT_PATH          = path.join(__dirname, 'capping-pro-nba-surfaces-enriched.json');
const RUN_SUMMARY_PATH     = path.join(__dirname, 'moneyline-enrichment.run-summary.json');
const BOOKMAKERS_CFG_PATH  = path.join(__dirname, 'config', 'moneyline_bookmakers.json');

const APPROVED_BOOKMAKERS = ['ladbrokes', 'sportsbet', 'pointsbet', 'bet365'];

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`[enrich-moneyline] Starting at ${startedAt}`);

  // 1. Load inputs
  const inputDataset     = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const bookmakersCfg    = JSON.parse(fs.readFileSync(BOOKMAKERS_CFG_PATH, 'utf8'));
  const bookmakerConfigs = bookmakersCfg.bookmakers;
  const aliasMap         = loadTeamAliases();

  console.log(`[enrich-moneyline] Loaded dataset: ${inputDataset.surfaces.length} surfaces`);

  // 2. Collect unique matchup strings across all surface items
  const matchupSet = new Set();
  for (const surface of inputDataset.surfaces) {
    for (const item of surface.items || []) {
      if (item.matchup) matchupSet.add(item.matchup);
    }
  }
  const uniqueMatchups = [...matchupSet];
  console.log(`[enrich-moneyline] Unique matchups to enrich: ${uniqueMatchups.length}`);

  // 3. Launch browser
  const browser = await chromium.launch({ headless: true });
  let bookOddsMap = {};
  let adapterHealth = {};

  try {
    // 4. Run all 4 adapters
    const adapterResult = await runAllAdapters(browser, bookmakerConfigs);
    bookOddsMap   = adapterResult.oddsMap;
    adapterHealth = adapterResult.adapterHealth;
  } finally {
    await browser.close();
  }

  // Log per-book health summary
  for (const slug of APPROVED_BOOKMAKERS) {
    const health = adapterHealth[slug] || {};
    const status = health.error ? `ERROR: ${health.error}` : `OK (${health.raw_games} games)`;
    console.log(`[enrich-moneyline] ${slug}: ${status}`);
  }

  // 5. Build enrichment cache: matchupStr → MoneylineEnrichment | null
  const enrichmentCache = new Map();
  for (const matchupStr of uniqueMatchups) {
    const enrichment = buildEnrichment(matchupStr, bookOddsMap, aliasMap, bookmakerConfigs);
    enrichmentCache.set(matchupStr, enrichment);
  }

  // 6. Attach enrichment to items and compute coverage per surface
  const enrichedAt = new Date().toISOString();
  const enrichedSurfaces = [];

  for (const surface of inputDataset.surfaces) {
    const enrichedItems = (surface.items || []).map((item) => {
      const enrichment = item.matchup ? (enrichmentCache.get(item.matchup) || null) : null;
      return { ...item, moneyline_enrichment: enrichment };
    });

    const coverage = computeCoverageStats(surface.id, enrichedItems);

    enrichedSurfaces.push({
      id: surface.id,
      label: surface.label,
      source_url: surface.source_url,
      scan_summary: surface.scan_summary || null,
      items: enrichedItems,
      moneyline_coverage: coverage,
    });

    console.log(
      `[enrich-moneyline] Surface "${surface.id}": ` +
      `${coverage.enriched_items}/${coverage.enrichable_items} items enriched ` +
      `(${coverage.coverage_pct}%)`
    );
  }

  // 7. Assemble EnrichedNBADataset
  const enrichedDataset = {
    generated_at: inputDataset.generated_at,
    enriched_at: enrichedAt,
    source_domain: inputDataset.source_domain || 'capping.pro',
    league_id: inputDataset.league_id || 'NBA',
    sport: inputDataset.sport || 'Basketball',
    approved_bookmakers: APPROVED_BOOKMAKERS,
    surfaces: enrichedSurfaces,
  };

  // 8. Write enriched dataset
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedDataset, null, 2), 'utf8');
  console.log(`[enrich-moneyline] Wrote enriched dataset → ${path.basename(OUTPUT_PATH)}`);

  // 9. Write run summary
  const runSummary = buildRunSummary(startedAt, enrichedAt, enrichedSurfaces, bookOddsMap, adapterHealth);
  fs.writeFileSync(RUN_SUMMARY_PATH, JSON.stringify(runSummary, null, 2), 'utf8');
  console.log(`[enrich-moneyline] Wrote run summary → ${path.basename(RUN_SUMMARY_PATH)}`);
  console.log(`[enrich-moneyline] Done.`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute MoneylineCoverageStats for one surface.
 *
 * @param {string} surfaceId
 * @param {Array} enrichedItems
 * @returns {import('./types/moneyline-enrichment').MoneylineCoverageStats}
 */
function computeCoverageStats(surfaceId, enrichedItems) {
  const total_items      = enrichedItems.length;
  const enrichable_items = enrichedItems.filter((i) => i.matchup != null).length;
  const enriched_items   = enrichedItems.filter(
    (i) => i.moneyline_enrichment !== null
  ).length;

  // Books that provided at least one available quote across this surface
  const booksWithCoverage = new Set();
  for (const item of enrichedItems) {
    if (!item.moneyline_enrichment) continue;
    for (const [slug, quote] of Object.entries(item.moneyline_enrichment.quotes)) {
      if (quote.is_available) booksWithCoverage.add(slug);
    }
  }

  const coverage_pct = enrichable_items > 0
    ? Math.round((enriched_items / enrichable_items) * 100)
    : 0;

  return {
    surface_id: surfaceId,
    total_items,
    enrichable_items,
    enriched_items,
    books_with_coverage: [...booksWithCoverage],
    coverage_pct,
  };
}

/**
 * Build the run summary object written to moneyline-enrichment.run-summary.json.
 *
 * @param {string} startedAt
 * @param {string} enrichedAt
 * @param {Array} enrichedSurfaces
 * @param {Record<string, Array>} bookOddsMap
 * @param {Record<string, object>} adapterHealth
 * @returns {object}
 */
function buildRunSummary(startedAt, enrichedAt, enrichedSurfaces, bookOddsMap, adapterHealth) {
  const surfaceSummaries = enrichedSurfaces.map((s) => ({
    surface_id: s.id,
    label: s.label,
    ...s.moneyline_coverage,
  }));

  const totalEnrichable = surfaceSummaries.reduce((acc, s) => acc + s.enrichable_items, 0);
  const totalEnriched   = surfaceSummaries.reduce((acc, s) => acc + s.enriched_items, 0);

  const perBook = {};
  for (const slug of APPROVED_BOOKMAKERS) {
    const health = adapterHealth[slug] || {};
    perBook[slug] = {
      raw_games_found: health.raw_games ?? (bookOddsMap[slug] || []).length,
      adapter_success: health.error === null || health.error === undefined,
      error: health.error || null,
      started_at: health.started_at || null,
      finished_at: health.finished_at || null,
    };
  }

  const failedAdapters = Object.entries(perBook)
    .filter(([, v]) => !v.adapter_success)
    .map(([slug]) => slug);

  return {
    started_at: startedAt,
    enriched_at: enrichedAt,
    approved_bookmakers: APPROVED_BOOKMAKERS,
    failed_adapters: failedAdapters,
    total_enrichable_items: totalEnrichable,
    total_enriched_items: totalEnriched,
    overall_coverage_pct: totalEnrichable > 0
      ? Math.round((totalEnriched / totalEnrichable) * 100)
      : 0,
    per_book: perBook,
    surfaces: surfaceSummaries,
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error('[enrich-moneyline] Fatal error:', err.message);
  process.exit(1);
});
