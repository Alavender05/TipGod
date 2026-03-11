'use strict';

const {
  waitForSettle,
  dismissOverlays,
  extractBookmakerSelections,
} = require('../shared');

const slug = 'ladbrokes';
const name = 'Ladbrokes';

async function fetchOdds(page, config) {
  const url = config.base_url + config.nba_path;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 3000);
    await dismissOverlays(page);

    return await extractBookmakerSelections(page, config, {
      containerSelectors: [
        '[class*="event-card"]',
        '[class*="match-card"]',
        '[class*="game-card"]',
        '[class*="sporting-event"]',
        '[class*="event-row"]',
      ],
      headingSelectors: [
        'h1', 'h2', 'h3', 'h4', 'h5',
        '[class*="market-name"]',
        '[class*="market-title"]',
        '[class*="marketName"]',
        '[class*="tab-label"]',
      ],
      teamSelectors: [
        '[class*="team-name"]',
        '[class*="competitor"]',
        '[class*="participant"]',
        '[class*="selection-name"]',
        '[class*="teamName"]',
      ],
      oddsSelectors: [
        '[class*="price"]',
        '[class*="odds"]',
        '[class*="Price"]',
        '[class*="Odds"]',
        'button[class*="bet"]',
        '[class*="outcome-price"]',
      ],
    });
  } catch (error) {
    console.error(`[${name}] fetchOdds failed: ${error.message}`);
    return [];
  }
}

module.exports = { slug, name, fetchOdds };
