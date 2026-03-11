const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SOURCE_POLICY = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/source_policy.json'), 'utf8'));
const ROOT_URL = SOURCE_POLICY.approved_root_url;
const OUTPUT_PATH = path.join(__dirname, 'capping-pro-nba-surfaces.json');
const RUN_SUMMARY_PATH = path.join(__dirname, 'capping-pro-nba-surfaces.run-summary.json');
const MAX_ITEMS_PER_SURFACE = 120;

const SURFACE_CONFIG = {
  'best-bets': {
    readySelector: '.nba-best-bets-grid, .nba-best-bets-container',
    fallbackPath: '/nba-bestbets',
  },
  edges: {
    readySelector: '.nba-edges-container, .nba-edges-table',
    fallbackPath: '/nba-edges',
  },
  props: {
    readySelector: '.nba-propfinder, .spreadsheet-table',
    fallbackPath: '/nba-propfinder',
  },
  parlay: {
    readySelector: '.parlay-night-container, .parlay-suggestion-card, .player-card',
    fallbackPath: '/parlay-of-the-night',
  },
  degen: {
    readySelector: '.degen-theory-container, .degen-table',
    fallbackPath: '/degen-theory',
  },
  exploits: {
    readySelector: '.game-card, .exploit-row',
    fallbackPath: '/nba-matchup-exploits',
  },
};

const TEAM_ALIAS_MAP = new Map(
  SOURCE_POLICY.official_nba_teams.flatMap((team) =>
    [team.name, ...(team.aliases || [])].map((alias) => [alias.toLowerCase(), team.name])
  )
);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function slugify(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parsePercent(value) {
  const numeric = parseNumber(value);
  return numeric == null ? null : numeric;
}

function buildMetric(key, label, rawValue, valueNumeric = null) {
  const display = normalizeText(rawValue);
  return {
    key,
    label,
    value: display || null,
    value_numeric: valueNumeric == null ? parseNumber(display) : valueNumeric,
  };
}

function canonicalTeamName(value) {
  return TEAM_ALIAS_MAP.get(normalizeText(value).toLowerCase()) || null;
}

function validateSurfaceItem(item, surface) {
  if (!item.surface || item.surface !== surface.id) return [false, 'wrong_surface'];
  if (!item.source_url || !surface.allowed_paths.some((allowedPath) => item.source_url.endsWith(allowedPath))) {
    return [false, 'wrong_source'];
  }
  if (item.league_id !== SOURCE_POLICY.league_id || item.sport !== SOURCE_POLICY.sport) {
    return [false, 'wrong_league'];
  }
  return [true, null];
}

function metricValue(item, key) {
  return item.metrics.find((metric) => metric.key === key)?.value_numeric ?? null;
}

function makeItem(surface, overrides) {
  const item = {
    surface: surface.id,
    source_url: new URL(SURFACE_CONFIG[surface.id].fallbackPath, ROOT_URL).href,
    league_id: SOURCE_POLICY.league_id,
    sport: SOURCE_POLICY.sport,
    item_id: '',
    title: null,
    subtitle: null,
    matchup: null,
    selection: null,
    market_type: null,
    team: null,
    player_name: null,
    sportsbook_name: null,
    odds_decimal: null,
    updated_at: null,
    reason: null,
    detail_notes: [],
    metrics: [],
    tags: [],
    raw_context: {},
    ...overrides,
  };
  item.metrics = (item.metrics || []).filter((metric) => metric && (metric.value || metric.value_numeric != null));
  item.tags = [...new Set((item.tags || []).map(normalizeText).filter(Boolean))];
  item.detail_notes = [...new Set((item.detail_notes || []).map(normalizeText).filter(Boolean))];
  item.item_id = item.item_id || sha1(
    [
      item.surface,
      item.title,
      item.matchup,
      item.selection,
      item.market_type,
      item.team,
      JSON.stringify(item.tags),
    ].join('|')
  );
  return item;
}

function createRunSummary() {
  return {
    generated_at: new Date().toISOString(),
    source_domain: SOURCE_POLICY.approved_domain,
    league_id: SOURCE_POLICY.league_id,
    sport: SOURCE_POLICY.sport,
    scanner: 'playwright',
    runtime: `node ${process.version}`,
    surfaces: [],
    totals: {
      unique_items: 0,
      rejected_wrong_source: 0,
      rejected_wrong_league: 0,
      rejected_wrong_surface: 0,
    },
  };
}

async function isVisible(locator) {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

async function clickWithRetry(page, locator, description) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await locator.first().scrollIntoViewIfNeeded();
      await locator.first().click({ timeout: 5000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(300);
      try {
        await locator.first().click({ timeout: 5000, force: true });
        return;
      } catch (forceError) {
        lastError = forceError;
      }
    }
  }
  throw new Error(`Failed to click ${description}: ${lastError && lastError.message}`);
}

async function dismissOverlays(page) {
  const selectors = [
    'button[aria-label="Close"]',
    '[data-testid*="close"]',
    '.modal button',
    '.popup button',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if (await isVisible(locator)) {
      try {
        await locator.first().click({ timeout: 1000 });
      } catch {
        // Best effort only.
      }
    }
  }
}

async function waitForSettle(page, timeout = 1800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(timeout);
}

async function ensureNbaMode(page) {
  const alreadyNba = await page.locator('.App.sport-nba').count();
  if (alreadyNba) return;

  const switched = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.sport-button'));
    const target = buttons.find((node) => normalize(node.textContent) === 'nba');
    if (!target) return false;
    target.click();
    return true;

    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  });

  if (!switched) {
    throw new Error('NBA sport switch not found');
  }
  await waitForSettle(page, 5000);
}

