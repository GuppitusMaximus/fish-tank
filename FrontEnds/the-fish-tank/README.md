# The Fish Tank

The public company website for The Fish Tank LLC at [the-fish-tank.com](https://the-fish-tank.com), with studio information, Fathom Fall, and business contact details.

Seth’s existing personal project hub lives at [`/hub/`](https://the-fish-tank.com/hub/). Its dashboards, simulations, and authentication remain together in the original single-page application.

## Tech Stack

Vanilla HTML, CSS, and JavaScript. No frameworks, no build tools. Entities (fish, tanks, planes) are rendered with SVG elements; effects (bubbles, smoke, debris) use CSS keyframe animations.

## Architecture

The root `index.html` is a static company page styled by `css/company.css`. Its small `js/company.js` script preserves old hub bookmarks such as `/#weather` by forwarding them to `/hub/#weather`; company content is readable without JavaScript or authentication.

The project hub remains a single-page app in `hub/index.html`, with views managed by `js/router.js`. Each module is an IIFE that exposes `start()` and `stop()` lifecycle methods. Shared assets, scripts, styles, data, and vendor libraries stay at the site root and use root-relative URLs so they work under `/hub/`. Authentication endpoints and localStorage keys are unchanged.

Before publishing for Apple enrollment, replace the current contact address with a verified working `@the-fish-tank.com` address and test sending and receiving mail. Do not publish an address that has not been provisioned.

### Views

- **Home** — Bento-grid project hub: hero/status tile, live weather tile + station compass, Fathom Fall, homelab and GitHub tiles, and a blur-gated TankCore teaser (sample data; sign-in lifts the veil)
- **Potter Weather Predictions** — Live weather readings, ML-powered forecasts, data browser, and workflow monitor (requires sign-in)
- **Fish Tank** — Click-to-spawn swimming fish with physics and wobble animation
- **Tank Battle** — Autonomous combat vehicles with turret AI, health bars, and explosions
- **Fighter Fish** — Aerial dogfight with flight physics, missiles, and crash sequences
- **Design Mocks** — Hub redesign exploration with interactive homepage mockups (requires sign-in)

### Theme System

Three CSS themes applied via body class, switching automatically with the active view:

- `theme-ocean` — Blue aquatic (Home, Weather, Fish Tank)
- `theme-battle` — Green/brown earthy (Tank Battle)
- `theme-sky` — Blue sky (Fighter Fish)

### Authentication

The site uses Cloudflare Workers for authentication and protected data access.

- **Sign-in modal** — Username/password form that authenticates against the Worker API and stores a JWT in localStorage (7-day sessions)
- **Content gating** — The "Potter Weather Predictions" nav link and sign-out link are hidden until authenticated (`.auth-gated` / `.auth-hidden` classes toggled by `auth.js`)
- **Worker-backed data fetching** — Protected data files (`weather.json`, `frontend.db.gz`) are fetched from the Cloudflare Worker with a `Bearer` token, not from static files in git
- **Public home summary** — The home page shows a brief weather summary loaded from `data/weather-public.json` without requiring authentication (`loadHomeSummary()`)

Auth configuration is in `js/auth-config.js` (sets `AUTH_API_URL` for the deployed Worker). Auth logic is in `js/auth.js` (sign-in, sign-out, token management, content gating). Auth styles are in `css/auth.css` (modal, overlay, gated content).

### Weather Dashboard

The weather dashboard requires authentication. It supports two data formats: v1 (legacy hardcoded fields) and v2 (data-driven multi-model). Version detection is automatic based on `schema_version` in `weather.json`. The v1 path is preserved as a fallback.

The dashboard has three sub-tabs:

**Dashboard** — In v2 mode, the current reading section auto-discovers properties from `current.readings` and renders them with labels from `property_meta` (or title-cased fallbacks). It has a visually prominent design (larger text, accent border) to distinguish it from forecasts. Predictions render as individual cards per model (3hrRaw, 24hrRaw, 6hrRC), each showing a model type badge, version, and forecast values. Predictions whose target time is more than 6 hours in the past are automatically hidden. The prediction history table dynamically discovers columns from flat `actual_*/predicted_*/delta_*` fields, supports filtering by model type and model version via multi-select dropdowns, date range filtering (defaults to last 7 days), sortable columns (click to toggle asc/desc), and lazy loading (50 rows at a time with "Show more"). When filters produce no matching results, the filter controls remain visible with a "0 predictions match filters" message so users can adjust or clear filters without reloading the page.

In v1 mode, the dashboard renders as before: two hardcoded temperature fields (indoor/outdoor) for the current reading and a single prediction card.

**Browse Data** — Explore raw weather station data and predictions using client-side SQL queries. The browser downloads `frontend.db.gz` (a gzipped SQLite database) from the Cloudflare Worker and decompresses it in-browser using DecompressionStream. sql.js (SQLite compiled to WebAssembly via Emscripten) executes queries directly against the full dataset — no server round-trips after the initial load. Select a data type, pick a date and hour, and view results as formatted cards or raw JSON. Supports both v1 flat prediction fields and v2 `values` object format.

**Workflow** — Monitor the GitHub Actions backend pipeline. Shows the latest run status with color-coded indicator, trigger type, and duration. A live countdown timer shows time until the next scheduled run. Stats card displays success rate, average duration, and failure count. A scrollable run history table lists recent runs with color-coded statuses.

### Format Toolbar

Temperature unit (Celsius, Fahrenheit, Kelvin) and time format (12h/24h) controls appear in a labeled toolbar below the weather sub-nav. Preferences are persisted in localStorage.

### Mobile Support

The site is mobile-responsive with touch-friendly 44px tap targets, scrollable tables with fade hints for overflow indication, and responsive layouts that adapt to smaller screens.

## Project Structure

```
the-fish-tank/
├── index.html              # Public company website
├── hub/index.html          # Existing project hub, dashboards, and sign-in
├── wrangler.jsonc          # Cloudflare Worker static asset configuration
├── favicon.png             # Site favicon
├── css/
│   ├── company.css         # Company homepage
│   ├── style.css           # Project hub styles, themes, and animations
│   └── auth.css            # Auth modal and content gating styles
├── data/
│   ├── weather-public.json # Committed fallback for the public home summary
│   ├── weather.json        # (local dev only — production fetched from Worker)
│   └── frontend.db.gz      # (local dev only — production fetched from Worker)
├── js/
│   ├── company.js          # Legacy hub bookmark redirects
│   ├── auth-config.js      # Worker URL configuration (AUTH_API_URL)
│   ├── auth.js             # Authentication module (sign-in, JWT, content gating)
│   ├── weather.js          # Weather dashboard module
│   ├── tank.js             # Fish Tank simulation
│   ├── battle.js           # Tank Battle simulation
│   └── fighter.js          # Fighter Fish simulation
└── tests/
    └── README.md           # Legacy test notes
```

Browser tests live at `FrontEnds/tests/browser/` (see Testing below).

## Development

No build step. Serve `the-fish-tank/` as the document root with a local HTTP server, for example `python3 -m http.server 8765 --bind 127.0.0.1`. Open `/` for the company page or `/hub/` for the dashboard. For authenticated features, the Worker URL in `js/auth-config.js` must point to a running Cloudflare Worker.

## Testing

Browser tests use [Playwright](https://playwright.dev) and live in `FrontEnds/tests/browser/`.

```bash
cd FrontEnds
npm install        # install Playwright (first time only)
npm test           # run all browser tests
npm run test:headed   # run with browser visible
npm run test:debug    # run in Playwright debug mode
```

Test files cover: auth modal, content gating, auth theme, SQLite browse, view switching, and smoke tests.

## Deployment

Cloudflare hosts this directory as static assets on the `fish-tank` Worker, serving `the-fish-tank.com` and `www.the-fish-tank.com`. Cloudflare Builds is connected to `GuppitusMaximus/fish-tank`, with production branch `main`, root directory `FrontEnds/the-fish-tank`, no build command, and deploy command `npx wrangler deploy`.

`wrangler.jsonc` declares the static asset directory. Publish the full directory so `/hub/` and shared root assets stay available. `.assetsignore` excludes documentation, tests, and deployment configuration. Existing custom domains are managed in Cloudflare.

**Data files are not deployed via git.** Protected data (`weather.json`, `frontend.db.gz`) is uploaded to Cloudflare R2 by the backend pipeline and served through the Cloudflare Worker. Only `data/weather-public.json` (the public home-summary fallback) is committed to the repo.
