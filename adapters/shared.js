'use strict';

/**
 * adapters/shared.js
 *
 * Shared utilities for bookmaker adapters.
 * Mirrors the patterns used in scan-capping-pro-nba-surfaces.js for consistency.
 */

const fs   = require('fs');
const path = require('path');

// ─── Text utilities ─────────────────────────────────────────────────────────

/**
 * Collapse whitespace sequences to a single space and trim.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse an AU decimal odds string into a number.
 * Strips leading '$', extracts the first decimal number.
 * Returns null if the value is not a valid odds figure (must be > 1.0).
 *
 * @param {unknown} text
 * @returns {number | null}
 */
function parseDecimalOdds(text) {
  const str = normalizeText(text).replace(/\$/g, '');
  const match = str.match(/\d+\.\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return n > 1.0 ? n : null;
}

// ─── Team name resolution ────────────────────────────────────────────────────

/**
 * Load source_policy.json and build an alias → canonical name map.
 * Covers both full names ("Los Angeles Lakers") and aliases ("LAL", "Lakers").
 * Keys are lowercased for case-insensitive lookup.
 *
 * @returns {Map<string, string>}
 */
function loadTeamAliases() {
  const policyPath = path.join(__dirname, '../config/source_policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const map = new Map();
  for (const team of policy.official_nba_teams) {
    map.set(team.name.toLowerCase(), team.name);
    for (const alias of team.aliases) {
      map.set(alias.toLowerCase(), team.name);
    }
  }
  return map;
}

/**
 * Escape a string for safe use in a RegExp pattern.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a raw bookmaker team name to its canonical NBA name.
 *
 * Resolution order:
 *  1. Exact alias match (lowercased)
 *  2. Word-boundary partial match — alias appears as a whole word in rawName,
 *     or rawName appears as a whole word in alias. Uses \b anchors to prevent
 *     short aliases (e.g. "no" for New Orleans) from matching inside unrelated
 *     strings like "unknown".
 *
 * Returns null if no match found.
 *
 * @param {string} rawName
 * @param {Map<string, string>} aliasMap
 * @returns {string | null}
 */
function resolveTeam(rawName, aliasMap) {
  if (!rawName) return null;
  const key = normalizeText(rawName).toLowerCase();

  if (aliasMap.has(key)) return aliasMap.get(key);

  for (const [alias, canonical] of aliasMap.entries()) {
    const aliasPattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    const keyPattern   = new RegExp(`\\b${escapeRegex(key)}\\b`, 'i');
    if (aliasPattern.test(key) || keyPattern.test(alias)) return canonical;
  }
  return null;
}

/**
 * Resolve both sides of a matchup to canonical team names.
 * Returns null if either side cannot be resolved.
 *
 * @param {string} homeRaw
 * @param {string} awayRaw
 * @param {Map<string, string>} aliasMap
 * @returns {{ home_team: string, away_team: string } | null}
 */
function resolveMatchup(homeRaw, awayRaw, aliasMap) {
  const home_team = resolveTeam(homeRaw, aliasMap);
  const away_team = resolveTeam(awayRaw, aliasMap);
  if (!home_team || !away_team) return null;
  return { home_team, away_team };
}

// ─── Playwright helpers ──────────────────────────────────────────────────────

/**
 * Wait for DOM content load then sleep for `ms` milliseconds.
 * Mirrors the waitForSettle pattern in the main scanner.
 *
 * @param {import('playwright').Page} page
 * @param {number} [ms=3000]
 */
async function waitForSettle(page, ms = 3000) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Best-effort dismissal of common overlay patterns (cookie banners, modals, popups).
 * Silently swallows all errors.
 *
 * @param {import('playwright').Page} page
 */
async function dismissOverlays(page) {
  const selectors = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    '[data-testid*="close"]',
    '[data-testid*="dismiss"]',
    '.modal button',
    '.popup button',
    '[class*="dismiss"]',
    '[class*="cookie"] button',
    '[class*="banner"] button',
    '[id*="cookie"] button',
    '[id*="modal"] button',
    'button[id*="accept"]',
    'button[id*="close"]',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.first().isVisible({ timeout: 400 })) {
        await loc.first().click({ timeout: 800 }).catch(() => {});
      }
    } catch {
      // best effort
    }
  }
}

/**
 * Best-effort generic market extraction for bookmaker pages.
 * Returns raw selection rows; normalization happens in adapters/index.js.
 *
 * @param {import('playwright').Page} page
 * @param {object} config
 * @param {{
 *   containerSelectors: string[],
 *   headingSelectors: string[],
 *   teamSelectors: string[],
 *   oddsSelectors: string[],
 * }} selectors
 * @returns {Promise<Array<object>>}
 */
