# The Fish Tank

An interactive web experience at [the-fish-tank.com](https://the-fish-tank.com) featuring a live weather dashboard and three simulations: a swimming fish aquarium, autonomous tank combat, and aerial dogfighting.

## Tech Stack

Vanilla HTML, CSS, and JavaScript. No frameworks, no build tools. Entities (fish, tanks, planes) are rendered with SVG elements; effects (bubbles, smoke, debris) use CSS keyframe animations.

## Architecture

Single-page app with five views managed by a view controller in `index.html`. Each module is an IIFE that exposes `start()` and `stop()` lifecycle methods. The controller switches views, swaps CSS themes, and manages module lifecycle.

### Views

- **Home** — Landing page with navigation
- **Potter Weather Predictions** — Live weather readings, ML-powered forecasts, data browser, and workflow monitor
- **Fish Tank** — Click-to-spawn swimming fish with physics and wobble animation
- **Tank Battle** — Autonomous combat vehicles with turret AI, health bars, and explosions
- **Fighter Fish** — Aerial dogfight with flight physics, missiles, and crash sequences

### Theme System

Three CSS themes applied via body class, switching automatically with the active view:

- `theme-ocean` — Blue aquatic (Home, Weather, Fish Tank)
- `theme-battle` — Green/brown earthy (Tank Battle)
- `theme-sky` — Blue sky (Fighter Fish)

### Weather Dashboard

The weather dashboard supports two data formats: v1 (legacy hardcoded fields) and v2 (data-driven multi-model). Version detection is automatic based on `schema_version` in `weather.json`. The v1 path is preserved as a fallback.

The dashboard has three sub-tabs:

**Dashboard** — In v2 mode, the current reading section auto-discovers properties from `current.readings` and renders them with labels from `property_meta` (or title-cased fallbacks). It has a visually prominent design (larger text, accent border) to distinguish it from forecasts. Predictions render as individual cards per model, each showing a model type badge, version, and forecast values. The prediction history table dynamically discovers columns from flat `actual_*/predicted_*/delta_*` fields, supports filtering by model type (partial match) and model version (exact match) via searchable text inputs with autocomplete, date range filtering, sortable columns (click to toggle asc/desc), and lazy loading (50 rows at a time with "Show more").

In v1 mode, the dashboard renders as before: two hardcoded temperature fields (indoor/outdoor) for the current reading and a single prediction card.

**Browse Data** — Explore raw weather station data and predictions by date and time. Select a data type (readings or predictions), pick a date, then choose an hour to view the data as formatted cards or raw JSON. Supports both v1 flat prediction fields and v2 `values` object format. Hour labels support precise HHMMSS timestamp filenames from the backend pipeline.

**Workflow** — Monitor the GitHub Actions backend pipeline. Shows the latest run status with color-coded indicator, trigger type, and duration. A live countdown timer shows time until the next scheduled run. Stats card displays success rate, average duration, and failure count. A scrollable run history table lists recent runs with color-coded statuses.

User preferences persisted in localStorage:
- Temperature unit toggle (Celsius, Fahrenheit, Kelvin)
- Time format toggle (12h / 24h)

Data is loaded from GitHub raw CDN and cached in localStorage with a 5-minute TTL to reduce redundant requests. Falls back to local files when the CDN is unavailable. The backend pipeline runs every 20 minutes via GitHub Actions.

### Mobile Support

The site is mobile-responsive with touch-friendly 44px tap targets, scrollable tables with fade hints for overflow indication, and responsive layouts that adapt to smaller screens.

## Project Structure

```
the-fish-tank/
├── index.html              # Single-page app — views, nav, and view controller
├── CNAME                   # GitHub Pages domain: the-fish-tank.com
├── favicon.png             # Site favicon
├── css/
│   └── style.css           # All styles, themes, and animations
├── data/
│   ├── weather.json        # Weather data from backend pipeline
│   ├── workflow.json       # GitHub Actions workflow status and run history
│   └── data-index.json     # Manifest of available data files for the browser
└── js/
    ├── tank.js             # Fish Tank simulation
    ├── battle.js           # Tank Battle simulation
    ├── fighter.js          # Fighter Fish simulation
    └── weather.js          # Weather dashboard module (~28KB)
```

## Development

No build step. Open `index.html` in a browser to run locally.

## Deployment

GitHub Pages via GitHub Actions ([`pages.yml`](../../.github/workflows/pages.yml)). Deploys automatically on push to `main` when files in `FrontEnds/the-fish-tank/` change. Custom domain configured via `CNAME`.
