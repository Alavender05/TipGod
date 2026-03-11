'use strict';

const {
  waitForSettle,
  dismissOverlays,
  extractBookmakerSelections,
} = require('../shared');

const slug = 'sportsbet';
const name = 'Sportsbet';

async function fetchOdds(page, config) {
  const url = config.base_url + config.nba_path;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 3000);
    await dismissOverlays(page);

    return await extractBookmakerSelections(page, config, {
      containerSelectors: [
        '[data-automation-id*="event-card"]',
        '[data-automation-id*="racing-event"]',
        '[class*="outcomeCard"]',
        '[class*="EventCard"]',
        '[class*="event-card"]',
        '[class*="match-card"]',
        '[class*="game-card"]',
        '[class*="event-row"]',
      ],
      headingSelectors: [
        '[data-automation-id*="market-name"]',
        '[data-automation-id*="market-title"]',
        '[class*="marketName"]',
        '[class*="market-name"]',
        '[class*="market-title"]',
        'h2', 'h3', 'h4',
      ],
      teamSelectors: [
        '[data-automation-id*="participant"]',
        '[data-automation-id*="competitor"]',
        '[class*="competitorName"]',
        '[class*="competitor-name"]',
        '[class*="team-name"]',
        '[class*="teamName"]',
        '[class*="selection-name"]',
      ],
      oddsSelectors: [
        '[data-automation-id*="price"]',
        '[class*="priceText"]',
        '[class*="price-text"]',
        '[class*="outcomePrice"]',
        '[class*="odds"]',
        'button[class*="price"]',
      ],
    });
  } catch (error) {
    console.error(`[${name}] fetchOdds failed: ${error.message}`);
    return [];
  }
}

module.exports = { slug, name, fetchOdds };
