# Kitchen Plan

The first runnable product slice for the kitchen iPad meal-planning system.

## Included now

- a responsive three-day ingredient review;
- **Have**, **Need**, and **Unavailable** states;
- a shopping list generated from **Need** ingredients;
- deterministic replacement previews for unavailable ingredients;
- replacement commit and one-step Undo;
- the 15 base recipes already imported into Paprika;
- local device persistence for this product slice;
- an installable PWA manifest and offline app-shell cache;
- a calendar-feed adapter route at `/calendar/kitchen-plan.ics`;
- a Docker Compose starting point for the homelab.

The feed currently publishes the three seed meals. The next engineering slice moves plan state from device storage to server-side SQLite, then generates the feed from that shared database. Do not subscribe Proton to the feed until that server-backed slice is complete.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run with Docker Compose

```bash
docker compose up --build -d
```

The app will be available on port `3000`. Put Caddy or another HTTPS reverse proxy in front of it before installing it on the iPad.

## Validation

```bash
npm test
```

## Next slice

1. Add server-side SQLite and revision transactions.
2. Import the full Paprika recipe content into the database.
3. Generate the dashboard and ICS feed from accepted plan revisions.
4. Add a long random calendar token and expose only that feed through Caddy.
5. Add Tailscale household access and then install the PWA on the kitchen iPad.
