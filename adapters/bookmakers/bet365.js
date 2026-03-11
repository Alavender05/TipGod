'use strict';

const {
  waitForSettle,
  dismissOverlays,
  extractBookmakerSelections,
} = require('../shared');

const slug = 'bet365';
const name = 'Bet365';

async function fetchOdds(page, config) {
  const url = config.base_url + config.nba_path;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 6000);
    await dismissOverlays(page);

    return await extractBookmakerSelections(page, config, {
      containerSelectors: [
        '[class*="gl-Market"]',
        '[class*="glm-"]',
        '[class*="event-row"]',
        '[class*="EventRow"]',
        '[class*="game-row"]',
        '[class*="match-row"]',
        '[class*="fixture"]',
      ],
      headingSelectors: [
        'h2', 'h3', 'h4', 'span', 'div', 'p',
      ],
      teamSelectors: [
        'span[class*="Team"]',
        'div[class*="Team"]',
        'span[class*="participant"]',
        'div[class*="participant"]',
      ],
      oddsSelectors: [
        'span',
        'button',
        'div[class*="Odds"]',
        'span[class*="Odds"]',
      ],
    });
  } catch (error) {
    console.error(`[${name}] fetchOdds failed: ${error.message}`);
    return [];
  }
}

module.exports = { slug, name, fetchOdds };
