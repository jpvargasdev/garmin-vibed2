// Cloudflare Worker that relays read-only requests from the GitHub Pages
// dashboard to the Garmin Connect API and adds the CORS headers Garmin omits.
// The token travels from the browser in X-Garmin-Token; nothing is stored here.
//
// Deploy: see worker/README.md. Set ALLOWED_ORIGIN to your Pages origin,
// e.g. https://jpvargasdev.github.io

const API_BASE = 'https://connectapi.garmin.com';

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

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Garmin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json(405, { error: 'Only GET is supported' }, cors);

    const url = new URL(request.url);
    const garminPath = url.pathname.replace(/^\/+/, '');
    const service = garminPath.split('/')[0];
    if (!ALLOWED_SERVICES.has(service) || garminPath.includes('..')) {
      return json(400, { error: `Service not allowed: ${service}` }, cors);
    }

    const token = (request.headers.get('X-Garmin-Token') || '').trim();
    if (!token) return json(401, { error: 'Missing X-Garmin-Token header' }, cors);

    const scheme = env.GARMIN_AUTH_SCHEME ?? 'Bearer';
    const upstream = await fetch(`${API_BASE}/${garminPath}${url.search}`, {
      headers: {
        Authorization: scheme ? `${scheme} ${token}` : token,
        Accept: 'application/json',
        'User-Agent': 'GCM-iOS-5.7.2.1',
        'DI-Backend': 'connectapi.garmin.com',
        NK: 'NT',
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return json(upstream.status, { error: `Garmin responded ${upstream.status}`, body: text.slice(0, 2000) }, cors);
    }
    return new Response(text || 'null', {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
    });
  },
};
