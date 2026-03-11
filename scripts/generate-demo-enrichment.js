'use strict';

const fs = require('fs');
const path = require('path');

const { loadTeamAliases } = require('../adapters/shared');
const { buildItemLookup, canonicalizeMatchup } = require('../adapters/market-utils');
const { APPROVED_BOOKMAKERS, toLegacyMoneylineEnrichment } = require('../adapters/index');

const INPUT_PATH = path.join(__dirname, '../capping-pro-nba-surfaces.json');
const OUTPUT_PATH = path.join(__dirname, '../capping-pro-nba-surfaces-enriched.json');
const RUN_SUMMARY_PATH = path.join(__dirname, '../moneyline-enrichment.run-summary.json');

const DEFAULT_BOOK_LABELS = {
  ladbrokes: {
    moneyline: 'Head To Head',
    spread: 'Line',
    game_total: 'Total Points',
    first_half_spread: '1st Half Line',
    first_half_total: '1st Half Total Points',
    second_half_spread: '2nd Half Line',
    second_half_total: '2nd Half Total Points',
    player_points: 'Player Points',
    player_rebounds: 'Player Rebounds',
    player_assists: 'Player Assists',
    player_blocks: 'Player Blocks',
    player_free_throws: 'Player Free Throws',
  },
  sportsbet: {
    moneyline: 'Head To Head',
    spread: 'Line',
    game_total: 'Total Points',
    first_half_spread: '1st Half Line',
    first_half_total: '1st Half Total Points',
    second_half_spread: '2nd Half Line',
    second_half_total: '2nd Half Total Points',
    player_points: 'Player Points',
    player_rebounds: 'Player Rebounds',
    player_assists: 'Player Assists',
    player_blocks: 'Player Blocks',
    player_free_throws: 'Player Free Throws',
  },
  pointsbet: {
    moneyline: 'Match Winner',
    spread: 'Handicap',
    game_total: 'Game Total',
    first_half_spread: '1st Half Handicap',
    first_half_total: '1st Half Total',
    second_half_spread: '2nd Half Handicap',
    second_half_total: '2nd Half Total',
    player_points: 'Player Points',
    player_rebounds: 'Player Rebounds',
    player_assists: 'Player Assists',
    player_blocks: 'Player Blocks',
    player_free_throws: 'Player Free Throws',
  },
  bet365: {
    moneyline: 'Match Betting',
    spread: 'Handicap',
    game_total: 'Total Points',
    first_half_spread: '1st Half Handicap',
    first_half_total: '1st Half Total',
    second_half_spread: '2nd Half Handicap',
    second_half_total: '2nd Half Total',
    player_points: 'Player Points',
    player_rebounds: 'Player Rebounds',
    player_assists: 'Player Assists',
    player_blocks: 'Player Blocks',
    player_free_throws: 'Player Free Throws',
  },
};

