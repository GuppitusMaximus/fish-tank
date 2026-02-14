# The Fish Tank

An interactive web experience at [the-fish-tank.com](https://the-fish-tank.com) featuring three simulations: a swimming fish aquarium, autonomous tank combat, and aerial dogfighting.

## Tech Stack

Vanilla HTML, CSS, and JavaScript. No frameworks, no build tools. Entities (fish, tanks, planes) are rendered with SVG elements; effects (bubbles, smoke, debris) use CSS keyframe animations.

## Architecture

Single-page app with four views managed by a view controller in `index.html`. Each simulation is an IIFE module that exposes `start()` and `stop()` lifecycle methods. The controller switches views, swaps CSS themes, and manages simulation lifecycle.

### Views

- **Home** — Landing page with navigation to simulations
- **Fish Tank** — Click-to-spawn swimming fish with physics and wobble animation
- **Tank Battle** — Autonomous combat vehicles with turret AI, health bars, and explosions
- **Fighter Fish** — Aerial dogfight with flight physics, missiles, and crash sequences

### Theme System

Three CSS themes applied via body class, switching automatically with the active view:

- `theme-ocean` — Blue aquatic (Home, Fish Tank)
- `theme-battle` — Green/brown earthy (Tank Battle)
- `theme-sky` — Blue sky (Fighter Fish)

## Project Structure

```
the-fish-tank/
├── index.html              # Single-page app — views, nav, and view controller
├── CNAME                   # GitHub Pages domain: the-fish-tank.com
├── css/
│   └── style.css           # All styles, themes, and animations
└── js/
    ├── tank.js             # Fish Tank simulation
    ├── battle.js           # Tank Battle simulation
    └── fighter.js          # Fighter Fish simulation
```

## Development

No build step. Open `index.html` in a browser to run locally.

## Deployment

GitHub Pages via GitHub Actions ([`pages.yml`](../../.github/workflows/pages.yml)). Deploys automatically on push to `main` when files in `FrontEnds/the-fish-tank/` change. Custom domain configured via `CNAME`.
