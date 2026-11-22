// Acceptance for the server-backed meal plan (qa-kitchen-meals-acceptance).
//
// Everything runs against disposable databases and a synthetic Paprika
// archive built here: a Tuesday chicken dinner whose leftovers feed a
// Wednesday dinner, with alternatives that each trip one hard rule. The
// bundled archive is used only for the import checks. No household data,
// device or calendar is touched; the feed is read over loopback only.

import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { crc32, gzipSync } from "node:zlib";
import test from "node:test";
import { runScheduledBackup, startKitchenService } from "../server/main.mjs";
import { escapeText, generateFeedToken } from "../server/calendar.mjs";
import { parsePaprikaArchive, resolveIngredientKey } from "../server/import.mjs";
import { assignmentProblems, compareOptions, loadContext } from "../server/planner.mjs";
import { addDays, easternDate } from "../server/store.mjs";
import { restoreBackup, verifyBackup } from "../server/backup.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLED = join(ROOT, "data", "kitchen-recipes.paprikarecipes");
const APP_ORIGIN = "https://kitchen.example.test";
const FEED_PUBLIC_ORIGIN = "https://kitchen-feed.example.test";

// --- Synthetic fixture -----------------------------------------------------

const ROAST_NAME = "Roast Chicken; Lemon, Garlic \\ Herbs — poulet rôti 🍋 façon grand-mère pour toute la famille";
const R = {
  roast: "0A000000-0000-4000-8000-000000000001",
  wraps: "0a000000-0000-4000-8000-000000000002", // lower-case on purpose: kept as supplied
  skillet: "0A000000-0000-4000-8000-000000000003",
  bake: "0A000000-0000-4000-8000-000000000004",
  forTwo: "0A000000-0000-4000-8000-000000000005",
  tacos: "0A000000-0000-4000-8000-000000000006",
  toast: "0A000000-0000-4000-8000-000000000007",
  saffron: "0A000000-0000-4000-8000-000000000008",
  pork: "0A000000-0000-4000-8000-000000000009",
  braise: "0A000000-0000-4000-8000-00000000000A",
};

const recipe = (uid, name, servings, prep, total, categories, ingredients) => ({
  uid,
  name,
  servings,
  prep_time: prep,
  cook_time: "",
  total_time: total,
  categories,
  ingredients: ingredients.join("\n"),
  directions: "Cook it.",
  description: "",
  notes: "",
  source: "QA fixture",
  source_url: "",
});

const FIXTURE = [
  recipe(R.roast, ROAST_NAME, "6", "20 min", "1 hr", ["Batch"], ["2 pounds chicken thighs", "1 pound potatoes", "2 tablespoons olive oil", "Salt and pepper"]),
  recipe(R.wraps, "Chicken Leftover Wraps", "2", "10 min", "15 min", ["Quick"], ["2 cups cooked chicken", "4 flour or corn tortillas", "1 cucumber"]),
  recipe(R.skillet, "Lemon Chicken Skillet", "4", "15 min", "25 min", ["Quick"], ["1 pound chicken breasts", "1 lemon", "Salt and pepper"]),
  recipe(R.bake, "Chicken Rice Bake", "4", "10 min", "50 min", ["Batch"], ["1 pound chicken thighs", "1 cup rice", "Salt and pepper"]),
  recipe(R.forTwo, "Chicken for Two", "2", "10 min", "20 min", ["Quick"], ["1 pound chicken thighs", "1 cup rice"]),
  recipe(R.tacos, "Black Bean Tacos", "4", "10 min", "20 min", ["Quick"], ["1 can black beans", "8 corn tortillas", "1 cucumber"]),
  recipe(R.toast, "Tiny Toast", "1", "5 min", "5 min", ["Quick"], ["1 slice bread"]),
  recipe(R.saffron, "Saffron Rice", "4", "10 min", "30 min", ["Rice"], ["1 pinch of saffron", "1 cup rice"]),
  recipe(R.pork, "Pork Chop Supper", "4", "15 min", "35 min", ["Pork"], ["1 pound pork chops", "1 pound potatoes"]),
  recipe(R.braise, "Slow Braised Beans", "6", "45 min", "3 hr", ["Batch"], ["1 pound dried beans", "1 onion"]),
];

