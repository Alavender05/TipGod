'use strict';

/**
 * scripts/generate-demo-enrichment.js
 *
 * Generates a demo `capping-pro-nba-surfaces-enriched.json` with synthetic
 * AU decimal moneyline odds for all 4 approved bookmakers.
 *
 * This script produces output in the exact same shape as `enrich-moneyline.js`
 * so the UI renders the Moneyline Comparison section without requiring an AU IP.
 *
 * Usage:
 *   node scripts/generate-demo-enrichment.js
 *   npm run demo:enrichment
 *
 * Odds are seeded by matchup string for reproducibility across re-runs.
 * Unavailability simulates ~30% geo-block rate for PointsBet.
 */

const fs   = require('fs');
const path = require('path');

const { loadTeamAliases, resolveMatchup } = require('../adapters/shared');

// ─── Paths ───────────────────────────────────────────────────────────────────

const INPUT_PATH       = path.join(__dirname, '../capping-pro-nba-surfaces.json');
const OUTPUT_PATH      = path.join(__dirname, '../capping-pro-nba-surfaces-enriched.json');
const RUN_SUMMARY_PATH = path.join(__dirname, '../moneyline-enrichment.run-summary.json');

// ─── Config ──────────────────────────────────────────────────────────────────

const APPROVED_BOOKMAKERS = ['ladbrokes', 'sportsbet', 'pointsbet', 'bet365'];

const BOOKMAKER_META = {
  ladbrokes:  { name: 'Ladbrokes',  market_name: 'Head To Head' },
  sportsbet:  { name: 'Sportsbet',  market_name: 'Head To Head' },
  pointsbet:  { name: 'PointsBet',  market_name: 'Match Winner' },
  bet365:     { name: 'Bet365',     market_name: 'Match Betting' },
};

// ─── Deterministic seeded RNG (mulberry32) ────────────────────────────────────

function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Odds generation ─────────────────────────────────────────────────────────

/**
 * Generate realistic AU decimal odds for a matchup.
 * Uses implied probability to ensure home + away overround is ~5–8%.
 *
 * @param {string} matchupStr
 * @returns {Record<string, { home_odds: number|null, away_odds: number|null, is_available: boolean }>}
 */
function generateOdds(matchupStr) {
  const rng = makeRng(strHash(matchupStr));

  // Base implied probability for home team (45%–65% range)
  const homeImplied = 0.45 + rng() * 0.20;
  const awayImplied = 1 - homeImplied;

  // Overround: add ~5–8% margin per book
  const bookParams = [
    { slug: 'ladbrokes', margin: 0.055, jitter: 0.012 },
    { slug: 'sportsbet',  margin: 0.058, jitter: 0.010 },
    { slug: 'pointsbet',  margin: 0.060, jitter: 0.015 },
    { slug: 'bet365',     margin: 0.052, jitter: 0.018 },
  ];

  const result = {};

  for (const book of bookParams) {
    const j = (rng() - 0.5) * 2 * book.jitter;
    const effectiveMargin = book.margin + j;
    const totalImplied = 1 + effectiveMargin;

    const rawHome = homeImplied * totalImplied;
    const rawAway = awayImplied * totalImplied;

    // Convert implied probability to decimal odds
    const homeOdds = Math.round((1 / rawHome) * 100) / 100;
    const awayOdds = Math.round((1 / rawAway) * 100) / 100;

    // PointsBet unavailable ~30% of the time (simulates geo-block)
    const unavailable = book.slug === 'pointsbet' && rng() < 0.30;

    result[book.slug] = {
      home_odds: unavailable ? null : homeOdds,
      away_odds: unavailable ? null : awayOdds,
      is_available: !unavailable,
    };
  }

  return result;
}

// ─── Build enrichment block ───────────────────────────────────────────────────

function buildBestAvailable(quotes) {
  let home_best_odds = null, home_best_bookmaker = null;
  let away_best_odds = null, away_best_bookmaker = null;

  for (const [slug, quote] of Object.entries(quotes)) {
    if (!quote.is_available) continue;
    if (quote.home_odds !== null && (home_best_odds === null || quote.home_odds > home_best_odds)) {
      home_best_odds = quote.home_odds;
      home_best_bookmaker = slug;
    }
    if (quote.away_odds !== null && (away_best_odds === null || quote.away_odds > away_best_odds)) {
      away_best_odds = quote.away_odds;
      away_best_bookmaker = slug;
    }
  }

  return { home_best_odds, home_best_bookmaker, away_best_odds, away_best_bookmaker };
}

function buildEnrichment(matchupStr, home_team, away_team, enrichedAt) {
  const generatedOdds = generateOdds(matchupStr);

  const quotes = {};
  for (const slug of APPROVED_BOOKMAKERS) {
    const meta = BOOKMAKER_META[slug];
    const odds = generatedOdds[slug];
    quotes[slug] = {
      bookmaker: slug,
      bookmaker_name: meta.name,
      home_odds: odds.home_odds,
      away_odds: odds.away_odds,
      market_name: meta.market_name,
      retrieved_at: odds.is_available ? enrichedAt : null,
      is_available: odds.is_available,
    };
  }

  return {
    matchup: matchupStr,
    home_team,
    away_team,
    quotes,
    best_available: buildBestAvailable(quotes),
    enriched_at: enrichedAt,
  };
}

