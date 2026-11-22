# Kitchen Plan tests

`node --test` (`npm test`) runs every `*.test.mjs` here against the Node service in
`server/`. Nothing here touches household data, a device or a real calendar. Every
case uses a disposable database (`:memory:`, or a file under the OS temp dir) and
either the bundled archive (import checks only) or the synthetic Paprika archive
built in `meals-acceptance.test.mjs`.

| File | Covers |
|---|---|
| `rendered-html.test.mjs` | `node server/main.mjs` as a child process: private page, 14 empty dinners, 3-day review, zero-event feed, restart, weak token, cross-process lock |
| `meals-acceptance.test.mjs` | Tuesday chicken → Wednesday leftovers through the HTTP API: import/UIDs/aliases, preview, ranking, hard rules, commit, Undo, ICS, DST, boundaries, restart, backups |

**File-backed cases need POSIX file locks.** Confined QA workers deny SQLite's
locks: the first write on any database file fails with `database is locked`, even in
rollback-journal mode. A probe at load time detects this and skips the four cases
that need a real file, naming the probe error. On the dev VM, run with
`KITCHEN_TEST_REQUIRE_FILE_DB=1`. That turns the probe off, so those four cases must
run and pass:

```bash
cd FrontEnds/kitchen-plan
KITCHEN_TEST_REQUIRE_FILE_DB=1 node --disable-warning=ExperimentalWarning --test
```

Expected there: `# tests 14`, `# pass 14`, `# skipped 0`.

Measured entries follow, newest first. Each one is the baseline for the next run.

## 2026-11-22 — qa-kitchen-meals-acceptance at `f80d86b4` (origin/dev)

Command, from `FrontEnds/kitchen-plan`, Node v22.23.4, on a confined tester worker:

```bash
node --disable-warning=ExperimentalWarning --test
```

Result: `# tests 14`, `# pass 10`, `# fail 0`, `# skipped 4`.

Skipped (environment, not code): the four file-backed cases below. Each was skipped
because the probe reported `file-backed SQLite unavailable here (database is locked)`.
They have **not been run** anywhere yet. The dev-VM command above is their first run.

- `rendered-html` › restarted on the same database re-imports the bundled archive as unchanged and keeps every slot
- `rendered-html` › refuses a database another process holds
- `meals-acceptance` › restart on the same file keeps accepted dinners, UIDs, sequences, leftovers, shopping and the feed
- `meals-acceptance` › scheduled backups are verified 0600 snapshots without the token; restore refuses a running service and brings the plan back

**Previous baseline** (no earlier entry; measured at `b05828f0`, before these files
changed): `# tests 2`, `# fail 2`. Both reds were in `rendered-html.test.mjs`. That
file imported `dist/server/index.js`, the vinext seed worker with three seed meals,
which is not built and no longer deployed. Both cases are now replaced by the
entrypoint checks against `server/main.mjs`.

Passing cases (10):

- `rendered-html` › fresh database (in-memory): private page shell and headers, 14 empty two-person dinners from Eastern today, empty 3-day review, bundled uids as supplied, zero-event feed on the token route only, no token or `/feed/` path in the log
- `rendered-html` › token under 256 bits keeps the feed listener off and out of the log
- `meals-acceptance` › bundled archive: imports once, repeats as unchanged with no revision, keeps uids, aliases resolve (`Garlic Cloves`→`garlic`, `chicken thighs`→`chicken`, …)
- `meals-acceptance` › a lower-case uid is kept as supplied, and an upper-cased re-export matches it
- `meals-acceptance` › Tuesday/Wednesday scenario: insufficient surplus, too-small producer, unavailable and unconsented accepts are all refused without a write; exact shopping (`chicken|mass` 1 lb net of pantry, `corn tortilla|each` 4, `potato|mass` 1 lb); review states; previews are deterministic and leave feed and shopping alone; ranking follows `compareOptions`; top option has exact reasons, metrics and shopping diff; the unavailable, dietary, workload and insufficient_yield rules reject; a locked Wednesday blocks every option (`locked_dependent`) and every accept that changes its producer
- `meals-acceptance` › commit/Undo: chicken made unavailable gives `leftover_source_unavailable` (blocked on Tuesday); every option changes both dinners; covers stale and replaced previews, forged option/preview/fields, missing key (428), tampered infeasible option (`option_invalid`), and an option rewritten behind its id (`unknown_option`); an injected shopping failure rolls back slots and feed; of two concurrent commits exactly one wins; idempotent replay and key reuse; UIDs stay stable and SEQUENCE goes up by 1; shopping equals the previewed diff; Undo is a fresh revision that restores both dinners, the link and shopping, with SEQUENCE up again
- `meals-acceptance` › preview goes stale across Eastern midnight and expires after 15 min
- `meals-acceptance` › ICS across 2027-03-14 and 2026-11-01: `VALUE=DATE` all-day dates, no TZID, HTTPS app recipe URL, servings, prep override, total, MPID, `\;` `\,` `\\` escaping, every physical line ≤ 75 octets and valid UTF-8 on its own
- `meals-acceptance` › non-HTTPS or pathful app origin refused at startup
- `meals-acceptance` › boundaries: feed serves only the exact token path (ETag 304, HEAD, POST 405; near-miss paths 404); private listener has no feed route; Host allowlist; cross-origin, cross-site, missing-header and form mutations refused; subscription URL only on a same-origin POST, `no-store`; token absent from API, shell, feed body and log

Controls, spliced into a scratch copy of `server/` outside the repository, one at a
time. Each turned exactly the named cases red:

| Splice | Red |
|---|---|
| fold continuation limit 74→75 | ICS/DST |
| `;` not escaped | ICS/DST |
| timed `DTSTART` | ICS/DST, commit/Undo |
| yield ignores leftover demand | Tuesday/Wednesday |
| `lockedThroughLinks` empty | Tuesday/Wednesday |
| pantry quantity ignored | Tuesday/Wednesday |
| commit writes only the first slot | commit/Undo |
| Undo drops the leftovers link | commit/Undo |
| no idempotency store | commit/Undo |
| preview records a revision | Tuesday/Wednesday, commit/Undo, preview stale/expiry |
| feed handler logs the URL | boundaries |
| 13-day horizon | `rendered-html` fresh database |
| page title changed | `rendered-html` fresh database |

The `leftover_source_unavailable` check also reddens commit/Undo at `b05828f0`. That
commit predates `f80d86b4`, which added the check.
