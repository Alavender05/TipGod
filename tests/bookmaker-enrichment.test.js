'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadTeamAliases } = require('../adapters/shared.js');
const {
  normalizePlayerName,
  canonicalizeMatchup,
  canonicalMarketTypeFromAlias,
  inferMarketType,
  buildItemLookup,
} = require('../adapters/market-utils.js');
const {
  buildMarketIndex,
  buildItemEnrichment,
  toLegacyMoneylineEnrichment,
} = require('../adapters/index.js');

const aliasMap = loadTeamAliases();

test('normalizePlayerName: strips trailing position suffix and symbols', () => {
  assert.equal(normalizePlayerName('Pascal SiakamPF'), 'Pascal Siakam');
  assert.equal(normalizePlayerName('Kawhi Leonard🏠'), 'Kawhi Leonard');
});

test('canonicalizeMatchup: treats away@home as home vs away', () => {
  assert.deepEqual(canonicalizeMatchup('TOR@NOP', aliasMap), {
    matchup: 'New Orleans Pelicans vs Toronto Raptors',
    home_team: 'New Orleans Pelicans',
    away_team: 'Toronto Raptors',
  });
});

test('canonicalMarketTypeFromAlias: normalizes bookmaker aliases to canonical capping names', () => {
  assert.equal(canonicalMarketTypeFromAlias('head_to_head'), 'moneyline');
  assert.equal(canonicalMarketTypeFromAlias('match_betting'), 'moneyline');
  assert.equal(canonicalMarketTypeFromAlias('handicap'), 'spread');
});

test('inferMarketType: maps scanner item markets into canonical output names', () => {
  assert.equal(inferMarketType({ market_type: 'points' }), 'player_points');
  assert.equal(inferMarketType({ market_type: 'rebounds' }), 'player_rebounds');
  assert.equal(inferMarketType({ market_type: 'assists' }), 'player_assists');
  assert.equal(inferMarketType({ market_type: 'blocks-exploit' }), 'player_blocks');
  assert.equal(inferMarketType({ market_type: 'single-leg', selection: 'OVER 2.5 Free Throws Made' }), 'player_free_throws');
});

test('buildItemLookup: derives canonical player market lookup from scanner item', () => {
  const lookup = buildItemLookup({
    market_type: 'points',
    selection: 'OVER 18 Points',
    player_name: 'Amen Thompson',
    matchup: 'HOU vs DEN',
    team: 'Houston Rockets',
  }, aliasMap, new Map());

  assert.equal(lookup.market_type, 'player_points');
  assert.equal(lookup.market_key, 'player_points:18');
  assert.equal(lookup.selection_key, 'over');
  assert.equal(lookup.player_name, 'Amen Thompson');
  assert.equal(lookup.matchup, 'Houston Rockets vs Denver Nuggets');
});

test('buildItemEnrichment: matches canonical player market and preserves native market labels', () => {
  const bookmakerConfigs = [
    { slug: 'ladbrokes', name: 'Ladbrokes' },
    { slug: 'sportsbet', name: 'Sportsbet' },
    { slug: 'pointsbet', name: 'PointsBet' },
    { slug: 'bet365', name: 'Bet365' },
  ];

  const marketMap = {
    ladbrokes: [
      {
        bookmaker: 'ladbrokes',
        bookmaker_name: 'Ladbrokes',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'moneyline',
        market_family: 'game_side',
        period: 'full_game',
        market_key: 'moneyline',
        selection_key: 'home',
        selection_label: 'Houston Rockets',
        player_name: null,
        line: null,
        market_name: 'Head To Head',
        odds: 1.91,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
      {
        bookmaker: 'ladbrokes',
        bookmaker_name: 'Ladbrokes',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'moneyline',
        market_family: 'game_side',
        period: 'full_game',
        market_key: 'moneyline',
        selection_key: 'away',
        selection_label: 'Denver Nuggets',
        player_name: null,
        line: null,
        market_name: 'Head To Head',
        odds: 1.96,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
      {
        bookmaker: 'ladbrokes',
        bookmaker_name: 'Ladbrokes',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'player_points',
        market_family: 'player_prop',
        period: 'full_game',
        market_key: 'player_points:18',
        selection_key: 'over',
        selection_label: 'OVER 18 Points',
        player_name: 'Amen Thompson',
        line: 18,
        market_name: 'Player Points',
        odds: 1.72,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
    ],
    sportsbet: [
      {
        bookmaker: 'sportsbet',
        bookmaker_name: 'Sportsbet',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'moneyline',
        market_family: 'game_side',
        period: 'full_game',
        market_key: 'moneyline',
        selection_key: 'home',
        selection_label: 'Houston Rockets',
        player_name: null,
        line: null,
        market_name: 'Head To Head',
        odds: 1.95,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
      {
        bookmaker: 'sportsbet',
        bookmaker_name: 'Sportsbet',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'moneyline',
        market_family: 'game_side',
        period: 'full_game',
        market_key: 'moneyline',
        selection_key: 'away',
        selection_label: 'Denver Nuggets',
        player_name: null,
        line: null,
        market_name: 'Head To Head',
        odds: 1.88,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
      {
        bookmaker: 'sportsbet',
        bookmaker_name: 'Sportsbet',
        matchup: 'Houston Rockets vs Denver Nuggets',
        home_team: 'Houston Rockets',
        away_team: 'Denver Nuggets',
        market_type: 'player_points',
        market_family: 'player_prop',
        period: 'full_game',
        market_key: 'player_points:18',
        selection_key: 'over',
        selection_label: 'OVER 18 Points',
        player_name: 'Amen Thompson',
        line: 18,
        market_name: 'Player Points',
        odds: 1.78,
        retrieved_at: '2026-03-11T00:00:00.000Z',
        is_available: true,
      },
    ],
    pointsbet: [],
    bet365: [],
  };

  const index = buildMarketIndex(marketMap, bookmakerConfigs);
  const enrichment = buildItemEnrichment({
    market_type: 'points',
    selection: 'OVER 18 Points',
    player_name: 'Amen Thompson',
    matchup: 'HOU vs DEN',
    team: 'Houston Rockets',
  }, index, aliasMap);

  assert.ok(enrichment);
  assert.equal(enrichment.matched_market.market_type, 'player_points');
  assert.equal(enrichment.matched_market.best_available.bookmaker, 'sportsbet');
  assert.equal(enrichment.matched_market.quotes.ladbrokes.market_name, 'Player Points');
  assert.equal(enrichment.game_bundle.matchup, 'Houston Rockets vs Denver Nuggets');

  const legacy = toLegacyMoneylineEnrichment(enrichment);
  assert.ok(legacy);
  assert.equal(legacy.best_available.home_best_bookmaker, 'sportsbet');
});