// A stored (method 0) zip of gzipped JSON entries, like a Paprika export.
function paprikaArchive(recipes) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const source of recipes) {
    const name = Buffer.from(`${source.name.replace(/[^A-Za-z0-9 ]/g, "")}.paprikarecipe`);
    const data = gzipSync(Buffer.from(JSON.stringify(source)));
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(recipes.length, 8);
  end.writeUInt16LE(recipes.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// --- Harness ---------------------------------------------------------------

const workdir = () => mkdtempSync(join(tmpdir(), "kitchen-acceptance-"));

// See tests/README.md: confined QA workers deny SQLite file locks.
function fileDbProblem() {
  const dir = workdir();
  try {
    const db = new DatabaseSync(join(dir, "probe.sqlite"));
    try {
      db.exec("CREATE TABLE probe (x)");
    } finally {
      db.close();
    }
    return null;
  } catch (error) {
    return error.message;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const FILE_DB_PROBLEM = fileDbProblem();
const needsFileDb = FILE_DB_PROBLEM && process.env.KITCHEN_TEST_REQUIRE_FILE_DB !== "1"
  ? { skip: `file-backed SQLite unavailable here (${FILE_DB_PROBLEM}); run on the dev VM` }
  : {};

function makeClock(iso) {
  const clock = { t: Date.parse(iso), now: () => new Date(clock.t), advance: (ms) => (clock.t += ms) };
  return clock;
}

async function startFixture(t, { now, dbPath = ":memory:", archive = paprikaArchive(FIXTURE), ...overrides } = {}) {
  const dir = workdir();
  const archivePath = join(dir, "fixture.paprikarecipes");
  writeFileSync(archivePath, archive);
  const token = generateFeedToken();
  const logs = [];
  const running = await startKitchenService({
    env: {},
    dbPath,
    archivePath,
    host: "127.0.0.1",
    port: 0,
    feedHost: "127.0.0.1",
    feedPort: 0,
    feedToken: token,
    appOrigin: APP_ORIGIN,
    feedPublicOrigin: FEED_PUBLIC_ORIGIN,
    now,
    log: (event, fields) => logs.push({ event, ...fields }),
    ...overrides,
  });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { running, token, logs, app: running.appUrl, feed: running.feedOrigin, archivePath };
}

function raw(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const text = bytes.toString("utf8");
        let parsed = null;
        if (/json/.test(res.headers["content-type"] ?? "") && text) parsed = JSON.parse(text);
        resolve({ status: res.statusCode, headers: res.headers, bytes, text, body: parsed });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

let keyCounter = 0;
const newKey = () => `qa-key-${process.pid}-${(keyCounter += 1)}`;

function api(base, method, path, body, { key, headers = {} } = {}) {
  const all = { ...headers };
  if (body !== undefined) {
    all["content-type"] = "application/json";
    all["x-kitchen-plan"] ??= "1";
  }
  if (key) all["idempotency-key"] = key;
  return raw(`${base}${path}`, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) });
}

const get = async (fx, path) => {
  const response = await api(fx.app, "GET", path);
  assert.equal(response.status, 200, `${path}: ${response.text}`);
  return response.body;
};
const feedText = async (fx) => {
  const response = await raw(`${fx.feed}/feed/${fx.token}.ics`);
  assert.equal(response.status, 200);
  return response;
};
const revision = async (fx) => (await get(fx, "/api/health")).revision;
const slotOn = (dashboard, date) => dashboard.slots.find((slot) => slot.date === date);

async function setPantry(fx, name, fields) {
  const current = (await get(fx, "/api/pantry")).items.find((item) => item.ingredientKey === resolveIngredientKey(fx.running.store, name));
  const response = await api(fx.app, "PUT", `/api/pantry/${encodeURIComponent(name)}`, { ...fields, rev: current?.rev ?? 0 });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

async function accept(fx, body, key = newKey()) {
  return api(fx.app, "POST", "/api/plan/accept", { accept: true, baseRevision: await revision(fx), ...body }, { key });
}

// Unfolds and splits a calendar into VEVENT property maps.
function parseEvents(ics) {
  return ics
    .replace(/\r\n[ \t]/g, "")
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((block) => {
      const props = {};
      for (const line of block.split("\r\n")) {
        if (line === "END:VEVENT") break;
        const colon = line.indexOf(":");
        props[line.slice(0, colon)] = line.slice(colon + 1);
      }
      return props;
    });
}
const unescapeText = (value) => value.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
const eventOn = (events, date) => events.find((event) => event["DTSTART;VALUE=DATE"] === date.replaceAll("-", ""));
const shoppingShape = (items) => items.map((item) => [item.id, item.quantity, item.unit, item.dates, item.recipes.map((r) => r.uid)]);

// Monday 2026-11-23, 10:00 Eastern: Tuesday and Wednesday sit inside the
// three-day shopping window.
const MONDAY = "2026-11-23T15:00:00.000Z";
const TUE = "2026-11-24";
const WED = "2026-11-25";

// Constraints, pantry and the accepted Tuesday chicken -> Wednesday leftovers
// pair, all through the HTTP API.
async function seedScenario(fx) {
  const constraints = await api(fx.app, "PUT", "/api/constraints", {
    baseRevision: await revision(fx),
    constraints: { dietaryExclusions: ["pork"], workload: { byWeekday: { tue: { maxPrepMinutes: 30 } } } },
  });
  assert.equal(constraints.status, 200, constraints.text);
  await setPantry(fx, "Chicken Thighs", { status: "have", quantity: 1, unit: "lb" });
  await setPantry(fx, "lemon", { status: "have", useSoon: true });
  await setPantry(fx, "cucumber", { status: "have" });
  await setPantry(fx, "flour tortillas", { status: "unavailable" });
  await setPantry(fx, "saffron", { status: "unavailable" });
  return {
    slots: [
      { date: TUE, recipeUid: R.roast, prepMinutes: 25 },
      { date: WED, recipeUid: R.wraps.toUpperCase() },
    ],
    dependencies: [{ producerDate: TUE, consumerDate: WED, servings: 2, ingredientKey: "cooked chicken" }],
  };
}

// --- Import ------------------------------------------------------------------

test("the bundled Paprika archive imports once, re-imports as unchanged, keeps its uids and normalizes aliases", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now, archive: readFileSync(BUNDLED) });
  const bundled = parsePaprikaArchive(readFileSync(BUNDLED));
  assert.deepEqual(bundled.skipped, []);
  const first = fx.logs.find((entry) => entry.event === "recipes_imported");
  assert.deepEqual([first.added, first.updated, first.unchanged, first.conflicts], [bundled.recipes.length, 0, 0, 0]);

  const listed = (await get(fx, "/api/recipes")).recipes;
  assert.deepEqual(listed.map((r) => r.uid).sort(), bundled.recipes.map((r) => r.uid).sort(), "uids exactly as supplied");
  const rev = await revision(fx);
  for (let pass = 0; pass < 2; pass += 1) {
    const again = fx.running.service.importArchive(readFileSync(BUNDLED));
    assert.deepEqual([again.added, again.updated, again.unchanged, again.conflicts.length], [0, 0, bundled.recipes.length, 0]);
  }
  assert.equal(await revision(fx), rev, "repeat imports record no revision");
  assert.equal((await get(fx, "/api/recipes")).recipes.length, bundled.recipes.length);

  // Surface forms resolve to one canonical ingredient key.
  const store = fx.running.store;
  for (const [surface, key] of [["Garlic Cloves", "garlic"], ["chicken thighs", "chicken"], ["Yellow Potatoes", "potato"], ["Vegetable Oil", "neutral oil"], ["Cheddar Cheese", "cheddar"]]) {
    assert.equal(resolveIngredientKey(store, surface), key, surface);
  }
  const pantry = await setPantry(fx, "Garlic Cloves", { status: "have" });
  assert.equal(pantry.item.ingredientKey, "garlic");
  const detail = (await get(fx, `/api/recipes/${bundled.recipes[0].uid.toLowerCase()}`)).recipe;
  assert.equal(detail.uid, bundled.recipes[0].uid, "lookup ignores case, answers with the stored uid");
  assert.ok(detail.ingredients.every((line) => line.alternatives.includes(line.ingredientKey)));
});

test("a lower-case Paprika uid is kept as supplied and an upper-cased re-export matches it", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  assert.ok((await get(fx, "/api/recipes")).recipes.some((r) => r.uid === R.wraps));
  const shouted = FIXTURE.map((source) => ({ ...source, uid: source.uid.toUpperCase() }));
  const result = fx.running.service.importArchive(paprikaArchive(shouted));
  assert.deepEqual([result.added, result.updated, result.unchanged], [0, 0, FIXTURE.length]);
  const uids = (await get(fx, "/api/recipes")).recipes.map((r) => r.uid);
  assert.equal(uids.length, FIXTURE.length);
  assert.ok(uids.includes(R.wraps) && !uids.includes(R.wraps.toUpperCase()));
});

