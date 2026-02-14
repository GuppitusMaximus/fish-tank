# FishTank

A monorepo containing interactive web experiences and weather data infrastructure, managed by autonomous Claude Code agents.

## Projects

### [the-fish-tank](FrontEnds/the-fish-tank/)

Interactive web experience at [the-fish-tank.com](https://the-fish-tank.com) — three simulations built with vanilla HTML, CSS, and JavaScript:

- **Fish Tank** — Click-to-spawn swimming fish with physics
- **Tank Battle** — Autonomous combat vehicles with turret AI
- **Fighter Fish** — Aerial dogfight with flight physics and missiles
- **Home** — Temperature forecast powered by the-snake-tank's ML model

### [the-snake-tank](BackEnds/the-snake-tank/)

Weather data pipeline and ML prediction system:

- Collects hourly weather data from a Netatmo station via GitHub Actions
- Stores readings in SQLite for ML training
- Trains a RandomForest model to predict next-hour indoor/outdoor temperature
- Generates prediction JSON consumed by the-fish-tank's forecast widget

### [Planning](https://github.com/GuppitusMaximus/FishTank-Planning)

Central control plane for writing plans, deploying autonomous agents, and tracking progress. See the [Planning repo](https://github.com/GuppitusMaximus/FishTank-Planning) for details.

## Structure

```
FishTank/
├── FrontEnds/
│   └── the-fish-tank/        # Website — GitHub Pages
├── BackEnds/
│   └── the-snake-tank/       # Weather data + ML pipeline
├── Planning/                  # Plans, agent configs, MCP server (separate repo)
└── .github/workflows/
    ├── pages.yml              # Deploy the-fish-tank to GitHub Pages
    └── netatmo.yml            # Hourly weather fetch + prediction
```

## How It Works

Plans are written in the [Planning repo](https://github.com/GuppitusMaximus/FishTank-Planning) and deployed to autonomous Claude Code agents that execute them in tmux windows. Each agent is scoped to its project — frontend agents work on the-fish-tank, backend agents work on the-snake-tank. Agents report completion back to Planning via MCP.
