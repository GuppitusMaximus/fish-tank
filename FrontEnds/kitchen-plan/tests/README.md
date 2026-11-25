# Kitchen Plan tests

`node --test` (`npm test`) runs every `*.test.mjs` here against the Node service in
`server/`. Nothing here touches household data, a device or a real calendar. Every
case uses a disposable database (`:memory:`, or a file under the OS temp dir) and
either the bundled archive or a synthetic Paprika archive built in the test file
(`meals-acceptance.test.mjs`, `swap-share.test.mjs`).

| File | Covers |
|---|---|
| `rendered-html.test.mjs` | `node server/main.mjs` as a child process: private page, 14 empty dinners, 3-day review, zero-event feed, schema version and swap tables, restart, weak token, cross-process lock |
| `meals-acceptance.test.mjs` | Tuesday chicken → Wednesday leftovers through the HTTP API: import/UIDs/aliases, preview, ranking, hard rules, commit, Undo, ICS, DST, boundaries, restart, backups |
| `swap-share.test.mjs` | Dinner swaps through the HTTP API: Brussels sprouts → roast carrots as a recipe line (two dates, one recipe) and as an owner-entered side (bundled library), preview/apply/idempotency/stale, shopping and restocks, Undo, rollover, hard rules, boundaries, restart, v1 → current migration |
| `swap-share-browser.mjs` | The served app in headless Chrome over CDP: pick a dinner, swap a side for roast carrots, preview, cancel, apply, shopping, share/copy with stubs and fallbacks, Undo; and a dinner's 1 lemon beside a restocked 1 lemon, both kept in the shared and copied text. **Not run by `npm test`** (see below) |

**File-backed cases need POSIX file locks.** Confined QA workers deny SQLite's
locks: the first write on any database file fails with `database is locked`, even in
rollback-journal mode. A probe at load time detects this and skips the six cases
that need a real file, naming the probe error. On the dev VM, run with
`KITCHEN_TEST_REQUIRE_FILE_DB=1`. That turns the probe off, so those six cases must
run and pass:

```bash
cd FrontEnds/kitchen-plan
KITCHEN_TEST_REQUIRE_FILE_DB=1 node --disable-warning=ExperimentalWarning --test
```

Expected there: `# tests 22`, `# pass 22`, `# skipped 0`.

**The browser case needs Google Chrome or Chromium.** `swap-share-browser.mjs` does not
match `node --test`'s default file pattern, so run it by name. Without a browser it
skips. `KITCHEN_TEST_REQUIRE_BROWSER=1` makes it mandatory, and
`KITCHEN_TEST_BROWSER=/path/to/chrome` picks the binary (otherwise PATH, the usual
install paths and the Playwright cache are searched). It needs no new dependency. Chrome
runs headless with a throwaway profile, resolves nothing but loopback, and sends
everything else to a dead proxy. `navigator.share` and `navigator.clipboard` are
capture stubs, so no share sheet opens and nothing is sent. On the dev VM:

```bash
cd FrontEnds/kitchen-plan
KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
```

Expected there: `# tests 2`, `# pass 2`, `# skipped 0`.

Measured entries follow, newest first. Each one is the baseline for the next run.

## 2026-11-25 — qa-kitchen-identical-lemon-share on `c57fb76c` (origin/dev)

Why: `706baf52` stopped the share text from keying rows on name and amount, because a
dinner's need and a restock with the same name and amount (two 1-lemon rows) were
merged into one line. No case drove that collision through the real Share and Copy
controls. This entry adds one. No production file changed.

What changed (only `swap-share-browser.mjs`):

- New case 2, "a dinner's 1 lemon and a restocked 1 lemon are both in the shared and
  the copied list". The setup is a fresh in-memory household. The bundled dinner whose
  only lemon line is `1 lemon` (each) is accepted for tomorrow and the day after. On the
  second date the lemon line is swapped for a carrot through the API, so the lemon is
  restocked. `arrangeIdenticalLemons` then checks the setup against the fixture's own
  `/api/shopping` response. There are exactly two rows named `lemon`. Their ids differ
  (`lemon|each`, `restock|lemon|each`). Both are unchecked with amount `1`. One is the
  first dinner's plan need, and the other is the restock dated on the swapped dinner.
