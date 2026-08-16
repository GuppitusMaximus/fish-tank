#!/usr/bin/env python3
"""FastAPI PvP ghost service for Fathom Fall matchmaking.

Players upload party snapshots after PvP battles; opponents receive real
player compositions instead of procedural ghosts.

Run with: uvicorn app_pvp:app --host 127.0.0.1 --port 8002
"""

import json
import logging
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Query, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Any, List, Optional

from psycopg2.extras import Json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from auth import verify_jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "")


# --- Constants ---

VALID_SPECIES = ["pufferfish", "swordfish", "seahorse", "guppy", "dog"]
VALID_CHARACTERS = ["andy", "saba"]
MATCHMAKING_BRACKET = 0.15
MATCHMAKING_BRACKET_WIDE = 0.30


# --- App ---

app = FastAPI(title="FishTank PvP Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://the-fish-tank.com", "http://localhost:5173"],
    allow_origin_regex=r"https://([a-z0-9-]+\.)?fathomfall\.com|https://([a-z0-9-]+\.)?fathomfall\.pages\.dev",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --- Structured JSON Logging ---

class JSONFormatter(logging.Formatter):
    EXTRA_FIELDS = ("event", "floor", "power_level", "found", "bracket_size",
                    "duration_ms", "status_code", "error", "path")

    def format(self, record):
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        for key in self.EXTRA_FIELDS:
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        return json.dumps(entry)


