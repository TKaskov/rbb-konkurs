const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRegistry } = require('../server/registry.js');
const { createServer } = require('../server/server.js');

async function startServer(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbb-server-'));
  const registry = createRegistry(path.join(dir, 'participants.csv'));
  const server = createServer({ registry, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  return { url, close: () => new Promise((resolve) => server.close(resolve)) };
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('registers participants and answers with CORS headers', async (t) => {
  const { url, close } = await startServer();
  t.after(close);
  const first = await post(url, { handle: '@Anna.K', lang: 'uk' });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await first.json(), { success: true, data: { number: 1, existing: false } });
  const again = await post(url, { handle: 'anna.k' });
  assert.deepEqual(await again.json(), { success: true, data: { number: 1, existing: true } });
});

test('gives unique numbers to many parallel registrations', async (t) => {
  const { url, close } = await startServer({ rateLimit: { max: 1000, windowMs: 60000 } });
  t.after(close);
  const handles = Array.from({ length: 40 }, (_, i) => 'user_' + i);
  const results = await Promise.all(handles.map((handle) => post(url, { handle }).then((r) => r.json())));
  const numbers = results.map((r) => r.data.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, handles.map((_, i) => i + 1));
});

test('reports invalid nick and malformed body', async (t) => {
  const { url, close } = await startServer();
  t.after(close);
  assert.deepEqual(await (await post(url, { handle: 'two words' })).json(), { success: false, error: 'invalid_handle' });
  assert.deepEqual(await (await post(url, 'not json')).json(), { success: false, error: 'server_error' });
});

test('rejects oversized bodies', async (t) => {
  const { url, close } = await startServer();
  t.after(close);
  const response = await post(url, { handle: 'a', pad: 'x'.repeat(5000) });
  assert.equal(response.status, 413);
});

test('answers closed when registration is closed', async (t) => {
  const { url, close } = await startServer({ isOpen: () => false });
  t.after(close);
  assert.deepEqual(await (await post(url, { handle: 'anna' })).json(), { success: false, error: 'closed' });
});

test('rate-limits one visitor but not others', async (t) => {
  const { url, close } = await startServer({ rateLimit: { max: 3, windowMs: 60000 } });
  t.after(close);
  const visitor = { 'CF-Connecting-IP': '1.1.1.1' };
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    statuses.push((await post(url, { handle: 'spam_' + i }, visitor)).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
  assert.equal((await post(url, { handle: 'other' }, { 'CF-Connecting-IP': '2.2.2.2' })).status, 200);
});

test('answers preflight and health check', async (t) => {
  const { url, close } = await startServer();
  t.after(close);
  assert.equal((await fetch(url, { method: 'OPTIONS' })).status, 204);
  const health = await (await fetch(url)).json();
  assert.deepEqual(health, { success: true, data: { count: 0 } });
});
