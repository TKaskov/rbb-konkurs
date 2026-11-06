// Runs apps-script/Code.gs against an in-memory fake of Google Sheets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

function createFakeSheet(initialRows) {
  const rows = initialRows.map((row) => [...row]);
  const range = (r, c, numRows, numCols) => ({
    getValues: () => rows.slice(r - 1, r - 1 + numRows).map((row) => row.slice(c - 1, c - 1 + numCols)),
    setValues: (values) => {
      values.forEach((v, i) => { rows[r - 1 + i] = v; });
      return range(r, c, numRows, numCols);
    },
    setFontWeight: () => range(r, c, numRows, numCols),
    setNumberFormat: () => range(r, c, numRows, numCols),
  });
  return {
    rows,
    getLastRow: () => rows.length,
    getRange: (a, b, c, d) => (typeof a === 'string' ? range(1, 2, 0, 1) : range(a, b, c, d)),
    appendRow: (row) => rows.push(row),
    setFrozenRows: () => {},
  };
}

function loadBackend({ existingRows } = {}) {
  let sheet = existingRows ? createFakeSheet(existingRows) : null;
  const context = {
    console: { error: () => {} },
    JSON,
    Date,
    Math,
    Number,
    String,
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: {
      flush: () => {},
      getActiveSpreadsheet: () => ({
        getSheetByName: () => sheet,
        insertSheet: () => { sheet = createFakeSheet([]); return sheet; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  const postRaw = (contents) => JSON.parse(context.doPost({ postData: { contents } }).text);
  const post = (body) => postRaw(JSON.stringify(body));
  return { post, postRaw, getSheet: () => sheet };
}

test('creates the sheet with headers and numbers participants from 1', () => {
  const { post, getSheet } = loadBackend();
  assert.deepEqual(post({ handle: '@Anna.K' }), { success: true, data: { number: 1, existing: false } });
  assert.deepEqual(post({ handle: 'olena_m', lang: 'pl' }), { success: true, data: { number: 2, existing: false } });
  const rows = getSheet().rows;
  assert.equal(rows[0][0], '№');
  assert.deepEqual([rows[1][0], rows[1][1], rows[1][3]], [1, 'anna.k', 'uk']);
  assert.deepEqual([rows[2][0], rows[2][1], rows[2][3]], [2, 'olena_m', 'pl']);
});

test('returns the same number when the same nick registers again', () => {
  const { post, getSheet } = loadBackend();
  post({ handle: 'anna.k' });
  post({ handle: 'bob' });
  assert.deepEqual(post({ handle: 'https://instagram.com/Anna.K/' }), { success: true, data: { number: 1, existing: true } });
  assert.equal(getSheet().rows.length, 3);
});

test('continues after the highest number even if rows were deleted', () => {
  const { post } = loadBackend({ existingRows: [['№', 'Instagram', 'Дата і час', 'Мова'], [1, 'a', '', 'uk'], [5, 'e', '', 'uk']] });
  assert.equal(post({ handle: 'new_one' }).data.number, 6);
});

test('rejects invalid nicknames without writing anything', () => {
  const { post, getSheet } = loadBackend();
  ['', '=HYPERLINK("x")', 'two words', 'x'.repeat(31)].forEach((handle) => {
    assert.deepEqual(post({ handle }), { success: false, error: 'invalid_handle' });
  });
  assert.equal(getSheet(), null);
});

test('returns server_error for a malformed body', () => {
  const { postRaw } = loadBackend();
  assert.deepEqual(postRaw('not json'), { success: false, error: 'server_error' });
});
