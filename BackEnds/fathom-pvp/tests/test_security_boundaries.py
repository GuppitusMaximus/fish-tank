"""Adversarial authority and lifecycle boundaries against real PostgreSQL + Node."""
from __future__ import annotations

import asyncio
import copy
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest

from fathom_pvp.worker import WorkerUnavailable, verify_artifact
from test_real_round_trip import live_service, success, guest, capture  # noqa: F401


def _identity(me, class_id="andy"):
    loadout = next(row for row in me["loadouts"] if row["classId"] == class_id)
    portrait = next(row for row in me["portraits"] if row["portraitId"] == loadout["portraitId"])
    return {"classId": class_id, "portraitId": loadout["portraitId"],
            "gamerTag": me["profile"]["gamerTag"], "profileRevision": me["profile"]["revision"],
            "portraitRevision": portrait["artworkRevision"]}


def _register_capture(client, manifest, template, me, headers, *, zone="sewers"):
    body = copy.deepcopy(template)
    body["provenance"].update({key: manifest[key] for key in body["provenance"] if key in manifest})
    body["run"].update(runId=str(uuid4()), encounterId=str(uuid4()), zoneId=zone, zonePath=[zone])
    body["identity"] = _identity(me)
    origin = {key: manifest[key] for key in ("gameVersion", "buildCommit", "buildId")}
    success(client.post("/pvp/v2/runs", json={"runId": body["run"]["runId"], "originBuild": origin,
                  "importedLocal": body["run"]["imported"]}, headers=headers | {"Idempotency-Key": str(uuid4())}))
    return body


def test_writes_disabled_blocks_every_v2_mutation(live_service):
    client, _, _, _, _ = live_service
    settings = client.app.state.settings
    before = settings.writes_enabled
    settings.writes_enabled = False
    try:
        key = str(uuid4())
        response = client.post("/pvp/v2/guest-sessions", json={"bootstrapKey": key}, headers={"Idempotency-Key": key})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "WRITES_DISABLED"
        assert client.get("/pvp/v2/capabilities").status_code == 200
    finally:
        settings.writes_enabled = before


def test_offline_capture_rejects_locked_portrait(live_service):
    client, manifest, template, _, _ = live_service
    me, headers = guest(client)
    body = _register_capture(client, manifest, template, me, headers)
    body["identity"].update(portraitId="andy-abyss-angler", portraitRevision="demo-v1")
    request = {"runId": body["run"]["runId"], "encounterId": body["run"]["encounterId"], "capture": body,
               "localGeneratedInput": {"source": "generated", "seed": 7},
               "result": {"encounterId": body["run"]["encounterId"], "outcome": "loss",
                          "preCombatGold": body["resources"]["runGold"], "postCombatGold": 0}}
    response = client.post("/pvp/v2/offline-encounters", json=request,
                           headers=headers | {"Idempotency-Key": str(uuid4())})
    assert response.status_code == 403, response.json()
    assert response.json()["error"]["code"] == "PORTRAIT_LOCKED"


def test_revoked_portrait_grant_invalidates_stale_loadout(live_service):
    client, manifest, template, schema, dsn = live_service
    me, headers = guest(client)
    account = me["account"]["accountId"]
    with psycopg.connect(dsn) as admin:
        admin.execute(sql.SQL("INSERT INTO {}.unlock_grants(account_id,object_type,object_id,source_type,source_reference) VALUES(%s,'portrait','andy-abyss-angler','support','security-test')").format(sql.Identifier(schema)), (account,))
    loadout = next(row for row in me["loadouts"] if row["classId"] == "andy")
    success(client.put("/pvp/v2/me/classes/andy/portrait",
        json={"portraitId": "andy-abyss-angler", "expectedRevision": loadout["revision"]},
        headers=headers | {"Idempotency-Key": str(uuid4())}))
    current = success(client.get("/pvp/v2/me", headers=headers))
    body = _register_capture(client, manifest, template, current, headers)
    with psycopg.connect(dsn) as admin:
        admin.execute(sql.SQL("UPDATE {}.unlock_grants SET active=false,revoked_at=clock_timestamp() WHERE account_id=%s AND object_id='andy-abyss-angler'").format(sql.Identifier(schema)), (account,))
    response = client.post("/pvp/v2/ghosts", json=body, headers=headers | {"Idempotency-Key": str(uuid4())})
    assert response.status_code == 403, response.json()
    assert response.json()["error"]["code"] == "PORTRAIT_LOCKED"


