'use strict';

/**
 * adapters/bookmakers/bet365.js
 *
 * Bet365 AU — NBA moneyline (Match Betting) adapter.
 *
 * Target page: https://www.bet365.com.au/#/AS/B1/C20601769/D6/E1453/F10/
 * (Fragment-routing SPA — the hash path navigates to the NBA basketball section.)
 *
 * DOM assumptions (as of 2026-03):
 *  - Bet365 uses heavily obfuscated/minified class names that change frequently.
 *  - Primary extraction strategy: text-content matching rather than class selectors.
 *  - Game containers: look for elements that contain two adjacent team-name spans
 *    and exactly two decimal odds values.
 *  - Market section: the "Match Betting" section is identified by a heading element
 *    whose text includes "Match Betting".
 *  - Odds values: elements whose trimmed text matches a decimal pattern (e.g. "1.85"),
 *    typically rendered as <span> inside odds button wrappers.
 *
 * Settle time: 6000ms — Bet365's SPA requires extra hydration time after navigation.
 *
 * Geo-restriction: Bet365 AU requires an AU IP.
 * If the site geo-blocks the request, page.evaluate() will return [] and all
 * Bet365 quotes will have is_available: false — graceful degradation.
 */

const {
  normalizeText,
  parseDecimalOdds,
  waitForSettle,
  dismissOverlays,
} = require('../shared');

const slug = 'bet365';
const name = 'Bet365';

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
  const targetMarket = config.moneyline_market_name; // "Match Betting"

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Bet365 SPA needs extra settle time for the fragment route to hydrate
    await waitForSettle(page, 6000);
    await dismissOverlays(page);

    const rawGames = await page.evaluate((marketLabel) => {
      const results = [];

      // ─── Strategy 1: text-content matching ────────────────────────────────
      // Find all elements that might be market section headings for "Match Betting"
      // Bet365 uses obfuscated classes, so we scan all headings and spans by text

      const allTextEls = Array.from(document.querySelectorAll(
        'h2, h3, h4, span, div, p'
      ));

      // Locate the "Match Betting" section heading
      const marketHeading = allTextEls.find((el) =>
        el.textContent.trim().toLowerCase() === marketLabel.toLowerCase()
        && el.children.length === 0  // leaf text node only
      );

      if (marketHeading) {
        // Walk up to find the section container, then find game rows within it
        let section = marketHeading.parentElement;
        for (let i = 0; i < 6 && section; i += 1) {
          // Look for game rows that contain exactly 2 decimal values (odds)
          const children = Array.from(section.children);
          for (const child of children) {
            const text = child.textContent.replace(/\s+/g, ' ').trim();
            // A game row typically contains: Team1, Odds1, Team2, Odds2
            const decimalMatches = text.match(/\b\d+\.\d{1,2}\b/g);
            if (decimalMatches && decimalMatches.length >= 2) {
              // Extract all leaf text nodes to find team names
              const leafTexts = Array.from(child.querySelectorAll('span, div, p'))
                .filter((el) => el.children.length === 0)
                .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
                .filter(Boolean);

              // Separate team names (non-numeric) from odds (decimal numbers)
              const teamNames = leafTexts.filter((t) => !/^\d+\.?\d*$/.test(t) && t.length > 1);
              const oddsValues = leafTexts.filter((t) => /^\d+\.\d{1,2}$/.test(t));

              if (teamNames.length >= 2 && oddsValues.length >= 2) {
                results.push({
                  home_team_raw: teamNames[0],
                  away_team_raw: teamNames[1],
                  home_odds_raw: oddsValues[0],
                  away_odds_raw: oddsValues[1],
                  market_name: marketLabel,
                });
              }
            }
          }
          if (results.length > 0) break;
          section = section.parentElement;
        }
      }

      // ─── Strategy 2: class-based fallback ─────────────────────────────────
      // If text-matching found nothing, fall back to generic class-pattern scanning.
      // Bet365's actual class names are obfuscated but often contain "gl-" prefixes.
      if (results.length === 0) {
        const cardSelectors = [
          '[class*="gl-Market"]',
          '[class*="glm-"]',
          '[class*="event-row"]',
          '[class*="EventRow"]',
          '[class*="game-row"]',
          '[class*="match-row"]',
          '[class*="fixture"]',
        ].join(', ');

        const cards = Array.from(document.querySelectorAll(cardSelectors));

        for (const card of cards) {
          // Filter to sections containing the target market label
          const text = card.textContent.toLowerCase();
          if (marketLabel && !text.includes(marketLabel.toLowerCase())) continue;

          const leafTexts = Array.from(card.querySelectorAll('span, div, p'))
            .filter((el) => el.children.length === 0)
            .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

          const teamNames = leafTexts.filter((t) => !/^\d+\.?\d*$/.test(t) && t.length > 1);
          const oddsValues = leafTexts.filter((t) => /^\d+\.\d{1,2}$/.test(t));

          if (teamNames.length >= 2 && oddsValues.length >= 2) {
            results.push({
              home_team_raw: teamNames[0],
              away_team_raw: teamNames[1],
              home_odds_raw: oddsValues[0],
              away_odds_raw: oddsValues[1],
              market_name: marketLabel,
            });
          }
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