async function openSurface(page, surface) {
  await page.goto(ROOT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForSettle(page, 3500);
  await dismissOverlays(page);
  await ensureNbaMode(page);

  const tiles = page.locator('.ios-quick-action-tile');
  await tiles.first().waitFor({ state: 'visible', timeout: 15000 });
  const targetTile = tiles.filter({ hasText: surface.expected_nav_label }).first();
  if (!(await isVisible(targetTile))) {
    throw new Error(`Quick action tile not found for ${surface.label}`);
  }
  await clickWithRetry(page, targetTile, `${surface.label} quick action`);
  await waitForSettle(page, 5000);

  const readySelector = SURFACE_CONFIG[surface.id].readySelector;
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 20000 });
  if (!(await surfaceLooksValid(page, surface))) {
    throw new Error(`Surface validation failed for ${surface.label} at ${page.url()}`);
  }
  await waitForSettle(page);
}

async function surfaceLooksValid(page, surface) {
  const bodyText = normalizeText(await page.locator('body').innerText().catch(() => ''));
  const lower = bodyText.toLowerCase();
  const isNba = await page.locator('.App.sport-nba').count();
  const rejected = [...SOURCE_POLICY.rejected_competition_keywords, ...surface.rejected_keywords]
    .some((keyword) => lower.includes(keyword.toLowerCase()));
  const required = surface.required_keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
  const pathAllowed = surface.allowed_paths.some((allowedPath) => page.url().includes(allowedPath));
  return Boolean(isNba) && !rejected && (required || pathAllowed);
}

