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
 * Resolve a raw bookmaker team name to its canonical NBA name.
 *
 * Resolution order:
 *  1. Exact alias match (lowercased)
 *  2. Partial include — alias appears in rawName or rawName appears in alias
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
    if (key.includes(alias) || alias.includes(key)) return canonical;
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

module.exports = {
  normalizeText,
  parseDecimalOdds,
  loadTeamAliases,
  resolveTeam,
  resolveMatchup,
  waitForSettle,
  dismissOverlays,
};
