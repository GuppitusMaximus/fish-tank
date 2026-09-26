"""Real PostgreSQL races at the encounter authority boundary."""
from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest

from test_real_round_trip import capture, guest, live_service, success  # noqa: F401


def _race(*calls):
    barrier = Barrier(len(calls) + 1)

    def ready(call):
        barrier.wait(timeout=5)
        return call()

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(ready, call) for call in calls]
        barrier.wait(timeout=5)
        return [future.result(timeout=15) for future in futures]


def test_concurrent_bootstrap_key_mints_one_account_and_session(live_service):
    client, _, _, schema, dsn = live_service
    key = str(uuid4())
    body = {"bootstrapKey": key, "deviceLabel": "concurrency-test"}
    headers = {"Idempotency-Key": key}
    responses = _race(
        lambda: client.post("/pvp/v2/guest-sessions", json=body, headers=headers),
        lambda: client.post("/pvp/v2/guest-sessions", json=body, headers=headers),
    )
    payloads = [success(response) for response in responses]
    account_ids = {row["account"]["accountId"] for row in payloads}
    session_tokens = {row["session"]["token"] for row in payloads}
    assert len(account_ids) == len(session_tokens) == 1
    with psycopg.connect(dsn) as conn:
        account_id = next(iter(account_ids))
        assert conn.execute(sql.SQL("SELECT count(*) FROM {}.accounts WHERE account_id=%s").format(
            sql.Identifier(schema)), (account_id,)).fetchone()[0] == 1
        assert conn.execute(sql.SQL("SELECT count(*) FROM {}.account_sessions WHERE account_id=%s").format(
            sql.Identifier(schema)), (account_id,)).fetchone()[0] == 1
        assert conn.execute(sql.SQL("SELECT count(*) FROM {}.bootstrap_requests WHERE account_id=%s").format(
            sql.Identifier(schema)), (account_id,)).fetchone()[0] == 1


def test_concurrent_identical_capture_with_distinct_keys_returns_one_ghost(live_service):
    client, manifest, template, schema, dsn = live_service
    me, headers = guest(client)
    body = copy.deepcopy(template)
    body["provenance"].update({key: manifest[key] for key in body["provenance"] if key in manifest})
    body["run"].update(runId=str(uuid4()), encounterId=str(uuid4()))
    loadout = next(row for row in me["loadouts"] if row["classId"] == "andy")
    portrait = next(row for row in me["portraits"] if row["portraitId"] == loadout["portraitId"])
    body["identity"] = {"classId": "andy", "portraitId": loadout["portraitId"],
                        "gamerTag": me["profile"]["gamerTag"], "profileRevision": me["profile"]["revision"],
                        "portraitRevision": portrait["artworkRevision"]}
    origin = {key: manifest[key] for key in ("gameVersion", "buildCommit", "buildId")}
    success(client.post("/pvp/v2/runs", json={"runId": body["run"]["runId"], "originBuild": origin,
                  "importedLocal": body["run"]["imported"]}, headers=headers | {"Idempotency-Key": str(uuid4())}))
    responses = _race(*[
        lambda key=str(uuid4()): client.post("/pvp/v2/ghosts", json=body,
                                              headers=headers | {"Idempotency-Key": key})
        for _ in range(2)
    ])
    payloads = [success(response) for response in responses]
    assert len({row["ghostId"] for row in payloads}) == 1
    with psycopg.connect(dsn) as conn:
        assert conn.execute(sql.SQL("SELECT count(*) FROM {}.ghost_snapshots WHERE encounter_id=%s").format(
            sql.Identifier(schema)), (body["run"]["encounterId"],)).fetchone()[0] == 1


@pytest.mark.parametrize("_attempt", range(5))
def test_concurrent_start_and_offline_reconciliation_choose_one_source(live_service, _attempt):
    client, manifest, template, schema, dsn = live_service
    me, headers = guest(client)
    body, accepted, _ = capture(client, manifest, template, me, headers)
    match = success(client.post("/pvp/v2/matches", json={"ghostId": accepted["ghostId"],
        "runId": body["run"]["runId"], "encounterId": body["run"]["encounterId"]},
        headers=headers | {"Idempotency-Key": str(uuid4())}))
    result = {"encounterId": body["run"]["encounterId"], "outcome": "loss",
              "preCombatGold": body["resources"]["runGold"], "postCombatGold": 0}
    offline = {"runId": body["run"]["runId"], "encounterId": body["run"]["encounterId"],
               "capture": body, "localGeneratedInput": {"source": "generated", "seed": 77},
               "result": result}
    responses = _race(
        lambda: client.post(f'/pvp/v2/matches/{match["matchId"]}/start',
                            json={"encounterId": body["run"]["encounterId"]},
                            headers=headers | {"Idempotency-Key": str(uuid4())}),
        lambda: client.post("/pvp/v2/offline-encounters", json=offline,
                            headers=headers | {"Idempotency-Key": str(uuid4())}),
    )
    assert all(response.status_code in (200, 201, 409) for response in responses), [
        (response.status_code, response.text) for response in responses]
    assert sorted(response.status_code == 409 for response in responses) == [False, True]
    with psycopg.connect(dsn) as conn:
        match_row = conn.execute(sql.SQL("SELECT state FROM {}.pvp_matches WHERE match_id=%s").format(
            sql.Identifier(schema)), (match["matchId"],)).fetchone()
        encounter = conn.execute(sql.SQL("SELECT source,lifecycle FROM {}.pvp_encounters WHERE encounter_id=%s").format(
            sql.Identifier(schema)), (body["run"]["encounterId"],)).fetchone()
        result_count = conn.execute(sql.SQL("SELECT count(*) FROM {}.pvp_results WHERE encounter_id=%s").format(
            sql.Identifier(schema)), (body["run"]["encounterId"],)).fetchone()[0]
    states = (match_row[0], encounter[0], encounter[1], result_count)
    assert states in {
        ("started", "online_match", "started", 0),
        ("abandoned_before_start", "local_generated", "completed", 1),
    }