logger = logging.getLogger("pvp_service")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(JSONFormatter())
logger.addHandler(_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error("Validation error", extra={
        "event": "validation_error",
        "path": request.url.path,
        "error": str(exc.errors())[:500]
    })
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# --- State & Metrics ---

_start_time = time.time()

_metrics = {
    "snapshot_upload_count": 0,
    "matchmaking_requests": 0,
    "matchmaking_hits": 0,
    "matchmaking_fallbacks": 0,
}


# --- Auth ---

def require_admin(request: Request):
    if not JWT_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = verify_jwt(request.headers.get("Authorization"), JWT_SECRET)
    if payload is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return payload


# --- Rate Limiting ---

_rate_lock = threading.Lock()
_rate_buckets = {}


def _client_ip(request: Request):
    forwarded = request.headers.get("CF-Connecting-IP")
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


_rate_sweep_counter = 0


def _sweep_rate_buckets(now, window):
    stale = [k for k, ts in _rate_buckets.items() if not ts or now - ts[-1] >= window]
    for k in stale:
        _rate_buckets.pop(k, None)


def rate_limit(request: Request, key: str, limit: int, window: int = 60):
    global _rate_sweep_counter
    now = time.time()
    ip = _client_ip(request)
    bucket_key = (key, ip)
    with _rate_lock:
        _rate_sweep_counter += 1
        if _rate_sweep_counter >= 1000:
            _rate_sweep_counter = 0
            _sweep_rate_buckets(now, window)
        timestamps = [t for t in _rate_buckets.get(bucket_key, []) if now - t < window]
        if len(timestamps) >= limit:
            _rate_buckets[bucket_key] = timestamps
            raise HTTPException(status_code=429, detail="Too many requests")
        timestamps.append(now)
        _rate_buckets[bucket_key] = timestamps


# --- Validation Models ---

class FishSnapshot(BaseModel):
    speciesId: str
    level: int
    moves: List[str] = Field(max_length=8)
    name: Optional[str] = None
    hp: Optional[int] = None
    maxHp: Optional[int] = None
    atk: Optional[int] = None
    def_: Optional[int] = Field(None, alias='def')
    spd: Optional[int] = None
    healPower: Optional[int] = None
    shield: Optional[int] = None
    maxShield: Optional[int] = None
    color: Optional[Any] = None
    effectAffinity: Optional[Any] = None
    effectResistance: Optional[Any] = None
    isCompanion: Optional[bool] = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def _cap_size(self):
        if len(json.dumps(self.model_dump())) > 8192:
            raise ValueError("fish snapshot too large")
        return self

    @field_validator("speciesId")
    @classmethod
    def valid_species(cls, v):
        if v not in VALID_SPECIES:
            raise ValueError(f"Invalid speciesId: {v}. Must be one of {VALID_SPECIES}")
        return v

    @field_validator("level")
    @classmethod
    def valid_level(cls, v):
        if not 1 <= v <= 20:
            raise ValueError(f"Level must be 1-20, got {v}")
        return v


class SnapshotUpload(BaseModel):
    playerId: str
    character: str
    floor: int = Field(ge=1, le=999)
    fish: List[FishSnapshot] = Field(min_length=1, max_length=3)
    powerLevel: float = Field(ge=0, le=5000)
    equipment: Optional[List] = Field(None, max_length=50)
    companion: Optional[dict] = None
    companionLevel: Optional[int] = None

    @field_validator("playerId")
    @classmethod
    def valid_player_id(cls, v):
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError(f"playerId must be UUID format, got {v}")
        return v

    @field_validator("equipment")
    @classmethod
    def valid_equipment(cls, v):
        if v is not None and len(json.dumps(v)) > 16384:
            raise ValueError("equipment payload too large")
        return v

    @field_validator("companion")
    @classmethod
    def valid_companion(cls, v):
        if v is not None:
            if len(v) > 50:
                raise ValueError("companion has too many fields")
            if len(json.dumps(v)) > 16384:
                raise ValueError("companion payload too large")
        return v

    @field_validator("character")
    @classmethod
    def valid_character(cls, v):
        if v not in VALID_CHARACTERS:
            raise ValueError(f"Invalid character: {v}. Must be one of {VALID_CHARACTERS}")
        return v


# --- Helpers ---

def _check_db():
    from db import get_connection
    try:
        with get_connection() as conn:
            conn.cursor().execute("SELECT 1")
        return "ok"
    except Exception:
        return "error"


def _find_opponent(floor, power_level, exclude_player_id=None, bracket=MATCHMAKING_BRACKET):
    from db import get_connection
    low = power_level * (1 - bracket)
    high = power_level * (1 + bracket)

    with get_connection() as conn:
        with conn.cursor() as cur:
            if exclude_player_id:
                cur.execute("""
                    SELECT ps.player_id, ps.character, ps.floor, ps.fish, ps.equipment,
                           ps.companion_level, ps.power_level, ps.companion,
                           COALESCE(p.display_name, 'Angler') as display_name
                    FROM party_snapshots ps
                    LEFT JOIN players p ON p.id::text = ps.player_id
                    WHERE ps.floor = %s
                      AND ps.power_level BETWEEN %s AND %s
                      AND ps.player_id != %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor, low, high, exclude_player_id))
            else:
                cur.execute("""
                    SELECT ps.player_id, ps.character, ps.floor, ps.fish, ps.equipment,
                           ps.companion_level, ps.power_level, ps.companion,
                           COALESCE(p.display_name, 'Angler') as display_name
                    FROM party_snapshots ps
                    LEFT JOIN players p ON p.id::text = ps.player_id
                    WHERE ps.floor = %s
                      AND ps.power_level BETWEEN %s AND %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor, low, high))
            return cur.fetchone()


def _find_any_opponent(floor, exclude_player_id=None):
    """Last-resort matchmaking: any opponent on the same floor, ignoring power level."""
    from db import get_connection
    with get_connection() as conn:
        with conn.cursor() as cur:
            if exclude_player_id:
                cur.execute("""
                    SELECT ps.player_id, ps.character, ps.floor, ps.fish, ps.equipment,
                           ps.companion_level, ps.power_level, ps.companion,
                           COALESCE(p.display_name, 'Angler') as display_name
                    FROM party_snapshots ps
                    LEFT JOIN players p ON p.id::text = ps.player_id
                    WHERE ps.floor = %s
                      AND ps.player_id != %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor, exclude_player_id))
            else:
                cur.execute("""
                    SELECT ps.player_id, ps.character, ps.floor, ps.fish, ps.equipment,
                           ps.companion_level, ps.power_level, ps.companion,
                           COALESCE(p.display_name, 'Angler') as display_name
                    FROM party_snapshots ps
                    LEFT JOIN players p ON p.id::text = ps.player_id
                    WHERE ps.floor = %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor,))
            return cur.fetchone()


