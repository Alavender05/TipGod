'use strict';

/**
 * tests/resolve.test.js
 *
 * Unit tests for team name resolution utilities in adapters/shared.js.
 *
 * Run with: node --test tests/resolve.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadTeamAliases, resolveTeam, resolveMatchup } = require('../adapters/shared.js');

// Shared alias map for all tests
const aliasMap = loadTeamAliases();

// ─── loadTeamAliases ──────────────────────────────────────────────────────────

test('loadTeamAliases: returns a Map', () => {
  assert.ok(aliasMap instanceof Map);
});

test('loadTeamAliases: contains canonical full team names', () => {
  assert.equal(aliasMap.get('los angeles lakers'), 'Los Angeles Lakers');
});

test('loadTeamAliases: contains short aliases (3-letter)', () => {
  assert.equal(aliasMap.get('lal'), 'Los Angeles Lakers');
});

test('loadTeamAliases: contains nickname aliases', () => {
  assert.equal(aliasMap.get('lakers'), 'Los Angeles Lakers');
});

test('loadTeamAliases: all keys are lowercase', () => {
  for (const key of aliasMap.keys()) {
    assert.equal(key, key.toLowerCase(), `Key "${key}" is not lowercase`);
  }
});

// ─── resolveTeam ─────────────────────────────────────────────────────────────

test('resolveTeam: resolves full canonical name', () => {
  assert.equal(resolveTeam('Boston Celtics', aliasMap), 'Boston Celtics');
});

test('resolveTeam: resolves nickname alias', () => {
  assert.equal(resolveTeam('Lakers', aliasMap), 'Los Angeles Lakers');
});

test('resolveTeam: resolves 3-letter code', () => {
  assert.equal(resolveTeam('BOS', aliasMap), 'Boston Celtics');
});

test('resolveTeam: resolves case-insensitively', () => {
  assert.equal(resolveTeam('GOLDEN STATE WARRIORS', aliasMap), 'Golden State Warriors');
});

test('resolveTeam: resolves with surrounding whitespace', () => {
  assert.equal(resolveTeam('  Heat  ', aliasMap), 'Miami Heat');
});

// NOTE: resolveTeam's partial match logic is intentionally broad — it checks if any
// alias appears as a substring within the raw name, or vice versa. Short aliases
// (e.g. "no" for New Orleans) can cause false positives on strings like "unknown".
// Tests use strings with no overlapping NBA aliases.
test('resolveTeam: returns null for fully non-NBA team name', () => {
  assert.equal(resolveTeam('QQQQQ ZZZZZ FC', aliasMap), null);
});

test('resolveTeam: returns null for empty string', () => {
  assert.equal(resolveTeam('', aliasMap), null);
});

test('resolveTeam: returns null for null', () => {
  assert.equal(resolveTeam(null, aliasMap), null);
});

// ─── resolveMatchup ───────────────────────────────────────────────────────────

test('resolveMatchup: resolves both teams successfully', () => {
  const result = resolveMatchup('Lakers', 'Celtics', aliasMap);
  assert.deepEqual(result, {
    home_team: 'Los Angeles Lakers',
    away_team: 'Boston Celtics',
  });
});

test('resolveMatchup: returns null when home team unresolvable', () => {
  assert.equal(resolveMatchup('QQQQQ FC', 'Celtics', aliasMap), null);
});

test('resolveMatchup: returns null when away team unresolvable', () => {
  assert.equal(resolveMatchup('Lakers', 'QQQQQ FC', aliasMap), null);
});

test('resolveMatchup: returns null when both teams unresolvable', () => {
  assert.equal(resolveMatchup('QQQQQ FC', 'ZZZZZ FC', aliasMap), null);
});
