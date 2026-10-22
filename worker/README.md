# Garmin API relay (Cloudflare Worker)

The GitHub Pages site is static, and Garmin's API does not send CORS headers,
so the browser cannot call it directly. This Worker forwards the dashboard's
read-only `GET` requests to `connectapi.garmin.com` and adds CORS headers.
The free Cloudflare plan is enough.

## Deploy

```sh
npm install -g wrangler
cd worker
wrangler login
wrangler deploy
```

`wrangler deploy` prints a URL such as `https://garmin-proxy.<you>.workers.dev`.
Paste it into **Settings → API relay URL** on the dashboard.

`ALLOWED_ORIGIN` in `wrangler.toml` limits which sites may use the relay. It is
set to the GitHub Pages origin; change it if you host the page somewhere else.

## Privacy

Your token is sent from your browser to the Worker in the `X-Garmin-Token`
header on each request and passed on to Garmin as `Authorization: Bearer …`.
The Worker does not store or log it.
