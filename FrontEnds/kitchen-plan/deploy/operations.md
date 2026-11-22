# Kitchen Plan — operations

How to deploy, bootstrap, back up, restore and check the Kitchen Plan service
on the homelab host. Deployment is done by hand, interactively, after QA has
passed. Commands run from `FrontEnds/kitchen-plan/` on the host unless noted.

## Shape of the deployment

```
iPad / laptop ──tailnet HTTPS──▶ Caddy (bind 100.x tailnet IP) ──▶ 127.0.0.1:3100 ─┐
Proton Calendar ──public HTTPS──▶ Caddy (bind public IP, one route) ─▶ 127.0.0.1:3101 ─┤
                                                                                     ▼
                                                container "kitchen-plan" (node server/main.mjs)
                                                  volume kitchen-plan-data     → /var/lib/kitchen-plan
                                                  volume kitchen-plan-backups  → /var/backups/kitchen-plan
```

- **One container, two listeners.** `3100` is the private app: the dashboard
  and PWA (`server/ui.mjs`, `public/`) plus the JSON API under `/api`. `3101`
  is the calendar feed. It serves only `/feed/<token>.ics`, and it starts only
  when a valid token is configured.
- **Loopback only.** Compose publishes both ports on `127.0.0.1`. Nothing in
  the container is reachable from the LAN or the internet except through Caddy.
- **Caddy on the host** (`deploy/Caddyfile`) serves the private app over HTTPS
  on the tailnet address only. On the public address it serves the exact feed
  route and answers 404 to everything else.
- **State lives in named volumes.** The SQLite database (WAL mode) lives in
  `kitchen-plan-data`. Scheduled backups go to `kitchen-plan-backups`.
  Rebuilding or recreating the container never touches either volume.
- **No secrets in the repository.** The feed token lives in
  `secrets/kitchen-feed-token` and the settings in `.env`. Both are
  git-ignored and docker-ignored.

## Prerequisites

- Docker Engine with the Compose v2 plugin.
- Caddy 2.8 or newer on the host, running as the `caddy` systemd service.
- Tailscale on the host, with MagicDNS and HTTPS certificates enabled for the
  tailnet. Let Caddy fetch certificates by adding `TS_PERMIT_CERT_UID=caddy`
  to `/etc/default/tailscaled`, then run `systemctl restart tailscaled`.
- A public DNS name for the feed (for example `kitchen-feed.example.net`)
  pointing at the host's public address. Forward ports 443 and 80 (80 is for
  ACME only) to that address. Expose no other port.

## Bootstrap (first deploy)

1. **Settings.** Create `.env` next to `compose.yaml`:

   ```sh
   cat > .env <<'EOF'
   KITCHEN_APP_ORIGIN=https://kitchen.<tailnet>.ts.net
   KITCHEN_FEED_PUBLIC_ORIGIN=https://kitchen-feed.example.net
   KITCHEN_BACKUP_INTERVAL_HOURS=6
   KITCHEN_BACKUP_KEEP=28
   EOF
   chmod 0600 .env
   ```

   `KITCHEN_APP_ORIGIN` must be the exact `https://` origin the household
   opens. The service rejects any other `Host` (DNS-rebinding guard) and any
   cross-origin mutation. It also uses this origin for recipe links inside
   calendar events. Leave `KITCHEN_FEED_PUBLIC_ORIGIN` empty to keep the
   subscription URL hidden in the app.

2. **Feed token.** Generate a 256-bit token on the host and store it where only
   the container user (uid 1000) can read it:

   ```sh
   mkdir -p secrets && chmod 0700 secrets
   docker build -t kitchen-plan:local .
   docker run --rm --entrypoint node kitchen-plan:local -e \
     "import('/app/server/calendar.mjs').then((m) => console.log(m.generateFeedToken()))" \
     > secrets/kitchen-feed-token
   sudo chown 1000:1000 secrets/kitchen-feed-token && sudo chmod 0400 secrets/kitchen-feed-token
   ```

   (`npm run -s feed-token` does the same thing on a machine with Node 22.13 or newer.)
   Never paste the token into a ticket, a chat, a commit or a shell history
   you keep. If it leaks, rotate it (see below). The service refuses tokens
   under 256 bits: the feed stays off and the log shows
   `feed_disabled: token_too_weak`.

