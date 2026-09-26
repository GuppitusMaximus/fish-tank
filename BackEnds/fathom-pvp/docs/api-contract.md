# Client and Ledger integration

Base path: `/pvp/v2`. Send `Authorization: Bearer <session token>` on private
requests and a durable `Idempotency-Key` on mutations. Persist the bootstrap
key before its first request. Account IDs and gamer tags are not credentials.
The executable request models are in `fathom_pvp/models.py`; unknown fields are
rejected, including legacy fields on new endpoints.

## Account and collection

`POST /guest-sessions` accepts `{ "bootstrapKey": "<random UUID>" }`. Use the
same UUID as its idempotency key. The response contains `session.token`,
`session.expiresAt`, and the same account view returned by `GET /me`:

```json
{
  "account": { "accountId": "<server UUID>" },
  "profile": { "revision": 1, "gamerTag": "Diver-123456" },
  "classes": [{ "classId": "andy", "displayName": "Andy", "defaultAvailable": true, "defaultPortraitId": "andy-default" }],
  "portraits": [{ "portraitId": "andy-default", "classId": "andy", "artworkRevision": "demo-v1", "defaultAvailable": true }],
  "loadouts": [{ "classId": "andy", "portraitId": "andy-default", "revision": 1 }],
  "grants": [{ "objectType": "portrait", "objectId": "andy-veteran", "sourceType": "promotion" }],
  "datasetId": "demo-v2"
}
```

The sample grant illustrates the shape; newly created accounts have no grants.
An object is owned if its catalog entry is default-available or a corresponding
active grant is present. Grants in this view are already filtered to active
records. Class and portrait access are separate. Local achievement flags do not
authorize a permanent collection grant.

`PATCH /me/profile` accepts `{ "gamerTag": "New Name", "expectedRevision": 1 }`
and returns `{ "profile": { "revision": 2, "gamerTag": "New Name" } }`.
Merge that partial response into the existing account cache. A delayed older
read must not overwrite a successful rename.

`PUT /me/classes/andy/portrait` accepts
`{ "portraitId": "andy-default", "expectedRevision": 1 }` and returns a
`loadout` object with `classId`, `portraitId`, and the new numeric `revision`.
Replace that class's cached loadout. The portrait's **artwork** revision comes
from `portraits[].artworkRevision`, not the loadout revision. Locked previews
do not call this endpoint. Stale revisions return a conflict; refresh the view
before the player chooses again.

## Ghost and encounter

Register a stable run with `POST /runs` using `runId`, `importedLocal`, and
`originBuild` containing only `gameVersion`, `buildCommit`, and `buildId`.
Create the schema-4 snapshot through the game's `GhostContractV4` module and
send it intact to `POST /ghosts`. Freeze it before battle. The accepted response
contains `ghostId`, recomputed `powerLevel`, validation status and provenance.
`GET /me/ghosts/{ghostId}` returns the complete private immutable snapshot.

`POST /matches` accepts `ghostId`, `runId`, and `encounterId`. Persist its
`matchId`, public `opponent`, and complete `battleInput` before calling
`POST /matches/{matchId}/start` with `{ "encounterId": "<UUID>" }`. A lost
start acknowledgement never permits replacing the stored fight.

`PUT /matches/{matchId}/result` accepts `encounterId`, `outcome`,
`preCombatGold`, `postCombatGold`, and optional `resources`. The wire outcomes
are **`win`, `loss`, or `interrupted`**; translate the game's `won`/`lost` values
at the transport boundary. `matchId` belongs in the URL, not the JSON body.
Results never grant permanent account value.

`POST /offline-encounters` accepts `runId`, `encounterId`, the original
`capture`, frozen `localGeneratedInput`, and the same result object. It can
reconcile an accepted capture and abandon an unstarted proposal. An already
started online match cannot change its source. Retry with the stored body and
key; never reconstruct a historical capture using a later game build.

The snapshot's medallion block records `soulCount`, `lossCount`, `litSoulSlots`,
`soulsToEscape`, `lossesToWake`, `eyeStage`, `displayEyeFrame`, and `eyeOpenness`.
The worker derives these from the captured prior PvP results and pinned rules.
Later results update the live run, not that ghost.

`GET /leaderboard` returns `items`, `datasetId`, `matchmakingPoolId`, `metric`,
and `progressionTrust`. Each row describes one coherent historical ghost.
The legacy UI adapter maps `items` to its existing `entries` property.

Recoverable Apple/Google/email identities, store verification, account currency,
achievement authorization, and collection purchase flows remain the next phase.
