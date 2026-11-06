// Participant list stored as a CSV (opens in Numbers / Excel). One nick = one number.
'use strict';

const fs = require('node:fs');
const { normalizeHandle, isValidHandle } = require('../handle.js');

const BOM = '﻿';
const HEADER = BOM + '№;Instagram;Дата і час;Мова\n';
const LANGS = Object.freeze(['uk', 'pl']);

function parseRows(text) {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(';'))
    .map(([number, handle]) => ({ number: Number(number), handle: (handle || '').trim() }))
    .filter((row) => Number.isInteger(row.number) && row.number > 0 && row.handle);
}

// Contest runs in Warsaw — record Warsaw time whatever the Mac's clock zone is.
const WARSAW_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formatDate(date) {
  return WARSAW_TIME.format(date);
}

function loadRows(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, HEADER);
    return [];
  }
  return parseRows(fs.readFileSync(filePath, 'utf8'));
}

function createRegistry(filePath, { now = () => new Date() } = {}) {
  const rows = loadRows(filePath);
  let numbers = new Map(rows.map((row) => [row.handle, row.number]));
  let lastNumber = rows.reduce((max, row) => Math.max(max, row.number), 0);

  // Synchronous on purpose: Node handles one request at a time here, so numbers can't collide.
  function register(rawHandle, rawLang) {
    const handle = normalizeHandle(rawHandle);
    if (!isValidHandle(handle)) return { success: false, error: 'invalid_handle' };
    if (numbers.has(handle)) {
      return { success: true, data: { number: numbers.get(handle), existing: true } };
    }
    const number = lastNumber + 1;
    const lang = LANGS.includes(rawLang) ? rawLang : 'uk';
    fs.appendFileSync(filePath, [number, handle, formatDate(now()), lang].join(';') + '\n');
    lastNumber = number;
    numbers = new Map([...numbers, [handle, number]]);
    return { success: true, data: { number, existing: false } };
  }

  return Object.freeze({ register, count: () => numbers.size });
}

module.exports = { createRegistry };
