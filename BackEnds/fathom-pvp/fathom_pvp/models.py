from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Provenance(StrictModel):
    gameVersion: str = Field(min_length=1, max_length=32)
    buildCommit: str = Field(pattern=r"^[a-f0-9]{40}$")
    buildId: str = Field(min_length=1, max_length=128)
    saveFormatVersion: int = Field(ge=1, le=10_000)
    battleRulesVersion: str = Field(min_length=1, max_length=64)
    tackleboxRulesVersion: str = Field(min_length=1, max_length=64)
    itemDefinitionsVersion: str = Field(min_length=1, max_length=64)
    cookingRulesVersion: str | int
    contentHash: str = Field(min_length=1, max_length=128)
    rulesetId: str = Field(min_length=1, max_length=128)
    ratingVersion: str = Field(min_length=1, max_length=128)
    matchmakingPoolId: str = Field(min_length=1, max_length=128)
    datasetId: str = Field(min_length=1, max_length=64)
    capturedAt: str = Field(min_length=20,max_length=40)
    capturePhase: Literal["pre_combat"]

    @field_validator("capturedAt")
    @classmethod
    def valid_timestamp(cls,value:str)->str:
        try:datetime.fromisoformat(value.replace("Z","+00:00"))
        except ValueError:raise ValueError("capturedAt must be ISO-8601") from None
        return value


class RunCapture(StrictModel):
    runId: UUID
    encounterId: UUID
    encounterKind: Literal["pvp"]
    floor: int = Field(ge=1, le=10_000)
    zoneId: str = Field(min_length=1, max_length=128)
    zonePath: list[str] = Field(max_length=1_000)
    tier: str | int
    difficulty: str | int
    mode: str = Field(min_length=1, max_length=64)
    seed: str | int
    imported: bool

    @field_validator("zonePath")
    @classmethod
    def valid_path(cls, value: list[str]) -> list[str]:
        if any(not part or len(part) > 128 for part in value):
            raise ValueError("zone path components must be 1-128 characters")
        return value


class IdentityCapture(StrictModel):
    gamerTag: str = Field(min_length=3, max_length=24)
    classId: str = Field(min_length=1, max_length=64)
    portraitId: str = Field(min_length=1, max_length=128)
    portraitRevision: str | int
    profileRevision: int = Field(ge=1)


class FlexibleBlock(BaseModel):
    model_config = ConfigDict(extra="allow")


class Tacklebox(FlexibleBlock):
    rulesVersion: str
    board: dict[str, Any]
    dock: list[dict[str, Any]]
    migrationHoldingArea: list[dict[str, Any]]
    permanentHistory: list[dict[str, Any]]
    permanentTotalsByLine: dict[str, Any]
    canonicalHash: str


class GhostUpload(StrictModel):
    schemaVersion: Literal[4]
    provenance: Provenance
    run: RunCapture
    identity: IdentityCapture
    roster: list[dict[str, Any]] = Field(min_length=1, max_length=64)
    combat: dict[str, Any]
    tacklebox: Tacklebox
    equipmentAttribution: dict[str, Any]
    resources: dict[str, Any]
    meal: dict[str, Any] | None

    @model_validator(mode="after")
    def validate_finite_and_combat(self) -> "GhostUpload":
        def walk(value: Any) -> None:
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("all numeric values must be finite")
            if isinstance(value, dict):
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)
        walk(self.model_dump(mode="python"))
        units = self.combat.get("units")
        if self.combat.get("startHealthPolicy") != "living_full_resolved_v1" or not isinstance(units, list) or len(units) > 3:
            raise ValueError("combat must use living_full_resolved_v1 with at most three units")
        return self


class GuestSessionRequest(StrictModel):
    bootstrapKey: str = Field(min_length=16, max_length=200)
    deviceLabel: str | None = Field(default=None, max_length=100)


class ProfilePatch(StrictModel):
    gamerTag: str = Field(min_length=3, max_length=24, pattern=r"^[A-Za-z0-9][A-Za-z0-9 _-]*$")
    expectedRevision: int = Field(ge=1)


class PortraitPut(StrictModel):
    portraitId: str = Field(min_length=1, max_length=128)
    expectedRevision: int = Field(ge=0)


class RunRegistration(StrictModel):
    runId: UUID
    originBuild: dict[str, str]
    importedLocal: bool = False

    @field_validator("originBuild")
    @classmethod
    def exact_build(cls, value: dict[str, str]) -> dict[str, str]:
        if set(value) != {"gameVersion", "buildCommit", "buildId"} or not re.fullmatch(r"[a-f0-9]{40}", value["buildCommit"]):
            raise ValueError("originBuild requires gameVersion, buildCommit, and buildId")
        return value


class MatchRequest(StrictModel):
    ghostId: UUID
    runId: UUID
    encounterId: UUID


class MatchStart(StrictModel):
    encounterId: UUID


class ResultPut(StrictModel):
    encounterId: UUID
    outcome: Literal["win", "loss", "interrupted"]
    preCombatGold: int = Field(ge=0)
    postCombatGold: int = Field(ge=0)
    resources: dict[str, Any] = Field(default_factory=dict)


class OfflineEncounter(StrictModel):
    runId: UUID
    encounterId: UUID
    capture: GhostUpload
    localGeneratedInput: dict[str, Any]
    result: ResultPut
