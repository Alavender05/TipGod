'use strict';

/**
 * tests/scanner-utils.test.js
 *
 * Unit tests for pure utility functions from the main scanner.
 * These are inlined here since the scanner has side effects (Playwright, file writes)
 * that prevent direct require().
 *
 * Run with: node --test tests/scanner-utils.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// ─── Inline pure functions from scanner ───────────────────────────────────────

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function slugify(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parsePercent(value) {
  const numeric = parseNumber(value);
  return numeric == null ? null : numeric;
}

// ─── sha1 ─────────────────────────────────────────────────────────────────────

test('sha1: returns a 40-char hex string', () => {
  const result = sha1('hello');
  assert.equal(typeof result, 'string');
  assert.equal(result.length, 40);
  assert.match(result, /^[0-9a-f]+$/);
});

test('sha1: is deterministic', () => {
  assert.equal(sha1('test-input'), sha1('test-input'));
});

test('sha1: different inputs produce different hashes', () => {
  assert.notEqual(sha1('abc'), sha1('xyz'));
});

// ─── slugify ──────────────────────────────────────────────────────────────────

test('slugify: lowercases and replaces spaces with hyphens', () => {
  assert.equal(slugify('Best Bets'), 'best-bets');
});

test('slugify: strips leading and trailing hyphens', () => {
  assert.equal(slugify('  Best Bets  '), 'best-bets');
});

test('slugify: replaces special characters with hyphens', () => {
  assert.equal(slugify('NBA/Best-Bets!'), 'nba-best-bets');
});

test('slugify: collapses consecutive special chars to one hyphen', () => {
  assert.equal(slugify('A & B'), 'a-b');
});

test('slugify: handles empty string', () => {
  assert.equal(slugify(''), '');
});

// ─── parseNumber ──────────────────────────────────────────────────────────────

test('parseNumber: parses integer string', () => {
  assert.equal(parseNumber('42'), 42);
});

test('parseNumber: parses decimal string', () => {
  assert.equal(parseNumber('3.14'), 3.14);
});

test('parseNumber: parses negative number', () => {
  assert.equal(parseNumber('-7.5'), -7.5);
});

test('parseNumber: strips commas from large numbers', () => {
  assert.equal(parseNumber('1,234'), 1234);
});

test('parseNumber: extracts number from text with surrounding content', () => {
  assert.equal(parseNumber('Edge: 67.3%'), 67.3);
});

test('parseNumber: returns null for empty string', () => {
  assert.equal(parseNumber(''), null);
});

test('parseNumber: returns null for non-numeric text', () => {
  assert.equal(parseNumber('N/A'), null);
});

test('parseNumber: returns null for null input', () => {
  assert.equal(parseNumber(null), null);
});

// ─── parsePercent ─────────────────────────────────────────────────────────────

test('parsePercent: parses percentage value as raw number', () => {
  assert.equal(parsePercent('75%'), 75);
});

test('parsePercent: returns null for non-numeric', () => {
  assert.equal(parsePercent('N/A'), null);
});

test('parsePercent: parses decimal percentages', () => {
  assert.equal(parsePercent('67.5%'), 67.5);
});