// --- Accept, preview and the hard rules ------------------------------------

test("Tuesday chicken with Wednesday leftovers: accept, exact shopping, deterministic preview, ranking and every rejection rule", async (t) => {
  const clock = makeClock(MONDAY);
  const fx = await startFixture(t, { now: clock.now });
  const plan = await seedScenario(fx);

  // Insufficient surplus is refused before any write.
  const before = await revision(fx);
  const tooHungry = await accept(fx, { ...plan, dependencies: [{ ...plan.dependencies[0], servings: 5 }] });
  assert.equal(tooHungry.status, 422);
  assert.equal(tooHungry.body.error.code, "insufficient_yield");
  assert.deepEqual(tooHungry.body.error.details, { producerDate: TUE, consumerDate: WED, problem: "insufficient_yield" });
  const tooSmall = await accept(fx, { ...plan, slots: [{ date: TUE, recipeUid: R.forTwo }, plan.slots[1]] });
  assert.equal(tooSmall.status, 422);
  assert.equal(tooSmall.body.error.code, "insufficient_yield");
  const unavailable = await accept(fx, { slots: [{ date: TUE, recipeUid: R.saffron }] });
  assert.equal(unavailable.status, 422);
  assert.deepEqual(unavailable.body.error.details.problems, [{ date: TUE, problem: "unavailable" }]);
  const noConsent = await api(fx.app, "POST", "/api/plan/accept", { ...plan, accept: false, baseRevision: before }, { key: newKey() });
  assert.equal(noConsent.status, 422);
  assert.equal(noConsent.body.error.code, "explicit_acceptance_required");
  assert.equal(await revision(fx), before, "rejected accepts write nothing");

  const accepted = await accept(fx, plan);
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.body.revision, before + 1);
  assert.deepEqual(accepted.body.warnings, []);
  const dashboard = await get(fx, "/api/dashboard");
  const tue = slotOn(dashboard, TUE);
  const wed = slotOn(dashboard, WED);
  assert.deepEqual([tue.recipe.uid, tue.prepMinutes, tue.prepOverride, tue.servings, tue.sequence], [R.roast, 25, true, 2, 1]);
  assert.deepEqual([wed.recipe.uid, wed.servings, wed.sequence], [R.wraps, 2, 1], "a case-different uid resolves to the stored one");
  assert.deepEqual(wed.consumes.map((dep) => [dep.producerDate, dep.ingredientKey, dep.sourceKey, dep.servings, dep.problem]), [[TUE, "cooked chicken", "chicken", 2, null]]);
  assert.deepEqual(dashboard.review.map((day) => [day.date, day.status]), [["2026-11-23", "empty"], [TUE, "accepted"], [WED, "accepted"]]);

  // Review: leftovers, have, need and use-soon states line by line.
  const review = (await get(fx, "/api/review")).days;
  assert.deepEqual(review[2].lines.map((line) => [line.ingredientKey, line.status]), [["cooked chicken", "leftover"], ["corn tortilla", "need"], ["cucumber", "have"]]);
  assert.deepEqual(review[1].lines.map((line) => [line.ingredientKey, line.status, line.partial]), [["chicken", "need", true], ["potato", "need", false], ["olive oil", "have", false], ["salt", "have", false], ["black pepper", "have", false]]);

  // Exact quantity-aware shopping: 2 lb chicken less 1 lb on hand, the
  // tortilla alternative that can be bought, nothing for leftovers or staples.
  const shopping = await get(fx, "/api/shopping");
  assert.deepEqual(shopping.dates, ["2026-11-23", TUE, WED]);
  assert.deepEqual(shopping.items.map((item) => [item.id, item.quantity, item.unit, item.amount, item.dates]), [
    ["chicken|mass", 453.592, "g", "1 lb", [TUE]],
    ["corn tortilla|each", 4, "each", "4", [WED]],
    ["potato|mass", 453.592, "g", "1 lb", [TUE]],
  ]);
  assert.deepEqual(shopping.blocked, []);

  // Preview: deterministic, writes nothing but itself.
  const feedBefore = (await feedText(fx)).text;
  const revBefore = await revision(fx);
  const one = await api(fx.app, "POST", "/api/previews", { baseRevision: revBefore, date: TUE });
  const two = await api(fx.app, "POST", "/api/previews", { baseRevision: revBefore, date: TUE });
  assert.equal(one.status, 201, one.text);
  assert.notEqual(one.body.previewId, two.body.previewId);
  for (const field of ["options", "rejected", "considered", "explored", "current", "targetDate", "baseRevision"]) {
    assert.deepEqual(two.body[field], one.body[field], field);
  }
  assert.deepEqual((await get(fx, `/api/previews/${one.body.previewId}`)).options, one.body.options);
  assert.equal(await revision(fx), revBefore);
  assert.equal((await feedText(fx)).text, feedBefore, "previews leave the accepted feed alone");
  assert.deepEqual((await get(fx, "/api/shopping")).items, shopping.items, "previews leave the accepted shopping alone");

  // Ranking: lexicographic by compareOptions, at most three.
  const { options, rejected } = one.body;
  assert.ok(options.length >= 2 && options.length <= 3);
  options.forEach((option, index) => assert.equal(option.rank, index + 1));
  for (let index = 1; index < options.length; index += 1) assert.ok(compareOptions(options[index - 1], options[index]) < 0, `option ${index} ranks before ${index + 1}`);
  const top = options[0];
  assert.deepEqual(top.changes, [{ date: TUE, fromRecipeUid: R.roast, fromRecipeName: ROAST_NAME, toRecipeUid: R.skillet, toRecipeName: "Lemon Chicken Skillet", servings: 2 }]);
  assert.deepEqual(top.reasons, ["Covers 4 of 4 ingredients from the pantry", "No new shopping", "Uses soon: lemon", "15 min prep, 25 min total"]);
  assert.deepEqual(top.metrics, { coverage: { covered: 4, total: 4 }, purchases: 0, useSoon: 1, disruption: 1, repeats: 0, prepMinutes: 15, totalMinutes: 25, leftoverServings: 0 });
  assert.deepEqual(top.droppedDependencies, []);
  assert.deepEqual(top.impactedDates, [TUE]);
  assert.deepEqual(top.shoppingDiff, {
    added: [],
    removed: [
      { id: "chicken|mass", ingredientKey: "chicken", bucket: "mass", before: 453.592, after: null, amountBefore: "1 lb", amountAfter: null, dates: [TUE] },
      { id: "potato|mass", ingredientKey: "potato", bucket: "mass", before: 453.592, after: null, amountBefore: "1 lb", amountAfter: null, dates: [TUE] },
    ],
    increased: [],
    decreased: [],
  });
  // An option whose Tuesday recipe cannot feed Wednesday also replaces Wednesday.
  for (const option of options) {
    if (option.changes.length === 1) continue;
    assert.equal(option.changes[1].date, WED);
    assert.ok(option.reasons.includes(`Also changes ${WED} to ${option.changes[1].toRecipeName} because it relied on leftovers from a changed dinner`));
    assert.ok(option.reasons.includes(`Drops the planned leftovers from ${TUE}`));
  }
  for (const reason of ["unavailable", "dietary", "workload", "insufficient_yield"]) assert.ok(rejected[reason] > 0, `rejected.${reason}: ${JSON.stringify(rejected)}`);
  assert.ok(!options.some((option) => option.changes.some((change) => [R.saffron, R.pork, R.braise, R.toast].includes(change.toRecipeUid))));

  // The same hard rules, named per date, for single assignments.
  const ctx = loadContext(fx.running.store);
  const rules = (uid) => assignmentProblems(ctx, new Map([[TUE, uid]]));
  assert.deepEqual(rules(R.skillet), []);
  assert.deepEqual(rules(R.forTwo), [{ date: WED, problem: "broken_dependency", producerDate: TUE }, { date: TUE, problem: "insufficient_yield" }], "too little surplus for Wednesday");
  assert.deepEqual(rules(R.saffron).map((p) => p.problem), ["unavailable", "broken_dependency"]);
  assert.deepEqual(rules(R.pork).map((p) => p.problem), ["dietary", "broken_dependency"]);
  assert.deepEqual(rules(R.braise).map((p) => p.problem), ["workload", "broken_dependency"]);
  assert.deepEqual(rules(R.toast).map((p) => p.problem), ["broken_dependency", "insufficient_yield"]);

  // Locked downstream slot: no option may change the producer under it.
  const lock = await accept(fx, { slots: [{ date: WED, locked: true }] });
  assert.equal(lock.status, 200, lock.text);
  const locked = await api(fx.app, "POST", "/api/previews", { baseRevision: await revision(fx), date: TUE });
  assert.equal(locked.status, 201);
  assert.deepEqual(locked.body.options, []);
  assert.ok(locked.body.rejected.locked_dependent > 0, JSON.stringify(locked.body.rejected));
  assert.deepEqual(assignmentProblems(loadContext(fx.running.store), new Map([[TUE, R.skillet]])), [{ date: WED, problem: "locked_dependent", producerDate: TUE }]);
  const lockedSelf = await api(fx.app, "POST", "/api/previews", { baseRevision: await revision(fx), date: WED });
  assert.equal(lockedSelf.status, 409);
  assert.equal(lockedSelf.body.error.code, "slot_locked");
  const underLock = await accept(fx, { slots: [{ date: TUE, recipeUid: R.skillet }] });
  assert.equal(underLock.status, 409);
  assert.deepEqual(underLock.body.error.details.problems, [{ date: WED, problem: "locked_dependency", producerDate: TUE, consumerDate: WED }]);
  const unlock = await accept(fx, { slots: [{ date: WED, locked: false }] });
  assert.equal(unlock.status, 200, unlock.text);
});