# --- Endpoints ---

@app.get("/pvp/health")
def health():
    uptime = int(time.time() - _start_time)
    return {
        "service": "pvp",
        "version": "1.0.0",
        "uptime_seconds": uptime,
        "database": _check_db(),
    }


@app.post("/pvp/snapshot")
def upload_snapshot(snapshot: SnapshotUpload, request: Request):
    rate_limit(request, "snapshot", 30)
    start = time.time()
    from db import get_connection

    fish_data = [f.model_dump(by_alias=True) for f in snapshot.fish]

    with get_connection() as conn:
        with conn.cursor() as cur:
            default_name = f'Angler#{snapshot.playerId[:4]}'
            cur.execute("""
                INSERT INTO players (id, display_name, platform)
                VALUES (%s, %s, 'web')
                ON CONFLICT (id) DO NOTHING
            """, (snapshot.playerId, default_name))
            cur.execute("""
                INSERT INTO party_snapshots
                    (player_id, character, floor, fish, equipment, companion, companion_level, power_level)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (snapshot.playerId, snapshot.character, snapshot.floor,
                  Json(fish_data),
                  Json(snapshot.equipment) if snapshot.equipment else None,
                  Json(snapshot.companion) if snapshot.companion else None,
                  snapshot.companionLevel, snapshot.powerLevel))
        conn.commit()

    _metrics["snapshot_upload_count"] += 1
    duration_ms = int((time.time() - start) * 1000)
    logger.info("Snapshot uploaded", extra={
        "event": "snapshot_upload", "floor": snapshot.floor,
        "power_level": snapshot.powerLevel, "duration_ms": duration_ms,
    })

    return {"status": "ok"}


@app.get("/pvp/opponent")
def get_opponent(
    request: Request,
    floor: int = Query(..., ge=1),
    powerLevel: float = Query(..., ge=0),
    playerId: Optional[str] = Query(None),
):
    rate_limit(request, "opponent", 60)
    start = time.time()
    _metrics["matchmaking_requests"] += 1

    row = _find_opponent(floor, powerLevel, playerId, MATCHMAKING_BRACKET)
    bracket_used = "narrow"

    if not row:
        row = _find_opponent(floor, powerLevel, playerId, MATCHMAKING_BRACKET_WIDE)
        bracket_used = "wide"

    if not row:
        row = _find_any_opponent(floor, playerId)
        bracket_used = "any"

    duration_ms = int((time.time() - start) * 1000)

    if not row:
        _metrics["matchmaking_fallbacks"] += 1
        logger.info("Matchmaking fallback", extra={
            "event": "matchmaking", "found": False, "bracket_size": bracket_used,
            "duration_ms": duration_ms,
        })
        return {"found": False}

    _metrics["matchmaking_hits"] += 1

    snapshot = {
        "playerId": row[0],
        "character": row[1],
        "floor": row[2],
        "fish": row[3],
        "equipment": row[4],
        "companionLevel": row[5],
        "powerLevel": row[6],
        "companion": row[7],
        "displayName": row[8],
    }

    logger.info("Matchmaking hit", extra={
        "event": "matchmaking", "found": True, "bracket_size": bracket_used,
        "duration_ms": duration_ms,
    })

    return {"found": True, "snapshot": snapshot}


@app.get("/pvp/leaderboard")
def leaderboard(request: Request, limit: int = Query(20, ge=1, le=100), season: str = Query(None)):
    rate_limit(request, "leaderboard", 60)
    from db import get_connection
    now = datetime.now(timezone.utc)

    if season is None:
        season = now.strftime("%Y-%m")

    if season == "all":
        where_clause = ""
        params = []
    elif re.match(r"^\d{4}-(0[1-9]|1[0-2])$", season):
        year, month = int(season[:4]), int(season[5:])
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            next_month_start = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_month_start = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        where_clause = "WHERE ps.created_at >= %s AND ps.created_at < %s"
        params = [month_start, next_month_start]
    else:
        raise HTTPException(status_code=400, detail="invalid season")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT ps.player_id, ps.character,
                       MAX(ps.floor) as highest_floor,
                       COUNT(*) as snapshots,
                       MAX(ps.power_level) as peak_power,
                       COALESCE(p.display_name, 'Angler') as display_name
                FROM party_snapshots ps
                LEFT JOIN players p ON p.id::text = ps.player_id
                {where_clause}
                GROUP BY ps.player_id, ps.character, p.display_name
                ORDER BY highest_floor DESC, peak_power DESC
                LIMIT %s
            """, params + [limit])
            rows = cur.fetchall()

            cur.execute("""
                SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
                FROM party_snapshots
                ORDER BY 1 DESC
            """)
            seasons = [r[0] for r in cur.fetchall()]

    entries = [
        {
            "playerId": row[0],
            "character": row[1],
            "highestFloor": row[2],
            "snapshots": row[3],
            "peakPower": row[4],
            "displayName": row[5],
        }
        for row in rows
    ]

    return {"season": season, "seasons": seasons, "entries": entries}


