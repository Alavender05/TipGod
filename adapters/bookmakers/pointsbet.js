'use strict';

/**
 * adapters/bookmakers/pointsbet.js
 *
 * PointsBet AU — NBA moneyline (Match Winner) adapter.
 *
 * Target page: https://pointsbet.com.au/sports/basketball/nba
 * Note: PointsBet AU uses no "www." subdomain — canonical form is pointsbet.com.au.
 *
 * DOM assumptions (as of 2026-03):
 *  - PointsBet uses a React/Next.js frontend.
 *  - Event rows: [class*="event-row"], [class*="EventRow"], [class*="game-row"],
 *    [class*="match-row"].
 *  - Team names: [class*="team-name"], [class*="TeamName"], [class*="participant"],
 *    [class*="competitor-name"].
 *  - Odds buttons: [class*="odds-button"], [class*="price-button"],
 *    [class*="outcome-button"], [class*="OddsButton"].
 *  - Market heading: [class*="market-name"] containing "Match Winner".
 *
 * Geo-restriction: PointsBet AU requires an AU IP.
 * Returns [] on any error; orchestrator marks quotes as is_available: false.
 */

const {
  normalizeText,
  parseDecimalOdds,
  waitForSettle,
  dismissOverlays,
} = require('../shared');

const slug = 'pointsbet';
const name = 'PointsBet';

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
  const targetMarket = config.moneyline_market_name; // "Match Winner"

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 3000);
    await dismissOverlays(page);

    const rawGames = await page.evaluate((marketLabel) => {
      const results = [];

      // PointsBet: event/game row containers
      const cardSelectors = [
        '[class*="event-row"]',
        '[class*="EventRow"]',
        '[class*="game-row"]',
        '[class*="match-row"]',
        '[class*="event-card"]',
        '[class*="EventCard"]',
        '[class*="sporting-event"]',
      ].join(', ');

      const cards = Array.from(document.querySelectorAll(cardSelectors));
      const containers = cards.length > 0
        ? cards
        : Array.from(document.querySelectorAll('article, [role="listitem"], li'));

      for (const card of containers) {
        // Market heading detection
        const headings = Array.from(card.querySelectorAll(
          '[class*="market-name"], [class*="MarketName"], [class*="market-title"], ' +
          '[class*="tab-label"], [class*="tab-name"], h2, h3, h4'
        ));
        const hasTargetMarket = marketLabel === ''
          || headings.some((h) =>
            h.textContent.trim().toLowerCase().includes(marketLabel.toLowerCase())
          );
        if (!hasTargetMarket) continue;

        // Team/participant name elements
        const teamEls = Array.from(card.querySelectorAll(
          '[class*="team-name"], [class*="TeamName"], [class*="participant"], ' +
          '[class*="competitor-name"], [class*="CompetitorName"], ' +
          '[class*="selection-name"], [class*="SelectionName"]'
        )).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

        // Odds/price button elements
        const oddsEls = Array.from(card.querySelectorAll(
          '[class*="odds-button"], [class*="OddsButton"], [class*="price-button"], ' +
          '[class*="outcome-button"], [class*="OutcomeButton"], ' +
          '[class*="odds-value"], [class*="OddsValue"], [class*="price"]'
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
