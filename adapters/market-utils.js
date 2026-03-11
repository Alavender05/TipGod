'use strict';

const { normalizeText, resolveMatchup, resolveTeam } = require('./shared');

const CANONICAL_MARKET_TYPES = [
  'moneyline',
  'spread',
  'game_total',
  'first_half_spread',
  'first_half_total',
  'second_half_spread',
  'second_half_total',
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_blocks',
  'player_free_throws',
];

const BOOKMAKER_ALIAS_MAP = {
  moneyline: ['moneyline', 'match_betting', 'head_to_head', 'match_winner'],
  spread: ['spread', 'handicap', 'line'],
  game_total: ['game_total', 'total', 'over_under'],
  first_half_spread: ['first_half_spread', '1st_half_spread', 'first_half_handicap'],
  first_half_total: ['first_half_total', '1st_half_total'],
  second_half_spread: ['second_half_spread', '2nd_half_spread', 'second_half_handicap'],
  second_half_total: ['second_half_total', '2nd_half_total'],
  player_points: ['player_points', 'points'],
  player_rebounds: ['player_rebounds', 'rebounds'],
  player_assists: ['player_assists', 'assists'],
  player_blocks: ['player_blocks', 'blocks'],
  player_free_throws: ['player_free_throws', 'free_throws', 'free_throws_made'],
};

