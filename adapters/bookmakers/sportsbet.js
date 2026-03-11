'use strict';

/**
 * adapters/bookmakers/sportsbet.js
 *
 * Sportsbet AU — NBA moneyline (Head To Head) adapter.
 *
 * Target page: https://www.sportsbet.com.au/basketball/nba
 *
 * DOM assumptions (as of 2026-03):
 *  - Sportsbet uses data-automation-id attributes extensively alongside
 *    class-based selectors. Both are targeted for resilience.
 *  - Event cards: [data-automation-id*="racing-event-card"] or
 *    [class*="outcomeCard"], [class*="event-card"], [class*="EventCard"].
 *  - Competitor names: [class*="competitorName"], [class*="competitor-name"],
 *    [data-automation-id*="participant"].
 *  - Odds/prices: [class*="priceText"], [class*="price-text"],
 *    [data-automation-id*="price"].
 *  - Market headings: [data-automation-id*="market-name"] or
 *    [class*="marketName"].
 *
 * Geo-restriction: Sportsbet AU requires an AU IP.
 * Returns [] on any error; orchestrator marks quotes as is_available: false.
 */

const {
  normalizeText,
  parseDecimalOdds,
  waitForSettle,
  dismissOverlays,
} = require('../shared');

const slug = 'sportsbet';
const name = 'Sportsbet';

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

      // Sportsbet: data-automation-id selectors preferred; class fallbacks included
      const cardSelectors = [
        '[data-automation-id*="event-card"]',
        '[data-automation-id*="racing-event"]',
        '[class*="outcomeCard"]',
        '[class*="EventCard"]',
        '[class*="event-card"]',
        '[class*="match-card"]',
        '[class*="game-card"]',
        '[class*="event-row"]',
        '[class*="EventRow"]',
      ].join(', ');

      const cards = Array.from(document.querySelectorAll(cardSelectors));
      const containers = cards.length > 0
        ? cards
        : Array.from(document.querySelectorAll('article, [role="listitem"], li'));

      for (const card of containers) {
        // Market heading detection
        const headings = Array.from(card.querySelectorAll(
          '[data-automation-id*="market-name"], [data-automation-id*="market-title"], ' +
          '[class*="marketName"], [class*="market-name"], [class*="market-title"], ' +
          'h2, h3, h4, [class*="tab-label"]'
        ));
        const hasTargetMarket = marketLabel === ''
          || headings.some((h) =>
            h.textContent.trim().toLowerCase().includes(marketLabel.toLowerCase())
          );
        if (!hasTargetMarket) continue;

        // Competitor/team name elements
        const teamEls = Array.from(card.querySelectorAll(
          '[data-automation-id*="participant"], [data-automation-id*="competitor"], ' +
          '[class*="competitorName"], [class*="competitor-name"], ' +
          '[class*="team-name"], [class*="teamName"], [class*="selection-name"]'
        )).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

        // Price elements
        const oddsEls = Array.from(card.querySelectorAll(
          '[data-automation-id*="price"], [class*="priceText"], [class*="price-text"], ' +
          '[class*="outcomePrice"], [class*="odds"], button[class*="price"]'
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