async function clickTextOption(page, selector, label) {
  const clicked = await page.evaluate(
    ({ cssSelector, text }) => {
      const nodes = Array.from(document.querySelectorAll(cssSelector));
      const target = nodes.find((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim() === text);
      if (!target) return false;
      target.click();
      return true;
    },
    { cssSelector: selector, text: label }
  );
  if (clicked) {
    await waitForSettle(page, 1800);
  }
  return clicked;
}

async function extractBestBets(page, surface) {
  const categoryLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-tab'))
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );

  const states = categoryLabels.length ? categoryLabels : ['Current'];
  const items = [];

  for (const label of states.slice(0, 4)) {
    if (label !== 'Current') {
      await clickTextOption(page, '.category-tab', label);
    }
    const extracted = await page.evaluate((stateLabel) => {
      const cards = Array.from(document.querySelectorAll('.nba-best-bet-card'));
      return cards.map((card) => {
        const text = (selector) => card.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
        const stats = Array.from(card.querySelectorAll('.stat-item')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
        return {
          category: stateLabel,
          player_name: text('.player-name'),
          position: text('.position-badge'),
          matchup: text('.team-matchup'),
          confidence: text('.confidence-value'),
          selection: text('.threshold-value'),
          reason: text('.edge-reason'),
          tier: text('.tier-badge'),
          games_analyzed: text('.games-analyzed'),
          stats,
        };
      });
    }, label);

    for (const entry of extracted) {
      const hitRate = entry.stats.find((value) => value.toLowerCase().includes('hit rate'));
      const average = entry.stats.find((value) => value.toLowerCase().includes('avg'));
      const teamHint = entry.matchup ? entry.matchup.split(/\s+vs\s+|\s+@\s+/i)[0] : null;
      items.push(
        makeItem(surface, {
          title: entry.player_name,
          subtitle: [entry.position, entry.matchup].filter(Boolean).join(' · ') || null,
          matchup: entry.matchup,
          selection: entry.selection,
          market_type: slugify((entry.selection || '').replace(/^\d+(?:\.\d+)?\+?\s+/, '')) || 'player-prop',
          team: canonicalTeamName(teamHint) || teamHint,
          player_name: entry.player_name,
          reason: entry.reason,
          detail_notes: entry.stats,
          tags: [entry.category, entry.tier, entry.position],
          metrics: [
            buildMetric('confidence', 'Confidence', entry.confidence, parsePercent(entry.confidence)),
            buildMetric('hit_rate', 'Hit Rate', hitRate),
            buildMetric('average', 'Average', average),
            buildMetric('games', 'Games', entry.games_analyzed),
          ],
          raw_context: entry,
        })
      );
    }
  }

  return dedupeItems(items).slice(0, MAX_ITEMS_PER_SURFACE);
}

async function extractEdges(page, surface) {
  const items = [];
  const propTypes = ['All Props', 'Points', 'Rebounds', 'Assists', '3-Pointers', 'Steals'];

  for (const propType of propTypes) {
    await clickTextOption(page, '.nba-edges-filters button', propType);
    const extracted = await page.evaluate((activeProp) => {
      const table = document.querySelector('.nba-edges-table');
      if (!table) return [];
      const headers = Array.from(table.querySelectorAll('thead th')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
        const record = Object.fromEntries(
          headers.map((header, index) => [header.toLowerCase().replace(/[^a-z0-9]+/g, '_'), cells[index] || null])
        );
        record.active_prop_type = activeProp;
        return record;
      });
    }, propType);

    for (const row of extracted) {
      const playerName = row.player || null;
      const prop = row.prop || row.active_prop_type;
      const selection = [row.direction, row.line, prop].filter(Boolean).join(' ');
      items.push(
        makeItem(surface, {
          title: playerName,
          subtitle: [row.team, prop].filter(Boolean).join(' · ') || null,
          selection,
          market_type: slugify(prop) || 'edge',
          team: canonicalTeamName(row.team) || row.team,
          player_name: playerName,
          odds_decimal: parseNumber(row.odds),
          reason: [row.tier, row.risk, row.ev_unit].filter(Boolean).join(' · ') || 'NBA edge candidate',
          tags: [row.tier, row.risk, row.active_prop_type],
          metrics: [
            buildMetric('edge', 'Edge', row.edge, parsePercent(row.edge)),
            buildMetric('win_probability', 'Win Prob', row.win_prob, parsePercent(row.win_prob)),
            buildMetric('hit_rate', 'Hit Rate', row.hit_rate, parsePercent(row.hit_rate)),
            buildMetric('recommended_bet', 'Rec Bet', row.rec_bet, parseNumber(row.rec_bet)),
          ],
          raw_context: row,
        })
      );
    }
  }

  return dedupeItems(items).slice(0, MAX_ITEMS_PER_SURFACE);
}