class SetNameRequest(BaseModel):
    playerId: str
    displayName: str

    @field_validator("playerId")
    @classmethod
    def valid_player_id(cls, v):
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError(f"playerId must be UUID format, got {v}")
        return v

    @field_validator("displayName")
    @classmethod
    def valid_display_name(cls, v):
        v = re.sub(r'[\x00-\x1f\x7f]', '', v).strip()
        if not v or len(v) > 20:
            raise ValueError("displayName must be 1-20 characters after stripping whitespace")
        return v


def _is_default_name(name, player_id):
    if not name:
        return True
    if name == "Angler":
        return True
    if name == f"Angler#{player_id[:4]}":
        return True
    return False


@app.post("/pvp/set-name")
def set_name(req: SetNameRequest, request: Request):
    rate_limit(request, "set_name", 10)
    from db import get_connection
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT display_name FROM players WHERE id = %s", (req.playerId,))
            row = cur.fetchone()
            if row and not _is_default_name(row[0], req.playerId):
                raise HTTPException(status_code=403, detail="This player already has a custom name")
            cur.execute("""
                INSERT INTO players (id, display_name, platform)
                VALUES (%s, %s, 'web')
                ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
            """, (req.playerId, req.displayName))
        conn.commit()
    return {"success": True, "displayName": req.displayName}


@app.get("/pvp/player-name")
def player_name(playerId: str = Query(...)):
    try:
        uuid.UUID(playerId)
    except ValueError:
        raise HTTPException(status_code=400, detail="playerId must be UUID format")
    from db import get_connection
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT display_name FROM players WHERE id = %s", (playerId,))
            row = cur.fetchone()
    name = row[0] if row else "Angler"
    return {"displayName": name}


@app.get("/pvp/admin/stats")
def admin_stats(_admin=Depends(require_admin)):
    from db import get_connection
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM players")
            total_players = cur.fetchone()[0]

            cur.execute("""
                SELECT COUNT(DISTINCT ps.player_id)
                FROM party_snapshots ps
                WHERE ps.created_at >= %s
            """, (month_start,))
            active_this_month = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM party_snapshots")
            total_snapshots = cur.fetchone()[0]

            cur.execute("""
                SELECT COUNT(*) FROM party_snapshots
                WHERE created_at >= %s
            """, (month_start,))
            snapshots_this_month = cur.fetchone()[0]

            cur.execute("SELECT COALESCE(MAX(floor), 0) FROM party_snapshots")
            top_floor = cur.fetchone()[0]

            cur.execute("""
                SELECT COALESCE(AVG(highest), 0) FROM (
                    SELECT MAX(floor) AS highest
                    FROM party_snapshots
                    WHERE created_at >= %s
                    GROUP BY player_id
                ) sub
            """, (month_start,))
            avg_highest = round(cur.fetchone()[0], 1)

    return {
        "totalPlayers": total_players,
        "activeThisMonth": active_this_month,
        "totalSnapshots": total_snapshots,
        "snapshotsThisMonth": snapshots_this_month,
        "topFloor": top_floor,
        "avgHighestFloor": avg_highest,
    }