// ─── Coverage stats (mirrors enrich-moneyline.js) ────────────────────────────

function computeCoverageStats(surfaceId, enrichedItems) {
  const total_items      = enrichedItems.length;
  const enrichable_items = enrichedItems.filter((i) => i.matchup != null).length;
  const enriched_items   = enrichedItems.filter((i) => i.moneyline_enrichment !== null).length;

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

// ─── Main ────────────────────────────────────────────────────────────────────

function run() {
  const startedAt = new Date().toISOString();
  console.log(`[demo-enrichment] Starting at ${startedAt}`);

  const inputDataset = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const aliasMap     = loadTeamAliases();
  const enrichedAt   = new Date().toISOString();

  // Collect unique matchup strings and resolve team names
  const matchupCache = new Map(); // matchupStr → { home_team, away_team } | null
  for (const surface of inputDataset.surfaces) {
    for (const item of surface.items || []) {
      if (item.matchup && !matchupCache.has(item.matchup)) {
        // Handle both "HOU vs DEN" and "TOR@NOP" formats
        const parts = item.matchup.split(/\s*(?:vs\.?|@|at)\s*/i);
        const resolved = resolveMatchup(
          parts[0]?.trim() || '',
          parts[1]?.trim() || '',
          aliasMap
        );
        matchupCache.set(item.matchup, resolved); // null if unresolvable
      }
    }
  }

  const resolvable = [...matchupCache.values()].filter(Boolean).length;
  console.log(`[demo-enrichment] Unique matchups: ${matchupCache.size} (${resolvable} resolvable)`);

  // Build enrichment cache
  const enrichmentCache = new Map();
  for (const [matchupStr, resolved] of matchupCache.entries()) {
    if (!resolved) continue;
    enrichmentCache.set(matchupStr, buildEnrichment(
      matchupStr,
      resolved.home_team,
      resolved.away_team,
      enrichedAt
    ));
  }

  // Attach enrichment to items and compute coverage per surface
  const enrichedSurfaces = [];

  for (const surface of inputDataset.surfaces) {
    const enrichedItems = (surface.items || []).map((item) => ({
      ...item,
      moneyline_enrichment: item.matchup
        ? (enrichmentCache.get(item.matchup) || null)
        : null,
    }));

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
      `[demo-enrichment] ${surface.label}: ` +
      `${coverage.enriched_items}/${coverage.enrichable_items} enriched (${coverage.coverage_pct}%)`
    );
  }

  // Assemble EnrichedNBADataset
  const enrichedDataset = {
    generated_at: inputDataset.generated_at,
    enriched_at: enrichedAt,
    source_domain: inputDataset.source_domain || 'capping.pro',
    league_id: inputDataset.league_id || 'NBA',
    sport: inputDataset.sport || 'Basketball',
    approved_bookmakers: APPROVED_BOOKMAKERS,
    demo_enrichment: true, // flag so real enrichment can overwrite without confusion
    surfaces: enrichedSurfaces,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedDataset, null, 2), 'utf8');
  console.log(`[demo-enrichment] Wrote → ${path.basename(OUTPUT_PATH)}`);

  // Write run summary
  const totalEnrichable = enrichedSurfaces.reduce((a, s) => a + s.moneyline_coverage.enrichable_items, 0);
  const totalEnriched   = enrichedSurfaces.reduce((a, s) => a + s.moneyline_coverage.enriched_items, 0);

  const runSummary = {
    started_at: startedAt,
    enriched_at: enrichedAt,
    demo: true,
    approved_bookmakers: APPROVED_BOOKMAKERS,
    failed_adapters: [],
    total_enrichable_items: totalEnrichable,
    total_enriched_items: totalEnriched,
    overall_coverage_pct: totalEnrichable > 0
      ? Math.round((totalEnriched / totalEnrichable) * 100)
      : 0,
    per_book: Object.fromEntries(
      APPROVED_BOOKMAKERS.map((slug) => [slug, {
        raw_games_found: resolvable,
        adapter_success: true,
        error: null,
        started_at: startedAt,
        finished_at: enrichedAt,
      }])
    ),
    surfaces: enrichedSurfaces.map((s) => ({
      surface_id: s.id,
      label: s.label,
      ...s.moneyline_coverage,
    })),
  };

  fs.writeFileSync(RUN_SUMMARY_PATH, JSON.stringify(runSummary, null, 2), 'utf8');
  console.log(`[demo-enrichment] Wrote → ${path.basename(RUN_SUMMARY_PATH)}`);
  console.log(`[demo-enrichment] Done. Total enriched: ${totalEnriched}/${totalEnrichable} items.`);
}

run();
