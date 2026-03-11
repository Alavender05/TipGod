'use strict';

const { loadTeamAliases, resolveMatchup, parseDecimalOdds } = require('./shared');
const {
  buildItemLookup,
  buildPlayerBundleKey,
  buildSelectionGroupKey,
  canonicalMarketTypeFromAlias,
  marketFamilyFromType,
  periodFromMarketType,
  aliasMapFromConfig,
  normalizePlayerName,
  parseLine,
} = require('./market-utils');

const ladbrokesAdapter = require('./bookmakers/ladbrokes');
const sportsbetAdapter = require('./bookmakers/sportsbet');
const pointsbetAdapter = require('./bookmakers/pointsbet');
const bet365Adapter = require('./bookmakers/bet365');

const ADAPTERS = [
  ladbrokesAdapter,
  sportsbetAdapter,
  pointsbetAdapter,
  bet365Adapter,
];

const APPROVED_BOOKMAKERS = ADAPTERS.map((adapter) => adapter.slug);

function emptyQuote(slug, bookmakerName, meta) {
  return {
    bookmaker: slug,
    bookmaker_name: bookmakerName,
    matchup: meta.matchup || null,
    home_team: meta.home_team || null,
    away_team: meta.away_team || null,
    market_type: meta.market_type,
    market_family: meta.market_family,
    period: meta.period,
    market_key: meta.market_key,
    selection_key: meta.selection_key,
    selection_label: meta.selection_label || null,
    player_name: meta.player_name || null,
    line: meta.line ?? null,
    market_name: meta.market_name || '',
    odds: null,
    retrieved_at: null,
    is_available: false,
  };
}

