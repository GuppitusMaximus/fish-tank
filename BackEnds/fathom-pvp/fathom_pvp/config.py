from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PVP_", extra="ignore")

    database_url: str
    db_schema: str = Field(default="game", pattern=r"^[a-z][a-z0-9_]{0,62}$")
    session_pepper: str = Field(min_length=32)
    dataset_id: str = "demo-v2"
    service_release: str = "dev"
    writes_enabled: bool = True
    rules_worker_path: Path
    rules_artifact_path: Path
    rules_artifact_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    worker_timeout_seconds: float = Field(default=2.0, ge=0.1, le=10.0)
    worker_concurrency: int = Field(default=2, ge=1, le=8)
    body_limit_bytes: int = Field(default=1_048_576, ge=65_536, le=4_194_304)
    knot_history_limit: int = Field(default=10_000, ge=1, le=100_000)
    session_days: int = Field(default=90, ge=1, le=365)
    bootstrap_rate_per_minute: int = Field(default=10, ge=1, le=100)
    trusted_proxy_ips: list[str] = ["127.0.0.1", "::1"]
    cors_origins: list[str] = []
    node_binary: str = "node"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def split_proxies(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value
