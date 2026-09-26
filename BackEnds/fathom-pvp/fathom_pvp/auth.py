from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Request
from psycopg import sql

from .errors import ApiError


_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)


def issue_credential() -> tuple[UUID, str, str]:
    session_id = UUID(bytes=secrets.token_bytes(16), version=4)
    secret = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    return session_id, f"{session_id}.{secret}", secret


def credential_hash(secret: str, pepper: str) -> str:
    return _hasher.hash(f"{secret}:{pepper}")


def bootstrap_hash(key: str, pepper: str) -> str:
    return hashlib.sha256(f"{key}:{pepper}".encode()).hexdigest()


def bootstrap_credential(key: str, pepper: str) -> str:
    return (
        base64.urlsafe_b64encode(
            hmac.new(
                pepper.encode(), ("session:" + key).encode(), hashlib.sha256
            ).digest()
        )
        .decode()
        .rstrip("=")
    )


@dataclass(frozen=True)
class Principal:
    account_id: UUID
    session_id: UUID


def authenticate(request: Request) -> Principal:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError(401, "SESSION_EXPIRED", "A valid guest session is required")
    token = header[7:]
    try:
        raw_id, secret = token.split(".", 1)
        session_id = UUID(raw_id)
    except (ValueError, AttributeError):
        raise ApiError(
            401, "SESSION_EXPIRED", "The session credential is malformed"
        ) from None
    schema = request.app.state.settings.db_schema
    with request.app.state.db.pool.connection() as conn:
        row = conn.execute(
            sql.SQL(
                "SELECT s.account_id, s.credential_hash, s.expires_at, s.revoked_at, a.state FROM {}.account_sessions s JOIN {}.accounts a USING(account_id) WHERE s.session_id=%s"
            ).format(sql.Identifier(schema), sql.Identifier(schema)),
            (session_id,),
        ).fetchone()
    if (
        not row
        or row["revoked_at"] is not None
        or row["expires_at"] <= datetime.now(row["expires_at"].tzinfo)
        or row["state"] == "deleted"
    ):
        raise ApiError(401, "SESSION_EXPIRED", "The session has expired or was revoked")
    try:
        _hasher.verify(
            row["credential_hash"],
            f"{secret}:{request.app.state.settings.session_pepper}",
        )
    except VerifyMismatchError:
        raise ApiError(
            401, "SESSION_EXPIRED", "The session credential is invalid"
        ) from None
    return Principal(row["account_id"], session_id)