async function runAllAdapters(browser, bookmakerConfigs) {
  const configBySlug = new Map(bookmakerConfigs.map((c) => [c.slug, c]));
  const rawMap = {};
  const marketMap = {};
  const adapterHealth = {};
  const aliasMap = loadTeamAliases();

  for (const adapter of ADAPTERS) {
    const config = configBySlug.get(adapter.slug);
    const startedAt = new Date().toISOString();

    if (!config) {
      adapterHealth[adapter.slug] = { raw_games: 0, normalized_offers: 0, error: 'no_config', started_at: startedAt, finished_at: new Date().toISOString() };
      rawMap[adapter.slug] = [];
      marketMap[adapter.slug] = [];
      continue;
    }

    let page = null;
    try {
      page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
      console.log(`[adapters/index] Running ${adapter.name} adapter...`);
      const rawSelections = await adapter.fetchOdds(page, config);
      const offers = normalizeRawSelectionsToMarketOffers(rawSelections, adapter, config, aliasMap);
      const finishedAt = new Date().toISOString();
      console.log(`[adapters/index] ${adapter.name}: ${rawSelections.length} raw selection(s), ${offers.length} normalized offer(s).`);
      rawMap[adapter.slug] = rawSelections;
      marketMap[adapter.slug] = offers;
      adapterHealth[adapter.slug] = {
        raw_games: rawSelections.length,
        normalized_offers: offers.length,
        error: null,
        started_at: startedAt,
        finished_at: finishedAt,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const msg = error.message || String(error);
      console.error(`[adapters/index] ${adapter.name} adapter threw: ${msg}`);
      rawMap[adapter.slug] = [];
      marketMap[adapter.slug] = [];
      adapterHealth[adapter.slug] = {
        raw_games: 0,
        normalized_offers: 0,
        error: msg,
        started_at: startedAt,
        finished_at: finishedAt,
      };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  return { oddsMap: rawMap, marketMap, adapterHealth };
}

function normalizeRawSelectionsToMarketOffers(rawSelections, adapter, config, aliasMap) {
  const offers = [];
  const aliasLookup = aliasMapFromConfig(config);
  const retrievedAt = new Date().toISOString();

  for (const row of rawSelections || []) {
    const marketType = row.market_type_raw && aliasLookup.get(String(row.market_type_raw).toLowerCase())
      ? aliasLookup.get(String(row.market_type_raw).toLowerCase())
      : canonicalMarketTypeFromAlias(row.market_type_raw || row.market_name);
    if (!marketType) continue;

    const resolved = row.home_team_raw && row.away_team_raw
      ? resolveMatchup(row.home_team_raw, row.away_team_raw, aliasMap)
      : null;
    const matchup = resolved ? `${resolved.home_team} vs ${resolved.away_team}` : null;
    const selectionLabel = row.selection_label_raw || null;
    const playerName = normalizePlayerName(row.player_name_raw);
    const line = row.line_raw != null ? Number(parseLine(row.line_raw)) : parseLine(selectionLabel);
    const selectionKey = inferSelectionKey(marketType, selectionLabel, resolved);

    offers.push({
      bookmaker: adapter.slug,
      bookmaker_name: config.name || adapter.name,
      matchup,
      home_team: resolved?.home_team || null,
      away_team: resolved?.away_team || null,
      market_type: marketType,
      market_family: marketFamilyFromType(marketType),
      period: periodFromMarketType(marketType),
      market_key: line == null ? marketType : `${marketType}:${line}`,
      selection_key: selectionKey,
      selection_label: selectionLabel,
      player_name: playerName || null,
      line,
      market_name: row.market_name || '',
      odds: parseDecimalOdds(row.odds_raw),
      retrieved_at: row.is_available ? retrievedAt : null,
      is_available: Boolean(row.is_available),
    });
  }

  return offers.filter((offer) => offer.selection_key);
}

function inferSelectionKey(marketType, label, resolvedMatchup) {
  const raw = String(label || '').toLowerCase();
  if (marketType === 'moneyline' || marketType.endsWith('_spread')) {
    if (resolvedMatchup?.home_team && raw.includes(resolvedMatchup.home_team.toLowerCase())) return 'home';
    if (resolvedMatchup?.away_team && raw.includes(resolvedMatchup.away_team.toLowerCase())) return 'away';
    return null;
  }
  if (marketType.includes('total') || marketType.startsWith('player_')) {
    if (/\bunder\b/.test(raw)) return 'under';
    if (/\bover\b/.test(raw)) return /\+/.test(raw) ? 'alt_over' : 'over';
  }
  return null;
}

function computeBestAvailableSelection(quotes) {
  let best = {
    odds: null,
    bookmaker: null,
    bookmaker_name: null,
    selection_key: null,
    selection_label: null,
  };

  for (const quote of Object.values(quotes)) {
    if (!quote.is_available || quote.odds == null) continue;
    if (best.odds === null || quote.odds > best.odds) {
      best = {
        odds: quote.odds,
        bookmaker: quote.bookmaker,
        bookmaker_name: quote.bookmaker_name,
        selection_key: quote.selection_key,
        selection_label: quote.selection_label,
      };
    }
  }

  return best;
}

function buildMarketIndex(marketMap, bookmakerConfigs) {
  const selectionMatches = new Map();
  const gameMarkets = new Map();
  const playerMarkets = new Map();
  const teamToGameMap = new Map();
  const configBySlug = new Map(bookmakerConfigs.map((config) => [config.slug, config]));
  const groupBuckets = new Map();

  for (const offers of Object.values(marketMap || {})) {
    for (const offer of offers || []) {
      const key = buildSelectionGroupKey(offer);
      if (!groupBuckets.has(key)) {
        groupBuckets.set(key, {
          meta: offer,
          quotes: {},
        });
      }
      groupBuckets.get(key).quotes[offer.bookmaker] = offer;
    }
  }

  for (const bucket of groupBuckets.values()) {
    const meta = bucket.meta;
    const quotes = {};

    for (const slug of APPROVED_BOOKMAKERS) {
      const bookmakerName = configBySlug.get(slug)?.name || slug;
      quotes[slug] = bucket.quotes[slug]
        ? bucket.quotes[slug]
        : emptyQuote(slug, bookmakerName, meta);
    }

    const match = {
      matchup: meta.matchup || null,
      home_team: meta.home_team || null,
      away_team: meta.away_team || null,
      market_type: meta.market_type,
      market_family: meta.market_family,
      period: meta.period,
      market_key: meta.market_key,
      selection_key: meta.selection_key,
      selection_label: meta.selection_label || null,
      player_name: meta.player_name || null,
      line: meta.line ?? null,
      quotes,
      best_available: computeBestAvailableSelection(quotes),
    };

    selectionMatches.set(buildSelectionGroupKey(meta), match);

    if (meta.matchup) {
      if (!gameMarkets.has(meta.matchup)) gameMarkets.set(meta.matchup, []);
      gameMarkets.get(meta.matchup).push(match);
    }

    if (meta.matchup && meta.player_name) {
      const playerKey = buildPlayerBundleKey(meta.matchup, meta.player_name);
      if (!playerMarkets.has(playerKey)) playerMarkets.set(playerKey, []);
      playerMarkets.get(playerKey).push(match);
    }

    if (meta.home_team && meta.matchup) {
      teamToGameMap.set(meta.home_team, {
        matchup: meta.matchup,
        home_team: meta.home_team,
        away_team: meta.away_team,
      });
    }
    if (meta.away_team && meta.matchup) {
      teamToGameMap.set(meta.away_team, {
        matchup: meta.matchup,
        home_team: meta.home_team,
        away_team: meta.away_team,
      });
    }
  }

  return {
    selectionMatches,
    gameMarkets,
    playerMarkets,
    teamToGameMap,
  };
}

function buildGameBundle(matchup, marketIndex) {
  const markets = (marketIndex.gameMarkets.get(matchup) || [])
    .filter((entry) => ['moneyline', 'spread', 'game_total', 'first_half_spread', 'first_half_total', 'second_half_spread', 'second_half_total'].includes(entry.market_type));
  if (markets.length === 0) return null;
  const first = markets[0];
  return {
    matchup,
    home_team: first.home_team,
    away_team: first.away_team,
    markets,
  };
}

function buildPlayerBundle(matchup, playerName, marketIndex) {
  const key = buildPlayerBundleKey(matchup, playerName);
  const markets = marketIndex.playerMarkets.get(key) || [];
  if (markets.length === 0) return null;
  return {
    matchup,
    player_name: playerName,
    markets,
  };
}

function buildItemEnrichment(item, marketIndex, aliasMap) {
  const lookup = buildItemLookup(item, aliasMap, marketIndex.teamToGameMap);
  if (!lookup || !lookup.market_key) return null;

  const groupKey = buildSelectionGroupKey({
    matchup: lookup.matchup,
    market_key: lookup.market_key,
    selection_key: lookup.selection_key,
    player_name: lookup.player_name,
  });

  const matchedMarket = lookup.selection_key
    ? marketIndex.selectionMatches.get(groupKey) || null
    : null;
  const gameBundle = lookup.matchup ? buildGameBundle(lookup.matchup, marketIndex) : null;
  const playerBundle = lookup.matchup && lookup.player_name
    ? buildPlayerBundle(lookup.matchup, lookup.player_name, marketIndex)
    : null;

  if (!matchedMarket && !gameBundle && !playerBundle) return null;

  return {
    lookup,
    matched_market: matchedMarket,
    game_bundle: gameBundle,
    player_bundle: playerBundle,
    enriched_at: new Date().toISOString(),
  };
}

function toLegacyMoneylineEnrichment(enrichment) {
  const gameBundle = enrichment?.game_bundle;
  if (!gameBundle) return null;

  const homeMatch = gameBundle.markets.find((entry) => entry.market_type === 'moneyline' && entry.selection_key === 'home');
  const awayMatch = gameBundle.markets.find((entry) => entry.market_type === 'moneyline' && entry.selection_key === 'away');
  if (!homeMatch || !awayMatch) return null;

  const quotes = {};
  let home_best_odds = null;
  let home_best_bookmaker = null;
  let away_best_odds = null;
  let away_best_bookmaker = null;

  for (const slug of APPROVED_BOOKMAKERS) {
    const homeQuote = homeMatch.quotes[slug];
    const awayQuote = awayMatch.quotes[slug];
    const isAvailable = Boolean(homeQuote?.is_available || awayQuote?.is_available);

    quotes[slug] = {
      bookmaker: slug,
      bookmaker_name: homeQuote?.bookmaker_name || awayQuote?.bookmaker_name || slug,
      home_odds: homeQuote?.odds ?? null,
      away_odds: awayQuote?.odds ?? null,
      market_name: homeQuote?.market_name || awayQuote?.market_name || '',
      retrieved_at: homeQuote?.retrieved_at || awayQuote?.retrieved_at || null,
      is_available: isAvailable,
    };

    if (quotes[slug].home_odds != null && (home_best_odds == null || quotes[slug].home_odds > home_best_odds)) {
      home_best_odds = quotes[slug].home_odds;
      home_best_bookmaker = slug;
    }
    if (quotes[slug].away_odds != null && (away_best_odds == null || quotes[slug].away_odds > away_best_odds)) {
      away_best_odds = quotes[slug].away_odds;
      away_best_bookmaker = slug;
    }
  }

  return {
    matchup: gameBundle.matchup,
    home_team: gameBundle.home_team,
    away_team: gameBundle.away_team,
    quotes,
    best_available: {
      home_best_odds,
      home_best_bookmaker,
      away_best_odds,
      away_best_bookmaker,
    },
    enriched_at: enrichment.enriched_at,
  };
}

module.exports = {
  ADAPTERS,
  APPROVED_BOOKMAKERS,
  runAllAdapters,
  normalizeRawSelectionsToMarketOffers,
  computeBestAvailableSelection,
  buildMarketIndex,
  buildItemEnrichment,
  toLegacyMoneylineEnrichment,
  loadTeamAliases,
};