3. **Start the service.**

   ```sh
   docker compose up -d
   docker compose ps                       # STATUS should become "healthy"
   docker compose logs --tail=20 kitchen-plan
   curl -fsS http://127.0.0.1:3100/api/health
   ```

   On first boot the service imports the bundled Paprika archive and creates
   14 empty dinner dates from today (Eastern) for two adults. No dinner is
   accepted until the owner accepts one in the app. The log is JSON lines:
   `recipes_imported`, `backups_scheduled` and `listening`. It never contains
   feed paths or tokens.

4. **Caddy.** Install the configuration and its environment:

   ```sh
   sudo install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
   sudo tee /etc/caddy/kitchen-plan.env >/dev/null <<'EOF'
   KITCHEN_APP_HOST=kitchen.<tailnet>.ts.net
   KITCHEN_TAILNET_IP=100.x.y.z
   KITCHEN_FEED_HOST=kitchen-feed.example.net
   KITCHEN_PUBLIC_IP=203.0.113.10
   EOF
   sudo systemctl edit caddy      # add:  [Service]
                                  #       EnvironmentFile=/etc/caddy/kitchen-plan.env
   sudo sh -c 'set -a; . /etc/caddy/kitchen-plan.env; set +a; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
   sudo systemctl restart caddy
   ```

   The Caddyfile enables no access log on any site. It also drops handler
   error and reverse-proxy logs, because those can contain the request URI.
   Do not add a `log` directive to the feed site.

5. **Check the perimeter** from a machine outside the tailnet. Replace
   `$FEED` with the public origin and `$T` with the token; read the token
   from the file, don't type it:

   ```sh
   T=$(sudo cat secrets/kitchen-feed-token)
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/feed/$T.ics"              # 200
   curl -s -o /dev/null -w '%{http_code}\n' -I "$FEED/feed/$T.ics"           # 200 (HEAD)
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/feed/$T.ics?x=1"          # 404 (query)
   curl -s -o /dev/null -w '%{http_code}\n' --path-as-is "$FEED/feed/./$T.ics" # 404 (dot segment)
   curl -s -o /dev/null -w '%{http_code}\n' --path-as-is "$FEED//feed/$T.ics" # 404
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/feed/%41${T#?}.ics"       # 404 (encoded)
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$FEED/feed/$T.ics"      # 404 (method)
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/feed/wrong-token-wrong-token-wrong-token-wrong.ics"  # 404
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/"                          # 404
   curl -s -o /dev/null -w '%{http_code}\n' "$FEED/api/dashboard"             # 404
   curl -s -o /dev/null -w '%{http_code}\n' "http://${FEED#https://}/feed/$T.ics"  # 404, no redirect
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: other.example' "http://${FEED#https://}/"  # 404
   unset T
   ```

   From the public side, the tailnet name and port 3100 must not answer at
   all. From a tailnet device, `https://kitchen.<tailnet>.ts.net/` opens the
   dashboard.

6. **Subscribe the household calendar.** On the private app, open
   **Household → Calendar subscription → Show subscription URL → Copy**. Then
   paste it into Proton Calendar under *Add calendar → From URL*. The URL is
   fetched only on that click. The response is `no-store`, and the URL exists
   only on that screen: it is not stored, not cached by the service worker,
   and not sent anywhere else. Press **Hide** when you are done.

