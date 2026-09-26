"""Actual PostgreSQL + pinned Node rules worker, with no service/worker mocks."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
import pytest
from fastapi.testclient import TestClient

from fathom_pvp.migrate import migrate
from fathom_pvp.provision import provision


@pytest.fixture(scope="module")
def live_service():
    dsn = os.environ.get("TEST_DATABASE_URL")
    artifact_value = os.environ.get("PVP_TEST_ARTIFACT")
    fixture_value = os.environ.get("PVP_TEST_FIXTURE")
    if not all((dsn, artifact_value, fixture_value)):
        pytest.skip("real round trip requires TEST_DATABASE_URL, PVP_TEST_ARTIFACT and PVP_TEST_FIXTURE")
    artifact = Path(artifact_value).resolve()
    manifest = json.loads((artifact / "src/pvp/release-manifest.json").read_text())
    metadata = json.loads((artifact / "artifact.json").read_text())
    fixture = json.loads(Path(fixture_value).read_text())
    unique = uuid4().hex[:12]
    schema, role = f"test_root_v2_{unique}", f"pvp_root_{unique}"
    password = uuid4().hex
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE ROLE {} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
    try:
        migrate(dsn, schema)
        provision(dsn, schema, role)
        with psycopg.connect(dsn) as admin:
            admin.execute(sql.SQL("""INSERT INTO {}.release_manifests
                (build_id,build_commit,game_version,schema_version,ruleset_id,rating_version,
                 content_hash,artifact_sha256,dataset_id,matchmaking_pool_id,start_health_policy,acceptance_state,manifest)
                VALUES(%s,%s,%s,4,%s,%s,%s,%s,%s,%s,%s,'accepted',%s)""").format(sql.Identifier(schema)),
                (manifest["buildId"], manifest["buildCommit"], manifest["gameVersion"], manifest["rulesetId"],
                 manifest["ratingVersion"], manifest["contentHash"], metadata["artifactDigest"],
                 manifest["datasetId"], manifest["matchmakingPoolId"], manifest["startHealthPolicy"], json.dumps(manifest)))
        options = conninfo_to_dict(dsn)
        options.update(user=role, password=password)
        settings_values = {
            "PVP_DATABASE_URL": make_conninfo(**options), "PVP_DB_SCHEMA": schema,
            "PVP_SESSION_PEPPER": uuid4().hex + uuid4().hex,
            "PVP_DATASET_ID": manifest["datasetId"], "PVP_SERVICE_RELEASE": "real-round-trip",
            "PVP_RULES_ARTIFACT_PATH": str(artifact),
            "PVP_RULES_WORKER_PATH": str(artifact / "scripts/pvp-worker.mjs"),
            "PVP_RULES_ARTIFACT_SHA256": metadata["artifactDigest"],
            "PVP_CORS_ORIGINS": '["https://localhost:18443"]',
            "PVP_BOOTSTRAP_RATE_PER_MINUTE": "100",
        }
        old = {key: os.environ.get(key) for key in settings_values}
        os.environ.update(settings_values)
        try:
            from fathom_pvp.app import create_app
            with TestClient(create_app()) as client:
                yield client, manifest, fixture, schema, dsn
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
    finally:
        with psycopg.connect(dsn, autocommit=True) as admin:
            assert schema.startswith("test_root_v2_") and role.startswith("pvp_root_")
            admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
            admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))


def success(response, *codes):
    assert response.status_code in (codes or (200, 201)), response.text
    return response.json()


def guest(client):
    key = str(uuid4())
    me = success(client.post("/pvp/v2/guest-sessions", json={"bootstrapKey": key}, headers={"Idempotency-Key": key}))
    replay = success(client.post("/pvp/v2/guest-sessions", json={"bootstrapKey": key}, headers={"Idempotency-Key": key}))
    assert replay["account"]["accountId"] == me["account"]["accountId"]
    assert replay["session"]["token"] == me["session"]["token"]
    return me, {"Authorization": f'Bearer {me["session"]["token"]}'}


def capture(client, manifest, template, me, headers):
    body = copy.deepcopy(template)
    body["provenance"].update({key: manifest[key] for key in body["provenance"] if key in manifest})
    body["run"].update(runId=str(uuid4()), encounterId=str(uuid4()))
    profile = me["profile"]
    loadout = next(row for row in me["loadouts"] if row.get("classId", row.get("class_id")) == "andy")
    portrait_id = loadout.get("portraitId", loadout.get("portrait_id"))
    portrait = next(row for row in me["portraits"] if row.get("portraitId", row.get("portrait_id")) == portrait_id)
    body["identity"] = {"classId": "andy", "portraitId": portrait_id,
                         "gamerTag": profile["gamerTag"], "profileRevision": profile["revision"],
                         "portraitRevision": portrait.get("artworkRevision", portrait.get("artwork_revision"))}
    origin = {key: manifest[key] for key in ("gameVersion", "buildCommit", "buildId")}
    success(client.post("/pvp/v2/runs", json={"runId": body["run"]["runId"], "originBuild": origin,
                  "importedLocal": body["run"]["imported"]}, headers=headers | {"Idempotency-Key": str(uuid4())}))
    key = str(uuid4())
    accepted = success(client.post("/pvp/v2/ghosts", json=body, headers=headers | {"Idempotency-Key": key}))
    repeated = success(client.post("/pvp/v2/ghosts", json=body, headers=headers | {"Idempotency-Key": key}), 200)
    assert repeated["ghostId"] == accepted["ghostId"]
    return body, accepted, key


def test_database_worker_match_and_historical_identity(live_service):
    client, manifest, template, schema, dsn = live_service
    assert success(client.get("/pvp/v2/ready"))["status"] == "ready"
    a, ah = guest(client)
    original, first, first_key = capture(client, manifest, template, a, ah)
    stored = success(client.get(f'/pvp/v2/me/ghosts/{first["ghostId"]}', headers=ah))
    assert stored["snapshot"] == original  # Includes JSONB round trip and every knot/slot/resource.
    changed = copy.deepcopy(original)
    changed["resources"]["runGold"] += 1
    assert client.post("/pvp/v2/ghosts", json=changed, headers=ah | {"Idempotency-Key": first_key}).status_code == 409
    success(client.patch("/pvp/v2/me/profile", json={"gamerTag": "Renamed Diver", "expectedRevision": 1},
                         headers=ah | {"Idempotency-Key": str(uuid4())}))
    b, bh = guest(client)
    second_body, second, _ = capture(client, manifest, template, b, bh)
    assert client.get(f'/pvp/v2/me/ghosts/{first["ghostId"]}', headers=bh).status_code == 404
    match_body = {"ghostId": second["ghostId"], "runId": second_body["run"]["runId"],
                  "encounterId": second_body["run"]["encounterId"]}
    key = str(uuid4())
    match = success(client.post("/pvp/v2/matches", json=match_body, headers=bh | {"Idempotency-Key": key}))
    assert match["opponent"]["source"] == "player_ghost"
    assert match["opponent"]["ghostId"] == first["ghostId"]
    assert match["opponent"]["displayName"] == original["identity"]["gamerTag"]
    assert match["opponent"]["gameVersion"] == manifest["gameVersion"]
    assert match["opponent"]["buildCommit"] == manifest["buildCommit"]
    assert success(client.post("/pvp/v2/matches", json=match_body, headers=bh | {"Idempotency-Key": key}))["battleInput"] == match["battleInput"]
    success(client.post(f'/pvp/v2/matches/{match["matchId"]}/start', json={"encounterId": match_body["encounterId"]}, headers=bh | {"Idempotency-Key": str(uuid4())}))
    result = {"encounterId": match_body["encounterId"], "outcome": "win", "preCombatGold": original["resources"]["runGold"], "postCombatGold": 999}
    result_key = str(uuid4())
    finished = success(client.put(f'/pvp/v2/matches/{match["matchId"]}/result', json=result, headers=bh | {"Idempotency-Key": result_key}))
    assert finished["accountRewardsGranted"] is False
    assert success(client.put(f'/pvp/v2/matches/{match["matchId"]}/result', json=result, headers=bh | {"Idempotency-Key": result_key}))["resultId"] == finished["resultId"]
    with psycopg.connect(dsn) as admin:
        assert admin.execute(sql.SQL("SELECT count(*) FROM {}.ghost_snapshots").format(sql.Identifier(schema))).fetchone()[0] == 2
        assert admin.execute(sql.SQL("SELECT count(*) FROM {}.unlock_grants").format(sql.Identifier(schema))).fetchone()[0] == 0
