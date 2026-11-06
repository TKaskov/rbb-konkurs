// HTTP API for the contest page: POST {handle, lang} → {success, data:{number, existing}}.
'use strict';

const http = require('node:http');

const MAX_BODY_BYTES = 2048;
const DEFAULT_RATE_LIMIT = Object.freeze({ max: 60, windowMs: 60 * 1000 });
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function createRateLimiter({ max, windowMs }) {
  let hits = new Map();
  return function allow(key, nowMs) {
    const recent = (hits.get(key) || []).filter((time) => nowMs - time < windowMs);
    if (recent.length >= max) return false;
    hits = new Map([...hits, [key, [...recent, nowMs]]]);
    return true;
  };
}

function send(res, status, payload) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'too_large'));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    return null;
  }
}

function visitorKey(req) {
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
}

function createServer({ registry, isOpen = () => true, rateLimit = DEFAULT_RATE_LIMIT, log = () => {} }) {
  const allow = createRateLimiter(rateLimit);

  async function handlePost(req, res) {
    if (!allow(visitorKey(req), Date.now())) {
      send(res, 429, { success: false, error: 'rate_limited' });
      return;
    }
    const body = parseJson(await readBody(req));
    if (!body) {
      send(res, 200, { success: false, error: 'server_error' });
      return;
    }
    if (!isOpen()) {
      send(res, 200, { success: false, error: 'closed' });
      return;
    }
    const result = registry.register(body.handle, body.lang);
    if (result.success && !result.data.existing) log('№' + result.data.number + ' ' + body.handle);
    send(res, 200, result);
  }

  return http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      send(res, 200, { success: true, data: { count: registry.count() } });
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { success: false, error: 'method_not_allowed' });
      return;
    }
    handlePost(req, res).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error('Registration failed:', error);
      send(res, status, { success: false, error: status === 413 ? 'too_large' : 'server_error' });
    });
  });
}

module.exports = { createServer };