async function extractProps(page, surface) {
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab-button'))
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
  const items = [];

  for (const tab of tabs.slice(0, 8)) {
    await clickTextOption(page, '.tab-button', tab);
    const extracted = await page.evaluate((activeTab) => {
      const headers = [
        'Player',
        'Pos',
        'Team',
        'Games',
        'Average',
        ...Array.from(document.querySelectorAll('.threshold-header')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      ];
      const rows = Array.from(document.querySelectorAll('tr.player-row'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
        if (cells.length < 6) {
          return null;
        }
        const team = row.querySelector('.team-cell img')?.getAttribute('alt') || cells[2] || null;
        const thresholds = headers.slice(5).map((header, index) => ({
          header,
          value: cells[index + 5] || '',
        }));
        return {
          active_tab: activeTab,
          player_name: cells[0] || null,
          position: cells[1] || null,
          team,
          games: cells[3] || null,
          average: cells[4] || null,
          thresholds,
        };
      }).filter(Boolean);
    }, tab);

    for (const row of extracted) {
      const bestThreshold = row.thresholds
        .map((threshold) => ({
          ...threshold,
          numeric: parsePercent(threshold.value),
          lineNumeric: parseNumber(threshold.header),
        }))
        .filter((threshold) => threshold.numeric != null)
        .sort((a, b) => (b.numeric - a.numeric) || ((b.lineNumeric || 0) - (a.lineNumeric || 0)))[0];

      const trendBucket = bestThreshold && bestThreshold.numeric >= 80
        ? 'High Trend'
        : bestThreshold && bestThreshold.numeric >= 65
          ? 'Medium Trend'
          : 'Low Trend';

      items.push(
        makeItem(surface, {
          title: row.player_name,
          subtitle: [row.team, row.position].filter(Boolean).join(' · ') || null,
          selection: bestThreshold ? `${bestThreshold.header}` : `${row.active_tab} ladder`,
          market_type: slugify(row.active_tab) || 'props',
          team: canonicalTeamName(row.team) || row.team,
          player_name: row.player_name,
          reason: bestThreshold
            ? `Best visible ladder hit rate at ${bestThreshold.header}`
            : `Visible ${row.active_tab.toLowerCase()} ladder`,
          tags: [row.active_tab, trendBucket, row.position],
          metrics: [
            buildMetric('hit_rate', 'Hit Rate', bestThreshold?.value || null, bestThreshold?.numeric ?? null),
            buildMetric('average', 'Average', row.average),
            buildMetric('games', 'Games', row.games),
            buildMetric('line', 'Line', bestThreshold?.header || null, bestThreshold?.lineNumeric ?? null),
          ],
          raw_context: row,
        })
      );
    }
  }

  return dedupeItems(items).slice(0, MAX_ITEMS_PER_SURFACE);
}

async function extractParlay(page, surface) {
  const items = await page.evaluate(() => {
    const results = [];

    for (const card of Array.from(document.querySelectorAll('.parlay-suggestion-card'))) {
      const text = (selector) => card.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
      results.push({
        type: 'prebuilt',
        title: text('.parlay-card-header') || text('h3'),
        legs: text('.risk-badge'),
        avg_probability: Array.from(card.querySelectorAll('.stat')).find((node) => node.textContent.includes('AVG PROBABILITY'))?.textContent?.replace(/\s+/g, ' ').trim() || null,
        combined_probability: Array.from(card.querySelectorAll('.stat')).find((node) => node.textContent.includes('COMBINED'))?.textContent?.replace(/\s+/g, ' ').trim() || null,
        odds: Array.from(card.querySelectorAll('.stat')).find((node) => node.textContent.includes('ODDS'))?.textContent?.replace(/\s+/g, ' ').trim() || null,
      });
    }

    for (const card of Array.from(document.querySelectorAll('.player-card'))) {
      const text = (selector) => card.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
      const stats = Array.from(card.querySelectorAll('.stat')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
      results.push({
        type: 'single-leg',
        rank: text('.rank'),
        player_name: text('.player-details'),
        team_pos: text('.team-pos'),
        selection: text('.bet-line'),
        probability: text('.prob-value'),
        stats,
        reasoning: text('.reasoning'),
        tier: text('.tier-badge'),
      });
    }

    return results;
  });

  return dedupeItems(items.map((entry) => {
    if (entry.type === 'prebuilt') {
      return makeItem(surface, {
        title: entry.title,
        subtitle: 'Pre-built parlay',
        selection: entry.title,
        market_type: 'prebuilt-parlay',
        reason: 'Suggested parlay bundle',
        tags: ['Prebuilt Parlay'],
        metrics: [
          buildMetric('legs', 'Legs', entry.legs),
          buildMetric('avg_probability', 'Avg Probability', entry.avg_probability, parsePercent(entry.avg_probability)),
          buildMetric('combined_probability', 'Combined', entry.combined_probability, parsePercent(entry.combined_probability)),
          buildMetric('odds', 'Odds', entry.odds, parseNumber(entry.odds)),
        ],
        raw_context: entry,
      });
    }

    const team = entry.team_pos?.split('•')[0]?.trim() || null;
    return makeItem(surface, {
      title: entry.player_name,
      subtitle: entry.team_pos,
      selection: entry.selection,
      market_type: 'single-leg',
      team,
      player_name: entry.player_name,
      reason: entry.reasoning || 'Parlay candidate',
      detail_notes: entry.stats,
      tags: [entry.tier],
      metrics: [
        buildMetric('probability', 'Hit Probability', entry.probability, parsePercent(entry.probability)),
        buildMetric('average', 'Average', entry.stats.find((value) => value.toLowerCase().startsWith('avg'))),
        buildMetric('accuracy', 'Accuracy', entry.stats.find((value) => value.toLowerCase().startsWith('accuracy')), parsePercent(entry.stats.find((value) => value.toLowerCase().startsWith('accuracy')))),
        buildMetric('tier', 'Tier', entry.tier),
      ],
      raw_context: entry,
    });
  })).slice(0, MAX_ITEMS_PER_SURFACE);
}

async function extractDegen(page, surface) {
  const statTypes = await page.evaluate(() => {
    const select = document.querySelector('.degen-theory-container select');
    if (!select) return [];
    return Array.from(select.options).map((option) => ({ value: option.value, label: option.textContent.replace(/\s+/g, ' ').trim() }));
  });
  const items = [];

  for (const option of statTypes.slice(0, 4)) {
    await page.selectOption('.degen-theory-container select', option.value).catch(() => {});
    await waitForSettle(page, 1800);
    const extracted = await page.evaluate((activeStat) => {
      const rows = Array.from(document.querySelectorAll('.degen-table tbody .player-row'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((node) => node.textContent.replace(/\s+/g, ' ').trim());
        return {
          active_stat: activeStat,
          rank: cells[0] || null,
          player_name: cells[1] || null,
          team: cells[2] || null,
          position: cells[3] || null,
          games: cells[4] || null,
          average: cells[5] || null,
          tier: cells[6] || null,
          pattern_type: cells[7] || null,
          consistency: cells[8] || null,
          accuracy: cells[9] || null,
          next_bet: cells[10] || null,
        };
      });
    }, option.label);

    for (const row of extracted) {
      items.push(
        makeItem(surface, {
          title: row.player_name,
          subtitle: [row.team, row.position].filter(Boolean).join(' · ') || null,
          selection: row.next_bet,
          market_type: slugify(row.active_stat) || 'degen',
          team: canonicalTeamName(row.team) || row.team,
          player_name: row.player_name,
          reason: row.pattern_type ? `${row.pattern_type} pattern` : 'Alternating performance candidate',
          tags: [row.active_stat, row.tier, row.pattern_type],
          metrics: [
            buildMetric('accuracy', 'Accuracy', row.accuracy, parsePercent(row.accuracy)),
            buildMetric('consistency', 'Consistency', row.consistency, parsePercent(row.consistency)),
            buildMetric('average', 'Average', row.average),
            buildMetric('games', 'Games', row.games),
          ],
          raw_context: row,
        })
      );
    }
  }

  return dedupeItems(items).slice(0, MAX_ITEMS_PER_SURFACE);
}

async function extractExploits(page, surface) {
  const items = [];

  const gameHeaders = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.game-card .game-header')).map((node) => node.textContent.replace(/\s+/g, ' ').trim())
  );

  for (const headerText of gameHeaders.slice(0, 6)) {
    await page.evaluate((headerLabel) => {
      const header = Array.from(document.querySelectorAll('.game-card .game-header'))
        .find((node) => node.textContent.replace(/\s+/g, ' ').trim() === headerLabel);
      if (header) header.click();
    }, headerText);
    await waitForSettle(page, 1200);

    const extracted = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.game-card'));
      return cards.flatMap((card) => {
        const matchup = card.querySelector('.game-matchup')?.textContent?.replace(/\s+/g, ' ').trim() || null;
        const rows = Array.from(card.querySelectorAll('.exploit-row'));
        return rows.map((row) => ({
          matchup,
          rank: row.querySelector('.exploit-rank')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          score: row.querySelector('.exploit-score')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          player_name: row.querySelector('.exploit-player-name')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          position: row.querySelector('.exploit-position')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          type_label: row.querySelector('.exploit-type-label')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          team: row.querySelector('.team-abbr')?.textContent?.replace(/\s+/g, ' ').trim() || null,
          ladder: Array.from(row.querySelectorAll('.ladder-chip')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
          badges: row.querySelector('.exploit-badges')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        }));
      });
    });

    for (const row of extracted) {
      items.push(
        makeItem(surface, {
          title: row.player_name,
          subtitle: [row.team, row.position].filter(Boolean).join(' · ') || null,
          matchup: row.matchup,
          selection: row.type_label,
          market_type: slugify(row.type_label) || 'exploit',
          team: canonicalTeamName(row.team) || row.team,
          player_name: row.player_name,
          reason: row.badges || 'Opponent weakness exploit',
          detail_notes: row.ladder,
          tags: [row.position, row.type_label, row.badges],
          metrics: [
            buildMetric('score', 'Exploit Score', row.score, parseNumber(row.score)),
            buildMetric('ladder_one', '1+', row.ladder[0], parsePercent(row.ladder[0])),
            buildMetric('ladder_two', '2+', row.ladder[1], parsePercent(row.ladder[1])),
            buildMetric('ladder_three', '3+', row.ladder[2], parsePercent(row.ladder[2])),
          ],
          raw_context: row,
        })
      );
    }
  }

  return dedupeItems(items).slice(0, MAX_ITEMS_PER_SURFACE);
}

function dedupeItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${item.surface}|${item.title}|${item.matchup}|${item.selection}|${item.market_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function scanSurface(page, surface) {
  const startedAt = new Date().toISOString();
  const summary = {
    id: surface.id,
    label: surface.label,
    source_url: new URL(SURFACE_CONFIG[surface.id].fallbackPath, ROOT_URL).href,
    started_at: startedAt,
    finished_at: null,
    page_url: null,
    accepted_items: 0,
    rejected_wrong_source: 0,
    rejected_wrong_league: 0,
    rejected_wrong_surface: 0,
    notes: [],
  };

  let items = [];
  try {
    await openSurface(page, surface);
    summary.page_url = page.url();

    if (surface.id === 'best-bets') {
      items = await extractBestBets(page, surface);
    } else if (surface.id === 'edges') {
      items = await extractEdges(page, surface);
    } else if (surface.id === 'props') {
      items = await extractProps(page, surface);
    } else if (surface.id === 'parlay') {
      items = await extractParlay(page, surface);
    } else if (surface.id === 'degen') {
      items = await extractDegen(page, surface);
    } else if (surface.id === 'exploits') {
      items = await extractExploits(page, surface);
    }
  } catch (error) {
    summary.notes.push(normalizeText(error.message));
  }

  const accepted = [];
  for (const item of items) {
    const [valid, reason] = validateSurfaceItem(item, surface);
    if (!valid) {
      if (reason === 'wrong_source') summary.rejected_wrong_source += 1;
      if (reason === 'wrong_league') summary.rejected_wrong_league += 1;
      if (reason === 'wrong_surface') summary.rejected_wrong_surface += 1;
      continue;
    }
    accepted.push(item);
  }

  summary.accepted_items = accepted.length;
  summary.finished_at = new Date().toISOString();
  return {
    id: surface.id,
    label: surface.label,
    source_url: summary.source_url,
    scan_summary: summary,
    items: accepted,
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  const runSummary = createRunSummary();
  const surfaces = [];

  try {
    for (const surface of SOURCE_POLICY.approved_surfaces) {
      const result = await scanSurface(page, surface);
      runSummary.surfaces.push(result.scan_summary);
      runSummary.totals.unique_items += result.items.length;
      runSummary.totals.rejected_wrong_source += result.scan_summary.rejected_wrong_source;
      runSummary.totals.rejected_wrong_league += result.scan_summary.rejected_wrong_league;
      runSummary.totals.rejected_wrong_surface += result.scan_summary.rejected_wrong_surface;
      surfaces.push(result);
    }
  } finally {
    await browser.close();
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_domain: SOURCE_POLICY.approved_domain,
    league_id: SOURCE_POLICY.league_id,
    sport: SOURCE_POLICY.sport,
    surfaces,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(RUN_SUMMARY_PATH, `${JSON.stringify(runSummary, null, 2)}\n`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
