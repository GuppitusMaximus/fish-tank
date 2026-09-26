# PvP v2 release and clean migration

The service keeps `https://api.the-fish-tank.com/pvp` and the existing
`fishtank-pvp` unit on loopback port 8002. It has its own Python environment,
Node rules artifact, database schema, and runtime role. Weather remains on 8001;
its deployment workflow restarts only `fishtank-ml`.

Production game promotion is separate from backend activation. Build and register
the exact candidate game commit before promoting that client. A branch name or a
version string alone is not an artifact identity.

## Release layout

```text
/opt/fathom-pvp/
  releases/<release-id>/backend/       # application, migrations, .venv
  releases/<release-id>/rules/         # immutable game rules source + inventory
  runtime/node-v22.23.3-linux-x64/
  current -> releases/<production-release-id>
  staging -> releases/<staging-release-id>
/etc/fathom-pvp/production.env          # runtime credentials only, mode 0600
/etc/fathom-pvp/staging.env             # distinct credentials/dataset/schema
```

The Node version and Linux x64 checksum are pinned in `deploy/install-node.sh`.
They were verified against the [official 22.23.3 release](https://nodejs.org/en/blog/release/v22.23.3).
Node does not receive database credentials or the session pepper. The backend
verifies the rules artifact before starting its bounded JSON-lines worker pool.

## Build a paired release

1. Pin clean game and backend commits. Run the game contract/lifecycle tests,
   backend PostgreSQL integration tests, and a browser round trip against the
   candidate. Record their exact revisions and output.
2. In the game checkout, set the release's `FATHOM_BUILD_ID`,
   `FATHOM_DATASET_ID`, and `FATHOM_POOL_ID`, then run
   `node scripts/pvp-build-artifact.mjs`. The tool reads the actual Git commit
   and authoritative game/save/rules versions. Keep its complete output
   directory; a manifest alone is insufficient.
3. Build the browser with the same variables and commit. Its emitted
   `pvp-release.json` must agree with the worker manifest. Use
   `VITE_PVP_API_BASE` for the approved staging origin. An unregistered dev
   build may play generated rivals, but cannot publish authenticated ghosts.
4. Package both components:

```bash
python3 deploy/bundle.py build \
  --backend /path/to/BackEnds/fathom-pvp \
  --rules /path/to/game-artifact \
  --output /tmp/pvp-release.tar.gz \
  --release reviewed-release-id \
  --backend-commit FULL_BACKEND_COMMIT
```

The command prints the archive SHA-256. Keep that digest independently of the
archive. The build-only GitHub workflow `build-fathom-pvp.yml` automates packaging
from a full game SHA; the private game checkout requires a read-only
`FATHOM_FALL_READ_TOKEN` secret. It does not promote either service or client.

## Install and stage

Install the bundle with its independently recorded checksum, then create its
virtualenv and install the hash-locked requirements. Run these as `fishtank` so
the systemd service can read the installed release:

```bash
python3 deploy/bundle.py install --archive /tmp/pvp-release.tar.gz \
  --sha256 REVIEWED_ARCHIVE_SHA256 --releases /opt/fathom-pvp/releases
cd /opt/fathom-pvp/releases/reviewed-release-id/backend
python3 -m venv .venv
.venv/bin/pip install --require-hashes -r requirements.txt
```

Database provisioning uses a separate operator credential in
`PVP_MIGRATION_DATABASE_URL`. Never put it in the runtime unit or pass it on the
command line. Use `game_pvp_staging` with `fathom_pvp_staging` for staging and
`game` with `fathom_pvp_runtime` for production. Each role must be LOGIN,
NOSUPERUSER, NOBYPASSRLS, NOCREATEDB and NOCREATEROLE, with a distinct random
password and no membership in the other role. Provision the role through the
database operator connection before granting application privileges:

```bash
.venv/bin/python -m fathom_pvp.migrate --schema game_pvp_staging
.venv/bin/python -m fathom_pvp.provision \
  --schema game_pvp_staging --role fathom_pvp_staging
.venv/bin/python -m fathom_pvp.register_release \
  ../rules/src/pvp/release-manifest.json \
  --schema game_pvp_staging --dataset staging-v2 \
  --artifact-sha256 sha256:RULES_CLOSURE_SHA256
```

Runtime environment keys:

| Key | Value |
|---|---|
| `PVP_DATABASE_URL` | Only the selected environment's restricted runtime DSN |
| `PVP_DB_SCHEMA` | `game_pvp_staging` or `game` |
| `PVP_DATASET_ID` | `staging-v2` or `demo-v2`, matching the registered manifest |
| `PVP_SESSION_PEPPER` | Independent random secret, at least 32 characters |
| `PVP_SERVICE_RELEASE` | Exact bundle release ID |
| `PVP_RULES_ARTIFACT_PATH` | Absolute immutable `rules` directory |
| `PVP_RULES_WORKER_PATH` | Its `scripts/pvp-worker.mjs` path |
| `PVP_RULES_ARTIFACT_SHA256` | Verified rules closure digest including its `sha256:` prefix |
| `PVP_NODE_BINARY` | `/opt/fathom-pvp/runtime/node-v22.23.3-linux-x64/bin/node` |
| `PVP_CORS_ORIGINS` | JSON array of exact approved browser origins |
| `PVP_WRITES_ENABLED` | `true` for acceptance; `false` for maintenance fallback |

Create the `staging` symlink to the reviewed release and install
`systemd/fishtank-pvp-staging.service`. Its loopback-only port 8003 is reachable
for browser tests through an SSH tunnel. Production and staging must not share
session secrets or database privileges. Confirm readiness and test a real
two-account capture, match, reload, and result using the Node worker and database.

## Cut over production

1. Record existing legacy row counts, unit configuration, new schema migration
   checksums, release metadata, and health of weather and PvP. Verify the actual
   Cloudflare-managed route forwards nested `/pvp/v2/*` paths to port 8002.
2. Back up the legacy tables and new game schema using a server-compatible
   `pg_dump`; restore that archive into an isolated database and verify counts.
   A readable archive alone is not evidence of a successful restore.
3. Apply production migrations, provision its separate role, register the
   `demo-v2` release, and validate the runtime's privileges. A staging manifest
   must never be registered as a production release by merely changing a column.
4. Install the independent production environment and unit, and point `current`
   at the already-tested release. Restart **only** `fishtank-pvp`. Verify local
   and public readiness, registered builds, CORS/preflight, and legacy behavior.
   Old snapshot/name writes must return 410; old clients use generated rivals.
5. The user authorized clearing only the legacy PoC player and ghost records.
   First run `deploy/purge_legacy.py` for current counts. With the restored
   backup available, apply the exact reviewed counts:

```bash
.venv/bin/python deploy/purge_legacy.py --apply \
  --expected-players REVIEWED_COUNT --expected-ghosts REVIEWED_COUNT \
  --restored-backup /protected/path/tested-backup.dump
```

The purge checks the local v2 dataset and the retired writer, locks the two
legacy tables, checks counts again, then deletes snapshots before players in one
transaction. It never uses `TRUNCATE CASCADE`. Weather, authentication, and new
account tables are outside its scope.

6. Promote the paired game build only after backend acceptance. Verify its
   public release manifest, create two new demo accounts, and confirm each can
   encounter the other's compatible recorded ghost. The intentionally empty
   initial pool returns labeled generated rivals until real captures arrive.

## Recovery

Keep the previous v2 release and its immutable artifact. Disable online writes
or switch to that compatible v2 release when necessary; never restore the old
unauthenticated writer. Generated PvP remains the client fallback. Retiring a
release or ghost changes eligibility, not its historical payload.

Keep the pre-save-19 browser backup. Rolling the game back to an older build that
cannot read save 19 must not overwrite the newer save. Restoring database data is
a separate operator action and must preserve permanent account/grant records;
the PoC purge is not a general database reset command.
