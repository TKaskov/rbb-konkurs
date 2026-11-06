/**
 * Бекенд конкурсу Rox Beauty Bar.
 * Видає кожному Instagram-ніку послідовний номер і записує його в Google-таблицю.
 * Один нік = один номер: повторна реєстрація повертає вже виданий номер.
 *
 * Встановлення — див. ІНСТРУКЦІЯ.md, крок 1.
 */

const SHEET_NAME = 'Учасники';
const HEADERS = ['№', 'Instagram', 'Дата і час', 'Мова'];
const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
const LOCK_TIMEOUT_MS = 20000;

// Поставте false, щоб закрити реєстрацію (сторінка покаже «Реєстрацію завершено»).
const REGISTRATION_OPEN = true;

function doPost(e) {
  try {
    if (!REGISTRATION_OPEN) return json_({ success: false, error: 'closed' });

    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const handle = normalizeHandle_(body.handle);
    if (!isValidHandle_(handle)) return json_({ success: false, error: 'invalid_handle' });

    const lang = body.lang === 'pl' ? 'pl' : 'uk';
    return json_({ success: true, data: register_(handle, lang) });
  } catch (error) {
    console.error('Registration failed:', error);
    return json_({ success: false, error: 'server_error' });
  }
}

// Перевірка, що веб-застосунок живий: відкрийте URL у браузері.
function doGet() {
  return json_({ success: true, data: { status: 'ok', open: REGISTRATION_OPEN } });
}

function register_(handle, lang) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const sheet = getSheet_();
    const rows = readRows_(sheet);

    const found = rows.find((row) => row.handle === handle);
    if (found) return { number: found.number, existing: true };

    const lastNumber = rows.reduce((max, row) => Math.max(max, row.number), 0);
    const number = lastNumber + 1;
    sheet.appendRow([number, handle, new Date(), lang]);
    SpreadsheetApp.flush();
    return { number: number, existing: false };
  } finally {
    lock.releaseLock();
  }
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet
    .getRange(2, 1, lastRow - 1, 2)
    .getValues()
    .map((values) => ({ number: Number(values[0]) || 0, handle: String(values[1]).trim().toLowerCase() }))
    .filter((row) => row.number > 0);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const existing = spreadsheet.getSheetByName(SHEET_NAME);
  if (existing) return existing;

  const sheet = spreadsheet.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.setFrozenRows(1);
  return sheet;
}

function normalizeHandle_(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().toLowerCase();
  const fromLink = trimmed.match(/instagram\.com\/([^/?#\s]+)/);
  const candidate = fromLink ? fromLink[1] : trimmed;
  return candidate.replace(/^@+/, '').replace(/\/+$/, '');
}

function isValidHandle_(handle) {
  return (
    HANDLE_PATTERN.test(handle) &&
    !handle.startsWith('.') &&
    !handle.endsWith('.') &&
    handle.indexOf('..') === -1
  );
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

// Запустіть вручну з редактора один раз, щоб видати дозволи й створити аркуш.
function setup() {
  getSheet_();
}
