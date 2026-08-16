"""Stdlib JWT verification matching the Cloudflare auth Worker's HS256 scheme.

The Worker (Planning/cloudflare-auth/src/index.js) signs tokens as
base64url(header).base64url(payload).base64url(HMAC-SHA256). We only ever
accept our own secret, so we always use HMAC-SHA256 and never trust the
header's 'alg' field (avoids alg-confusion attacks).
"""

import base64
import hashlib
import hmac
import json
import time


def _b64url_decode(part):
    padding = '=' * (-len(part) % 4)
    return base64.urlsafe_b64decode(part + padding)


def verify_jwt(auth_header, secret):
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    if not secret:
        return None

    token = auth_header[7:]
    parts = token.split(".")
    if len(parts) != 3:
        return None

    try:
        signing_input = f"{parts[0]}.{parts[1]}"
        expected = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
        actual = _b64url_decode(parts[2])
        if not hmac.compare_digest(actual, expected):
            return None

        payload = json.loads(_b64url_decode(parts[1]))
        if "exp" in payload and payload["exp"] < int(time.time()):
            return None
        return payload
    except Exception:
        return None