def test_abandoned_match_cannot_accept_result(live_service):
    client, manifest, template, schema, dsn = live_service
    me, headers = guest(client)
    body, accepted, _ = capture(client, manifest, template, me, headers)
    match_body = {"ghostId": accepted["ghostId"], "runId": body["run"]["runId"], "encounterId": body["run"]["encounterId"]}
    match = success(client.post("/pvp/v2/matches", json=match_body, headers=headers | {"Idempotency-Key": str(uuid4())}))
    with psycopg.connect(dsn) as admin:
        admin.execute(sql.SQL("UPDATE {}.pvp_matches SET state='abandoned_before_start',abandoned_at=clock_timestamp() WHERE match_id=%s").format(sql.Identifier(schema)), (match["matchId"],))
    result = {"encounterId": body["run"]["encounterId"], "outcome": "win",
              "preCombatGold": body["resources"]["runGold"], "postCombatGold": body["resources"]["runGold"]}
    response = client.put(f'/pvp/v2/matches/{match["matchId"]}/result', json=result,
                          headers=headers | {"Idempotency-Key": str(uuid4())})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MATCH_ABANDONED"


def test_manifest_forbids_cross_zone_candidate(live_service):
    client, manifest, template, _, _ = live_service
    first_me, first_headers = guest(client)
    first_body = _register_capture(client, manifest, template, first_me, first_headers, zone="sewers")
    first = success(client.post("/pvp/v2/ghosts", json=first_body, headers=first_headers | {"Idempotency-Key": str(uuid4())}))
    assert first["ghostId"]
    second_me, second_headers = guest(client)
    second_body = _register_capture(client, manifest, template, second_me, second_headers, zone="goblin_caves")
    second = success(client.post("/pvp/v2/ghosts", json=second_body, headers=second_headers | {"Idempotency-Key": str(uuid4())}))
    request = {"ghostId": second["ghostId"], "runId": second_body["run"]["runId"], "encounterId": second_body["run"]["encounterId"]}
    match = success(client.post("/pvp/v2/matches", json=request, headers=second_headers | {"Idempotency-Key": str(uuid4())}))
    assert match["opponent"]["source"] == "generated"
    assert match["reason"] == "no_compatible_opponent"


def test_artifact_verification_rejects_unlisted_config(tmp_path):
    source_value = os.environ.get("PVP_TEST_ARTIFACT")
    if not source_value:
        pytest.skip("requires PVP_TEST_ARTIFACT")
    source = Path(source_value)
    root = tmp_path / "artifact"
    shutil.copytree(source, root)
    metadata = json.loads((root / "artifact.json").read_text())
    injected = root / "src/config/fish/zz-unlisted.json"
    injected.write_text('{"id":"guppy","baseHp":999999}')
    with pytest.raises(WorkerUnavailable, match="exactly cover"):
        verify_artifact(root, metadata["artifactDigest"])


def test_chunked_body_limit_stops_reading_at_budget(live_service):
    client, _, _, _, _ = live_service
    app = client.app
    chunk = b"x" * 65_536
    offered = 40
    consumed = 0
    messages = []

    async def receive():
        nonlocal consumed
        consumed += 1
        return {"type": "http.request", "body": chunk, "more_body": consumed < offered}

    async def send(message):
        messages.append(message)

    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
             "scheme": "http", "path": "/pvp/v2/guest-sessions", "raw_path": b"/pvp/v2/guest-sessions",
             "query_string": b"", "headers": [(b"content-type", b"application/json"), (b"transfer-encoding", b"chunked")],
             "client": ("127.0.0.1", 1234), "server": ("testserver", 80), "root_path": "", "state": {}}
    asyncio.run(app(scope, receive, send))
    start = next(message for message in messages if message["type"] == "http.response.start")
    assert start["status"] == 413
    assert consumed <= client.app.state.settings.body_limit_bytes // len(chunk) + 2
