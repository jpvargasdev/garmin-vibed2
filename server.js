// Zero-dependency local server: serves the dashboard and proxies read-only
// requests to the Garmin Connect API (browsers cannot call it directly: no CORS).
// The token is read from .env and never sent to the browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

loadDotEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';
const API_BASE = (process.env.GARMIN_API_BASE || 'https://connectapi.garmin.com').replace(/\/$/, '');
const AUTH_SCHEME = process.env.GARMIN_AUTH_SCHEME ?? 'Bearer';
const TOKEN = (process.env.GARMIN_TOKEN || '').trim();

// Only these Garmin services can be reached through the proxy.
const ALLOWED_SERVICES = new Set([
  'userprofile-service',
  'usersummary-service',
  'wellness-service',
  'hrv-service',
  'activitylist-service',
  'activity-service',
  'device-service',
  'personalrecord-service',
  'metrics-service',
  'weight-service',
  'badge-service',
  'fitnessstats-service',
  'goal-service',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function proxyGarmin(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Only GET is supported' });
  if (!TOKEN) return sendJson(res, 500, { error: 'GARMIN_TOKEN is not set. Add it to .env and restart the server.' });

  const garminPath = url.pathname.slice('/api/garmin/'.length);
  const service = garminPath.split('/')[0];
  if (!ALLOWED_SERVICES.has(service) || garminPath.includes('..')) {
    return sendJson(res, 400, { error: `Service not allowed: ${service}` });
  }

  try {
    const upstream = await fetch(`${API_BASE}/${garminPath}${url.search}`, {
      headers: {
        Authorization: AUTH_SCHEME ? `${AUTH_SCHEME} ${TOKEN}` : TOKEN,
        Accept: 'application/json',
        'User-Agent': 'GCM-iOS-5.7.2.1',
        'DI-Backend': new URL(API_BASE).host,
        NK: 'NT',
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return sendJson(res, upstream.status, { error: `Garmin responded ${upstream.status}`, body: text.slice(0, 2000) });
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text || 'null');
  } catch (err) {
    sendJson(res, 502, { error: `Could not reach Garmin: ${err.cause?.code || err.message}` });
  }
}

async function serveStatic(res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/garmin/')) return proxyGarmin(req, res, url);
  return serveStatic(res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Garmin dashboard running at http://localhost:${PORT}`);
  if (!TOKEN) console.warn('Warning: GARMIN_TOKEN is not set — copy .env.example to .env and add your token.');
});