// --- Commit, Undo, feed ----------------------------------------------------

test("explicit commit replaces both dinners, shopping and feed atomically; Undo restores them with higher sequences", async (t) => {
  const clock = makeClock(MONDAY);
  const fx = await startFixture(t, { now: clock.now });
  const plan = await seedScenario(fx);
  assert.equal((await accept(fx, plan)).status, 200);
  const stalePreview = await api(fx.app, "POST", "/api/previews", { baseRevision: await revision(fx), date: TUE });

  // With chicken unavailable every Tuesday replacement loses Wednesday's
  // leftovers, so every option changes both dinners.
  await setPantry(fx, "chicken", { status: "unavailable" });
  const base = await revision(fx);
  const accepted = await get(fx, "/api/dashboard");
  // The accepted pair is kept as accepted, but Tuesday can no longer cook
  // Wednesday's leftover source, and shopping says so on Tuesday.
  assert.equal(slotOn(accepted, WED).recipe.uid, R.wraps);
  assert.equal(slotOn(accepted, WED).consumes[0].problem, "leftover_source_unavailable");
  const blocked = (await get(fx, "/api/shopping")).blocked;
  assert.ok(blocked.some((item) => item.date === TUE && item.kind === "dependency" && item.problem === "leftover_source_unavailable" && item.ingredientKey === "chicken"), JSON.stringify(blocked));
  const shoppingBefore = (await get(fx, "/api/shopping")).items;
  const feedBefore = parseEvents((await feedText(fx)).text);
  const p1 = await api(fx.app, "POST", "/api/previews", { baseRevision: base, date: TUE });
  const p2 = await api(fx.app, "POST", "/api/previews", { baseRevision: base, date: TUE });
  assert.equal(p1.status, 201);
  assert.ok(p1.body.options.length > 0);
  assert.ok(p1.body.options.every((option) => option.changes.map((change) => change.date).join() === `${TUE},${WED}`));
  const option = p1.body.options[0];
  assert.deepEqual(option.droppedDependencies, [{ producerDate: TUE, consumerDate: WED, ingredientKey: "cooked chicken", servings: 2 }]);
  const commitBody = (preview, optionId = option.optionId) => ({ baseRevision: base, previewId: preview.body.previewId, optionId });

  // A preview from before the pantry change is gone; an old revision is stale.
  const gone = await api(fx.app, "POST", "/api/commit", { baseRevision: base, previewId: stalePreview.body.previewId, optionId: stalePreview.body.options[0].optionId }, { key: newKey() });
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error.code, "preview_not_found");
  const stale = await api(fx.app, "POST", "/api/commit", { ...commitBody(p1), baseRevision: base - 1 }, { key: newKey() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "stale_revision");

  // Forged selections.
  const forgedOption = await api(fx.app, "POST", "/api/commit", commitBody(p1, "f".repeat(32)), { key: newKey() });
  assert.equal(forgedOption.status, 422);
  assert.equal(forgedOption.body.error.code, "unknown_option");
  const forgedPreview = await api(fx.app, "POST", "/api/commit", { ...commitBody(p1), previewId: "00000000-0000-4000-8000-000000000000" }, { key: newKey() });
  assert.equal(forgedPreview.status, 404);
  const extraField = await api(fx.app, "POST", "/api/commit", { ...commitBody(p1), toRecipeUid: R.saffron }, { key: newKey() });
  assert.equal(extraField.status, 422);
  const noKey = await api(fx.app, "POST", "/api/commit", commitBody(p1));
  assert.equal(noKey.status, 428);
  const tamper = async (mutate) => {
    const preview = await api(fx.app, "POST", "/api/previews", { baseRevision: base, date: TUE });
    const body = structuredClone(preview.body);
    mutate(body.options[0]);
    fx.running.store.db.prepare("UPDATE previews SET body = ? WHERE id = ?").run(JSON.stringify(body), preview.body.previewId);
    return api(fx.app, "POST", "/api/commit", commitBody(preview, body.options[0].optionId), { key: newKey() });
  };
  const infeasible = await tamper((forged) => (forged.changes[0].toRecipeUid = R.saffron));
  assert.equal(infeasible.status, 409);
  assert.equal(infeasible.body.error.code, "option_invalid");
  assert.deepEqual(infeasible.body.error.details.problems.map((p) => [p.date, p.problem]), [[TUE, "unavailable"]]);
  const swapped = await tamper((forged) => (forged.changes[1].toRecipeUid = forged.changes[1].toRecipeUid === R.tacos ? R.braise : R.tacos));
  assert.equal(swapped.status, 422);
  assert.equal(swapped.body.error.code, "unknown_option", "an option rewritten behind its id is refused");
  assert.equal(await revision(fx), base, "nothing above wrote");

  // A failure after the slots are written rolls everything back.
  const failKey = newKey();
  const realRecalculate = fx.running.service.recalculateShopping;
  fx.running.service.recalculateShopping = () => {
    throw new Error("injected shopping failure");
  };
  const failed = await api(fx.app, "POST", "/api/commit", commitBody(p1), { key: failKey });
  fx.running.service.recalculateShopping = realRecalculate;
  assert.equal(failed.status, 500);
  assert.equal(await revision(fx), base);
  assert.deepEqual((await get(fx, "/api/dashboard")).slots, accepted.slots);
  assert.deepEqual(parseEvents((await feedText(fx)).text), feedBefore);

  // Two devices commit the same option at once: exactly one wins. The
  // failed key retries cleanly because nothing was stored for it.
  const otherKey = newKey();
  const raced = await Promise.all([
    api(fx.app, "POST", "/api/commit", commitBody(p1), { key: failKey }),
    api(fx.app, "POST", "/api/commit", commitBody(p2), { key: otherKey }),
  ]);
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  const winner = raced.find((r) => r.status === 200);
  const winnerKey = winner === raced[0] ? failKey : otherKey;
  const loser = raced.find((r) => r.status === 409);
  assert.equal(loser.body.error.code, "stale_revision");
  const committed = winner.body;
  assert.equal(committed.revision, base + 1);
  assert.equal(committed.change.kind, "commit");
  assert.deepEqual(committed.change.dates, [TUE, WED]);
  assert.equal(committed.change.undoable, true);

  // Retries replay; a reused key with another body is refused.
  const replay = await api(fx.app, "POST", "/api/commit", winner === raced[0] ? commitBody(p1) : commitBody(p2), { key: winnerKey });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  assert.deepEqual(replay.body, committed);
  const reused = await api(fx.app, "POST", "/api/commit", { ...commitBody(p1), baseRevision: base + 1 }, { key: winnerKey });
  assert.equal(reused.status, 422);
  assert.equal(reused.body.error.code, "idempotency_key_reused");
  const afterRace = await api(fx.app, "POST", "/api/commit", { ...commitBody(p2), baseRevision: base + 1 }, { key: newKey() });
  assert.equal(afterRace.status, 404, "a commit clears every outstanding preview");
  assert.equal(await revision(fx), base + 1);

  // Both dinners, the dependency, shopping and the feed moved together.
  const now = await get(fx, "/api/dashboard");
  for (const change of option.changes) {
    const slot = slotOn(now, change.date);
    const was = slotOn(accepted, change.date);
    assert.equal(slot.recipe.uid, change.toRecipeUid);
    assert.equal(slot.uid, was.uid, "slot UID is stable");
    assert.equal(slot.sequence, was.sequence + 1);
    assert.equal(slot.servings, 2);
  }
  assert.deepEqual(slotOn(now, WED).consumes, []);
  const shoppingAfter = (await get(fx, "/api/shopping")).items;
  const expected = new Map(shoppingBefore.map((item) => [item.id, item.quantity]));
  for (const item of option.shoppingDiff.removed) expected.delete(item.id);
  for (const item of [...option.shoppingDiff.added, ...option.shoppingDiff.increased, ...option.shoppingDiff.decreased]) expected.set(item.id, item.after);
  assert.deepEqual(new Map(shoppingAfter.map((item) => [item.id, item.quantity])), expected, "shopping changed exactly as previewed");
  const feedAfter = parseEvents((await feedText(fx)).text);
  for (const change of option.changes) {
    const event = eventOn(feedAfter, change.date);
    const old = eventOn(feedBefore, change.date);
    assert.equal(event.UID, old.UID);
    assert.equal(Number(event.SEQUENCE), Number(old.SEQUENCE) + 1);
    assert.equal(unescapeText(event.SUMMARY), change.toRecipeName);
  }

  // Undo the commit: a fresh revision restores both dinners, the leftovers
  // link and the shopping list, with higher sequences.
  const undoKey = newKey();
  const undoBody = { baseRevision: base + 1, revision: now.undo.revision };
  assert.equal(now.undo.revision, committed.revision);
  const undone = await api(fx.app, "POST", "/api/undo", undoBody, { key: undoKey });
  assert.equal(undone.status, 200, undone.text);
  assert.equal(undone.body.revision, base + 2);
  assert.equal(undone.body.undone, committed.revision);
  assert.equal(undone.body.change.kind, "undo");
  const restored = await get(fx, "/api/dashboard");
  for (const date of [TUE, WED]) {
    const slot = slotOn(restored, date);
    const was = slotOn(accepted, date);
    assert.deepEqual([slot.recipe.uid, slot.uid, slot.servings, slot.prepMinutes], [was.recipe.uid, was.uid, was.servings, was.prepMinutes]);
    assert.equal(slot.sequence, was.sequence + 2);
  }
  assert.deepEqual(slotOn(restored, WED).consumes, slotOn(accepted, WED).consumes);
  assert.deepEqual(shoppingShape((await get(fx, "/api/shopping")).items), shoppingShape(shoppingBefore));
  const feedUndone = parseEvents((await feedText(fx)).text);
  for (const date of [TUE, WED]) {
    const event = eventOn(feedUndone, date);
    assert.equal(event.UID, eventOn(feedBefore, date).UID);
    assert.ok(Number(event.SEQUENCE) > Number(eventOn(feedAfter, date).SEQUENCE));
    assert.equal(event.SUMMARY, eventOn(feedBefore, date).SUMMARY);
  }
  const undoReplay = await api(fx.app, "POST", "/api/undo", undoBody, { key: undoKey });
  assert.equal(undoReplay.headers["idempotency-replayed"], "true");
  assert.equal(await revision(fx), base + 2);
  const twice = await api(fx.app, "POST", "/api/undo", { baseRevision: base + 2, revision: committed.revision }, { key: newKey() });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error.code, "not_latest_change");
});

