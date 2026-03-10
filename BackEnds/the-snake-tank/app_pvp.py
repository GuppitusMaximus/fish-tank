#!/usr/bin/env python3
"""FastAPI PvP ghost service for Fathom Fall matchmaking.

Players upload party snapshots after PvP battles; opponents receive real
player compositions instead of procedural ghosts.

Run with: uvicorn app_pvp:app --host 127.0.0.1 --port 8002
"""

import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

from psycopg2.extras import Json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)


# --- Constants ---

VALID_SPECIES = ["pufferfish", "swordfish", "seahorse", "guppy"]
VALID_CHARACTERS = ["andy", "saba"]
MATCHMAKING_BRACKET = 0.15
MATCHMAKING_BRACKET_WIDE = 0.30


# --- App ---

app = FastAPI(title="FishTank PvP Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Structured JSON Logging ---

class JSONFormatter(logging.Formatter):
    EXTRA_FIELDS = ("event", "floor", "power_level", "found", "bracket_size",
                    "duration_ms", "status_code", "error")

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


# --- State & Metrics ---

_start_time = time.time()

_metrics = {
    "snapshot_upload_count": 0,
    "matchmaking_requests": 0,
    "matchmaking_hits": 0,
    "matchmaking_fallbacks": 0,
}


# --- Validation Models ---

class FishSnapshot(BaseModel):
    speciesId: str
    level: int
    moves: List[str]

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
    equipment: Optional[List] = None
    companionLevel: Optional[int] = None

    @field_validator("playerId")
    @classmethod
    def valid_player_id(cls, v):
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError(f"playerId must be UUID format, got {v}")
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
                    SELECT player_id, character, floor, fish, equipment,
                           companion_level, power_level
                    FROM party_snapshots
                    WHERE floor = %s
                      AND power_level BETWEEN %s AND %s
                      AND player_id != %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor, low, high, exclude_player_id))
            else:
                cur.execute("""
                    SELECT player_id, character, floor, fish, equipment,
                           companion_level, power_level
                    FROM party_snapshots
                    WHERE floor = %s
                      AND power_level BETWEEN %s AND %s
                    ORDER BY RANDOM()
                    LIMIT 1
                """, (floor, low, high))
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
def upload_snapshot(snapshot: SnapshotUpload):
    start = time.time()
    from db import get_connection

    fish_data = [f.model_dump() for f in snapshot.fish]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO party_snapshots
                    (player_id, character, floor, fish, equipment, companion_level, power_level)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_id, floor) DO UPDATE SET
                    character = EXCLUDED.character,
                    fish = EXCLUDED.fish,
                    equipment = EXCLUDED.equipment,
                    companion_level = EXCLUDED.companion_level,
                    power_level = EXCLUDED.power_level,
                    created_at = NOW()
            """, (snapshot.playerId, snapshot.character, snapshot.floor,
                  Json(fish_data),
                  Json(snapshot.equipment) if snapshot.equipment else None,
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
    floor: int = Query(..., ge=1),
    powerLevel: float = Query(..., ge=0),
    playerId: Optional[str] = Query(None),
):
    start = time.time()
    _metrics["matchmaking_requests"] += 1

    row = _find_opponent(floor, powerLevel, playerId, MATCHMAKING_BRACKET)
    bracket_used = "narrow"

    if not row:
        row = _find_opponent(floor, powerLevel, playerId, MATCHMAKING_BRACKET_WIDE)
        bracket_used = "wide"

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
    }

    logger.info("Matchmaking hit", extra={
        "event": "matchmaking", "found": True, "bracket_size": bracket_used,
        "duration_ms": duration_ms,
    })

    return {"found": True, "snapshot": snapshot}


@app.get("/pvp/leaderboard")
def leaderboard(limit: int = Query(20, ge=1, le=100)):
    from db import get_connection
    now = datetime.now(timezone.utc)
    season = now.strftime("%Y-%m")
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT player_id, character, MAX(floor) as highest_floor,
                       COUNT(*) as snapshots, MAX(power_level) as peak_power
                FROM party_snapshots
                WHERE created_at >= %s
                GROUP BY player_id, character
                ORDER BY highest_floor DESC
                LIMIT %s
            """, (month_start, limit))
            rows = cur.fetchall()

    entries = [
        {
            "playerId": row[0],
            "character": row[1],
            "highestFloor": row[2],
            "snapshots": row[3],
            "peakPower": row[4],
        }
        for row in rows
    ]

    return {"season": season, "entries": entries}


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
