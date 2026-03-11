'use strict';

/**
 * adapters/index.js
 *
 * Adapter registry and orchestrator for NBA moneyline enrichment.
 *
 * Exports:
 *   ADAPTERS            — ordered array of all 4 bookmaker adapter modules
 *   runAllAdapters()    — runs each book on a fresh page, returns raw odds map
 *   buildEnrichment()   — assembles a MoneylineEnrichment block from raw odds
 *   loadTeamAliases     — re-exported from shared for convenience
 */

const {
  resolveMatchup,
  resolveTeam,
  loadTeamAliases,
} = require('./shared');

const ladbrokesAdapter = require('./bookmakers/ladbrokes');
const sportsbetAdapter = require('./bookmakers/sportsbet');
const pointsbetAdapter = require('./bookmakers/pointsbet');
const bet365Adapter    = require('./bookmakers/bet365');

/** @type {Array<{ slug: string, name: string, fetchOdds: Function }>} */
const ADAPTERS = [
  ladbrokesAdapter,
  sportsbetAdapter,
  pointsbetAdapter,
  bet365Adapter,
];

// ─── runAllAdapters ──────────────────────────────────────────────────────────

/**
 * Run all 4 adapters sequentially, each on a fresh browser page.
 * Per-book errors are caught and logged; the run continues with remaining books.
 *
 * @param {import('playwright').Browser} browser
 * @param {object[]} bookmakerConfigs - BookmakerConfig[] from moneyline_bookmakers.json
 * @returns {Promise<{ oddsMap: Record<string, RawGameOdds[]>, adapterHealth: Record<string, AdapterHealth> }>}
 */