test("a preview expires after 15 minutes and goes stale when the Eastern day turns", async (t) => {
  // Monday 23:50 Eastern.
  const clock = makeClock("2026-11-24T04:50:00.000Z");
  const fx = await startFixture(t, { now: clock.now });
  assert.equal(easternDate(clock.now()), "2026-11-23");
  assert.equal((await accept(fx, { slots: [{ date: TUE, recipeUid: R.skillet }] })).status, 200);
  const preview = async () => (await api(fx.app, "POST", "/api/previews", { baseRevision: await revision(fx), date: TUE })).body;
  const commit = async (body) => api(fx.app, "POST", "/api/commit", { baseRevision: await revision(fx), previewId: body.previewId, optionId: body.options[0].optionId }, { key: newKey() });

  const late = await preview();
  clock.advance(12 * 60 * 1000); // Tuesday 00:02 Eastern, inside the TTL
  const turned = await commit(late);
  assert.equal(turned.status, 409);
  assert.equal(turned.body.error.code, "stale_preview");

  const early = await preview();
  clock.advance(16 * 60 * 1000);
  const expired = await commit(early);
  assert.equal(expired.status, 409);
  assert.equal(expired.body.error.code, "preview_expired");
  assert.equal((await api(fx.app, "GET", `/api/previews/${early.previewId}`)).status, 404);
  const fresh = await commit(await preview());
  assert.equal(fresh.status, 200, fresh.text);
});

