'use strict';

/**
 * enrich-moneyline.js
 *
 * CLI entry point for generic bookmaker enrichment.
 * The script name is retained for compatibility, but the attached item field is
 * now `bookmaker_enrichment` with a temporary `moneyline_enrichment` compatibility
 * block where game-level moneyline data exists.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const {
  APPROVED_BOOKMAKERS,
  runAllAdapters,
  buildMarketIndex,
  buildItemEnrichment,
  toLegacyMoneylineEnrichment,
  loadTeamAliases,
} = require('./adapters/index');

const INPUT_PATH = path.join(__dirname, 'capping-pro-nba-surfaces.json');
const OUTPUT_PATH = path.join(__dirname, 'capping-pro-nba-surfaces-enriched.json');
const RUN_SUMMARY_PATH = path.join(__dirname, 'moneyline-enrichment.run-summary.json');
const BOOKMAKERS_CFG_PATH = path.join(__dirname, 'config', 'moneyline_bookmakers.json');

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`[enrich-moneyline] Starting at ${startedAt}`);

  const inputDataset = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const bookmakersCfg = JSON.parse(fs.readFileSync(BOOKMAKERS_CFG_PATH, 'utf8'));
  const bookmakerConfigs = bookmakersCfg.bookmakers;
  const aliasMap = loadTeamAliases();

  console.log(`[enrich-moneyline] Loaded dataset: ${inputDataset.surfaces.length} surfaces`);

  const browser = await chromium.launch({ headless: true });
  let marketMap = {};
  let oddsMap = {};
  let adapterHealth = {};

  try {
    const adapterResult = await runAllAdapters(browser, bookmakerConfigs);
    marketMap = adapterResult.marketMap;
    oddsMap = adapterResult.oddsMap;
    adapterHealth = adapterResult.adapterHealth;
  } finally {
    await browser.close();
  }

  for (const slug of APPROVED_BOOKMAKERS) {
    const health = adapterHealth[slug] || {};
    const status = health.error
      ? `ERROR: ${health.error}`
      : `OK (${health.raw_games} games, ${health.normalized_offers} offers)`;
    console.log(`[enrich-moneyline] ${slug}: ${status}`);
  }

  const marketIndex = buildMarketIndex(marketMap, bookmakerConfigs);
  const enrichedAt = new Date().toISOString();
  const enrichedSurfaces = [];

  for (const surface of inputDataset.surfaces) {
    const enrichedItems = (surface.items || []).map((item) => {
      const bookmakerEnrichment = buildItemEnrichment(item, marketIndex, aliasMap);
      return {
        ...item,
        bookmaker_enrichment: bookmakerEnrichment,
        moneyline_enrichment: bookmakerEnrichment
          ? toLegacyMoneylineEnrichment(bookmakerEnrichment)
          : null,
      };
    });

    const coverage = computeCoverageStats(surface.id, enrichedItems);

    enrichedSurfaces.push({
      id: surface.id,
      label: surface.label,
      source_url: surface.source_url,
      scan_summary: surface.scan_summary || null,
      items: enrichedItems,
      bookmaker_coverage: coverage,
      moneyline_coverage: coverage,
    });

    console.log(
      `[enrich-moneyline] Surface "${surface.id}": ` +
      `${coverage.enriched_items}/${coverage.enrichable_items} items enriched ` +
      `(${coverage.coverage_pct}%)`
    );
  }

  const enrichedDataset = {
    generated_at: inputDataset.generated_at,
    enriched_at: enrichedAt,
    source_domain: inputDataset.source_domain || 'capping.pro',
    league_id: inputDataset.league_id || 'NBA',
    sport: inputDataset.sport || 'Basketball',
    approved_bookmakers: APPROVED_BOOKMAKERS,
    surfaces: enrichedSurfaces,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedDataset, null, 2), 'utf8');
  console.log(`[enrich-moneyline] Wrote enriched dataset → ${path.basename(OUTPUT_PATH)}`);

  const runSummary = buildRunSummary(startedAt, enrichedAt, enrichedSurfaces, marketMap, oddsMap, adapterHealth);
  fs.writeFileSync(RUN_SUMMARY_PATH, JSON.stringify(runSummary, null, 2), 'utf8');
  console.log(`[enrich-moneyline] Wrote run summary → ${path.basename(RUN_SUMMARY_PATH)}`);
  console.log('[enrich-moneyline] Done.');
}

function computeCoverageStats(surfaceId, enrichedItems) {
  const total_items = enrichedItems.length;
  const enrichable_items = enrichedItems.filter((item) => item.matchup != null || item.team != null).length;
  const enriched_items = enrichedItems.filter((item) => item.bookmaker_enrichment !== null).length;

  const booksWithCoverage = new Set();
  const marketTypeCounts = {};
  for (const item of enrichedItems) {
    const match = item.bookmaker_enrichment?.matched_market;
    if (match) {
      marketTypeCounts[match.market_type] = (marketTypeCounts[match.market_type] || 0) + 1;
      for (const [slug, quote] of Object.entries(match.quotes)) {
        if (quote.is_available) booksWithCoverage.add(slug);
      }
      continue;
    }

    const gameMarkets = item.bookmaker_enrichment?.game_bundle?.markets || [];
    for (const market of gameMarkets) {
      for (const [slug, quote] of Object.entries(market.quotes)) {
        if (quote.is_available) booksWithCoverage.add(slug);
      }
    }
  }

  return {
    surface_id: surfaceId,
    total_items,
    enrichable_items,
    enriched_items,
    books_with_coverage: [...booksWithCoverage],
    market_type_counts: marketTypeCounts,
    coverage_pct: enrichable_items > 0
      ? Math.round((enriched_items / enrichable_items) * 100)
      : 0,
  };
}

function buildRunSummary(startedAt, enrichedAt, enrichedSurfaces, marketMap, oddsMap, adapterHealth) {
  const surfaceSummaries = enrichedSurfaces.map((surface) => ({
    surface_id: surface.id,
    label: surface.label,
    ...surface.bookmaker_coverage,
  }));

  const totalEnrichable = surfaceSummaries.reduce((acc, surface) => acc + surface.enrichable_items, 0);
  const totalEnriched = surfaceSummaries.reduce((acc, surface) => acc + surface.enriched_items, 0);

  const perBook = {};
  for (const slug of APPROVED_BOOKMAKERS) {
    const health = adapterHealth[slug] || {};
    const market_type_counts = {};
    for (const offer of marketMap[slug] || []) {
      market_type_counts[offer.market_type] = (market_type_counts[offer.market_type] || 0) + 1;
    }
    perBook[slug] = {
      raw_games_found: health.raw_games ?? (oddsMap[slug] || []).length,
      normalized_offers_found: health.normalized_offers ?? (marketMap[slug] || []).length,
      market_type_counts,
      adapter_success: health.error === null || health.error === undefined,
      error: health.error || null,
      started_at: health.started_at || null,
      finished_at: health.finished_at || null,
    };
  }

  const failedAdapters = Object.entries(perBook)
    .filter(([, value]) => !value.adapter_success)
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

run().catch((error) => {
  console.error(`[enrich-moneyline] Fatal: ${error.stack || error.message || String(error)}`);
  process.exitCode = 1;
});
