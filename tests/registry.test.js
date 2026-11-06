const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRegistry } = require('../server/registry.js');

// 13:05:09 UTC = 14:05:09 in Warsaw (CET)
const FIXED_DATE = new Date(Date.UTC(2026, 10, 7, 13, 5, 9));

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbb-registry-'));
  return path.join(dir, 'participants.csv');
}

function open(filePath) {
  return createRegistry(filePath, { now: () => FIXED_DATE });
}

test('creates the CSV with a header and numbers participants from 1', () => {
  const file = tempFile();
  const registry = open(file);
  assert.deepEqual(registry.register('@Anna.K', 'uk'), { success: true, data: { number: 1, existing: false } });
  assert.deepEqual(registry.register('olena_m', 'pl'), { success: true, data: { number: 2, existing: false } });
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split('\n');
  assert.deepEqual(lines, [
    '№;Instagram;Дата і час;Мова',
    '1;anna.k;2026-11-07 14:05:09;uk',
    '2;olena_m;2026-11-07 14:05:09;pl',
  ]);
});

test('returns the existing number for a repeated nick without writing', () => {
  const file = tempFile();
  const registry = open(file);
  registry.register('anna.k', 'uk');
  registry.register('bob', 'uk');
  assert.deepEqual(registry.register('https://instagram.com/Anna.K/', 'pl'), { success: true, data: { number: 1, existing: true } });
  assert.equal(registry.count(), 2);
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 3);
});

test('keeps numbering after a restart and continues after the highest number', () => {
  const file = tempFile();
  fs.writeFileSync(file, '﻿№;Instagram;Дата і час;Мова\n1;a;x;uk\n5;e;x;uk\n');
  const registry = open(file);
  assert.deepEqual(registry.register('e', 'uk').data, { number: 5, existing: true });
  assert.equal(registry.register('new_one', 'uk').data.number, 6);
  assert.equal(open(file).register('new_one', 'uk').data.number, 6);
});

test('rejects invalid nicks and does not write them', () => {
  const file = tempFile();
  const registry = open(file);
  ['', '=HYPERLINK("x")', 'two words', 'a;b', 'x'.repeat(31), null, 42].forEach((handle) => {
    assert.deepEqual(registry.register(handle, 'uk'), { success: false, error: 'invalid_handle' });
  });
  assert.equal(registry.count(), 0);
});

test('stores an unknown language as uk', () => {
  const file = tempFile();
  open(file).register('anna', '<script>');
  assert.match(fs.readFileSync(file, 'utf8'), /;anna;[^;]+;uk\n$/);
});