test("feed events are all-day Eastern dates across both DST changes with app-owned HTTPS URLs, servings, prep, MPID, escaping and UTF-8-safe folding", async (t) => {
  for (const [instant, today, dates] of [
    // Saturday 23:30 EST, the night before clocks go forward.
    ["2027-03-14T04:30:00.000Z", "2027-03-13", ["2027-03-13", "2027-03-14", "2027-03-15"]],
    // Saturday 21:00 EDT, the night before clocks go back.
    ["2026-11-01T01:00:00.000Z", "2026-10-31", ["2026-10-31", "2026-11-01", "2026-11-02"]],
  ]) {
    const clock = makeClock(instant);
    const fx = await startFixture(t, { now: clock.now });
    const dashboard = await get(fx, "/api/dashboard");
    assert.equal(dashboard.today, today);
    assert.deepEqual(dashboard.slots.map((slot) => slot.date), Array.from({ length: 14 }, (_, n) => addDays(today, n)));
    const response = await accept(fx, {
      slots: [
        { date: dates[0], recipeUid: R.roast, servings: 3, prepMinutes: 25 },
        { date: dates[1], recipeUid: R.wraps },
        { date: dates[2], recipeUid: R.tacos, servings: 4 },
      ],
    });
    assert.equal(response.status, 200, response.text);
    const feed = await feedText(fx);
    assert.match(feed.headers["content-type"], /^text\/calendar; charset=utf-8$/);

    // Valid UTF-8, every physical line at most 75 octets and none split
    // inside a multi-byte sequence.
    new TextDecoder("utf-8", { fatal: true }).decode(feed.bytes);
    const physical = feed.text.split("\r\n");
    assert.equal(physical.pop(), "");
    for (const line of physical) {
      assert.ok(Buffer.byteLength(line) <= 75, `folded line too long: ${line}`);
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(line));
      assert.ok(!/�/.test(line));
    }
    assert.ok(physical.some((line) => line.startsWith(" ")), "the long summary is folded");

    const events = parseEvents(feed.text);
    assert.equal(events.length, 3);
    const ids = new Map(dashboard.slots.map((slot) => [slot.date, slot.uid]));
    const expectations = [
      [dates[0], R.roast, ROAST_NAME, 3, "Prep 25 min", "Total 60 min"],
      [dates[1], R.wraps, "Chicken Leftover Wraps", 2, "Prep 10 min", "Total 15 min"],
      [dates[2], R.tacos, "Black Bean Tacos", 4, "Prep 10 min", "Total 20 min"],
    ];
    for (const [date, uid, name, servings, prep, total] of expectations) {
      const event = eventOn(events, date);
      const compact = date.replaceAll("-", "");
      assert.equal(event.UID, ids.get(date));
      assert.equal(event.SEQUENCE, "1");
      assert.equal(event["DTSTART;VALUE=DATE"], compact);
      assert.equal(event["DTEND;VALUE=DATE"], addDays(date, 1).replaceAll("-", ""));
      assert.ok(!Object.keys(event).some((key) => /TZID|^DTSTART$|^DTEND$/.test(key)), "all-day dates, no times or zones");
      assert.equal(event.SUMMARY, escapeText(name));
      assert.equal(unescapeText(event.SUMMARY), name);
      const url = `${APP_ORIGIN}/recipes/${encodeURIComponent(uid)}`;
      assert.equal(event["URL;VALUE=URI"], url);
      assert.deepEqual(unescapeText(event.DESCRIPTION).split("\n"), [`Dinner for ${servings}`, prep, total, `Recipe: ${url}`, `MPID:kp-${compact}`]);
      assert.equal(event["X-KITCHEN-PLAN-MPID"], `kp-${compact}`);
      assert.equal(event["X-KITCHEN-PLAN-SERVINGS"], String(servings));
      assert.equal((await raw(`${fx.app}${new URL(url).pathname}`)).status, 200, "the recipe link opens the app");
      assert.equal((await get(fx, `/api/recipes/${encodeURIComponent(uid)}`)).recipe.uid, uid);
    }
    assert.equal(eventOn(events, dates[0]).SUMMARY, "Roast Chicken\\; Lemon\\, Garlic \\\\ Herbs — poulet rôti 🍋 façon grand-mère pour toute la famille");

    // Across the change the Eastern day and the horizon move by calendar day.
    clock.advance(3 * 3_600_000);
    const next = await get(fx, "/api/dashboard");
    assert.equal(next.today, dates[1]);
    assert.equal(next.slots[0].date, dates[1]);
    assert.equal(next.slots.filter((slot) => slot.status === "empty").length, 12);
    assert.equal(parseEvents((await feedText(fx)).text).length, 3, "yesterday's dinner stays in the feed");
  }
});

