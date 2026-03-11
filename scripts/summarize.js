'use strict';

/**
 * scripts/summarize.js
 *
 * Node.js port of summarize_capping_pro_nba_surfaces.py.
 *
 * Usage:
 *   node scripts/summarize.js <dataset-path>
 *   npm run summarize:nba-surfaces
 *
 * Reads:
 *   <dataset-path>                     — capping-pro-nba-surfaces.json (or enriched variant)
 *   <dataset-stem>.run-summary.json    — optional run summary alongside the dataset
 *
 * Writes:
 *   <dataset-stem>.summary.json        — human-readable summary
 *
 * Prints:
 *   summary_file, total_items, surface_count, per-surface item counts
 */

const fs   = require('fs');
const path = require('path');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function topTitles(items, limit = 5) {
  const counts = new Map();
  for (const item of items) {
    const title = normalizeText(item.title);
    if (title) counts.set(title, (counts.get(title) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([title, count]) => ({ title, count }));
}

function buildSummary(datasetPath) {
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const stem = path.basename(datasetPath, path.extname(datasetPath));
  const dir  = path.dirname(datasetPath);
  const runSummaryPath = path.join(dir, `${stem}.run-summary.json`);

  const runSummary = fs.existsSync(runSummaryPath)
    ? JSON.parse(fs.readFileSync(runSummaryPath, 'utf8'))
    : {};

  const surfaces = [];
  let totalItems = 0;

  for (const surface of dataset.surfaces || []) {
    const items = surface.items || [];
    totalItems += items.length;
    surfaces.push({
      id: surface.id,
      label: surface.label,
      source_url: surface.source_url,
      item_count: items.length,
      top_titles: topTitles(items),
      notes: (surface.scan_summary || {}).notes || [],
    });
  }

  return {
    dataset_file: path.basename(datasetPath),
    run_summary_file: fs.existsSync(runSummaryPath) ? path.basename(runSummaryPath) : null,
    generated_at: dataset.generated_at,
    source_domain: dataset.source_domain,
    league_id: dataset.league_id,
    sport: dataset.sport,
    total_items: totalItems,
    surface_count: surfaces.length,
    surfaces,
    run_summary: runSummary,
  };
}

function writeSummary(datasetPath, summary) {
  const stem = path.basename(datasetPath, path.extname(datasetPath));
  const dir  = path.dirname(datasetPath);
  const summaryPath = path.join(dir, `${stem}.summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return summaryPath;
}

function printSummary(summary, summaryPath) {
  console.log(`summary_file: ${path.basename(summaryPath)}`);
  console.log(`total_items: ${summary.total_items}`);
  console.log(`surface_count: ${summary.surface_count}`);
  for (const surface of summary.surfaces) {
    console.log(`- ${surface.label}: ${surface.item_count}`);
  }
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node scripts/summarize.js <dataset-path>');
    process.exit(1);
  }

  const datasetPath = path.resolve(arg);
  if (!fs.existsSync(datasetPath)) {
    console.error(`File not found: ${datasetPath}`);
    process.exit(1);
  }

  const summary     = buildSummary(datasetPath);
  const summaryPath = writeSummary(datasetPath, summary);
  printSummary(summary, summaryPath);
}

main();
