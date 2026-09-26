from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        fields: dict[str, Any] | None = None,
        retryable: bool = False,
    ):
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.retryable = retryable


def error_response(request: Request, exc: ApiError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    detail: dict[str, Any] = {
        "code": exc.code,
        "message": exc.message,
        "retryable": exc.retryable,
        "requestId": request_id,
    }
    if exc.fields:
        detail["fields"] = exc.fields
    return JSONResponse(status_code=exc.status, content={"error": detail})