async function extractBookmakerSelections(page, config, selectors) {
  return page.evaluate((marketAliases, passedSelectors) => {
    function norm(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function aliasKey(value) {
      return norm(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function canonicalMarket(headings) {
      const headingKeys = headings.map(aliasKey);
      for (const [canonical, labels] of Object.entries(marketAliases || {})) {
        const labelKeys = (labels || []).map(aliasKey);
        if (headingKeys.some((heading) => labelKeys.some((label) => heading.includes(label)))) {
          return {
            market_type_raw: canonical,
            market_name: headings[0] || canonical,
          };
        }
      }
      return null;
    }

    function leafTexts(node) {
      return Array.from(node.querySelectorAll('span, div, p, button'))
        .filter((el) => el.children.length === 0)
        .map((el) => norm(el.textContent))
        .filter(Boolean);
    }

    function findLine(texts) {
      for (const text of texts) {
        const match = text.match(/-?\d+(?:\.\d+)?/);
        if (match) return match[0];
      }
      return null;
    }

    function pickPlayerName(texts, headings, teams) {
      const blocked = new Set([
        ...headings.map(aliasKey),
        ...teams.map(aliasKey),
        'over',
        'under',
      ]);
      return texts.find((text) => {
        const key = aliasKey(text);
        return key
          && !blocked.has(key)
          && !/^\d+(\.\d+)?$/.test(text)
          && !/\b(over|under)\b/i.test(text)
          && text.length > 2;
      }) || null;
    }

    const containerSelector = passedSelectors.containerSelectors.join(', ');
    const headingSelector = passedSelectors.headingSelectors.join(', ');
    const teamSelector = passedSelectors.teamSelectors.join(', ');
    const oddsSelector = passedSelectors.oddsSelectors.join(', ');

    const containers = Array.from(document.querySelectorAll(containerSelector));
    const fallback = containers.length > 0
      ? containers
      : Array.from(document.querySelectorAll('article, [role="listitem"], li, section'));

    const results = [];

    for (const container of fallback) {
      const headings = Array.from(container.querySelectorAll(headingSelector))
        .map((el) => norm(el.textContent))
        .filter(Boolean);
      const matched = canonicalMarket(headings);
      if (!matched) continue;

      const teams = Array.from(container.querySelectorAll(teamSelector))
        .map((el) => norm(el.textContent))
        .filter(Boolean);
      const odds = Array.from(container.querySelectorAll(oddsSelector))
        .map((el) => norm(el.textContent))
        .filter(Boolean)
        .filter((value) => /\d+\.\d+/.test(value));
      const texts = leafTexts(container);

      const marketType = matched.market_type_raw;
      const line = findLine(texts);
      const playerName = marketType.startsWith('player_') ? pickPlayerName(texts, headings, teams) : null;
      const matchupTeamA = teams[0] || null;
      const matchupTeamB = teams[1] || null;

      if (marketType === 'moneyline' || marketType.endsWith('_spread')) {
        if (teams.length >= 2 && odds.length >= 2) {
          results.push({
            home_team_raw: matchupTeamA,
            away_team_raw: matchupTeamB,
            player_name_raw: null,
            market_type_raw: marketType,
            market_name: matched.market_name,
            selection_label_raw: matchupTeamA,
            line_raw: line,
            odds_raw: odds[0],
            is_available: true,
          });
          results.push({
            home_team_raw: matchupTeamA,
            away_team_raw: matchupTeamB,
            player_name_raw: null,
            market_type_raw: marketType,
            market_name: matched.market_name,
            selection_label_raw: matchupTeamB,
            line_raw: line,
            odds_raw: odds[1],
            is_available: true,
          });
        }
        continue;
      }

      if (marketType.includes('total')) {
        if (odds.length >= 2) {
          results.push({
            home_team_raw: matchupTeamA,
            away_team_raw: matchupTeamB,
            player_name_raw: null,
            market_type_raw: marketType,
            market_name: matched.market_name,
            selection_label_raw: `Over ${line || ''}`.trim(),
            line_raw: line,
            odds_raw: odds[0],
            is_available: true,
          });
          results.push({
            home_team_raw: matchupTeamA,
            away_team_raw: matchupTeamB,
            player_name_raw: null,
            market_type_raw: marketType,
            market_name: matched.market_name,
            selection_label_raw: `Under ${line || ''}`.trim(),
            line_raw: line,
            odds_raw: odds[1],
            is_available: true,
          });
        }
        continue;
      }

      if (marketType.startsWith('player_') && odds.length > 0) {
        const labels = texts.filter((text) => /\b(over|under)\b/i.test(text) || /\d+(?:\.\d+)?\+/.test(text));
        const selectionLabels = labels.length > 0 ? labels : ['Over'];
        for (let i = 0; i < Math.min(selectionLabels.length, odds.length); i += 1) {
          results.push({
            home_team_raw: matchupTeamA,
            away_team_raw: matchupTeamB,
            player_name_raw: playerName,
            market_type_raw: marketType,
            market_name: matched.market_name,
            selection_label_raw: selectionLabels[i],
            line_raw: findLine([selectionLabels[i]]) || line,
            odds_raw: odds[i],
            is_available: true,
          });
        }
      }
    }

    return results;
  }, config.market_aliases, selectors);
}

module.exports = {
  normalizeText,
  parseDecimalOdds,
  loadTeamAliases,
  resolveTeam,
  resolveMatchup,
  waitForSettle,
  dismissOverlays,
  extractBookmakerSelections,
};