- In Chrome, the list shows two `lemon` rows, and exactly one of them carries the
  `Restock: 1` note. The real Share and Copy buttons are clicked inside user activation.
  `expectBothLemons` checks each captured payload: one line per unchecked row, and the
  lemon lines are exactly `- lemon: 1` plus `- lemon: 1 (restock: 1)`, so the annotation
  and the count are both checked. Copy must equal Share, and the banner must say
  `Copied 9 items.`. Neither action changes a check mark or the revision. The page
  requests nothing outside loopback, with no CSP violations and no page errors.
- Case 1 is unchanged. Its household and Chrome/CDP setup moved into `startHousehold`
  and `openApp`, so case 2 shares them. `startHousehold`, `arrangeIdenticalLemons` and
  `expectBothLemons` are exported only so they can be exercised without a browser.

Checked here without a browser, with a scratch driver outside the repository. The
driver ran the real fixture, then ran the real `shoppingShareText` (and its helpers,
cut out of `public/app.js`) in a `vm` on the fixture's rows:

| Case | Result |
|---|---|
| fixture preconditions | pass: `lemon\|each` plan `1` (D1) and `restock\|lemon\|each` restock `1` (D2), 9 unchecked rows |
| real `shoppingShareText`, rows in API order, then reversed | pass both: `- lemon: 1` and `- lemon: 1 (restock: 1)` |
| control: pre-`706baf52` name+amount dedupe spliced into the app, need first / restock first | caught both (8 lines for 9 rows) |
| control: restock line dropped / need line dropped | caught both |
| control: need dropped while another line keeps the count at 9 | caught (lemon lines differ) |
| control: annotation dropped / on both lines / restock line doubled | caught all three |
| control: the app's `restockText` call spliced out | caught |

Command, from `FrontEnds/kitchen-plan`, Node v22.23.4, on a confined tester worker:

```bash
node --disable-warning=ExperimentalWarning --test
node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
```

Result: `# tests 22`, `# pass 16`, `# fail 0`, `# skipped 6`. This matches the
`7b4a8ebd` entry exactly, with the same six `file-backed SQLite unavailable here
(database is locked)` skips. Then `# tests 2`, `# skipped 2` (`no Google Chrome or
Chromium found`). With `KITCHEN_TEST_REQUIRE_BROWSER=1` it is `# tests 2`, `# fail 2`,
as intended, because this worker has no browser.

`eslint tests/swap-share-browser.mjs` reports two `no-useless-escape` errors in case 1's
`Sharing cancelled\.` regex. The same errors are at `c57fb76c` (line 573 there), so they
are inherited and were left alone. The new lines lint clean.

**Not run here: the Chrome path.** Both cases must pass on the dev VM:

```bash
cd FrontEnds/kitchen-plan
KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
ls -d "${TMPDIR:-/tmp}"/kitchen-chrome-* 2>/dev/null   # expect nothing left behind
```

Expected there: `# tests 2`, `# pass 2`, `# fail 0`, `# skipped 0`.

## 2026-11-22 — qa-kitchen-browser-cleanup on `7b4a8ebd` (origin/dev)

Why: on the dev VM, standalone Chrome runs passed every functional check but the
teardown sometimes failed with `ENOTEMPTY: rmdir …/kitchen-chrome-*/Default`. The old
teardown SIGKILLed the browser and called `rmSync` once, but Chrome's helper processes
can still be writing the profile then. It also waited only when `exitCode` was null,
and a child that a signal killed has `exitCode` null too, so the teardown would wait
forever for an `exit` that had already fired. This was a test defect. No production
file changed.

What changed (only `swap-share-browser.mjs`, only in teardown):

- `stopBrowser` stops only the spawned child. It sends `Browser.close` through that
  browser's own DevTools port, then SIGTERM, then SIGKILL. It waits up to 5 s after
  each one and returns at once if the child has already exited by code or by signal,
  or never spawned. It never signals anything else, and Node never signals a child it
  has reaped.
- `removeProfile` retries `rmSync` every 100 ms for up to 10 s on `ENOTEMPTY`,
  `EBUSY` or `EPERM`. Any other error is rethrown at once, and so is the last error
  after the deadline. The profile is removed even if `stopBrowser` throws.
- The launch loop reports a signal exit (`Chrome exited with SIGKILL`), not `null`.
- The assertions, the service and household cleanup, and the real-browser requirement
  are unchanged. `exitOf`, `stopBrowser` and `removeProfile` are exported only so the
  teardown can be exercised without a browser.

Checked here without a browser, using a scratch driver outside the repository that
imports those exports:

