# Fathom Fall PvP v2

Authenticated FastAPI service for immutable schema-4 ghosts, version-compatible matching, offline reconciliation, and client-reported outcomes. It uses PostgreSQL only; there is no SQLite or in-memory production data path. Account currency, purchases, achievement grants, and recoverable identity providers are deliberately outside this service. Run gold and outcomes remain `client_reported` and never create account grants.

## Runtime

Python 3.12 and Node 22.23.3 are the pinned runtimes. Install the hash-locked Python requirements and run:

```sh
uvicorn fathom_pvp.entrypoint:app --host 127.0.0.1 --port 8002 --no-proxy-headers
```

The Node worker is a fixed, digest-verified artifact directory. The service starts a bounded persistent worker pool with 128 MiB heaps, minimal environment, finite queue acquisition and pipe deadlines, and no database/session environment variables. Invalid builds or worker failures fail closed.

Required environment:

- `PVP_DATABASE_URL`: dedicated runtime role DSN.
- `PVP_DB_SCHEMA`: isolated lowercase schema, default `game`.
- `PVP_SESSION_PEPPER`: at least 32 random characters.
- `PVP_RULES_WORKER_PATH`: retained for deployment compatibility; point to `<artifact>/scripts/pvp-worker.mjs`.
- `PVP_RULES_ARTIFACT_PATH`: immutable artifact directory.
- `PVP_RULES_ARTIFACT_SHA256`: `sha256:<hex>` closure digest from `artifact.json`.
- `PVP_DATASET_ID`, `PVP_SERVICE_RELEASE`, and `PVP_CORS_ORIGINS`. List-valued settings use JSON arrays, for example `PVP_CORS_ORIGINS='["https://fathomfall.com"]'`.
- `PVP_TRUSTED_PROXY_IPS`: JSON array of direct peers allowed to supply `CF-Connecting-IP`, for example `'["127.0.0.1", "::1"]'`. It defaults to loopback for the local Cloudflare tunnel. Arbitrary remote peers cannot select their rate-limit identity.

`PVP_WRITES_ENABLED=false` returns `503 WRITES_DISABLED` for every v2 mutation. The public capabilities endpoint reports the switch. Maximum request size is 1 MiB, including requests without a truthful `Content-Length`; knot history is provisionally capped at 10,000 records.

## Database administration

Migration and runtime credentials are separate. Ordered migrations record and enforce source SHA-256 checksums:

```sh
PVP_MIGRATION_DATABASE_URL='postgresql://...' python -m fathom_pvp.migrate --schema game_pvp_staging
PVP_MIGRATION_DATABASE_URL='postgresql://...' python -m fathom_pvp.provision --schema game_pvp_staging --role fathom_pvp_staging_runtime
PVP_MIGRATION_DATABASE_URL='postgresql://...' python -m fathom_pvp.register_release /opt/fathom-pvp/rules/src/pvp/release-manifest.json --schema game_pvp_staging --dataset staging-v2 --artifact-sha256 sha256:...
```

Create each runtime login separately with an environment-specific secret, `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. Provisioning grants catalog/release/grant reads and only the operational writes the API needs. It cannot create release manifests or unlock grants, and cannot update/delete immutable snapshots or results. Startup refuses superuser/BYPASSRLS roles, missing schema access, or schemas exposed to PUBLIC.

The schema separates immutable profile revisions, class loadout revisions, independent grant provenance, owned runs, encounters, ghosts and mutable eligibility, match proposals, outcomes, and request deduplication. Snapshot/result triggers prevent history rewriting. Retention remains an explicit operator task; eligibility can be retired independently without deleting active-match history.

## API contract

The base is `/pvp/v2`. Durable mutations require `Idempotency-Key`; changing the normalized request under one key yields `409 IDEMPOTENCY_CONFLICT`. Authentication is `Authorization: Bearer <opaque session token>`. Session secrets are hashed with argon2-cffi's `PasswordHasher`, whose configured/default algorithm is Argon2id; plaintext bearer secrets are never stored. Bootstrap uses a persistent high-entropy `bootstrapKey` equal to its idempotency key, safely replays the same account/session, rotates an expired session, and is rate limited.

Routes: `GET /capabilities`, `POST /guest-sessions`, `GET /me`, `PATCH /me/profile`, `PUT /me/classes/{classId}/portrait`, `POST /runs`, `POST /ghosts`, own ghost list/detail, `POST /matches`, `POST /matches/{id}/start`, `PUT /matches/{id}/result`, `POST /offline-encounters`, and `GET /leaderboard`.

Match selection requires an accepted release, exact dataset/pool/rules/rating/floor/mode/tier and zone unless the manifest allows cross-zone matching. It considers at most one newest eligible candidate per other account, tries 15%, then 30%, and calls the pinned worker for a deterministic generated fallback. A proposal freezes both parties, slots, seed, health policy, and battle rules. Timeout reconciliation can abandon only an unstarted proposal; started-online and local-generated sources cannot be silently switched.

Opponent projections include recorded identity, provenance, roster, resolved battle specs, tacklebox and equipment attribution. They exclude account/session IDs, run IDs/seeds, pantry, reserve, and whole-run resources.

Errors use `{ "error": { "code", "message", "fields"?, "retryable", "requestId" } }`. Unknown fields are rejected. Legacy mutation routes return `410 LEGACY_CLIENT_RETIRED` and do not import old UUIDs or claim tokens.

## Tests

Real integration tests require PostgreSQL and a built rules artifact; they skip rather than substitute SQLite:

```sh
TEST_DATABASE_URL='postgresql://...' \
PVP_TEST_ARTIFACT_DIR=/tmp/fathom-pvp-artifact \
PVP_TEST_ARTIFACT=/tmp/fathom-pvp-artifact \
PVP_TEST_FIXTURE=/path/to/tests/fixtures/pvp-v2-rich-ghost.json \
pytest -q
```

The suite migrates a fresh schema, provisions a non-superuser role, starts the actual Node worker, then exercises bootstrap replay, two accounts, rich capture validation, JSONB persistence, private opponent projection, matching, start/result, and historical reads.
