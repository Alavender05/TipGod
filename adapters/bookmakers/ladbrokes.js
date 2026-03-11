'use strict';

/**
 * adapters/bookmakers/ladbrokes.js
 *
 * Ladbrokes AU — NBA moneyline (Head To Head) adapter.
 *
 * Target page: https://www.ladbrokes.com.au/sports/basketball/nba
 *
 * DOM assumptions (as of 2026-03):
 *  - Game cards are wrapped in elements whose class contains "event-card",
 *    "match-card", or similar.
 *  - Team names appear in elements whose class contains "team-name",
 *    "competitor", "participant", or "selection-name".
 *  - Odds appear in price/odds button elements.
 *  - The market type is identified by a heading whose text includes
 *    config.moneyline_market_name ("Head To Head").
 *
 * Geo-restriction: Ladbrokes AU requires an AU IP.
 * If the site is unavailable this function returns [] and the orchestrator
 * marks all Ladbrokes quotes as is_available: false.
 */

const {
  normalizeText,
  parseDecimalOdds,
  waitForSettle,
  dismissOverlays,
} = require('../shared');

const slug = 'ladbrokes';
const name = 'Ladbrokes';

/**
 * @param {import('playwright').Page} page
 * @param {object} config - BookmakerConfig from moneyline_bookmakers.json
 * @returns {Promise<Array<{
 *   home_team_raw: string,
 *   away_team_raw: string,
 *   home_odds: number|null,
 *   away_odds: number|null,
 *   market_name: string,
 *   is_available: boolean
 * }>>}
 */
async function fetchOdds(page, config) {
  const url = config.base_url + config.nba_path;
  const targetMarket = config.moneyline_market_name; // "Head To Head"

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 3000);
    await dismissOverlays(page);

    const rawGames = await page.evaluate((marketLabel) => {
      const results = [];

      // Ladbrokes AU: event/game card containers
      const cardSelectors = [
        '[class*="event-card"]',
        '[class*="match-card"]',
        '[class*="game-card"]',
        '[class*="EventCard"]',
        '[class*="MatchCard"]',
        '[class*="sporting-event"]',
        '[class*="event-row"]',
      ].join(', ');

      const cards = Array.from(document.querySelectorAll(cardSelectors));

      // Fallback: if no cards found by class, try to find containers that hold
      // exactly two team name elements and two odds buttons
      const containers = cards.length > 0
        ? cards
        : Array.from(document.querySelectorAll('article, [role="listitem"], li'));

      for (const card of containers) {
        // Market section detection — find a heading whose text matches our target
        const headings = Array.from(card.querySelectorAll(
          'h1, h2, h3, h4, h5, [class*="market-name"], [class*="market-title"], ' +
          '[class*="marketName"], [class*="tab-label"], [class*="tab-name"]'
        ));
        const hasTargetMarket = marketLabel === ''
          || headings.some((h) =>
            h.textContent.trim().toLowerCase().includes(marketLabel.toLowerCase())
          );
        if (!hasTargetMarket) continue;

        // Team name extraction
        const teamEls = Array.from(card.querySelectorAll(
          '[class*="team-name"], [class*="competitor"], [class*="participant"], ' +
          '[class*="selection-name"], [class*="teamName"], [class*="competitorName"]'
        )).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

        // Odds extraction — decimal values in price/odds/bet button elements
        const oddsEls = Array.from(card.querySelectorAll(
          '[class*="price"], [class*="odds"], [class*="Price"], [class*="Odds"], ' +
          'button[class*="bet"], [class*="outcome-price"], [class*="outcomePrice"]'
        )).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

        if (teamEls.length >= 2 && oddsEls.length >= 2) {
          results.push({
            home_team_raw: teamEls[0],
            away_team_raw: teamEls[1],
            home_odds_raw: oddsEls[0],
            away_odds_raw: oddsEls[1],
            market_name: marketLabel,
          });
        }
      }

      return results;
    }, targetMarket);

    return rawGames.map((g) => ({
      home_team_raw: normalizeText(g.home_team_raw),
      away_team_raw: normalizeText(g.away_team_raw),
      home_odds: parseDecimalOdds(g.home_odds_raw),
      away_odds: parseDecimalOdds(g.away_odds_raw),
      market_name: g.market_name,
      is_available: Boolean(g.home_team_raw && g.away_team_raw),
    }));
  } catch (error) {
    console.error(`[${name}] fetchOdds failed: ${error.message}`);
    return [];
  }
}

module.exports = { slug, name, fetchOdds };