function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bestAvailable(quotes) {
  let best = { odds: null, bookmaker: null, bookmaker_name: null, selection_key: null, selection_label: null };
  for (const quote of Object.values(quotes)) {
    if (!quote.is_available || quote.odds == null) continue;
    if (best.odds == null || quote.odds > best.odds) {
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

function makeQuotes(seedKey, meta, enrichedAt) {
  const rng = makeRng(strHash(seedKey));
  const quotes = {};

  for (const slug of APPROVED_BOOKMAKERS) {
    const unavailable = slug === 'pointsbet' && rng() < 0.18;
    const odds = unavailable ? null : Math.round((1.55 + rng() * 1.75) * 100) / 100;
    quotes[slug] = {
      bookmaker: slug,
      bookmaker_name: slug === 'bet365' ? 'Bet365' : slug === 'pointsbet' ? 'PointsBet' : slug === 'sportsbet' ? 'Sportsbet' : 'Ladbrokes',
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
      market_name: DEFAULT_BOOK_LABELS[slug][meta.market_type] || DEFAULT_BOOK_LABELS[slug].moneyline,
      odds,
      retrieved_at: unavailable ? null : enrichedAt,
      is_available: !unavailable,
    };
  }

  return quotes;
}

function makeMatch(meta, enrichedAt) {
  const quotes = makeQuotes(`${meta.market_key}|${meta.selection_key}|${meta.player_name || ''}|${meta.matchup || ''}`, meta, enrichedAt);
  return {
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
    best_available: bestAvailable(quotes),
  };
}

function gameBundle(matchupMeta, enrichedAt) {
  if (!matchupMeta) return null;
  const home = makeMatch({
    matchup: matchupMeta.matchup,
    home_team: matchupMeta.home_team,
    away_team: matchupMeta.away_team,
    market_type: 'moneyline',
    market_family: 'game_side',
    period: 'full_game',
    market_key: 'moneyline',
    selection_key: 'home',
    selection_label: matchupMeta.home_team,
    player_name: null,
    line: null,
  }, enrichedAt);
  const away = makeMatch({
    matchup: matchupMeta.matchup,
    home_team: matchupMeta.home_team,
    away_team: matchupMeta.away_team,
    market_type: 'moneyline',
    market_family: 'game_side',
    period: 'full_game',
    market_key: 'moneyline',
    selection_key: 'away',
    selection_label: matchupMeta.away_team,
    player_name: null,
    line: null,
  }, enrichedAt);
  return {
    matchup: matchupMeta.matchup,
    home_team: matchupMeta.home_team,
    away_team: matchupMeta.away_team,
    markets: [home, away],
  };
}

function computeCoverageStats(surfaceId, items) {
  const books = new Set();
  const market_type_counts = {};
  for (const item of items) {
    const matched = item.bookmaker_enrichment?.matched_market;
    if (!matched) continue;
    market_type_counts[matched.market_type] = (market_type_counts[matched.market_type] || 0) + 1;
    for (const [slug, quote] of Object.entries(matched.quotes)) {
      if (quote.is_available) books.add(slug);
    }
  }
  const enrichable_items = items.filter((item) => item.matchup != null || item.team != null).length;
  const enriched_items = items.filter((item) => item.bookmaker_enrichment != null).length;
  return {
    surface_id: surfaceId,
    total_items: items.length,
    enrichable_items,
    enriched_items,
    books_with_coverage: [...books],
    market_type_counts,
    coverage_pct: enrichable_items > 0 ? Math.round((enriched_items / enrichable_items) * 100) : 0,
  };
}

function run() {
  const startedAt = new Date().toISOString();
  const enrichedAt = new Date().toISOString();
  console.log(`[demo-enrichment] Starting at ${startedAt}`);

  const inputDataset = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const aliasMap = loadTeamAliases();
  const teamToGameMap = new Map();

  for (const surface of inputDataset.surfaces) {
    for (const item of surface.items || []) {
      const matchupMeta = canonicalizeMatchup(item.matchup, aliasMap);
      if (matchupMeta) {
        teamToGameMap.set(matchupMeta.home_team, matchupMeta);
        teamToGameMap.set(matchupMeta.away_team, matchupMeta);
      }
    }
  }

  const enrichedSurfaces = inputDataset.surfaces.map((surface) => {
    const items = (surface.items || []).map((item) => {
      const lookup = buildItemLookup(item, aliasMap, teamToGameMap);
      const bundle = lookup?.matchup ? gameBundle({
        matchup: lookup.matchup,
        home_team: lookup.home_team,
        away_team: lookup.away_team,
      }, enrichedAt) : null;

      const matched = lookup?.market_key && lookup?.selection_key
        ? makeMatch({
            matchup: lookup.matchup,
            home_team: lookup.home_team,
            away_team: lookup.away_team,
            market_type: lookup.market_type,
            market_family: lookup.market_family,
            period: lookup.period,
            market_key: lookup.market_key,
            selection_key: lookup.selection_key,
            selection_label: lookup.selection_label,
            player_name: lookup.player_name,
            line: lookup.line,
          }, enrichedAt)
        : null;

      const bookmaker_enrichment = (lookup && (matched || bundle)) ? {
        lookup,
        matched_market: matched,
        game_bundle: bundle,
        player_bundle: matched?.player_name && lookup.matchup ? {
          matchup: lookup.matchup,
          player_name: matched.player_name,
          markets: [matched],
        } : null,
        enriched_at: enrichedAt,
      } : null;

      return {
        ...item,
        bookmaker_enrichment,
        moneyline_enrichment: bookmaker_enrichment ? toLegacyMoneylineEnrichment(bookmaker_enrichment) : null,
      };
    });

    const coverage = computeCoverageStats(surface.id, items);
    console.log(`[demo-enrichment] ${surface.label}: ${coverage.enriched_items}/${coverage.enrichable_items} enriched (${coverage.coverage_pct}%)`);
    return {
      id: surface.id,
      label: surface.label,
      source_url: surface.source_url,
      scan_summary: surface.scan_summary || null,
      items,
      bookmaker_coverage: coverage,
      moneyline_coverage: coverage,
    };
  });

  const enrichedDataset = {
    generated_at: inputDataset.generated_at,
    enriched_at: enrichedAt,
    source_domain: inputDataset.source_domain || 'capping.pro',
    league_id: inputDataset.league_id || 'NBA',
    sport: inputDataset.sport || 'Basketball',
    approved_bookmakers: APPROVED_BOOKMAKERS,
    demo_enrichment: true,
    surfaces: enrichedSurfaces,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedDataset, null, 2), 'utf8');
  console.log(`[demo-enrichment] Wrote → ${path.basename(OUTPUT_PATH)}`);

  const per_book = Object.fromEntries(APPROVED_BOOKMAKERS.map((slug) => [slug, {
    raw_games_found: enrichedSurfaces.reduce((acc, surface) => acc + surface.items.length, 0),
    normalized_offers_found: enrichedSurfaces.reduce((acc, surface) => acc + surface.items.filter((item) => item.bookmaker_enrichment?.matched_market).length, 0),
    market_type_counts: enrichedSurfaces.reduce((acc, surface) => {
      for (const item of surface.items) {
        const type = item.bookmaker_enrichment?.matched_market?.market_type;
        if (type) acc[type] = (acc[type] || 0) + 1;
      }
      return acc;
    }, {}),
    adapter_success: true,
    error: null,
    started_at: startedAt,
    finished_at: enrichedAt,
  }]));

  const totalEnrichable = enrichedSurfaces.reduce((acc, surface) => acc + surface.bookmaker_coverage.enrichable_items, 0);
  const totalEnriched = enrichedSurfaces.reduce((acc, surface) => acc + surface.bookmaker_coverage.enriched_items, 0);

  fs.writeFileSync(RUN_SUMMARY_PATH, JSON.stringify({
    started_at: startedAt,
    enriched_at: enrichedAt,
    demo: true,
    approved_bookmakers: APPROVED_BOOKMAKERS,
    failed_adapters: [],
    total_enrichable_items: totalEnrichable,
    total_enriched_items: totalEnriched,
    overall_coverage_pct: totalEnrichable > 0 ? Math.round((totalEnriched / totalEnrichable) * 100) : 0,
    per_book,
    surfaces: enrichedSurfaces.map((surface) => ({
      surface_id: surface.id,
      label: surface.label,
      ...surface.bookmaker_coverage,
    })),
  }, null, 2), 'utf8');
  console.log(`[demo-enrichment] Wrote → ${path.basename(RUN_SUMMARY_PATH)}`);
  console.log(`[demo-enrichment] Done. Total enriched: ${totalEnriched}/${totalEnrichable} items.`);
}

run();