async function runAllAdapters(browser, bookmakerConfigs) {
  const configBySlug = new Map(bookmakerConfigs.map((c) => [c.slug, c]));
  const oddsMap = {};
  /** @type {Record<string, { raw_games: number, error: string | null, started_at: string, finished_at: string }>} */
  const adapterHealth = {};

  for (const adapter of ADAPTERS) {
    const config = configBySlug.get(adapter.slug);
    const startedAt = new Date().toISOString();

    if (!config) {
      console.warn(`[adapters/index] No config found for slug "${adapter.slug}", skipping.`);
      adapterHealth[adapter.slug] = { raw_games: 0, error: 'no_config', started_at: startedAt, finished_at: new Date().toISOString() };
      oddsMap[adapter.slug] = [];
      continue;
    }

    let page = null;
    try {
      page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
      console.log(`[adapters/index] Running ${adapter.name} adapter...`);
      const odds = await adapter.fetchOdds(page, config);
      const finishedAt = new Date().toISOString();
      console.log(`[adapters/index] ${adapter.name}: ${odds.length} raw game(s) found.`);
      oddsMap[adapter.slug] = odds;
      adapterHealth[adapter.slug] = { raw_games: odds.length, error: null, started_at: startedAt, finished_at: finishedAt };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const msg = error.message || String(error);
      console.error(`[adapters/index] ${adapter.name} adapter threw: ${msg}`);
      oddsMap[adapter.slug] = [];
      adapterHealth[adapter.slug] = { raw_games: 0, error: msg, started_at: startedAt, finished_at: finishedAt };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  return { oddsMap, adapterHealth };
}

// ─── buildEnrichment ─────────────────────────────────────────────────────────

/**
 * Given a canonical matchup string and a raw odds map from all 4 books,
 * produce a fully-populated MoneylineEnrichment block.
 *
 * All 4 bookmaker slots are always populated in the quotes Record.
 * Books with no matching game get is_available: false, home_odds: null, away_odds: null.
 *
 * @param {string} matchupStr - canonical "Home vs Away" matchup string from items
 * @param {Record<string, RawGameOdds[]>} bookOddsMap - keyed by adapter slug
 * @param {Map<string, string>} aliasMap - from loadTeamAliases()
 * @param {object[]} bookmakerConfigs - BookmakerConfig[] from moneyline_bookmakers.json
 * @returns {import('../types/moneyline-enrichment').MoneylineEnrichment | null}
 */
function buildEnrichment(matchupStr, bookOddsMap, aliasMap, bookmakerConfigs) {
  if (!matchupStr) return null;

  // Parse canonical matchup — scanner uses "HOME vs AWAY" format (aliases, not full names)
  const parts = matchupStr.split(/\s+(?:vs\.?|@|at)\s+/i);
  if (parts.length !== 2) return null;

  const [homeRaw, awayRaw] = parts;
  const resolved = resolveMatchup(homeRaw.trim(), awayRaw.trim(), aliasMap);
  if (!resolved) return null;

  const { home_team, away_team } = resolved;
  const enrichedAt = new Date().toISOString();
  const configBySlug = new Map(bookmakerConfigs.map((c) => [c.slug, c]));

  // Build quotes Record — all 4 books always present
  const quotes = {};

  for (const adapter of ADAPTERS) {
    const slug = adapter.slug;
    const bookConfig = configBySlug.get(slug);
    const rawOddsArr = bookOddsMap[slug] || [];

    const matched = findMatchingGame(rawOddsArr, home_team, away_team, aliasMap);

    if (matched && matched.is_available) {
      quotes[slug] = {
        bookmaker: slug,
        bookmaker_name: bookConfig ? bookConfig.name : adapter.name,
        home_odds: matched.home_odds,
        away_odds: matched.away_odds,
        market_name: matched.market_name,
        retrieved_at: enrichedAt,
        is_available: true,
      };
    } else {
      quotes[slug] = {
        bookmaker: slug,
        bookmaker_name: bookConfig ? bookConfig.name : adapter.name,
        home_odds: null,
        away_odds: null,
        market_name: bookConfig ? bookConfig.moneyline_market_name : '',
        retrieved_at: null,
        is_available: false,
      };
    }
  }

  return {
    matchup: matchupStr,
    home_team,
    away_team,
    quotes,
    best_available: computeBestAvailable(quotes),
    enriched_at: enrichedAt,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Find the best-matching RawGameOdds entry for the given canonical home/away teams.
 *
 * Matching:
 *  1. Both home_team_raw and away_team_raw resolve to the canonical teams (direct order).
 *  2. Swap check: also tries reversed order (some AU books list visiting team first),
 *     swapping home_odds/away_odds accordingly.
 *
 * @param {RawGameOdds[]} rawOddsArr
 * @param {string} canonicalHome
 * @param {string} canonicalAway
 * @param {Map<string, string>} aliasMap
 * @returns {RawGameOdds | null}
 */
function findMatchingGame(rawOddsArr, canonicalHome, canonicalAway, aliasMap) {
  for (const entry of rawOddsArr) {
    const resolvedHome = resolveTeam(entry.home_team_raw, aliasMap);
    const resolvedAway = resolveTeam(entry.away_team_raw, aliasMap);

    if (resolvedHome === canonicalHome && resolvedAway === canonicalAway) {
      return entry;
    }

    // Some AU books list away team first — detect and swap
    if (resolvedHome === canonicalAway && resolvedAway === canonicalHome) {
      return {
        home_team_raw: entry.away_team_raw,
        away_team_raw: entry.home_team_raw,
        home_odds: entry.away_odds,
        away_odds: entry.home_odds,
        market_name: entry.market_name,
        is_available: entry.is_available,
      };
    }
  }
  return null;
}

/**
 * Compute best available odds per side across all 4 bookmaker quotes.
 *
 * @param {Record<string, import('../types/moneyline-enrichment').BookmakerMoneylineQuote>} quotes
 * @returns {import('../types/moneyline-enrichment').BestAvailableMoneyline}
 */
function computeBestAvailable(quotes) {
  let home_best_odds = null;
  let home_best_bookmaker = null;
  let away_best_odds = null;
  let away_best_bookmaker = null;

  for (const [slug, quote] of Object.entries(quotes)) {
    if (!quote.is_available) continue;

    if (quote.home_odds !== null) {
      if (home_best_odds === null || quote.home_odds > home_best_odds) {
        home_best_odds = quote.home_odds;
        home_best_bookmaker = slug;
      }
    }
    if (quote.away_odds !== null) {
      if (away_best_odds === null || quote.away_odds > away_best_odds) {
        away_best_odds = quote.away_odds;
        away_best_bookmaker = slug;
      }
    }
  }

  return {
    home_best_odds,
    home_best_bookmaker,
    away_best_odds,
    away_best_bookmaker,
  };
}

module.exports = {
  ADAPTERS,
  runAllAdapters,
  buildEnrichment,
  loadTeamAliases,
};