test("the feed is HTTPS-origin only and recipe links never point anywhere but the app", async () => {
  await assert.rejects(startKitchenService({ env: {}, dbPath: ":memory:", archivePath: null, port: 0, feedPort: 0, appOrigin: "http://kitchen.example.test", log: () => {} }), /https:\/\//);
  await assert.rejects(startKitchenService({ env: {}, dbPath: ":memory:", archivePath: null, port: 0, feedPort: 0, appOrigin: "https://kitchen.example.test/app", log: () => {} }), /without path/);
});

// --- Secret and private boundaries -----------------------------------------

test("secret and private boundaries: one feed route, guarded mutations, an owner-only subscription URL and no token in logs or data", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  assert.equal((await accept(fx, { slots: [{ date: TUE, recipeUid: R.skillet }] })).status, 200);

  // Feed listener: the exact token path only.
  const good = await raw(`${fx.feed}/feed/${fx.token}.ics`);
  assert.equal(good.status, 200);
  assert.equal(good.headers["cache-control"], "private, max-age=0, must-revalidate");
  assert.equal(good.headers["x-robots-tag"], "noindex");
  assert.equal((await raw(`${fx.feed}/feed/${fx.token}.ics`, { headers: { "if-none-match": good.headers.etag } })).status, 304);
  assert.equal((await raw(`${fx.feed}/feed/${fx.token}.ics`, { method: "HEAD" })).status, 200);
  assert.equal((await raw(`${fx.feed}/feed/${fx.token}.ics`, { method: "POST" })).status, 405);
  for (const path of [`/feed/${generateFeedToken()}.ics`, `/feed/${fx.token.slice(0, -1)}.ics`, `/feed/${fx.token}.ICS`, `/feed/${fx.token}`, "/feed/", "/", "/api/dashboard", "/api/health"]) {
    const response = await raw(`${fx.feed}${path}`);
    assert.equal(response.status, 404, path);
    assert.ok(!response.text.includes("BEGIN:VCALENDAR"));
  }

  // Private listener: no feed, Host allowlist, guarded mutations.
  assert.equal((await raw(`${fx.app}/feed/${fx.token}.ics`)).status, 404);
  const evilHost = await raw(`${fx.app}/api/dashboard`, { headers: { host: "evil.example" } });
  assert.equal(evilHost.status, 403);
  assert.equal(evilHost.body.error.code, "host_not_allowed");
  assert.equal((await raw(`${fx.app}/api/health`, { headers: { host: "kitchen.example.test" } })).status, 200);
  const pantryBody = { status: "have", rev: 0 };
  const crossOrigin = await api(fx.app, "PUT", "/api/pantry/rice", pantryBody, { headers: { origin: "https://evil.example" } });
  assert.equal(crossOrigin.body.error.code, "cross_origin");
  const crossSite = await api(fx.app, "PUT", "/api/pantry/rice", pantryBody, { headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(crossSite.body.error.code, "cross_origin");
  const noHeader = await api(fx.app, "PUT", "/api/pantry/rice", pantryBody, { headers: { "x-kitchen-plan": "0" } });
  assert.equal(noHeader.body.error.code, "missing_request_header");
  const form = await raw(`${fx.app}/api/pantry/rice`, { method: "PUT", headers: { "content-type": "application/x-www-form-urlencoded", "x-kitchen-plan": "1" }, body: "status=have&rev=0" });
  assert.equal(form.status, 415);
  const appOrigin = await api(fx.app, "PUT", "/api/pantry/rice", pantryBody, { headers: { origin: APP_ORIGIN } });
  assert.equal(appOrigin.status, 200, "the configured app origin may mutate");

  // Subscription URL: only on an explicit same-origin owner request, never cached.
  assert.equal((await raw(`${fx.app}/owner/subscription`)).status, 405);
  assert.equal((await raw(`${fx.app}/owner/subscription`, { method: "POST" })).status, 403);
  assert.equal((await raw(`${fx.app}/owner/subscription`, { method: "POST", headers: { "x-kitchen-plan": "1", origin: "https://evil.example" } })).status, 403);
  const owner = await raw(`${fx.app}/owner/subscription`, { method: "POST", headers: { "x-kitchen-plan": "1" } });
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.body, { url: `${FEED_PUBLIC_ORIGIN}/feed/${fx.token}.ics` });
  assert.match(owner.headers["cache-control"], /no-store/);

  // The token appears nowhere else: API reads, the shell, the feed body, the log.
  for (const path of ["/api/dashboard", "/api/slots", "/api/review", "/api/recipes", "/api/pantry", "/api/constraints", "/api/shopping", "/api/changes", "/", "/app.js", "/sw.js", "/manifest.webmanifest"]) {
    const response = await raw(`${fx.app}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok(!response.text.includes(fx.token), `${path} leaks the token`);
    if (path.startsWith("/api/")) assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.ok(!good.text.includes(fx.token));
  assert.ok(!(await get(fx, "/api/dashboard")).slots.some((slot) => JSON.stringify(slot).includes("/feed/")));
  const logText = JSON.stringify(fx.logs);
  assert.ok(!logText.includes(fx.token), "the token never reaches the log");
  assert.ok(!logText.includes("/feed/"), "feed paths never reach the log");
  assert.ok(fx.logs.some((entry) => entry.event === "feed_request" && entry.status === 404));
});

// --- Storage: restart and backups (file-backed) -----------------------------

test("restart on the same file keeps accepted dinners, UIDs, sequences, leftovers, shopping and the feed", needsFileDb, async (t) => {
  const dir = workdir();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "kitchen.sqlite");
  const clock = makeClock(MONDAY);
  const first = await startFixture(t, { now: clock.now, dbPath });
  const plan = await seedScenario(first);
  assert.equal((await accept(first, plan)).status, 200);
  const dashboard = await get(first, "/api/dashboard");
  const shopping = (await get(first, "/api/shopping")).items;
  const feed = parseEvents((await feedText(first)).text);
  await first.running.close();
  assert.ok(!existsSync(`${dbPath}.lock`), "close releases the lock");

  const second = await startFixture(t, { now: clock.now, dbPath });
  const imported = second.logs.find((entry) => entry.event === "recipes_imported");
  assert.deepEqual([imported.added, imported.updated, imported.unchanged], [0, 0, FIXTURE.length]);
  const reopened = await get(second, "/api/dashboard");
  assert.equal(reopened.revision, dashboard.revision);
  assert.deepEqual(reopened.slots, dashboard.slots);
  assert.deepEqual((await get(second, "/api/shopping")).items, shopping);
  assert.deepEqual(parseEvents((await feedText(second)).text), feed);
});

test("scheduled backups are verified 0600 snapshots without the token; restore refuses a running service and brings the plan back", needsFileDb, async (t) => {
  const dir = workdir();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "kitchen.sqlite");
  const backupDir = join(dir, "backups");
  const clock = makeClock(MONDAY);
  const fx = await startFixture(t, { now: clock.now, dbPath, backupDir, backupKeep: 2 });
  const plan = await seedScenario(fx);
  assert.equal((await accept(fx, plan)).status, 200);
  const atBackup = await get(fx, "/api/dashboard");

  const written = fx.running.backupNow();
  assert.ok(written, JSON.stringify(fx.logs.filter((entry) => entry.event === "backup_failed")));
  assert.equal(written.revision, atBackup.revision);
  assert.equal(statSync(written.file).mode & 0o777, 0o600);
  const report = verifyBackup(written.file);
  assert.equal(report.ok, true, report.problems.join("; "));
  assert.deepEqual([report.recipes, report.acceptedSlots, report.revision], [FIXTURE.length, 2, atBackup.revision]);
  assert.ok(!readFileSync(written.file).includes(Buffer.from(fx.token)), "the token is not in the database");

  // Pruning keeps the newest `keep` scheduled backups only. backupNow stamps
  // the file with real time and these with the simulated clock, so which
  // five names survive depends on the day the suite runs: derive the
  // expected survivors from the names written, never from written.file.
  const scheduledNames = () => readdirSync(backupDir).filter((name) => /^kitchen-plan-\d{8}T\d{6}Z\.sqlite$/.test(name)).sort();
  const writtenNames = [basename(written.file)];
  assert.deepEqual(scheduledNames(), writtenNames);
  const pruned = [];
  for (const hours of [1, 2, 3, 4]) {
    const result = runScheduledBackup({ store: fx.running.store, dir: backupDir, keep: 2, now: new Date(clock.t + hours * 3_600_000) });
    assert.equal(result.revision, atBackup.revision);
    writtenNames.push(basename(result.file));
    pruned.push(result.pruned);
  }
  assert.equal(new Set(writtenNames).size, 5, `five distinct stamps: ${writtenNames.join(", ")}`);
  assert.deepEqual(pruned, [0, 1, 1, 1], "each backup past the second prunes exactly one");
  const retained = [...writtenNames].sort().reverse().slice(0, 2);
  assert.deepEqual(scheduledNames(), [...retained].sort(), "exactly the two newest stamps remain");
  for (const name of writtenNames.filter((name) => !retained.includes(name))) assert.ok(!existsSync(join(backupDir, name)), `${name} was pruned`);
  assert.equal(statSync(backupDir).mode & 0o777, 0o700);
  for (const name of retained) {
    const file = join(backupDir, name);
    assert.equal(statSync(file).mode & 0o777, 0o600, name);
    const kept = verifyBackup(file);
    assert.equal(kept.ok, true, `${name}: ${kept.problems.join("; ")}`);
    assert.deepEqual([kept.recipes, kept.acceptedSlots, kept.revision], [FIXTURE.length, 2, atBackup.revision], name);
    assert.ok(!readFileSync(file).includes(Buffer.from(fx.token)), `${name} holds the token`);
  }
  const snapshot = join(backupDir, retained[0]);

  // A later change, then restore a retained snapshot.
  const change = await accept(fx, { slots: [{ date: "2026-11-27", recipeUid: R.tacos }] });
  assert.equal(change.status, 200, change.text);
  assert.equal(change.body.revision, atBackup.revision + 1);
  assert.equal(slotOn(await get(fx, "/api/dashboard"), "2026-11-27").recipe.uid, R.tacos);
  assert.throws(() => restoreBackup({ backupPath: snapshot, dbPath }), /Stop the Kitchen Plan service/);
  assert.equal(await revision(fx), atBackup.revision + 1, "a refused restore leaves the running service alone");
  await fx.running.close();
  const restored = restoreBackup({ backupPath: snapshot, dbPath });
  assert.equal(restored.from, snapshot);
  assert.equal(restored.revision, atBackup.revision);
  assert.equal(statSync(dbPath).mode & 0o777, 0o600);
  assert.ok(!existsSync(`${dbPath}.lock`), "restore releases its lock");

  // The pre-restore safety copy holds the change the restore discarded.
  assert.ok(restored.safetyBackup, "restore keeps a safety backup");
  assert.equal(statSync(restored.safetyBackup).mode & 0o777, 0o600);
  const safety = verifyBackup(restored.safetyBackup);
  assert.equal(safety.ok, true, safety.problems.join("; "));
  assert.deepEqual([safety.revision, safety.acceptedSlots], [atBackup.revision + 1, 3]);
  for (const file of [dbPath, restored.safetyBackup]) assert.ok(!readFileSync(file).includes(Buffer.from(fx.token)), `${file} holds the token`);
  assert.deepEqual(scheduledNames(), [...retained].sort(), "restore leaves the scheduled backups alone");

  const reopened = await startFixture(t, { now: clock.now, dbPath });
  const dashboard = await get(reopened, "/api/dashboard");
  assert.equal(dashboard.revision, atBackup.revision);
  assert.deepEqual(dashboard.slots, atBackup.slots);
  assert.equal(slotOn(dashboard, "2026-11-27").status, "empty");
  const logText = JSON.stringify([...fx.logs, ...reopened.logs]);
  assert.ok(!logText.includes(fx.token) && !logText.includes(reopened.token), "no token in the log");
  assert.ok(!logText.includes("/feed/"), "no feed path in the log");
});