| Case | Result |
|---|---|
| fake browser that exits on `Browser.close` (minimal CDP endpoint) | `closed`, 226 ms |
| fake browser that ignores `Browser.close` and SIGTERM (0.5 s waits) | `SIGKILL`, 3.0 s |
| no DevTools port, child exits on SIGTERM | `SIGTERM` |
| already exited (code 3) / killed by SIGKILL beforehand / spawn ENOENT | `exited`, no wait |
| old teardown on the SIGKILLed child (control) | still waiting after 1.5 s |
| `Default/` refilled by a writer while removing, 20 rounds | plain `rmSync`: `ENOTEMPTY` 20/20 (control). `removeProfile`: 20/20 removed, at most 3 attempts |
| writer that never stops (1 s bound) | gives up with `ENOTEMPTY` after 1.09 s |
| missing directory / `EACCES` | 1 attempt / rethrown at once |

Command, from `FrontEnds/kitchen-plan`, Node v22.23.4, on a confined tester worker:

```bash
node --disable-warning=ExperimentalWarning --test
node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
```

Result: `# tests 22`, `# pass 16`, `# fail 0`, `# skipped 6`. This matches the
`c60420b4` entry exactly, with the same six `file-backed SQLite unavailable here
(database is locked)` skips. Then `# tests 1`, `# skipped 1` (`no Google Chrome or
Chromium found`). With `KITCHEN_TEST_REQUIRE_BROWSER=1` it is `# fail 1`, as intended,
because this worker has no browser.

**Not run here: the Chrome path.** The operator's host evidence at `7b4a8ebd` is a
22/22 mandatory SQLite suite and a passing second Chrome run. That was the old teardown,
on the host, not a worker run. The new teardown needs repeated real-browser runs on the
dev VM:

```bash
cd FrontEnds/kitchen-plan
for i in $(seq 10); do KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs | grep -E '^# (pass|fail)'; done
ls -d "${TMPDIR:-/tmp}"/kitchen-chrome-* 2>/dev/null   # expect nothing left behind
```

Expected there: `# pass 1`, `# fail 0` on every run, and no `kitchen-chrome-*`
directory left over.

## 2026-11-22 — qa-kitchen-swap-share on `c60420b4` (origin/dev)

Code under test: the dinner swap and share commits `2a30763c`…`4efa10bd`, plus
`706baf52` (share lists every unchecked row) and `d39e5a4b` (schema v3: bought is
recorded per restock contribution). Both of those landed while this run was in
progress. The tests were graded at the pushed tip.

**Baseline.** The previous entry was `e97ac22b`: 14 tests, 10 pass, 4 skipped. That entry
is older than the swap commits, so the suite was measured once at `4efa10bd` before any
test changed. Result: `# tests 14`, `# pass 9`, `# fail 1`, `# skipped 4`. The red was not
in the baseline. It was `rendered-html` › fresh database, at `schemaVersion` (`2 !== 1`).
`97c22cbf` added migration v2, which made that literal pin obsolete.

Changed:

- `rendered-html.test.mjs`, fresh database: `health.schemaVersion` must equal
  `SCHEMA_VERSION` (it used to be the literal 1). Health reports the constant rather than
  the database's value, so the case now also requires `GET /api/dinner-swaps?date=<today>`
  to answer 404 `dinner_not_found`. That route reads the v2 tables, so it fails if the
  migration never ran.
- `meals-acceptance.test.mjs`: unchanged. It has no schema pin, and every case passed at
  `4efa10bd` and at the tip.
- New `swap-share.test.mjs` (8 cases) and `swap-share-browser.mjs` (1 case).

`swap-share.test.mjs` covers:

- **Line swap.** A synthetic traybake with `1 pound Brussels sprouts` is accepted on Tue
  and Wed. The case checks the `GET /api/dinner-swaps` shape, and that a preview is
  deterministic (masking `previewId` and `swapId`). The preview leaves the revision,
  slots, shopping and the feed (byte-equal) alone. Apply without a key is 428. The retry
  replays, and reusing the key is `idempotency_key_reused`. The other preview is then
  `stale_revision` at the old base and 404 `preview_not_found` at the new one (every
  recorded change clears all previews). Wed's slot, its sources and the library recipe are
  unchanged. The list after apply is the list before plus the diff: sprouts 2→1 lb (Wed
  only), carrot 1 lb on Tue, and a restock row of 1 lb with its reason. The Tue event keeps
  its UID, gets SEQUENCE+1 and a `Swap: Roast carrots instead of Brussels sprouts` line.
  Wed's event is identical. A note keeps the swap. Pantry stock never cancels a restock,
  and a bought restock stays checked through recalculation. A different dinner drops the
  swap and Undo brings it back. Last, after Tue's pound is bought, Wed's swap lists only
  Wed's unbought pound, unchecked. That last check is the v3 fix, and it is red at
  `4efa10bd`.
