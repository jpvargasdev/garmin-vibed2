# garmin-vibed2

A local dashboard for your Garmin Connect profile: daily summary, heart rate,
Body Battery, stress, sleep, HRV / training readiness, steps and weight
trends, recent activities, personal records, devices, and every raw API
response.

A tiny Node server (no dependencies) serves the page and forwards requests to
Garmin, adding your token from `.env`. The token never reaches the browser and
is never committed (`.env` is in `.gitignore`).

## Run it on your Mac

Requires Node 18+ (`brew install node` if you don't have it).

```sh
git clone https://github.com/jpvargasdev/garmin-vibed2.git
cd garmin-vibed2
cp .env.example .env
open -e .env        # paste your token after GARMIN_TOKEN=
npm start
```

Then open <http://localhost:5173>.

When the token expires, replace it in `.env` and restart `npm start`.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GARMIN_TOKEN` | — | Your Garmin access token (required) |
| `PORT` | `5173` | Local port |
| `GARMIN_API_BASE` | `https://connectapi.garmin.com` | Garmin API host |
| `GARMIN_AUTH_SCHEME` | `Bearer` | Prefix for the `Authorization` header |