7. **Install the PWA** on the kitchen iPad. In Safari, open the private
   address, then choose *Share → Add to Home Screen*. The service worker
   caches only the app shell (`/`, `/app.js`, `/app.css`, the manifest and
   the icon). Offline, the app opens but says it cannot reach the kitchen
   server. Plan data, recipes and the subscription URL are never cached, and
   nothing is queued while offline.

## Update / redeploy

```sh
git pull                              # on the reviewed branch
docker compose build
docker compose up -d                  # recreates the container; volumes are kept
docker compose ps && curl -fsS http://127.0.0.1:3100/api/health
```

Take a manual backup first (below) when the update changes `server/store.mjs`
migrations. A database written by a newer schema is refused by older code:
`verify` reports `schema version N is newer`.

## Backups

**Scheduled.** The service writes a backup every
`KITCHEN_BACKUP_INTERVAL_HOURS` (default 6) to the `kitchen-plan-backups`
volume, as `kitchen-plan-YYYYMMDDTHHMMSSZ.sqlite`. It keeps the newest
`KITCHEN_BACKUP_KEEP` (default 28, about one week) and prunes older ones.
Files with any other name are never pruned. Each backup is a `VACUUM INTO`
snapshot taken from the live connection between transactions, so it is
transactionally consistent while the service keeps running. It is verified
(integrity check, foreign keys, schema version) before it is renamed into
place. The log records `backup_written` with the file, size and revision, or
`backup_failed` with a reason.

Never copy `kitchen-plan.sqlite` with `cp` while the service runs. A WAL
database copied that way can be missing committed changes. Always use the
backup command.

**Manual backup**, for example before an update or a restore drill:

```sh
docker compose exec kitchen-plan node --disable-warning=ExperimentalWarning server/backup.mjs backup \
  /var/lib/kitchen-plan/kitchen-plan.sqlite /var/backups/kitchen-plan/manual-$(date -u +%Y%m%dT%H%M%SZ).sqlite
```

**List and verify:**

```sh
docker compose exec kitchen-plan ls -l /var/backups/kitchen-plan
docker compose exec kitchen-plan node --disable-warning=ExperimentalWarning server/backup.mjs verify \
  /var/backups/kitchen-plan/<file>.sqlite      # {"ok": true, "revision": ..., "acceptedSlots": ...}
```

**Off-host copy** (do this regularly; a volume is not a backup of the disk it lives on):

```sh
mkdir -p ~/kitchen-plan-offsite
docker compose cp kitchen-plan:/var/backups/kitchen-plan/<file>.sqlite ~/kitchen-plan-offsite/
```

## Restore

Restore replaces the live database with a verified backup. The service must
be stopped first: `restore` refuses while the service holds the database
lock. Before replacing anything, restore saves the current database as
`kitchen-plan.sqlite.pre-restore-<timestamp>` in the data volume.

```sh
# 0. Choose the backup (scheduled, manual, or copied back in from off-host):
docker compose exec kitchen-plan ls -l /var/backups/kitchen-plan
#    To bring an off-host file back into the backups volume:
#    docker run --rm -v kitchen-plan-backups:/b -v ~/kitchen-plan-offsite:/in:ro --user 1000:1000 \
#      node:22-bookworm-slim cp /in/<file>.sqlite /b/<file>.sqlite

# 1. Stop the service (Caddy keeps running and returns 502 meanwhile):
docker compose stop kitchen-plan

# 2. Verify, then restore, using one-off containers on the same volumes:
docker compose run --rm --no-deps kitchen-plan node --disable-warning=ExperimentalWarning \
  server/backup.mjs verify /var/backups/kitchen-plan/<file>.sqlite
docker compose run --rm --no-deps kitchen-plan node --disable-warning=ExperimentalWarning \
  server/backup.mjs restore /var/backups/kitchen-plan/<file>.sqlite /var/lib/kitchen-plan/kitchen-plan.sqlite

# 3. Start the service and confirm the restored revision:
docker compose start kitchen-plan
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health      # revision matches the "revision" restore printed
```

