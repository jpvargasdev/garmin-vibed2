# garmin-vibed2

A simple static web app that shows your Garmin Connect profile: daily summary,
heart rate, Body Battery, stress, sleep, HRV / training readiness, steps and
weight trends, recent activities, personal records, devices, and every raw API
response.

No build step, no backend, no dependencies — just `public/`.

## Use it

1. Open the GitHub Pages site: <https://jpvargasdev.github.io/garmin-vibed2/>
2. Click **Settings**, paste your Garmin token, and **Save & load**.

The token is stored only in your browser's `localStorage` and sent only to
Garmin (or to your relay, if you set one). **Forget token** removes it.

### If the browser blocks the request (CORS)

Garmin's API does not send CORS headers, so browsers may refuse direct calls
from a web page. If the dashboard reports a CORS block, deploy the small
Cloudflare Worker in [`worker/`](worker/README.md) and paste its URL in
**Settings → API relay URL**.

## Run locally

Any static file server works:

```sh
npx serve public
# or
python3 -m http.server -d public 8000
```

## Publishing

`.github/workflows/pages.yml` deploys `public/` to GitHub Pages on every push
to `main`. One-time setup: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.