- **Owner-entered side, bundled library.** The library has carrots and no Brussels sprouts,
  and sprouts are not a catalogued replacement. A `Brussels sprouts` 1 lb side becomes
  `Roast carrots` 4 each. `sourceId` omitted and `sourceId: null` preview the same. The
  applied side id is the previewed one, and the same side again is `side_in_recipe`. The
  list adds carrot 4 and a sprouts restock of 1 lb, and the share text lists the swap. No
  library recipe changes. An unbought Undo restores the slot exactly (SEQUENCE+2), the
  list, the sources and the feed description. A bought Undo keeps only the checked
  restock.
- **Undo of the latest of two swaps.** The shared restock row goes 1 → 2 lb and carrots
  2.5 lb. Re-swapping a swapped line does not restock twice. Swapping it to what it already
  is gives `same_ingredient`. Undo of Wed restores Wed (SEQUENCE+2) and the list as it was
  with Tue's swap only. Tue's event and restock are untouched.
- **Rollover.** A Monday 23:50 preview applied at 00:01 is `stale_preview`, with no write.
  On Wednesday the restock is still listed, Tue's carrots are gone, and the past dinner
  refuses swaps (422 `date`). The feed keeps Tue as it was cooked.
- **Hard rules, no write.** Covers locked (409 `slot_locked`), diet exclusion,
  `label_mismatch` (`Roast parsnips`), a label smuggling pork, `same_ingredient`,
  `unknown_ingredient`, `leftover_reserved`, `leftover_consumer_line`, `side_in_recipe`,
  `source_not_found`, a malformed source, source and side together, an empty dinner, a
  pinch, quantity 0 and a stale base. An unavailable carrot is refused and not offered.
  The pantry change also clears the earlier preview (404). Excluded pork is not offered.
- **Boundaries.** No swap route on the feed listener. Cross-origin, cross-site, a missing
  header and a form body are refused on preview and apply, and the configured app origin
  is allowed. Responses are `no-store`. No token or `/feed/` appears in any swap response,
  the shopping list or the log, and the share text has no links.
- **File-backed (skipped here).** Restart keeps swaps, restocks, check marks, sequences and
  the feed, and Undo works after restart. A schema-v1 file (v2 and v3 tables dropped,
  `user_version` 1, swaps stripped from change images) migrates in place: dinners, UIDs,
  sequences, revision and shopping are kept, Undo of the pre-v2 accept works, then a swap
  works.

Contract notes. These are adaptations, not defects. Apply also answers 404
`preview_not_found` for a preview cleared by a later change. A swap made after the day
turns gives `stale_preview`. `/api/shopping` restock rows carry `kind: "restock"` and
`restock: {label, labels, quantity, unit, reasons[], amount}`. Row order is not part of
the contract, so the shape comparisons sort by id.

`swap-share-browser.mjs`, step by step:

1. Seed two dates with one bundled dinner that has no carrots, and open `/`.
2. On the first date, use the visible controls: choose "A separate side", type Brussels
   sprouts 1 lb, then type `carrot` in the search box and check that the picker narrows
   to carrot. The option is picked by setting the `<select>` and firing `change`, because
   headless select popups cannot be clicked.
3. Type `Roast carrots`, 4 each, and preview. The preview shows "Comes off", "Goes on" and
   "Kept for restock", and the diff has Add carrot 4 and Add Brussels sprouts (restock)
   1 lb. The revision and the feed are unchanged.
4. Cancel: nothing changes. Fill again and Apply. The dinner card shows the swap, and the
   other date does not.
5. Open Shopping. Check that the restock row reads `Restock: 1 lb`, then check one row off.
6. Share: the stub gets `{text}` with transient user activation, one line per unchecked
   row with quantities, and the checked row left out.
7. Share cancel shows "Nothing was sent". A share error shows the text fallback.
8. Copy: writeText gets the same text, also under user activation. A denied clipboard
   falls back to the text. With no Web Share API, Share copies instead.
9. Check marks and the revision are unchanged on the server.
10. Undo via the card's confirm dialog. The UID is the same, the SEQUENCE is higher, the
    restock and carrots are gone, and the other date is unchanged.
11. The run requests nothing off-origin, has no CSP violation, no page error and no token
    in the log.