function normalizePlayerName(value) {
  let str = normalizeText(value);
  if (!str) return '';

  str = str.replace(/([a-z])([A-Z]{2})$/, '$1 $2');
  str = str.replace(/\b(PG|SG|SF|PF|C)\b$/i, '');
  str = str.replace(/[^\p{L}\p{N}\s.'-]+/gu, ' ');
  return normalizeText(str);
}

function normalizeAliasLabel(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function canonicalMarketTypeFromAlias(value) {
  const key = normalizeAliasLabel(value);
  for (const [canonical, aliases] of Object.entries(BOOKMAKER_ALIAS_MAP)) {
    if (key === canonical || aliases.includes(key)) {
      return canonical;
    }
  }
  return null;
}

function inferMarketType(item) {
  const marketType = normalizeAliasLabel(item?.market_type);
  const selection = normalizeText(item?.selection).toLowerCase();

  if (!marketType) return null;
  if (marketType === 'prebuilt_parlay') return null;

  if (marketType === 'single_leg') {
    if (selection.includes('free throw')) return 'player_free_throws';
    if (selection.includes('block')) return 'player_blocks';
    if (selection.includes('assist')) return 'player_assists';
    if (selection.includes('rebound')) return 'player_rebounds';
    if (selection.includes('point')) return 'player_points';
    return null;
  }

  const mapped = {
    points: 'player_points',
    points_exploit: 'player_points',
    rebounds: 'player_rebounds',
    rebounds_exploit: 'player_rebounds',
    off_rebounds_exploit: 'player_rebounds',
    assists: 'player_assists',
    assists_exploit: 'player_assists',
    blocks: 'player_blocks',
    blocks_exploit: 'player_blocks',
    free_throws: 'player_free_throws',
    free_throws_made: 'player_free_throws',
    moneyline: 'moneyline',
    match_winner: 'moneyline',
    head_to_head: 'moneyline',
    match_betting: 'moneyline',
    spread: 'spread',
    handicap: 'spread',
    line: 'spread',
    total: 'game_total',
    game_total: 'game_total',
    over_under: 'game_total',
    first_half_spread: 'first_half_spread',
    first_half_total: 'first_half_total',
    second_half_spread: 'second_half_spread',
    second_half_total: 'second_half_total',
  };

  return mapped[marketType] || canonicalMarketTypeFromAlias(marketType);
}

function marketFamilyFromType(marketType) {
  if (!marketType) return null;
  if (marketType === 'moneyline' || marketType.endsWith('_spread')) return 'game_side';
  if (marketType.includes('total')) return 'game_total';
  if (marketType.startsWith('player_')) return 'player_prop';
  return null;
}

function periodFromMarketType(marketType) {
  if (!marketType) return 'full_game';
  if (marketType.startsWith('first_half_')) return 'first_half';
  if (marketType.startsWith('second_half_')) return 'second_half';
  return 'full_game';
}

function parseLine(value) {
  const match = normalizeText(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseSelectionDetails(selection, marketType) {
  const raw = normalizeText(selection);
  const lower = raw.toLowerCase();
  const line = parseLine(raw);

  let selectionKey = null;
  if (marketType === 'moneyline' || marketType.endsWith('_spread')) {
    if (/\bhome\b/.test(lower)) selectionKey = 'home';
    if (/\baway\b/.test(lower)) selectionKey = 'away';
  } else if (marketType && (marketType.includes('total') || marketType.startsWith('player_'))) {
    if (/\bunder\b/.test(lower)) selectionKey = 'under';
    else if (/\bover\b/.test(lower)) selectionKey = 'over';
    else if (/\d+(?:\.\d+)?\+/.test(lower)) selectionKey = 'alt_over';
  }

  return {
    selection_key: selectionKey,
    selection_label: raw || null,
    line,
  };
}

function canonicalizeMatchup(matchup, aliasMap) {
  const raw = normalizeText(matchup);
  if (!raw) return null;

  let homeRaw = '';
  let awayRaw = '';

  if (raw.includes('@')) {
    const [awayPart, homePart] = raw.split(/\s*@\s*/);
    awayRaw = awayPart || '';
    homeRaw = homePart || '';
  } else if (/\sat\s/i.test(raw)) {
    const [awayPart, homePart] = raw.split(/\s+at\s+/i);
    awayRaw = awayPart || '';
    homeRaw = homePart || '';
  } else {
    const [homePart, awayPart] = raw.split(/\s+vs\.?\s+/i);
    homeRaw = homePart || '';
    awayRaw = awayPart || '';
  }

  const resolved = resolveMatchup(homeRaw.trim(), awayRaw.trim(), aliasMap);
  if (!resolved) return null;

  return {
    matchup: `${resolved.home_team} vs ${resolved.away_team}`,
    home_team: resolved.home_team,
    away_team: resolved.away_team,
  };
}

function buildMarketKey(marketType, line) {
  if (!marketType) return null;
  return line == null ? marketType : `${marketType}:${line}`;
}

function buildSelectionGroupKey(parts) {
  return [
    parts.matchup || '',
    parts.market_key || '',
    parts.selection_key || '',
    normalizePlayerName(parts.player_name || '').toLowerCase(),
  ].join('|');
}

function buildPlayerBundleKey(matchup, playerName) {
  return `${matchup || ''}|${normalizePlayerName(playerName || '').toLowerCase()}`;
}

function resolveCanonicalTeam(teamName, aliasMap) {
  return resolveTeam(teamName, aliasMap);
}

function buildItemLookup(item, aliasMap, teamToGameMap) {
  const marketType = inferMarketType(item);
  if (!marketType) return null;

  const marketFamily = marketFamilyFromType(marketType);
  const period = periodFromMarketType(marketType);
  const canonicalTeam = resolveCanonicalTeam(item.team, aliasMap);
  const directMatchup = canonicalizeMatchup(item.matchup, aliasMap);
  const inferredMatchup = !directMatchup && canonicalTeam && teamToGameMap.has(canonicalTeam)
    ? teamToGameMap.get(canonicalTeam)
    : null;
  const matchupMeta = directMatchup || inferredMatchup || null;
  const playerName = normalizePlayerName(item.player_name || item.title);
  const selection = parseSelectionDetails(item.selection, marketType);

  let selectionKey = selection.selection_key;
  let selectionLabel = selection.selection_label || item.selection || null;

  if (marketType === 'moneyline' && matchupMeta && canonicalTeam) {
    if (canonicalTeam === matchupMeta.home_team) selectionKey = 'home';
    if (canonicalTeam === matchupMeta.away_team) selectionKey = 'away';
    if (!selectionLabel) selectionLabel = canonicalTeam;
  }

  return {
    matchup: matchupMeta?.matchup || null,
    home_team: matchupMeta?.home_team || null,
    away_team: matchupMeta?.away_team || null,
    market_type: marketType,
    market_family: marketFamily,
    period,
    market_key: buildMarketKey(marketType, selection.line),
    selection_key: selectionKey,
    selection_label: selectionLabel,
    player_name: playerName || null,
    line: selection.line,
    team_context: canonicalTeam,
  };
}

function aliasMapFromConfig(bookConfig) {
  return new Map(
    Object.entries(bookConfig.market_aliases || {}).flatMap(([canonical, labels]) =>
      (labels || []).map((label) => [normalizeAliasLabel(label), canonical])
    )
  );
}

module.exports = {
  CANONICAL_MARKET_TYPES,
  BOOKMAKER_ALIAS_MAP,
  normalizePlayerName,
  normalizeAliasLabel,
  canonicalMarketTypeFromAlias,
  inferMarketType,
  marketFamilyFromType,
  periodFromMarketType,
  parseLine,
  parseSelectionDetails,
  canonicalizeMatchup,
  buildMarketKey,
  buildSelectionGroupKey,
  buildPlayerBundleKey,
  buildItemLookup,
  aliasMapFromConfig,
};
