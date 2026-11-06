// Entry point: node server/index.js  (PORT, RBB_DATA_FILE can override defaults)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRegistry } = require('./registry.js');
const { createServer } = require('./server.js');

const RBB_DIR = path.resolve(__dirname, '..', '..');
const DATA_FILE = process.env.RBB_DATA_FILE || path.join(RBB_DIR, 'Учасники конкурсу.csv');
// Registration closes as soon as this file exists — no restart needed.
const CLOSED_FLAG = path.join(RBB_DIR, '.konkurs-closed');
const PORT = Number(process.env.PORT) || 8787;

const registry = createRegistry(DATA_FILE);
const server = createServer({
  registry,
  isOpen: () => !fs.existsSync(CLOSED_FLAG),
  log: (line) => process.stdout.write(new Date().toISOString() + ' ' + line + '\n'),
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write('Contest server on http://127.0.0.1:' + PORT + ' · ' + registry.count() + ' participants · ' + DATA_FILE + '\n');
});