**It has not run anywhere yet.** This worker has no Chrome or Chromium and no DOM library.
What was checked here: the file passes `node --check`, it skips by default and fails under
`KITCHEN_TEST_REQUIRE_BROWSER=1`, and with `KITCHEN_TEST_BROWSER=/bin/false` the service,
the seeding and the dinner choice all run up to the Chrome launch. The injected page
harness parses. The selectors follow `public/app.js` at `c60420b4`. Its first run is the
dev-VM command above, and a red there may be a driver defect rather than a code defect.

Command, from `FrontEnds/kitchen-plan`, Node v22.23.4, on a confined tester worker, at
`c60420b4` (a `git archive` export of origin/dev, because this worker's checkout is
`4efa10bd`):

```bash
node --disable-warning=ExperimentalWarning --test
node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
```

Result: `# tests 22`, `# pass 16`, `# fail 0`, `# skipped 6`, and then `# tests 1`,
`# skipped 1`. Against the baseline: 8 cases were added (6 pass, 2 file-backed skips),
and the `rendered-html` red is now green. 10 + 6 = 16 pass, 4 + 2 = 6 skipped. Every skip
is `file-backed SQLite unavailable here (database is locked)`: the four listed in the
`f80d86b4` entry, plus `swap-share` › restart and `swap-share` › schema-v1 migration.
Neither new file-backed case has run anywhere yet. The browser skip reads `no Google
Chrome or Chromium found`.

Controls. Each splice went into a scratch copy of `c60420b4` outside the repository, one
at a time. Every one turned the named cases red:

| Splice | Red |
|---|---|
| a slot's swaps applied to every date (`view.swaps.get(date)` → all dates) | swap line, side, Undo of latest, rollover |
| feed description drops `Swap:` lines | swap line, side, rollover |
| Undo never withdraws a restock | side, Undo of latest |
| migrations stop at v1 | `rendered-html` fresh database and weak token, every in-memory `swap-share` case |
| the code before v3 (`4efa10bd`) | swap line (bought restock owed again) |

## 2026-11-22 — qa-kitchen-meals-retained-backup on `e97ac22b` (origin/dev)

Why: on the dev VM at `e97ac22b` with `KITCHEN_TEST_REQUIRE_FILE_DB=1` the result was
13 pass, 1 fail, 0 skipped. The red was `meals-acceptance` › scheduled backups. It
restored `written.file`, but that file can already be pruned. `backupNow` stamps its
file with real time, while the four `runScheduledBackup` calls use the simulated
Monday clock (+1 h to +4 h). So which two names survive `keep: 2` depends on the day
the suite runs. This was a test defect, not a code defect. No production file changed.

Rewritten case, which holds under either ordering:

- Records all five names written. Each scheduled call reports the snapshot revision
  and `pruned` is `[0, 1, 1, 1]`. The directory then holds exactly the two newest
  stamps, and every other name is gone. The backup dir is `0700`.
- Each retained file is `0600`, passes `verifyBackup` (recipes, 2 accepted slots,
  snapshot revision) and does not contain the token.
- The newest retained snapshot is used after a later accept (revision +1, tacos on
  2026-11-27). While the service runs, restore is refused and the revision is unchanged.
- After stop, restore reports `from` = that snapshot and the snapshot revision. The
  db is `0600` and the lock is released. The safety backup is `0600` and verified,
  holding revision +1 with 3 accepted slots. Neither the db nor the safety backup
  contains the token. The scheduled backups are untouched.
- After reopen: the revision and every slot equal the snapshot, 2026-11-27 is
  `empty`, and neither the token nor `/feed/` appears in either service log.

No other case changed.

Command, from `FrontEnds/kitchen-plan`, Node v22.23.4, on a confined tester worker:

```bash
node --disable-warning=ExperimentalWarning --test
```

Result: `# tests 14`, `# pass 10`, `# fail 0`, `# skipped 4`. The counts and the skip
list are the same as in the `f80d86b4` entry below. All four skips have the same
cause: `file-backed SQLite unavailable here (database is locked)`. This worker also
refuses `VACUUM INTO` a temp file from `:memory:` (`database is locked`). So **the
rewritten case has not run here, and no worker coverage is claimed for it**, only a
`node --check` syntax pass. It was also not possible to run a control on this worker.
The dev-VM run with `KITCHEN_TEST_REQUIRE_FILE_DB=1` is the first execution of the
rewritten case, and the expected result there is `# pass 14`, `# skipped 0`.

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