If step 2 reports `Stop the Kitchen Plan service (pid N)` but
`docker compose ps` shows the service stopped, the previous run ended without
a clean shutdown and left a stale lock file. Remove it, then repeat step 2:

```sh
docker compose run --rm --no-deps kitchen-plan rm /var/lib/kitchen-plan/kitchen-plan.sqlite.lock
```

To roll a restore back, restore the `pre-restore-…` file the same way. Its
path inside the container is under `/var/lib/kitchen-plan/`, so pass that
path as the backup.

Calendar clients pick up restored dinners on their next refresh. Every slot
restored this way gets a higher event `SEQUENCE`, so the changed events
replace the old ones.

**Restore drill.** Do this after the first deploy and then every few months.
Take a manual backup and run `verify` on it. Then restore it into a scratch
path instead of the live one, which needs no downtime:

```sh
docker compose exec kitchen-plan node --disable-warning=ExperimentalWarning server/backup.mjs restore \
  /var/backups/kitchen-plan/<file>.sqlite /tmp/drill.sqlite
docker compose exec kitchen-plan node --disable-warning=ExperimentalWarning server/backup.mjs verify /tmp/drill.sqlite
```

## Rotating the feed token

Rotate when the subscription URL has been shared too widely or may have
leaked.

```sh
docker run --rm --entrypoint node kitchen-plan:local -e \
  "import('/app/server/calendar.mjs').then((m) => console.log(m.generateFeedToken()))" \
  | sudo tee secrets/kitchen-feed-token.new >/dev/null
sudo chown 1000:1000 secrets/kitchen-feed-token.new && sudo chmod 0400 secrets/kitchen-feed-token.new
sudo mv secrets/kitchen-feed-token.new secrets/kitchen-feed-token
docker compose up -d --force-recreate kitchen-plan
```

The old URL returns 404 as soon as the container restarts. Copy the new URL
from **Household → Calendar subscription**, and re-subscribe in Proton
(remove the old calendar subscription first).

To turn the feed off, replace the token file with an empty file and recreate
the container. The log then shows `feed_disabled`, and every feed request
returns 404.

## Tests and checks

```sh
npm test          # node --test: discovers every *.test.mjs / test-*.mjs under the project
npm run check     # syntax check of server/*.mjs and public/*.js
npm run lint
```

Tests use in-memory databases (`dbPath: ':memory:'`). Some container
filesystems (ZFS subvolumes inside LXC) reject the POSIX locks SQLite needs
for file-backed databases. WAL mode, scheduled backups and restore are
therefore checked on the real host: use the restore drill above.

## Operator reference

| Task | Command |
| --- | --- |
| Status / health | `docker compose ps` · `curl -fsS http://127.0.0.1:3100/api/health` |
| Logs (JSON lines) | `docker compose logs -f --tail=100 kitchen-plan` |
| Restart | `docker compose restart kitchen-plan` |
| Stop / start | `docker compose stop kitchen-plan` · `docker compose start kitchen-plan` |
| Recent plan changes | `curl -fsS 'http://127.0.0.1:3100/api/changes?limit=10'` |
| Accepted dinners | `curl -fsS http://127.0.0.1:3100/api/dashboard` |
| Manual backup | see *Backups* |
| Verify a backup | `docker compose exec kitchen-plan node server/backup.mjs verify <file>` |
| Restore | see *Restore* (service stopped) |
| Rotate feed token | see *Rotating the feed token* |
| Caddy config check | `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` (with the env file loaded) |
| Run locally (dev) | `npm run dev`, then open `http://localhost:3100` |

The loopback `curl` commands work because the service always accepts
`127.0.0.1` and `localhost` as `Host`. Mutations need the `X-Kitchen-Plan: 1`
header and an `Idempotency-Key`. Plan changes are made in the app, by the
owner, and not from the shell.
