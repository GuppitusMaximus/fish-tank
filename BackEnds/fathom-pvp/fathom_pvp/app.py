from __future__ import annotations

import hashlib
import ipaddress
import json
import secrets
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Callable
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from psycopg import errors, sql

from .auth import Principal, authenticate, bootstrap_credential, bootstrap_hash, credential_hash
from .config import Settings
from .db import Database
from .errors import ApiError, error_response
from .models import GhostUpload, GuestSessionRequest, MatchRequest, MatchStart, OfflineEncounter, PortraitPut, ProfilePatch, ResultPut, RunRegistration
from .worker import WorkerPool, WorkerRejected, WorkerUnavailable


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def idem_key(value: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    if value is None or not 8 <= len(value) <= 200:
        raise ApiError(422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8-200 characters")
    return value


def principal(request: Request) -> Principal:
    return authenticate(request)


def _q(schema: str, statement: str) -> sql.Composed:
    return sql.SQL(statement).format(s=sql.Identifier(schema))


def _runtime_role_safe(conn:Any,schema:str)->bool:
    role=conn.execute("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()
    access=conn.execute("SELECT has_schema_privilege(current_user,%s,'USAGE') AS runtime_usage, EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname=%s AND a.grantee=0 AND a.privilege_type='USAGE') AS public_usage",(schema,schema)).fetchone()
    return bool(role and not role["rolsuper"] and not role["rolbypassrls"] and access["runtime_usage"] and not access["public_usage"])


def _account_view(conn: Any, schema: str, account_id: UUID) -> dict[str, Any]:
    profile = conn.execute(_q(schema, "SELECT revision, gamer_tag FROM {s}.account_profile_revisions WHERE account_id=%s ORDER BY revision DESC LIMIT 1"), (account_id,)).fetchone()
    classes = conn.execute(_q(schema, "SELECT class_id, display_name, default_available, default_portrait_id FROM {s}.class_catalog WHERE active ORDER BY class_id")).fetchall()
    portraits = conn.execute(_q(schema, "SELECT portrait_id, class_id, artwork_revision, default_available FROM {s}.portrait_catalog WHERE active ORDER BY portrait_id")).fetchall()
    loadouts = conn.execute(_q(schema, "SELECT class_id, portrait_id, revision FROM {s}.class_loadouts WHERE account_id=%s ORDER BY class_id"), (account_id,)).fetchall()
    grants = conn.execute(_q(schema, "SELECT object_type, object_id, source_type FROM {s}.unlock_grants WHERE account_id=%s AND active"), (account_id,)).fetchall()
    return {
        "account": {"accountId": str(account_id)},
        "profile": {"revision": profile["revision"], "gamerTag": profile["gamer_tag"]},
        "classes": [{"classId":r["class_id"],"displayName":r["display_name"],"defaultAvailable":r["default_available"],"defaultPortraitId":r["default_portrait_id"]} for r in classes],
        "portraits": [{"portraitId":r["portrait_id"],"classId":r["class_id"],"artworkRevision":r["artwork_revision"],"defaultAvailable":r["default_available"]} for r in portraits],
        "loadouts": [{"classId":r["class_id"],"portraitId":r["portrait_id"],"revision":r["revision"]} for r in loadouts],
        "grants": [{"objectType":r["object_type"],"objectId":r["object_id"],"sourceType":r["source_type"]} for r in grants],
    }


def _dedup(conn: Any, schema: str, account_id: UUID, operation: str, key: str, body: Any) -> dict[str, Any] | None:
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"{account_id}:{operation}:{key}",))
    row = conn.execute(_q(schema, "SELECT request_hash, response_body FROM {s}.request_deduplication WHERE account_id=%s AND operation=%s AND idempotency_key=%s FOR UPDATE"), (account_id, operation, key)).fetchone()
    if not row:
        return None
    if row["request_hash"] != digest(body):
        raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request")
    return row["response_body"]


def _save_dedup(conn: Any, schema: str, account_id: UUID, operation: str, key: str, body: Any, status: int, response: dict[str, Any]) -> None:
    conn.execute(_q(schema, "INSERT INTO {s}.request_deduplication(account_id,operation,idempotency_key,request_hash,response_status,response_body) VALUES(%s,%s,%s,%s,%s,%s)"), (account_id, operation, key, digest(body), status, json.dumps(response)))


def _preflight_mutation(conn:Any,schema:str,account_id:UUID,operation:str,key:str,body:Any,run_id:UUID,dataset_id:str)->dict[str,Any]|None:
    row=conn.execute(_q(schema,"SELECT request_hash,response_body FROM {s}.request_deduplication WHERE account_id=%s AND operation=%s AND idempotency_key=%s"),(account_id,operation,key)).fetchone()
    if row:
        if row["request_hash"]!=digest(body):raise ApiError(409,"IDEMPOTENCY_CONFLICT","This idempotency key was already used for a different request")
        return row["response_body"]
    if not conn.execute(_q(schema,"SELECT 1 FROM {s}.runs WHERE run_id=%s AND account_id=%s AND dataset_id=%s"),(run_id,account_id,dataset_id)).fetchone():raise ApiError(409,"RUN_OWNERSHIP_CONFLICT","Run is not registered to this account")
    return None


def create_app(settings: Settings | None = None, *, worker_factory: Callable[[Settings], Any] | None = None) -> FastAPI:
    settings = settings or Settings()  # type: ignore[call-arg]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.db = Database(settings.database_url)
        app.state.db.open()
        with app.state.db.pool.connection() as conn:
            if not _runtime_role_safe(conn,settings.db_schema):
                app.state.db.close(); raise RuntimeError("runtime database role is not least privilege")
        factory = worker_factory or (lambda cfg: WorkerPool(cfg.node_binary, cfg.rules_worker_path, cfg.rules_artifact_path, cfg.rules_artifact_sha256, cfg.worker_timeout_seconds, cfg.worker_concurrency))
        app.state.worker = factory(settings)
        try:
            with app.state.db.pool.connection() as conn:
                release=conn.execute(_q(settings.db_schema,"SELECT ruleset_id,content_hash,rating_version,start_health_policy FROM {s}.release_manifests WHERE dataset_id=%s AND acceptance_state='accepted' ORDER BY created_at DESC LIMIT 1"),(settings.dataset_id,)).fetchone()
            if not release:raise RuntimeError("no accepted release is registered for this dataset")
            probe=app.state.worker.call("health");loaded=probe.get("loaded") or {}
            expected={"workerProtocolVersion":1,"rulesetId":release["ruleset_id"],"contentHash":release["content_hash"],"ratingVersion":release["rating_version"],"startHealthPolicy":release["start_health_policy"]}
            if probe.get("status")!="ready" or any(loaded.get(k)!=v for k,v in expected.items()):raise RuntimeError("rules worker readiness identity does not match the accepted release")
            app.state.worker_health={"status":"ready","loaded":loaded}
        except Exception:
            app.state.worker.close();app.state.db.close();raise
        yield
        app.state.worker.close()
        app.state.db.close()

    app = FastAPI(title="Fathom Fall PvP", version="2.0.0", lifespan=lifespan)
    bootstrap_hits:dict[str,deque[float]]=defaultdict(deque);bootstrap_lock=threading.Lock()
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])

    @app.middleware("http")
    async def limits_and_request_id(request: Request, call_next: Callable[..., Any]) -> Response:
        request.state.request_id = request.headers.get("X-Request-ID", str(uuid4()))[:100]
        if not settings.writes_enabled and request.method in {"POST","PUT","PATCH","DELETE"} and request.url.path.startswith("/pvp/v2/"):
            return error_response(request,ApiError(503,"WRITES_DISABLED","PvP writes are temporarily disabled",retryable=True))
        length = request.headers.get("content-length")
        try:
            if length and int(length) > settings.body_limit_bytes: return error_response(request, ApiError(413,"SNAPSHOT_TOO_LARGE","Request body exceeds the configured limit"))
        except ValueError: return error_response(request,ApiError(400,"INVALID_CONTENT_LENGTH","Content-Length is invalid"))
        if request.method in {"POST","PUT","PATCH"}:
            chunks=[];total=0
            async for chunk in request.stream():
                total+=len(chunk)
                if total>settings.body_limit_bytes:return error_response(request,ApiError(413,"SNAPSHOT_TOO_LARGE","Request body exceeds the configured limit"))
                chunks.append(chunk)
            request._body=b"".join(chunks)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(request, ApiError(422, "INVALID_REQUEST", "Request validation failed", fields={"errors": jsonable_encoder(exc.errors())}))

    @app.get("/pvp/v2/capabilities")
    def capabilities(request: Request) -> dict[str, Any]:
        schema = settings.db_schema
        with request.app.state.db.pool.connection() as conn:
            releases = conn.execute(_q(schema, "SELECT build_id,build_commit,game_version,schema_version,ruleset_id,rating_version,matchmaking_pool_id FROM {s}.release_manifests WHERE dataset_id=%s AND acceptance_state='accepted' ORDER BY created_at DESC"), (settings.dataset_id,)).fetchall()
        return {"serviceRelease": settings.service_release, "datasetId": settings.dataset_id, "writesEnabled": settings.writes_enabled, "protocolVersions": [2], "schemaVersions": [4], "payloadBudgetBytes": settings.body_limit_bytes, "knotHistoryLimit": settings.knot_history_limit, "releases": [dict(row) for row in releases]}

    @app.get("/pvp/v2/ready")
    def ready(request: Request) -> dict[str, Any]:
        with request.app.state.db.pool.connection() as conn:safe=_runtime_role_safe(conn,settings.db_schema)
        if not safe:
            raise ApiError(503, "DATABASE_ROLE_UNSAFE", "Runtime database role is not least privilege", retryable=True)
        return {"status": "ready", "serviceRelease": settings.service_release, "datasetId": settings.dataset_id, "worker": request.app.state.worker_health, "database": "ok"}

    @app.post("/pvp/v2/guest-sessions", status_code=201)
    def guest_session(body: GuestSessionRequest, request: Request, key: str = Depends(idem_key)) -> dict[str, Any]:
        if key != body.bootstrapKey:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "Bootstrap key and Idempotency-Key must match")
        schema = settings.db_schema
        peer=request.client.host if request.client else "unknown";source=peer
        if peer in settings.trusted_proxy_ips and request.headers.get("CF-Connecting-IP"):
            try:source=str(ipaddress.ip_address(request.headers["CF-Connecting-IP"]))
            except ValueError:raise ApiError(400,"INVALID_CLIENT_ADDRESS","Trusted proxy supplied an invalid client address") from None
        now=time.monotonic()
        with bootstrap_lock:
            hits=bootstrap_hits[source]
            while hits and hits[0]<now-60:hits.popleft()
            if len(hits)>=settings.bootstrap_rate_per_minute:raise ApiError(429,"RATE_LIMITED","Guest bootstrap rate limit exceeded",retryable=True)
            hits.append(now)
        key_hash = bootstrap_hash(key, settings.session_pepper)
        request_hash = digest(body.model_dump(mode="json"))
        secret = bootstrap_credential(key, settings.session_pepper)
        expires = datetime.now(UTC) + timedelta(days=settings.session_days)
        with request.app.state.db.transaction() as conn:
            replay = conn.execute(_q(schema, "SELECT b.request_hash,b.account_id,b.session_id,s.expires_at FROM {s}.bootstrap_requests b JOIN {s}.account_sessions s USING(session_id) WHERE bootstrap_key_hash=%s FOR UPDATE"), (key_hash,)).fetchone()
            if replay:
                if replay["request_hash"] != request_hash:
                    raise ApiError(409, "IDEMPOTENCY_CONFLICT", "Bootstrap key was used with different data")
                if replay["expires_at"]<=datetime.now(UTC):
                    new_session=uuid4();expires=datetime.now(UTC)+timedelta(days=settings.session_days)
                    conn.execute(_q(schema,"INSERT INTO {s}.account_sessions(session_id,account_id,credential_hash,device_label,expires_at) VALUES(%s,%s,%s,%s,%s)"),(new_session,replay["account_id"],credential_hash(secret,settings.session_pepper),body.deviceLabel,expires));conn.execute(_q(schema,"UPDATE {s}.bootstrap_requests SET session_id=%s WHERE bootstrap_key_hash=%s"),(new_session,key_hash));replay={**replay,"session_id":new_session,"expires_at":expires}
                view = _account_view(conn, schema, replay["account_id"])
                view.update({"session": {"token": f'{replay["session_id"]}.{secret}', "expiresAt": replay["expires_at"]}, "datasetId": settings.dataset_id})
                return view
            account_id, session_id = uuid4(), uuid4()
            gamer_tag = f"Diver-{str(account_id)[:6]}"
            conn.execute(_q(schema, "INSERT INTO {s}.accounts(account_id) VALUES(%s)"), (account_id,))
            conn.execute(_q(schema, "INSERT INTO {s}.account_profile_revisions(account_id,revision,gamer_tag) VALUES(%s,1,%s)"), (account_id, gamer_tag))
            conn.execute(_q(schema, "INSERT INTO {s}.account_sessions(session_id,account_id,credential_hash,device_label,expires_at) VALUES(%s,%s,%s,%s,%s)"), (session_id, account_id, credential_hash(secret, settings.session_pepper), body.deviceLabel, expires))
            conn.execute(_q(schema, "INSERT INTO {s}.class_loadouts(account_id,class_id,portrait_id) SELECT %s,class_id,default_portrait_id FROM {s}.class_catalog WHERE default_available"), (account_id,))
            conn.execute(_q(schema, "INSERT INTO {s}.bootstrap_requests(bootstrap_key_hash,request_hash,account_id,session_id) VALUES(%s,%s,%s,%s)"), (key_hash, request_hash, account_id, session_id))
            view = _account_view(conn, schema, account_id)
            view.update({"session": {"token": f"{session_id}.{secret}", "expiresAt": expires}, "datasetId": settings.dataset_id})
            return view

    @app.get("/pvp/v2/me")
    def me(request: Request, auth: Principal = Depends(principal)) -> dict[str, Any]:
        with request.app.state.db.pool.connection() as conn:
            result = _account_view(conn, settings.db_schema, auth.account_id)
        result["datasetId"] = settings.dataset_id
        return result

    @app.patch("/pvp/v2/me/profile")
    def patch_profile(body: ProfilePatch, request: Request, key: str = Depends(idem_key), auth: Principal = Depends(principal)) -> dict[str, Any]:
        schema = settings.db_schema
        raw = body.model_dump(mode="json")
        with request.app.state.db.transaction() as conn:
            if replay := _dedup(conn, schema, auth.account_id, "profile", key, raw): return replay
            account = conn.execute(_q(schema, "SELECT current_profile_revision FROM {s}.accounts WHERE account_id=%s FOR UPDATE"), (auth.account_id,)).fetchone()
            if account["current_profile_revision"] != body.expectedRevision:
                raise ApiError(409, "PROFILE_CHANGED", "Profile revision is stale")
            revision = body.expectedRevision + 1
            conn.execute(_q(schema, "INSERT INTO {s}.account_profile_revisions(account_id,revision,gamer_tag) VALUES(%s,%s,%s)"), (auth.account_id, revision, body.gamerTag))
            conn.execute(_q(schema, "UPDATE {s}.accounts SET current_profile_revision=%s WHERE account_id=%s"), (revision, auth.account_id))
            response = {"profile": {"revision": revision, "gamerTag": body.gamerTag}}
            _save_dedup(conn, schema, auth.account_id, "profile", key, raw, 200, response)
            return response

    @app.put("/pvp/v2/me/classes/{class_id}/portrait")
    def put_portrait(class_id: str, body: PortraitPut, request: Request, key: str = Depends(idem_key), auth: Principal = Depends(principal)) -> dict[str, Any]:
        schema = settings.db_schema; raw = body.model_dump(mode="json") | {"classId": class_id}
        with request.app.state.db.transaction() as conn:
            if replay := _dedup(conn, schema, auth.account_id, "portrait", key, raw): return replay
            portrait = conn.execute(_q(schema, "SELECT default_available,artwork_revision FROM {s}.portrait_catalog WHERE portrait_id=%s AND class_id=%s AND active"), (body.portraitId, class_id)).fetchone()
            class_ok = conn.execute(_q(schema, "SELECT 1 FROM {s}.class_catalog c WHERE c.class_id=%s AND c.active AND (c.default_available OR EXISTS (SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=%s AND g.object_type='class' AND g.object_id=c.class_id AND g.active))"), (class_id, auth.account_id)).fetchone()
            portrait_ok = portrait and (portrait["default_available"] or conn.execute(_q(schema, "SELECT 1 FROM {s}.unlock_grants WHERE account_id=%s AND object_type='portrait' AND object_id=%s AND active"), (auth.account_id, body.portraitId)).fetchone())
            if not class_ok: raise ApiError(403, "CLASS_LOCKED", "Class is not available")
            if not portrait_ok: raise ApiError(403, "PORTRAIT_LOCKED", "Portrait is not available")
            current = conn.execute(_q(schema, "SELECT revision FROM {s}.class_loadouts WHERE account_id=%s AND class_id=%s FOR UPDATE"), (auth.account_id, class_id)).fetchone()
            if not current or current["revision"] != body.expectedRevision: raise ApiError(409, "LOADOUT_CHANGED", "Loadout revision is stale")
            revision = current["revision"] + 1
            conn.execute(_q(schema, "UPDATE {s}.class_loadouts SET portrait_id=%s,revision=%s,updated_at=clock_timestamp() WHERE account_id=%s AND class_id=%s"), (body.portraitId, revision, auth.account_id, class_id))
            response = {"loadout": {"classId": class_id, "portraitId": body.portraitId, "portraitRevision": portrait["artwork_revision"], "revision": revision}}
            _save_dedup(conn, schema, auth.account_id, "portrait", key, raw, 200, response)
            return response

    @app.post("/pvp/v2/runs", status_code=201)
    def register_run(body: RunRegistration, request: Request, key: str = Depends(idem_key), auth: Principal = Depends(principal)) -> dict[str, Any]:
        schema=settings.db_schema; raw=body.model_dump(mode="json")
        with request.app.state.db.transaction() as conn:
            if replay := _dedup(conn,schema,auth.account_id,"run",key,raw): return replay
            existing=conn.execute(_q(schema,"SELECT * FROM {s}.runs WHERE run_id=%s FOR UPDATE"),(body.runId,)).fetchone()
            expected=(auth.account_id,settings.dataset_id,body.originBuild["buildId"],body.originBuild["gameVersion"],body.originBuild["buildCommit"],body.importedLocal)
            if existing:
                actual=(existing["account_id"],existing["dataset_id"],existing["origin_build_id"],existing["origin_game_version"],existing["origin_build_commit"],existing["imported_local"])
                if actual != expected: raise ApiError(409,"RUN_OWNERSHIP_CONFLICT","Run is already registered with different immutable attributes")
                created=False
            else:
                conn.execute(_q(schema,"INSERT INTO {s}.runs(run_id,account_id,dataset_id,origin_build_id,origin_game_version,origin_build_commit,imported_local) VALUES(%s,%s,%s,%s,%s,%s,%s)"), (body.runId,*expected)); created=True
            response={"runId":str(body.runId),"datasetId":settings.dataset_id,"created":created,"progressionTrust":"client_reported"}
            _save_dedup(conn,schema,auth.account_id,"run",key,raw,201 if created else 200,response); return response

    @app.post("/pvp/v2/ghosts", status_code=201)
    def create_ghost(body: GhostUpload, request: Request, response: Response, key: str = Depends(idem_key), auth: Principal = Depends(principal)) -> dict[str, Any]:
        response.status_code=201
        if len(body.tacklebox.permanentHistory)>settings.knot_history_limit: raise ApiError(413,"SNAPSHOT_TOO_LARGE","Knot history exceeds configured limit")
        raw=body.model_dump(mode="json"); schema=settings.db_schema
        with request.app.state.db.pool.connection() as lookup:
            replay=_preflight_mutation(lookup,schema,auth.account_id,"ghost",key,raw,body.run.runId,settings.dataset_id)
            if replay:response.status_code=200;return replay
            manifest=lookup.execute(_q(schema,"SELECT * FROM {s}.release_manifests WHERE build_id=%s AND dataset_id=%s AND acceptance_state='accepted'"),(body.provenance.buildId,settings.dataset_id)).fetchone()
        if not manifest: raise ApiError(422,"CLIENT_UPDATE_REQUIRED","Build is not registered for this dataset")
        if any((manifest["build_commit"]!=body.provenance.buildCommit,manifest["game_version"]!=body.provenance.gameVersion,manifest["ruleset_id"]!=body.provenance.rulesetId,manifest["rating_version"]!=body.provenance.ratingVersion,manifest["matchmaking_pool_id"]!=body.provenance.matchmakingPoolId,body.provenance.datasetId!=settings.dataset_id)):
            raise ApiError(422,"UNSUPPORTED_RULESET","Snapshot provenance does not match the registered release")
        approved={key:manifest["manifest"].get(key) for key in ("gameVersion","buildCommit","buildId","contentHash","rulesetId","ratingVersion","matchmakingPoolId","datasetId","startHealthPolicy")}
        try: resolved=request.app.state.worker.call("resolve_and_rate",body.provenance.rulesetId,snapshot=raw,approvedManifest=approved)
        except WorkerRejected as exc: raise ApiError(422,"INVALID_SNAPSHOT",str(exc),fields=exc.error.get("fields")) from exc
        except WorkerUnavailable as exc: raise ApiError(503,"VALIDATOR_UNAVAILABLE",str(exc),retryable=True) from exc
        accepted=resolved.get("resolvedPayload")
        power=resolved.get("powerLevel")
        if not isinstance(accepted,dict) or not isinstance(power,(int,float)): raise ApiError(503,"VALIDATOR_UNAVAILABLE","Validator response was incomplete",retryable=True)
        with request.app.state.db.transaction() as conn:
            if replay:=_dedup(conn,schema,auth.account_id,"ghost",key,raw): response.status_code=200; return replay
            run=conn.execute(_q(schema,"SELECT 1 FROM {s}.runs WHERE run_id=%s AND account_id=%s AND dataset_id=%s FOR UPDATE"),(body.run.runId,auth.account_id,settings.dataset_id)).fetchone()
            if not run: raise ApiError(409,"RUN_OWNERSHIP_CONFLICT","Run is not registered to this account")
            profile=conn.execute(_q(schema,"SELECT gamer_tag FROM {s}.account_profile_revisions WHERE account_id=%s AND revision=%s"),(auth.account_id,body.identity.profileRevision)).fetchone()
            loadout=conn.execute(_q(schema,"SELECT l.portrait_id,p.artwork_revision FROM {s}.class_loadouts l JOIN {s}.class_catalog c ON c.class_id=l.class_id AND c.active JOIN {s}.portrait_catalog p ON p.portrait_id=l.portrait_id AND p.class_id=l.class_id AND p.active WHERE l.account_id=%s AND l.class_id=%s AND (c.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=l.account_id AND g.object_type='class' AND g.object_id=l.class_id AND g.active)) AND (p.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=l.account_id AND g.object_type='portrait' AND g.object_id=l.portrait_id AND g.active))"),(auth.account_id,body.identity.classId)).fetchone()
            if not profile or profile["gamer_tag"]!=body.identity.gamerTag: raise ApiError(409,"PROFILE_CHANGED","Captured profile revision does not match")
            if not loadout:raise ApiError(403,"PORTRAIT_LOCKED","Captured class or portrait is not currently authorized")
            if loadout["portrait_id"]!=body.identity.portraitId or str(loadout["artwork_revision"])!=str(body.identity.portraitRevision):
                requested=conn.execute(_q(schema,"SELECT 1 FROM {s}.portrait_catalog p WHERE p.portrait_id=%s AND p.class_id=%s AND p.active AND (p.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=%s AND g.object_type='portrait' AND g.object_id=p.portrait_id AND g.active))"),(body.identity.portraitId,body.identity.classId,auth.account_id)).fetchone()
                if not requested:raise ApiError(403,"PORTRAIT_LOCKED","Captured portrait is not currently authorized")
                raise ApiError(409,"LOADOUT_CHANGED","Captured portrait is not the current authorized loadout")
            ghost_id=uuid4(); submitted=digest(raw); accepted_hash=digest(accepted)
            try:
              with conn.transaction():
                conn.execute(_q(schema,"INSERT INTO {s}.pvp_encounters(encounter_id,run_id,account_id,dataset_id,floor,encounter_kind) VALUES(%s,%s,%s,%s,%s,'pvp')"),(body.run.encounterId,body.run.runId,auth.account_id,settings.dataset_id,body.run.floor))
                conn.execute(_q(schema,"INSERT INTO {s}.ghost_snapshots(ghost_id,account_id,run_id,encounter_id,dataset_id,build_id,ruleset_id,matchmaking_pool_id,rating_version,game_version,build_commit,floor,zone_id,mode,tier,power_level,captured_gamer_tag,captured_class_id,captured_portrait_id,captured_portrait_revision,captured_profile_revision,submission_hash,accepted_payload_hash,accepted_payload,captured_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"),(ghost_id,auth.account_id,body.run.runId,body.run.encounterId,settings.dataset_id,body.provenance.buildId,body.provenance.rulesetId,body.provenance.matchmakingPoolId,body.provenance.ratingVersion,body.provenance.gameVersion,body.provenance.buildCommit,body.run.floor,body.run.zoneId,body.run.mode,str(body.run.tier),power,body.identity.gamerTag,body.identity.classId,body.identity.portraitId,body.identity.portraitRevision,body.identity.profileRevision,submitted,accepted_hash,json.dumps(accepted),body.provenance.capturedAt))
                conn.execute(_q(schema,"INSERT INTO {s}.ghost_status(ghost_id) VALUES(%s)"),(ghost_id,))
            except errors.UniqueViolation:
                existing=conn.execute(_q(schema,"SELECT ghost_id,submission_hash,accepted_payload_hash,power_level FROM {s}.ghost_snapshots WHERE account_id=%s AND run_id=%s AND encounter_id=%s"),(auth.account_id,body.run.runId,body.run.encounterId)).fetchone()
                if not existing or existing["submission_hash"]!=submitted: raise ApiError(409,"CAPTURE_CONFLICT","Encounter already has a different immutable capture")
                ghost_id=existing["ghost_id"]; accepted_hash=existing["accepted_payload_hash"]; power=existing["power_level"]; response.status_code=200
            result={"ghostId":str(ghost_id),"schemaVersion":4,"gameVersion":body.provenance.gameVersion,"buildCommit":body.provenance.buildCommit,"datasetId":settings.dataset_id,"rulesetId":body.provenance.rulesetId,"matchmakingPoolId":body.provenance.matchmakingPoolId,"powerLevel":power,"ratingVersion":body.provenance.ratingVersion,"acceptedPayloadHash":accepted_hash,"validation":{"identity":"authorized","appearance":"authorized","build":"recomputed","progression":"client_reported"}}
            _save_dedup(conn,schema,auth.account_id,"ghost",key,raw,response.status_code,result); return result

    @app.get("/pvp/v2/me/ghosts")
    def ghost_history(request:Request,runId:UUID|None=None,cursor:datetime|None=None,limit:int=Query(50,ge=1,le=100),auth:Principal=Depends(principal))->dict[str,Any]:
        schema=settings.db_schema; clauses=["g.account_id=%s"];params:list[Any]=[auth.account_id]
        if runId:clauses.append("g.run_id=%s");params.append(runId)
        if cursor:clauses.append("g.received_at<%s");params.append(cursor)
        query="SELECT g.ghost_id,g.run_id,g.floor,g.captured_gamer_tag,g.captured_class_id,g.captured_portrait_id,g.game_version,g.build_commit,g.power_level,g.captured_at,g.received_at,s.state FROM {s}.ghost_snapshots g JOIN {s}.ghost_status s USING(ghost_id) WHERE "+" AND ".join(clauses)+" ORDER BY g.received_at DESC LIMIT %s";params.append(limit+1)
        with request.app.state.db.pool.connection() as conn:rows=conn.execute(_q(schema,query),params).fetchall()
        items=[{"ghostId":str(r["ghost_id"]),"runId":str(r["run_id"]),"floor":r["floor"],"gamerTag":r["captured_gamer_tag"],"classId":r["captured_class_id"],"portraitId":r["captured_portrait_id"],"gameVersion":r["game_version"],"buildCommit":r["build_commit"],"powerLevel":r["power_level"],"capturedAt":r["captured_at"],"status":r["state"]} for r in rows[:limit]]
        return {"items":items,"nextCursor":rows[limit-1]["received_at"] if len(rows)>limit else None}

    @app.get("/pvp/v2/me/ghosts/{ghost_id}")
    def ghost_detail(ghost_id:UUID,request:Request,auth:Principal=Depends(principal))->dict[str,Any]:
        with request.app.state.db.pool.connection() as conn:row=conn.execute(_q(settings.db_schema,"SELECT g.*,s.state,s.reason FROM {s}.ghost_snapshots g JOIN {s}.ghost_status s USING(ghost_id) WHERE g.ghost_id=%s AND g.account_id=%s"),(ghost_id,auth.account_id)).fetchone()
        if not row:raise ApiError(404,"GHOST_NOT_FOUND","Ghost was not found")
        return {"ghostId":str(row["ghost_id"]),"snapshot":row["accepted_payload"],"powerLevel":row["power_level"],"acceptedPayloadHash":row["accepted_payload_hash"],"status":{"state":row["state"],"reason":row["reason"]},"progressionTrust":row["progression_trust"],"receivedAt":row["received_at"]}

    @app.post("/pvp/v2/matches",status_code=201)
    def create_match(body:MatchRequest,request:Request,response:Response,key:str=Depends(idem_key),auth:Principal=Depends(principal))->dict[str,Any]:
        schema=settings.db_schema;raw=body.model_dump(mode="json")
        with request.app.state.db.transaction() as conn:
            if replay:=_dedup(conn,schema,auth.account_id,"match",key,raw):response.status_code=200;return replay
            own=conn.execute(_q(schema,"SELECT g.*,e.source FROM {s}.ghost_snapshots g JOIN {s}.pvp_encounters e USING(encounter_id) JOIN {s}.ghost_status st USING(ghost_id) WHERE g.ghost_id=%s AND g.account_id=%s AND g.run_id=%s AND g.encounter_id=%s AND st.state='eligible' FOR UPDATE OF e"),(body.ghostId,auth.account_id,body.runId,body.encounterId)).fetchone()
            if not own:raise ApiError(409,"GHOST_NOT_ELIGIBLE","Requester ghost is missing, not owned, or not eligible")
            if own["source"]=="local_generated":raise ApiError(409,"ENCOUNTER_SOURCE_CONFLICT","A reconciled local-generated encounter cannot request an online match")
            policy=conn.execute(_q(schema,"SELECT allowed_cross_zone FROM {s}.release_manifests WHERE build_id=%s AND dataset_id=%s AND acceptance_state='accepted'"),(own["build_id"],settings.dataset_id)).fetchone()
            if not policy:raise ApiError(422,"CLIENT_UPDATE_REQUIRED","Requester build is no longer accepted")
            previous=conn.execute(_q(schema,"SELECT * FROM {s}.pvp_matches WHERE requester_account_id=%s AND encounter_id=%s"),(auth.account_id,body.encounterId)).fetchone()
            if previous:
                result={"matchId":str(previous["match_id"]),"state":previous["state"],"opponent":previous["public_opponent"],"battleInput":previous["battle_input"],"reason":previous["selection_reason"],"selectionBand":previous["selection_band"],"rulesetId":previous["ruleset_id"]};_save_dedup(conn,schema,auth.account_id,"match",key,raw,200,result);response.status_code=200;return result
            candidates=conn.execute(_q(schema,"WITH ranked AS (SELECT g.*,row_number() OVER(PARTITION BY g.account_id ORDER BY (g.zone_id=%s) DESC,g.received_at DESC) rn FROM {s}.ghost_snapshots g JOIN {s}.ghost_status st USING(ghost_id) JOIN {s}.release_manifests rm ON rm.build_id=g.build_id AND rm.dataset_id=g.dataset_id AND rm.acceptance_state='accepted' WHERE st.state='eligible' AND g.dataset_id=%s AND g.matchmaking_pool_id=%s AND g.ruleset_id=%s AND g.rating_version=%s AND g.floor=%s AND g.mode=%s AND g.tier=%s AND g.account_id<>%s AND (g.zone_id=%s OR %s) AND g.received_at>clock_timestamp()-interval '30 days') SELECT * FROM ranked WHERE rn=1 AND abs(power_level-%s)<=greatest(%s*0.30,10) ORDER BY CASE WHEN abs(power_level-%s)<=greatest(%s*0.15,10) THEN 0 ELSE 1 END,(zone_id=%s) DESC,md5(ghost_id::text||%s) LIMIT 1"),(own["zone_id"],settings.dataset_id,own["matchmaking_pool_id"],own["ruleset_id"],own["rating_version"],own["floor"],own["mode"],own["tier"],auth.account_id,own["zone_id"],policy["allowed_cross_zone"],own["power_level"],own["power_level"],own["power_level"],own["power_level"],own["zone_id"],str(body.encounterId))).fetchone()
            seed=int.from_bytes(hashlib.sha256(f"{body.encounterId}:{body.ghostId}".encode()).digest()[:6],"big")
            try:
                if candidates:
                    projection=request.app.state.worker.call("opponent",own["ruleset_id"],snapshot=candidates["accepted_payload"])
                    captured=candidates["accepted_payload"]; public_snapshot={"schemaVersion":4,"provenance":{k:captured["provenance"][k] for k in ("gameVersion","buildCommit","rulesetId","ratingVersion","matchmakingPoolId")},"identity":{k:captured["identity"][k] for k in ("gamerTag","classId","portraitId","portraitRevision")},"roster":captured["roster"],"combat":{"startHealthPolicy":projection["startHealthPolicy"],"units":projection["specs"]},"tacklebox":captured["tacklebox"],"equipmentAttribution":captured["equipmentAttribution"]}
                    public={"source":"player_ghost","ghostId":str(candidates["ghost_id"]),"displayName":candidates["captured_gamer_tag"],"classId":candidates["captured_class_id"],"portraitId":candidates["captured_portrait_id"],"portraitRevision":candidates["captured_portrait_revision"],"floor":candidates["floor"],"gameVersion":candidates["game_version"],"buildCommit":candidates["build_commit"],"powerLevel":candidates["power_level"],"rulesetId":candidates["ruleset_id"],"snapshot":public_snapshot};battle={"requesterSpecs":[u["entrySpec"] for u in own["accepted_payload"]["combat"]["units"]],"requesterSlots":[{"unitId":u["unitId"],"memberKey":u["memberKey"],"slot":u["slot"]} for u in own["accepted_payload"]["combat"]["units"]],"opponentSpecs":projection["specs"],"seed":seed,"startHealthPolicy":projection["startHealthPolicy"],"battleRulesVersion":own["accepted_payload"]["provenance"]["battleRulesVersion"]};kind="player_ghost";opp=candidates["ghost_id"];diff=abs(candidates["power_level"]-own["power_level"]);band="15_percent" if diff<=max(own["power_level"]*.15,10) else "30_percent";reason="compatible_player_ghost"
                else:
                    generated=request.app.state.worker.call("generate",own["ruleset_id"],seed=seed,context={"floor":own["floor"]});public=generated["publicOpponent"];battle={**generated["battleInput"],"requesterSpecs":[u["entrySpec"] for u in own["accepted_payload"]["combat"]["units"]],"requesterSlots":[{"unitId":u["unitId"],"memberKey":u["memberKey"],"slot":u["slot"]} for u in own["accepted_payload"]["combat"]["units"]],"battleRulesVersion":own["accepted_payload"]["provenance"]["battleRulesVersion"]};kind="generated";opp=None;diff=None;band="generated";reason="no_compatible_opponent"
            except WorkerRejected as exc:raise ApiError(422,"UNSUPPORTED_RULESET",str(exc),fields=exc.error.get("fields")) from exc
            except WorkerUnavailable as exc:raise ApiError(503,"VALIDATOR_UNAVAILABLE",str(exc),retryable=True) from exc
            match_id=uuid4();conn.execute(_q(schema,"INSERT INTO {s}.pvp_matches(match_id,requester_ghost_id,requester_account_id,run_id,encounter_id,opponent_ghost_id,opponent_kind,seed,ruleset_id,battle_input,public_opponent,selection_reason,selection_band,rating_difference) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"),(match_id,body.ghostId,auth.account_id,body.runId,body.encounterId,opp,kind,str(seed),own["ruleset_id"],json.dumps(battle),json.dumps(public),reason,band,diff));conn.execute(_q(schema,"UPDATE {s}.pvp_encounters SET lifecycle='proposed' WHERE encounter_id=%s"),(body.encounterId,))
            result={"matchId":str(match_id),"state":"proposed","opponent":public,"battleInput":battle,"seed":seed,"reason":reason,"selectionBand":band,"rulesetId":own["ruleset_id"]};_save_dedup(conn,schema,auth.account_id,"match",key,raw,201,result);return result

    @app.post("/pvp/v2/matches/{match_id}/start")
    def start_match(match_id:UUID,body:MatchStart,request:Request,key:str=Depends(idem_key),auth:Principal=Depends(principal))->dict[str,Any]:
        schema=settings.db_schema;raw=body.model_dump(mode="json")|{"matchId":str(match_id)}
        with request.app.state.db.transaction() as conn:
            if replay:=_dedup(conn,schema,auth.account_id,"match-start",key,raw):return replay
            match=conn.execute(_q(schema,"SELECT * FROM {s}.pvp_matches WHERE match_id=%s AND requester_account_id=%s FOR UPDATE"),(match_id,auth.account_id)).fetchone()
            if not match or match["encounter_id"]!=body.encounterId:raise ApiError(404,"MATCH_NOT_FOUND","Match was not found")
            if match["state"]=="abandoned_before_start":raise ApiError(409,"MATCH_ABANDONED","Match was already reconciled as unused")
            if match["state"]=="completed":raise ApiError(409,"MATCH_COMPLETED","Match is already complete")
            if match["state"]=="proposed":conn.execute(_q(schema,"UPDATE {s}.pvp_matches SET state='started',started_at=clock_timestamp() WHERE match_id=%s"),(match_id,));conn.execute(_q(schema,"UPDATE {s}.pvp_encounters SET source='online_match',lifecycle='started' WHERE encounter_id=%s"),(body.encounterId,))
            result={"matchId":str(match_id),"state":"started","battleInput":match["battle_input"]};_save_dedup(conn,schema,auth.account_id,"match-start",key,raw,200,result);return result

    @app.put("/pvp/v2/matches/{match_id}/result",status_code=201)
    def put_result(match_id:UUID,body:ResultPut,request:Request,response:Response,key:str=Depends(idem_key),auth:Principal=Depends(principal))->dict[str,Any]:
        response.status_code=201
        schema=settings.db_schema;raw=body.model_dump(mode="json")
        with request.app.state.db.transaction() as conn:
            if replay:=_dedup(conn,schema,auth.account_id,"result",key,raw):response.status_code=200;return replay
            match=conn.execute(_q(schema,"SELECT * FROM {s}.pvp_matches WHERE match_id=%s AND requester_account_id=%s FOR UPDATE"),(match_id,auth.account_id)).fetchone()
            if not match or match["encounter_id"]!=body.encounterId:raise ApiError(404,"MATCH_NOT_FOUND","Match was not found")
            if match["state"]=="abandoned_before_start":raise ApiError(409,"MATCH_ABANDONED","Match was reconciled as unused")
            if match["state"] not in ("started","completed"):raise ApiError(409,"MATCH_NOT_STARTED","Only a started match can accept a result")
            existing=conn.execute(_q(schema,"SELECT payload_hash,result_id FROM {s}.pvp_results WHERE encounter_id=%s"),(body.encounterId,)).fetchone()
            payload_hash=digest(raw)
            if existing and existing["payload_hash"]!=payload_hash:raise ApiError(409,"RESULT_CONFLICT","First accepted result is immutable")
            if existing:result_id=existing["result_id"];response.status_code=200
            else:
                result_id=uuid4();conn.execute(_q(schema,"INSERT INTO {s}.pvp_results(result_id,account_id,encounter_id,match_id,outcome,reported_payload,payload_hash) VALUES(%s,%s,%s,%s,%s,%s,%s)"),(result_id,auth.account_id,body.encounterId,match_id,body.outcome,json.dumps(raw),payload_hash));conn.execute(_q(schema,"UPDATE {s}.pvp_matches SET state='completed' WHERE match_id=%s"),(match_id,));conn.execute(_q(schema,"UPDATE {s}.pvp_encounters SET lifecycle='completed' WHERE encounter_id=%s"),(body.encounterId,))
            result={"resultId":str(result_id),"matchId":str(match_id),"outcome":body.outcome,"outcomeTrust":"client_reported","progressionTrust":"client_reported","accountRewardsGranted":False};_save_dedup(conn,schema,auth.account_id,"result",key,raw,response.status_code,result);return result

    @app.get("/pvp/v2/leaderboard")
    def leaderboard(request:Request,limit:int=Query(50,ge=1,le=100))->dict[str,Any]:
        with request.app.state.db.pool.connection() as conn:
            current=conn.execute(_q(settings.db_schema,"SELECT matchmaking_pool_id FROM {s}.release_manifests WHERE dataset_id=%s AND acceptance_state='accepted' ORDER BY created_at DESC LIMIT 1"),(settings.dataset_id,)).fetchone()
            rows=[] if not current else conn.execute(_q(settings.db_schema,"WITH ranked AS (SELECT g.*,row_number() OVER(PARTITION BY account_id ORDER BY floor DESC,power_level DESC,received_at DESC) rn FROM {s}.ghost_snapshots g JOIN {s}.ghost_status st USING(ghost_id) JOIN {s}.release_manifests rm ON rm.build_id=g.build_id AND rm.dataset_id=g.dataset_id AND rm.acceptance_state='accepted' WHERE g.dataset_id=%s AND g.matchmaking_pool_id=%s AND st.state='eligible') SELECT * FROM ranked WHERE rn=1 ORDER BY floor DESC,power_level DESC LIMIT %s"),(settings.dataset_id,current["matchmaking_pool_id"],limit)).fetchall()
        return {"datasetId":settings.dataset_id,"matchmakingPoolId":current["matchmaking_pool_id"] if current else None,"metric":"highest_floor_then_power","progressionTrust":"client_reported","items":[{"ghostId":str(r["ghost_id"]),"gamerTag":r["captured_gamer_tag"],"classId":r["captured_class_id"],"portraitId":r["captured_portrait_id"],"floor":r["floor"],"powerLevel":r["power_level"],"gameVersion":r["game_version"]} for r in rows]}

    @app.post("/pvp/v2/offline-encounters",status_code=201)
    def offline_encounter(body:OfflineEncounter,request:Request,response:Response,key:str=Depends(idem_key),auth:Principal=Depends(principal))->dict[str,Any]:
        response.status_code=201
        schema=settings.db_schema; raw=body.model_dump(mode="json"); capture=body.capture
        if body.runId!=capture.run.runId or body.encounterId!=capture.run.encounterId or body.result.encounterId!=body.encounterId:raise ApiError(422,"INVALID_OFFLINE_ENCOUNTER","Run and encounter identities must agree")
        with request.app.state.db.pool.connection() as conn:
            replay=_preflight_mutation(conn,schema,auth.account_id,"offline-encounter",key,raw,body.runId,settings.dataset_id)
            if replay:response.status_code=200;return replay
            manifest=conn.execute(_q(schema,"SELECT * FROM {s}.release_manifests WHERE build_id=%s AND dataset_id=%s AND acceptance_state='accepted'"),(capture.provenance.buildId,settings.dataset_id)).fetchone()
        if not manifest:raise ApiError(422,"CLIENT_UPDATE_REQUIRED","Build is not registered for this dataset")
        approved={k:manifest["manifest"].get(k) for k in ("gameVersion","buildCommit","buildId","contentHash","rulesetId","ratingVersion","matchmakingPoolId","datasetId","startHealthPolicy")}
        try:resolved=request.app.state.worker.call("resolve_and_rate",capture.provenance.rulesetId,snapshot=capture.model_dump(mode="json"),approvedManifest=approved)
        except WorkerRejected as exc:raise ApiError(422,"INVALID_SNAPSHOT",str(exc),fields=exc.error.get("fields")) from exc
        except WorkerUnavailable as exc:raise ApiError(503,"VALIDATOR_UNAVAILABLE",str(exc),retryable=True) from exc
        accepted=resolved.get("resolvedPayload");power=resolved.get("powerLevel")
        if not isinstance(accepted,dict) or not isinstance(power,(int,float)):raise ApiError(503,"VALIDATOR_UNAVAILABLE","Validator response was incomplete",retryable=True)
        with request.app.state.db.transaction() as conn:
            if replay:=_dedup(conn,schema,auth.account_id,"offline-encounter",key,raw):response.status_code=200;return replay
            if not conn.execute(_q(schema,"SELECT 1 FROM {s}.runs WHERE run_id=%s AND account_id=%s AND dataset_id=%s FOR UPDATE"),(body.runId,auth.account_id,settings.dataset_id)).fetchone():raise ApiError(409,"RUN_OWNERSHIP_CONFLICT","Run is not registered to this account")
            proposal=conn.execute(_q(schema,"SELECT match_id,state FROM {s}.pvp_matches WHERE requester_account_id=%s AND encounter_id=%s FOR UPDATE"),(auth.account_id,body.encounterId)).fetchone()
            if proposal and proposal["state"]!="proposed":raise ApiError(409,"ENCOUNTER_SOURCE_CONFLICT","A started online match cannot become local-generated")
            if proposal:conn.execute(_q(schema,"UPDATE {s}.pvp_matches SET state='abandoned_before_start',abandoned_at=clock_timestamp() WHERE match_id=%s"),(proposal["match_id"],))
            existing=conn.execute(_q(schema,"SELECT g.ghost_id,g.submission_hash,r.result_id,r.payload_hash FROM {s}.ghost_snapshots g JOIN {s}.pvp_results r USING(encounter_id) WHERE g.account_id=%s AND g.encounter_id=%s"),(auth.account_id,body.encounterId)).fetchone(); capture_raw=capture.model_dump(mode="json"); submission=digest(capture_raw);result_hash=digest(body.result.model_dump(mode="json"))
            if existing:
                if existing["submission_hash"]!=submission or existing["payload_hash"]!=result_hash:raise ApiError(409,"OFFLINE_RECONCILIATION_CONFLICT","Offline encounter was already reconciled differently")
                ghost_id=existing["ghost_id"];result_id=existing["result_id"];response.status_code=200
            else:
                profile=conn.execute(_q(schema,"SELECT gamer_tag FROM {s}.account_profile_revisions WHERE account_id=%s AND revision=%s"),(auth.account_id,capture.identity.profileRevision)).fetchone()
                if not profile or profile["gamer_tag"]!=capture.identity.gamerTag:raise ApiError(409,"PROFILE_CHANGED","Captured profile revision does not match")
                loadout=conn.execute(_q(schema,"SELECT l.portrait_id,p.artwork_revision FROM {s}.class_loadouts l JOIN {s}.class_catalog c ON c.class_id=l.class_id AND c.active JOIN {s}.portrait_catalog p ON p.portrait_id=l.portrait_id AND p.class_id=l.class_id AND p.active WHERE l.account_id=%s AND l.class_id=%s AND (c.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=l.account_id AND g.object_type='class' AND g.object_id=l.class_id AND g.active)) AND (p.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=l.account_id AND g.object_type='portrait' AND g.object_id=l.portrait_id AND g.active))"),(auth.account_id,capture.identity.classId)).fetchone()
                if not loadout:raise ApiError(403,"PORTRAIT_LOCKED","Captured class or portrait is not currently authorized")
                if loadout["portrait_id"]!=capture.identity.portraitId or str(loadout["artwork_revision"])!=str(capture.identity.portraitRevision):
                    requested=conn.execute(_q(schema,"SELECT 1 FROM {s}.portrait_catalog p WHERE p.portrait_id=%s AND p.class_id=%s AND p.active AND (p.default_available OR EXISTS(SELECT 1 FROM {s}.unlock_grants g WHERE g.account_id=%s AND g.object_type='portrait' AND g.object_id=p.portrait_id AND g.active))"),(capture.identity.portraitId,capture.identity.classId,auth.account_id)).fetchone()
                    if not requested:raise ApiError(403,"PORTRAIT_LOCKED","Captured portrait is not currently authorized")
                    raise ApiError(409,"LOADOUT_CHANGED","Captured portrait is not the current authorized loadout")
                ghost_id=uuid4();result_id=uuid4();conn.execute(_q(schema,"INSERT INTO {s}.pvp_encounters(encounter_id,run_id,account_id,dataset_id,floor,encounter_kind,source,lifecycle,local_generated_input) VALUES(%s,%s,%s,%s,%s,'pvp','local_generated','completed',%s)"),(body.encounterId,body.runId,auth.account_id,settings.dataset_id,capture.run.floor,json.dumps(body.localGeneratedInput)))
                conn.execute(_q(schema,"INSERT INTO {s}.ghost_snapshots(ghost_id,account_id,run_id,encounter_id,dataset_id,build_id,ruleset_id,matchmaking_pool_id,rating_version,game_version,build_commit,floor,zone_id,mode,tier,power_level,captured_gamer_tag,captured_class_id,captured_portrait_id,captured_portrait_revision,captured_profile_revision,submission_hash,accepted_payload_hash,accepted_payload,captured_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"),(ghost_id,auth.account_id,body.runId,body.encounterId,settings.dataset_id,capture.provenance.buildId,capture.provenance.rulesetId,capture.provenance.matchmakingPoolId,capture.provenance.ratingVersion,capture.provenance.gameVersion,capture.provenance.buildCommit,capture.run.floor,capture.run.zoneId,capture.run.mode,str(capture.run.tier),power,capture.identity.gamerTag,capture.identity.classId,capture.identity.portraitId,capture.identity.portraitRevision,capture.identity.profileRevision,submission,digest(accepted),json.dumps(accepted),capture.provenance.capturedAt));conn.execute(_q(schema,"INSERT INTO {s}.ghost_status(ghost_id) VALUES(%s)"),(ghost_id,));conn.execute(_q(schema,"INSERT INTO {s}.pvp_results(result_id,account_id,encounter_id,outcome,reported_payload,payload_hash) VALUES(%s,%s,%s,%s,%s,%s)"),(result_id,auth.account_id,body.encounterId,body.result.outcome,json.dumps(body.result.model_dump(mode="json")),result_hash))
            result={"encounterId":str(body.encounterId),"ghostId":str(ghost_id),"resultId":str(result_id),"source":"local_generated","proposalAbandoned":bool(proposal),"outcomeTrust":"client_reported","progressionTrust":"client_reported","accountRewardsGranted":False};_save_dedup(conn,schema,auth.account_id,"offline-encounter",key,raw,response.status_code,result);return result

    @app.api_route("/pvp/{legacy_path:path}",methods=["POST","PUT","PATCH"])
    def legacy_write(legacy_path:str)->None:raise ApiError(410,"LEGACY_CLIENT_RETIRED","Upgrade required; legacy writes are retired")

    @app.get("/pvp/opponent")
    def legacy_opponent()->dict[str,Any]:return {"found":False,"upgradeRequired":True}

    @app.get("/pvp/leaderboard")
    def legacy_leaderboard()->dict[str,Any]:return {"season":None,"seasons":[],"entries":[],"upgradeRequired":True}

    @app.get("/pvp/player-name")
    def legacy_player_name()->dict[str,Any]:return {"displayName":None,"upgradeRequired":True}

    @app.get("/pvp/health")
    def legacy_health()->dict[str,Any]:return {"status":"ok","legacy":"retired","v2":"/pvp/v2/ready"}

    return app