@app.get("/pvp/admin/players")
def admin_players(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    _admin=Depends(require_admin),
):
    from db import get_connection
    offset = (page - 1) * per_page

    search_clause = ""
    params = []
    if search:
        search_clause = "WHERE p.display_name ILIKE %s"
        params.append(f"%{search}%")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT COUNT(*) FROM players p {search_clause}
            """, params)
            total = cur.fetchone()[0]

            cur.execute(f"""
                SELECT p.id, p.display_name, p.platform, p.created_at,
                       COALESCE(MAX(ps.floor), 0) AS highest_floor,
                       COUNT(ps.id) AS snapshot_count,
                       MAX(ps.created_at) AS last_active
                FROM players p
                LEFT JOIN party_snapshots ps ON ps.player_id = p.id::text
                {search_clause}
                GROUP BY p.id, p.display_name, p.platform, p.created_at
                ORDER BY last_active DESC NULLS LAST
                LIMIT %s OFFSET %s
            """, params + [per_page, offset])
            rows = cur.fetchall()

    players = [
        {
            "playerId": str(row[0]),
            "displayName": row[1],
            "platform": row[2],
            "createdAt": row[3].isoformat() if row[3] else None,
            "highestFloor": row[4],
            "snapshotCount": row[5],
            "lastActive": row[6].isoformat() if row[6] else None,
        }
        for row in rows
    ]

    return {"players": players, "total": total, "page": page, "perPage": per_page}


@app.get("/pvp/admin/player/{player_id}")
def admin_player_detail(player_id: str, _admin=Depends(require_admin)):
    try:
        uuid.UUID(player_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="player_id must be UUID format")
    from db import get_connection

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, display_name, platform, created_at
                FROM players WHERE id = %s
            """, (player_id,))
            player_row = cur.fetchone()

            if not player_row:
                raise HTTPException(status_code=404, detail="Player not found")

            cur.execute("""
                SELECT floor, character, power_level, fish, equipment, companion, created_at
                FROM party_snapshots
                WHERE player_id = %s
                ORDER BY created_at DESC
                LIMIT 50
            """, (player_id,))
            snap_rows = cur.fetchall()

    snapshots = [
        {
            "floor": row[0],
            "character": row[1],
            "powerLevel": row[2],
            "fish": row[3] if row[3] else [],
            "equipment": row[4] if row[4] else [],
            "companion": row[5] if row[5] else None,
            "createdAt": row[6].isoformat() if row[6] else None,
        }
        for row in snap_rows
    ]

    return {
        "player": {
            "playerId": str(player_row[0]),
            "displayName": player_row[1],
            "platform": player_row[2],
            "createdAt": player_row[3].isoformat() if player_row[3] else None,
        },
        "snapshots": snapshots,
    }


@app.get("/pvp/admin/snapshots")
def admin_snapshots(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _admin=Depends(require_admin),
):
    from db import get_connection
    offset = (page - 1) * per_page

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM party_snapshots")
            total = cur.fetchone()[0]

            cur.execute("""
                SELECT ps.player_id, COALESCE(p.display_name, 'Angler'),
                       ps.floor, ps.character, ps.power_level, ps.fish, ps.equipment,
                       ps.companion, ps.created_at
                FROM party_snapshots ps
                LEFT JOIN players p ON p.id::text = ps.player_id
                ORDER BY ps.created_at DESC
                LIMIT %s OFFSET %s
            """, (per_page, offset))
            rows = cur.fetchall()

    snapshots = [
        {
            "playerId": row[0],
            "displayName": row[1],
            "floor": row[2],
            "character": row[3],
            "powerLevel": row[4],
            "fish": row[5] if row[5] else [],
            "equipment": row[6] if row[6] else [],
            "companion": row[7] if row[7] else None,
            "createdAt": row[8].isoformat() if row[8] else None,
        }
        for row in rows
    ]

    return {"snapshots": snapshots, "total": total, "page": page, "perPage": per_page}


@app.get("/pvp/metrics")
def metrics():
    return _metrics


# --- Request Logging Middleware ---

@app.middleware("http")
async def log_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)
    logger.info(f"{request.method} {request.url.path}", extra={
        "event": "request", "duration_ms": duration_ms,
        "status_code": response.status_code,
    })
    return response
