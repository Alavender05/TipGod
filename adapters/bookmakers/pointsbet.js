'use strict';

const {
  waitForSettle,
  dismissOverlays,
  extractBookmakerSelections,
} = require('../shared');

const slug = 'pointsbet';
const name = 'PointsBet';

async function fetchOdds(page, config) {
  const url = config.base_url + config.nba_path;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 3000);
    await dismissOverlays(page);

    return await extractBookmakerSelections(page, config, {
      containerSelectors: [
        '[class*="event-row"]',
        '[class*="EventRow"]',
        '[class*="game-row"]',
        '[class*="match-row"]',
        '[class*="event-card"]',
        '[class*="EventCard"]',
      ],
      headingSelectors: [
        '[class*="market-name"]',
        '[class*="MarketName"]',
        '[class*="market-title"]',
        '[class*="tab-label"]',
        '[class*="tab-name"]',
        'h2', 'h3', 'h4',
      ],
      teamSelectors: [
        '[class*="team-name"]',
        '[class*="TeamName"]',
        '[class*="participant"]',
        '[class*="competitor-name"]',
        '[class*="CompetitorName"]',
        '[class*="selection-name"]',
        '[class*="SelectionName"]',
      ],
      oddsSelectors: [
        '[class*="odds-button"]',
        '[class*="OddsButton"]',
        '[class*="price-button"]',
        '[class*="outcome-button"]',
        '[class*="OutcomeButton"]',
        '[class*="odds-value"]',
        '[class*="OddsValue"]',
        '[class*="price"]',
      ],
    });
  } catch (error) {
    console.error(`[${name}] fetchOdds failed: ${error.message}`);
    return [];
  }
}

module.exports = { slug, name, fetchOdds };
