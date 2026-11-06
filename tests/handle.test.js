const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHandle, isValidHandle, instagramUrl } = require('../handle.js');

test('normalizeHandle strips @, spaces and uppercase', () => {
  assert.equal(normalizeHandle('  @Rox.Beauty.Bar '), 'rox.beauty.bar');
  assert.equal(normalizeHandle('@@anna_k'), 'anna_k');
});

test('normalizeHandle extracts nick from a pasted profile link', () => {
  assert.equal(normalizeHandle('https://www.instagram.com/med.gumenko?cplk=MTBqeGt0'), 'med.gumenko');
  assert.equal(normalizeHandle('instagram.com/_k.patisserie/'), '_k.patisserie');
  assert.equal(normalizeHandle('https://instagram.com/alis.polska/#top'), 'alis.polska');
});

test('normalizeHandle returns empty string for non-string input', () => {
  assert.equal(normalizeHandle(undefined), '');
  assert.equal(normalizeHandle(null), '');
  assert.equal(normalizeHandle(42), '');
});

test('isValidHandle accepts real Instagram nicknames', () => {
  ['revivo_home', 'jewels.by.irina', '_k.patisserie', 'a', 'x'.repeat(30)].forEach((h) => {
    assert.equal(isValidHandle(h), true, h);
  });
});

test('isValidHandle rejects malformed nicknames', () => {
  ['', 'x'.repeat(31), 'has space', 'bad-dash', '.start', 'end.', 'two..dots', '=cmd()', 'ім’я'].forEach((h) => {
    assert.equal(isValidHandle(h), false, h);
  });
});

test('instagramUrl builds a clean profile link without tracking params', () => {
  assert.equal(instagramUrl('dolce_bakerry'), 'https://www.instagram.com/dolce_bakerry/');
});
