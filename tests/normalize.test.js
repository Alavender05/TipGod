'use strict';

/**
 * tests/normalize.test.js
 *
 * Unit tests for text/number parsing utilities in adapters/shared.js
 * and the scanner's own parsing functions (inlined here for isolation).
 *
 * Run with: node --test tests/normalize.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeText, parseDecimalOdds } = require('../adapters/shared.js');

// ─── normalizeText ────────────────────────────────────────────────────────────

test('normalizeText: collapses multiple spaces', () => {
  assert.equal(normalizeText('Los   Angeles  Lakers'), 'Los Angeles Lakers');
});

test('normalizeText: trims leading and trailing whitespace', () => {
  assert.equal(normalizeText('  Hawks  '), 'Hawks');
});

test('normalizeText: collapses newlines and tabs', () => {
  assert.equal(normalizeText('Boston\n\tCeltics'), 'Boston Celtics');
});

test('normalizeText: handles null input', () => {
  assert.equal(normalizeText(null), '');
});

test('normalizeText: handles undefined input', () => {
  assert.equal(normalizeText(undefined), '');
});

test('normalizeText: handles empty string', () => {
  assert.equal(normalizeText(''), '');
});

test('normalizeText: handles numeric input', () => {
  assert.equal(normalizeText(42), '42');
});

// ─── parseDecimalOdds ─────────────────────────────────────────────────────────

test('parseDecimalOdds: parses standard AU decimal odds', () => {
  assert.equal(parseDecimalOdds('1.90'), 1.90);
});

test('parseDecimalOdds: parses odds with leading dollar sign', () => {
  assert.equal(parseDecimalOdds('$2.35'), 2.35);
});

test('parseDecimalOdds: parses odds with surrounding whitespace', () => {
  assert.equal(parseDecimalOdds('  3.50  '), 3.50);
});

test('parseDecimalOdds: returns null for value <= 1.0 (invalid odds)', () => {
  assert.equal(parseDecimalOdds('1.00'), null);
});

test('parseDecimalOdds: returns null for zero', () => {
  assert.equal(parseDecimalOdds('0.90'), null);
});

test('parseDecimalOdds: returns null for non-numeric text', () => {
  assert.equal(parseDecimalOdds('N/A'), null);
});

test('parseDecimalOdds: returns null for empty string', () => {
  assert.equal(parseDecimalOdds(''), null);
});

test('parseDecimalOdds: returns null for null', () => {
  assert.equal(parseDecimalOdds(null), null);
});

test('parseDecimalOdds: extracts first decimal from text with extra content', () => {
  const result = parseDecimalOdds('Win 2.10 lose');
  assert.equal(result, 2.10);
});

test('parseDecimalOdds: handles high odds correctly', () => {
  assert.equal(parseDecimalOdds('21.00'), 21.00);
});
