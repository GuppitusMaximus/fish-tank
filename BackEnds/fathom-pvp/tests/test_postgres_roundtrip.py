from __future__ import annotations
import json, os, secrets
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import psycopg, pytest
from fastapi.testclient import TestClient
from psycopg import sql

from fathom_pvp.app import create_app
from fathom_pvp.config import Settings
from fathom_pvp.migrate import migrate
from fathom_pvp.provision import provision

ADMIN=os.getenv("TEST_DATABASE_URL")
ARTIFACT=Path(os.getenv("PVP_TEST_ARTIFACT_DIR","/tmp/fathom-pvp-artifact"))
pytestmark=pytest.mark.skipif(not ADMIN or not (ARTIFACT/"artifact.json").exists(),reason="requires real PostgreSQL and built rules artifact")

@pytest.fixture(scope="module")
def service():
    suffix=secrets.token_hex(4);schema=f"pvp_it_{suffix}";role=f"pvp_rt_{suffix}";password=secrets.token_urlsafe(24)
    migrate(ADMIN,schema)
    with psycopg.connect(ADMIN,autocommit=True) as conn:conn.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE").format(sql.Identifier(role),sql.Literal(password)))
    provision(ADMIN,schema,role)
    info=json.loads((ARTIFACT/"artifact.json").read_text())
    with psycopg.connect(ADMIN) as conn:
        conn.execute(sql.SQL("INSERT INTO {}.release_manifests(build_id,build_commit,game_version,schema_version,ruleset_id,rating_version,content_hash,artifact_sha256,dataset_id,matchmaking_pool_id,start_health_policy,acceptance_state,manifest) VALUES(%s,%s,%s,4,%s,%s,%s,%s,%s,%s,%s,'accepted',%s)").format(sql.Identifier(schema)),(info["buildId"],info["buildCommit"],info["gameVersion"],info["rulesetId"],info["ratingVersion"],info["contentHash"],info["artifactDigest"],info["datasetId"],info["matchmakingPoolId"],info["startHealthPolicy"],json.dumps(info)))
    dsn=f"postgresql://{role}:{quote(password)}@127.0.0.1:65432/fathom_pvp_test"
    settings=Settings(database_url=dsn,db_schema=schema,session_pepper="x"*40,dataset_id=info["datasetId"],service_release="test",rules_worker_path=ARTIFACT/"scripts/pvp-worker.mjs",rules_artifact_path=ARTIFACT,rules_artifact_sha256=info["artifactDigest"])
    with TestClient(create_app(settings)) as client:yield client,info

def bootstrap(client:TestClient)->tuple[str,dict]:
    key=secrets.token_urlsafe(24);response=client.post("/pvp/v2/guest-sessions",headers={"Idempotency-Key":key},json={"bootstrapKey":key})
    assert response.status_code==201,response.text;body=response.json();return body["session"]["token"],body

def upload(client:TestClient,info:dict,token:str,account:dict):
    fixture=Path("/home/dev/workspace/projects/FishTank/fathom-fall/.pvp-contract-worktree/tests/fixtures/pvp-v2-rich-ghost.json")
    snapshot=json.loads(fixture.read_text());run_id=str(uuid4());encounter_id=str(uuid4())
    for key in ("gameVersion","buildCommit","buildId","contentHash","rulesetId","ratingVersion","matchmakingPoolId","datasetId"):snapshot["provenance"][key]=info[key]
    snapshot["run"]["runId"]=run_id;snapshot["run"]["encounterId"]=encounter_id;snapshot["identity"].update(gamerTag=account["profile"]["gamerTag"],profileRevision=account["profile"]["revision"],classId="andy",portraitId="andy-default",portraitRevision="demo-v1")
    headers={"Authorization":f"Bearer {token}","Idempotency-Key":secrets.token_urlsafe(16)}
    run=client.post("/pvp/v2/runs",headers=headers,json={"runId":run_id,"originBuild":{"gameVersion":info["gameVersion"],"buildCommit":info["buildCommit"],"buildId":info["buildId"]},"importedLocal":False});assert run.status_code==201,run.text
    headers["Idempotency-Key"]=secrets.token_urlsafe(16);ghost=client.post("/pvp/v2/ghosts",headers=headers,json=snapshot);assert ghost.status_code==201,ghost.text
    return snapshot,ghost.json(),headers

def test_real_postgres_two_account_roundtrip(service):
    client,info=service;token_a,account_a=bootstrap(client);snapshot_a,ghost_a,_=upload(client,info,token_a,account_a)
    token_b,account_b=bootstrap(client);snapshot_b,ghost_b,headers=upload(client,info,token_b,account_b)
    match=client.post("/pvp/v2/matches",headers=headers,json={"ghostId":ghost_b["ghostId"],"runId":snapshot_b["run"]["runId"],"encounterId":snapshot_b["run"]["encounterId"]});assert match.status_code==201,match.text
    proposal=match.json();assert proposal["opponent"]["source"]=="player_ghost";assert proposal["opponent"]["snapshot"]["identity"]["gamerTag"]==account_a["profile"]["gamerTag"];assert "resources" not in proposal["opponent"]["snapshot"]
    headers["Idempotency-Key"]=secrets.token_urlsafe(16);started=client.post(f'/pvp/v2/matches/{proposal["matchId"]}/start',headers=headers,json={"encounterId":snapshot_b["run"]["encounterId"]});assert started.status_code==200
    headers["Idempotency-Key"]=secrets.token_urlsafe(16);result=client.put(f'/pvp/v2/matches/{proposal["matchId"]}/result',headers=headers,json={"encounterId":snapshot_b["run"]["encounterId"],"outcome":"win","preCombatGold":100,"postCombatGold":120});assert result.status_code==201;assert result.json()["accountRewardsGranted"] is False
    detail=client.get(f'/pvp/v2/me/ghosts/{ghost_b["ghostId"]}',headers={"Authorization":f"Bearer {token_b}"});assert detail.status_code==200;assert detail.json()["snapshot"]["tacklebox"]==snapshot_b["tacklebox"]

def test_bootstrap_replay_and_conflict(service):
    client,_=service;key=secrets.token_urlsafe(24);headers={"Idempotency-Key":key};body={"bootstrapKey":key,"deviceLabel":"browser"}
    first=client.post("/pvp/v2/guest-sessions",headers=headers,json=body);second=client.post("/pvp/v2/guest-sessions",headers=headers,json=body)
    assert first.json()["account"]==second.json()["account"];assert first.json()["session"]["token"]==second.json()["session"]["token"]
    conflict=client.post("/pvp/v2/guest-sessions",headers=headers,json={**body,"deviceLabel":"other"});assert conflict.status_code==409

def test_concurrent_bootstrap_creates_one_account(service):
    client,_=service;key=secrets.token_urlsafe(24);headers={"Idempotency-Key":key};body={"bootstrapKey":key}
    with ThreadPoolExecutor(max_workers=2) as pool:responses=list(pool.map(lambda _:client.post("/pvp/v2/guest-sessions",headers=headers,json=body),range(2)))
    assert [response.status_code for response in responses]==[201,201]
    assert responses[0].json()["account"]==responses[1].json()["account"]
    assert responses[0].json()["session"]==responses[1].json()["session"]
