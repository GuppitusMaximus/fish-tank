// Acceptance for dinner swaps and their restocks (qa-kitchen-swap-share).
//
// Every case runs the real service (server/main.mjs startKitchenService)
// on a disposable database: a synthetic Paprika archive whose traybake has a
// Brussels sprouts line and is accepted on two dates, or the bundled
// archive, which has carrots and no Brussels sprouts, for the owner-entered
// side. No household data, device, calendar or share destination is
// touched; the feed is read over loopback only.

import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { crc32, gzipSync } from "node:zlib";
import test from "node:test";
import { startKitchenService } from "../server/main.mjs";
import { generateFeedToken } from "../server/calendar.mjs";
import { parsePaprikaArchive, resolveIngredientKey } from "../server/import.mjs";
import { SCHEMA_VERSION } from "../server/store.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLED = join(ROOT, "data", "kitchen-recipes.paprikarecipes");
const APP_ORIGIN = "https://kitchen.example.test";
const FEED_PUBLIC_ORIGIN = "https://kitchen-feed.example.test";

// --- Synthetic fixture -----------------------------------------------------

const R = {
  traybake: "0B000000-0000-4000-8000-000000000001",
  roast: "0B000000-0000-4000-8000-000000000002",
  wraps: "0B000000-0000-4000-8000-000000000003",
  carrots: "0B000000-0000-4000-8000-000000000004",
  pork: "0B000000-0000-4000-8000-000000000005",
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
  recipe(R.traybake, "Chicken and Sprouts Traybake", "4", "15 min", "40 min", ["Sheetpan"], ["1 pound chicken thighs", "1 pound Brussels sprouts", "2 tablespoons olive oil", "Salt and pepper"]),
  recipe(R.roast, "Roast Chicken", "6", "20 min", "1 hr", ["Batch"], ["2 pounds chicken thighs", "1 pound potatoes", "Salt and pepper"]),
  recipe(R.wraps, "Chicken Leftover Wraps", "2", "10 min", "15 min", ["Quick"], ["2 cups cooked chicken", "4 flour tortillas", "1 cucumber"]),
  recipe(R.carrots, "Glazed Carrots", "4", "10 min", "25 min", ["Side"], ["1 pound carrots", "1 tablespoon butter"]),
  recipe(R.pork, "Pork Chop Supper", "4", "15 min", "35 min", ["Pork"], ["1 pound pork chops", "1 pound potatoes"]),
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

const workdir = () => mkdtempSync(join(tmpdir(), "kitchen-swaps-"));

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

async function startFixture(t, { now, dbPath = ":memory:", archive = paprikaArchive(FIXTURE), token = generateFeedToken() } = {}) {
  const dir = workdir();
  const archivePath = join(dir, "fixture.paprikarecipes");
  writeFileSync(archivePath, archive);
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
  });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { running, token, logs, app: running.appUrl, feed: running.feedOrigin };
}

function raw(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const parsed = /json/.test(res.headers["content-type"] ?? "") && text ? JSON.parse(text) : null;
        resolve({ status: res.statusCode, headers: res.headers, text, body: parsed });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

let keyCounter = 0;
const newKey = () => `qa-swap-${process.pid}-${(keyCounter += 1)}`;

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
const revision = async (fx) => (await get(fx, "/api/health")).revision;
const slotOn = (dashboard, date) => dashboard.slots.find((slot) => slot.date === date);
const feedText = async (fx) => {
  const response = await raw(`${fx.feed}/feed/${fx.token}.ics`);
  assert.equal(response.status, 200);
  return response.text;
};

async function accept(fx, body) {
  const response = await api(fx.app, "POST", "/api/plan/accept", { accept: true, baseRevision: await revision(fx), ...body }, { key: newKey() });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

async function setPantry(fx, name, fields) {
  const key = resolveIngredientKey(fx.running.store, name);
  const current = (await get(fx, "/api/pantry")).items.find((item) => item.ingredientKey === key);
  const response = await api(fx.app, "PUT", `/api/pantry/${encodeURIComponent(name)}`, { ...fields, rev: current?.rev ?? 0 });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

const previewSwap = async (fx, body) => api(fx.app, "POST", "/api/dinner-swaps/preview", { baseRevision: await revision(fx), ...body });
const applySwap = (fx, body, key = newKey()) => api(fx.app, "POST", "/api/dinner-swaps/apply", body, { key });

async function undoLatest(fx) {
  const dashboard = await get(fx, "/api/dashboard");
  assert.ok(dashboard.undo?.undoable, "something is undoable");
  const response = await api(fx.app, "POST", "/api/undo", { baseRevision: dashboard.revision, revision: dashboard.undo.revision }, { key: newKey() });
  assert.equal(response.status, 200, response.text);
  return response.body;
}

async function checkItem(fx, id, checked = true) {
  const item = (await get(fx, "/api/shopping")).items.find((entry) => entry.id === id);
  assert.ok(item, `${id} is on the list`);
  const response = await api(fx.app, "PUT", `/api/shopping/${encodeURIComponent(id)}`, { checked, rev: item.rev });
  assert.equal(response.status, 200, response.text);
  return response.body;
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
const eventOn = (ics, date) => parseEvents(ics).find((event) => event["DTSTART;VALUE=DATE"] === date.replaceAll("-", ""));
const descriptionOn = (ics, date) => unescapeText(eventOn(ics, date)?.DESCRIPTION ?? "");

// Row order is not part of the contract; ids are unique.
const shoppingShape = (items) => [...items].sort((a, b) => (a.id < b.id ? -1 : 1)).map((item) => [item.id, item.quantity, item.unit, item.dates, item.checked, item.kind]);
const byId = (items) => new Map(items.map((item) => [item.id, item]));

// The shopping list a preview promises: the list before, with its diff.
function expectedShopping(before, diff) {
  const expected = new Map(before.map((item) => [item.id, item.quantity]));
  for (const item of diff.removed) expected.delete(item.id);
  for (const item of [...diff.added, ...diff.increased, ...diff.decreased]) expected.set(item.id, item.after);
  return expected;
}

// Monday 2026-11-23, 10:00 Eastern: the shopping window is Mon, Tue, Wed.
const MONDAY = "2026-11-23T15:00:00.000Z";
const TUE = "2026-11-24";
const WED = "2026-11-25";
const THU = "2026-11-26";
const FRI = "2026-11-27";
const SAT = "2026-11-28";

const SPROUTS = "Brussels sprouts";
const ROAST_CARROTS = "Roast carrots";

// --- Line swap on one of two dates sharing a recipe ---------------------------

test("a Brussels sprouts line swapped for roast carrots on one of two traybake dates: deterministic preview, apply once, exact shopping and restock, feed after apply only", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  assert.equal(resolveIngredientKey(store, "carrot"), carrotKey);
  const libraryBefore = await get(fx, `/api/recipes/${R.traybake}`);

  await accept(fx, { slots: [{ date: TUE, recipeUid: R.traybake }, { date: WED, recipeUid: R.traybake }] });
  const accepted = await get(fx, "/api/dashboard");
  const shoppingBefore = (await get(fx, "/api/shopping")).items;
  const feedBefore = await feedText(fx);
  const base = accepted.revision;

  // The sprouts row covers both dates: 1 lb each.
  const sproutRow = byId(shoppingBefore).get(`${sproutKey}|mass`);
  assert.deepEqual([sproutRow.amount, sproutRow.dates], ["2 lb", [TUE, WED]]);
  assert.ok(!shoppingBefore.some((item) => item.ingredientKey === carrotKey), "no carrots before the swap");

  // GET /api/dinner-swaps: the recipe's lines, the catalogue, no swaps yet.
  const sources = await get(fx, `/api/dinner-swaps?date=${TUE}`);
  assert.equal(sources.revision, base);
  assert.equal(sources.date, TUE);
  assert.equal(sources.recipe.uid, R.traybake);
  const sproutSource = sources.sources.find((source) => source.ingredientKey === sproutKey);
  assert.deepEqual([sproutSource.kind, sproutSource.label, sproutSource.quantity, sproutSource.unit, sproutSource.swapped], ["line", SPROUTS, 1, "lb", false]);
  for (const source of sources.sources) assert.equal(typeof source.id, "string");
  assert.ok(sources.ingredients.some((item) => item.key === carrotKey), "carrot can be chosen");
  for (const item of sources.ingredients) assert.deepEqual(Object.keys(item).sort(), ["key", "label"]);
  assert.deepEqual(sources.swaps, []);

  // Preview: deterministic, and nothing accepted changes.
  const request = { date: TUE, sourceId: sproutSource.id, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" };
  const first = await previewSwap(fx, request);
  assert.equal(first.status, 201, first.text);
  const second = await previewSwap(fx, request);
  assert.equal(second.status, 201, second.text);
  const masked = (body) => ({ ...body, previewId: undefined, swapId: undefined });
  assert.notEqual(first.body.previewId, second.body.previewId);
  assert.deepEqual(masked(second.body), masked(first.body), "the same request previews the same swap");
  const preview = first.body;
  assert.deepEqual([preview.baseRevision, preview.date, preview.fromLabel, preview.toLabel], [base, TUE, SPROUTS, ROAST_CARROTS]);
  assert.deepEqual([preview.restock.label, preview.restock.quantity, preview.restock.unit, preview.restock.added], [SPROUTS, 1, "lb", true]);
  const restockId = `restock|${sproutKey}|mass`;
  const diff = preview.shoppingDiff;
  assert.deepEqual(diff.added.map((entry) => [entry.id, entry.amountAfter]).sort(), [[`${carrotKey}|mass`, "1 lb"], [restockId, "1 lb"]].sort());
  assert.deepEqual(diff.decreased.map((entry) => [entry.id, entry.amountBefore, entry.amountAfter]), [[`${sproutKey}|mass`, "2 lb", "1 lb"]]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.restocks.map((entry) => [entry.id, entry.label, entry.quantity, entry.unit, entry.alreadyListed]), [[restockId, SPROUTS, 1, "lb", false]]);
  assert.equal(await revision(fx), base, "a preview records no revision");
  assert.deepEqual((await get(fx, "/api/dashboard")).slots, accepted.slots);
  assert.deepEqual((await get(fx, "/api/shopping")).items, shoppingBefore);
  assert.deepEqual((await get(fx, `/api/dinner-swaps?date=${TUE}`)).swaps, []);
  assert.equal(await feedText(fx), feedBefore, "the feed never shows a preview");

  // Apply needs a key; then exactly once, and a retry replays.
  const applyBody = { baseRevision: base, previewId: preview.previewId };
  const keyless = await api(fx.app, "POST", "/api/dinner-swaps/apply", applyBody);
  assert.equal(keyless.status, 428);
  assert.equal(await revision(fx), base);
  const key = newKey();
  const applied = await applySwap(fx, applyBody, key);
  assert.equal(applied.status, 200, applied.text);
  assert.equal(applied.body.revision, base + 1);
  assert.equal(applied.body.date, TUE);
  assert.equal(applied.body.change.undoable, true);
  assert.deepEqual([applied.body.swap.fromLabel, applied.body.swap.toLabel, applied.body.swap.quantity, applied.body.swap.unit], [SPROUTS, ROAST_CARROTS, 1, "lb"]);
  assert.deepEqual(applied.body.restock, preview.restock);
  assert.deepEqual(applied.body.share, { title: `Dinner on ${TUE}`, text: `Chicken and Sprouts Traybake\nSwap: ${ROAST_CARROTS} instead of ${SPROUTS}` });
  const replay = await applySwap(fx, applyBody, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  assert.deepEqual(replay.body, applied.body);
  const reused = await applySwap(fx, { ...applyBody, baseRevision: base + 1 }, key);
  assert.equal(reused.status, 422);
  assert.equal(reused.body.error.code, "idempotency_key_reused");
  assert.equal(await revision(fx), base + 1, "the retry applied nothing");

  // The other preview is stale now: its base revision is old, and the
  // applied change cleared every outstanding preview.
  const staleByRevision = await applySwap(fx, { baseRevision: base, previewId: second.body.previewId });
  assert.equal(staleByRevision.status, 409);
  assert.equal(staleByRevision.body.error.code, "stale_revision");
  const staleByPreview = await applySwap(fx, { baseRevision: base + 1, previewId: second.body.previewId });
  assert.equal(staleByPreview.status, 404);
  assert.equal(staleByPreview.body.error.code, "preview_not_found");
  assert.equal(await revision(fx), base + 1);

  // Only Tuesday changed; the shared recipe and Wednesday did not.
  const after = await get(fx, "/api/dashboard");
  const tue = slotOn(after, TUE);
  const wed = slotOn(after, WED);
  assert.deepEqual([tue.uid, tue.sequence, tue.recipe.uid], [slotOn(accepted, TUE).uid, slotOn(accepted, TUE).sequence + 1, R.traybake]);
  assert.deepEqual(tue.swaps.map((swap) => [swap.kind, swap.sourceId, swap.fromLabel, swap.toLabel]), [["line", sproutSource.id, SPROUTS, ROAST_CARROTS]]);
  assert.deepEqual(wed, slotOn(accepted, WED), "the other date sharing the recipe is untouched");
  assert.deepEqual(await get(fx, `/api/recipes/${R.traybake}`), libraryBefore, "the recipe library is untouched");
  const tueSources = await get(fx, `/api/dinner-swaps?date=${TUE}`);
  const swappedLine = tueSources.sources.find((source) => source.id === sproutSource.id);
  assert.deepEqual([swappedLine.label, swappedLine.ingredientKey, swappedLine.swapped], [ROAST_CARROTS, carrotKey, true]);
  assert.deepEqual((await get(fx, `/api/dinner-swaps?date=${WED}`)).sources, sources.sources);
  assert.deepEqual((await get(fx, `/api/dinner-swaps?date=${WED}`)).swaps, []);

  // Shopping is exactly what the preview promised, the restock its own row.
  const shoppingAfter = (await get(fx, "/api/shopping")).items;
  assert.deepEqual(new Map(shoppingAfter.map((item) => [item.id, item.quantity])), expectedShopping(shoppingBefore, diff));
  const rows = byId(shoppingAfter);
  assert.deepEqual([rows.get(`${sproutKey}|mass`).amount, rows.get(`${sproutKey}|mass`).dates, rows.get(`${sproutKey}|mass`).kind], ["1 lb", [WED], "plan"]);
  assert.deepEqual([rows.get(`${carrotKey}|mass`).amount, rows.get(`${carrotKey}|mass`).dates], ["1 lb", [TUE]]);
  const restockRow = rows.get(restockId);
  assert.deepEqual([restockRow.kind, restockRow.name, restockRow.amount, restockRow.checked], ["restock", SPROUTS, "1 lb", false]);
  assert.deepEqual([restockRow.restock.label, restockRow.restock.quantity, restockRow.restock.unit], [SPROUTS, 1, "lb"]);
  assert.deepEqual(restockRow.restock.reasons.map((reason) => [reason.date, reason.fromLabel, reason.toLabel, reason.amount]), [[TUE, SPROUTS, ROAST_CARROTS, "1 lb"]]);

  // The feed shows the swap now, on Tuesday's event only.
  const feedAfter = await feedText(fx);
  assert.equal(eventOn(feedAfter, TUE).UID, eventOn(feedBefore, TUE).UID);
  assert.equal(Number(eventOn(feedAfter, TUE).SEQUENCE), Number(eventOn(feedBefore, TUE).SEQUENCE) + 1);
  assert.ok(descriptionOn(feedAfter, TUE).includes(`Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`), descriptionOn(feedAfter, TUE));
  assert.ok(!descriptionOn(feedBefore, TUE).includes("Swap:"));
  assert.deepEqual(eventOn(feedAfter, WED), eventOn(feedBefore, WED));

  // Recalculation keeps the swap and the restock: a note on Tuesday and a
  // pantry edit leave the amounts, and a bought restock stays bought.
  await accept(fx, { slots: [{ date: TUE, recipeUid: R.traybake, note: "Double the carrots glaze" }] });
  assert.equal(slotOn(await get(fx, "/api/dashboard"), TUE).swaps.length, 1, "a note keeps the swap in force");
  await checkItem(fx, restockId);
  await setPantry(fx, "olive oil", { status: "need" });
  await setPantry(fx, SPROUTS, { status: "have", quantity: 2, unit: "lb" });
  const recalculated = byId((await get(fx, "/api/shopping")).items);
  assert.deepEqual([recalculated.get(restockId).amount, recalculated.get(restockId).checked], ["1 lb", true], "pantry stock never cancels a restock; the check mark holds");
  assert.equal(recalculated.get(`${carrotKey}|mass`).amount, "1 lb");
  assert.ok(!recalculated.has(`${sproutKey}|mass`), "Wednesday's sprouts are covered by the pantry");

  // A second dinner is accepted on Tuesday: the swap goes, Undo brings it back.
  const replaced = await accept(fx, { slots: [{ date: TUE, recipeUid: R.roast }] });
  assert.deepEqual(slotOn(await get(fx, "/api/dashboard"), TUE).swaps, []);
  assert.ok(!descriptionOn(await feedText(fx), TUE).includes("Swap:"));
  assert.equal(byId((await get(fx, "/api/shopping")).items).get(restockId).checked, true, "a bought restock outlives its dinner");
  const undone = await undoLatest(fx);
  assert.equal(undone.undone, replaced.revision);
  const back = slotOn(await get(fx, "/api/dashboard"), TUE);
  assert.deepEqual([back.recipe.uid, back.swaps.map((swap) => swap.toLabel)], [R.traybake, [ROAST_CARROTS]]);

  // Wednesday's sprouts swapped too: the bought pound is not owed again.
  // The restock line lists only Wednesday's unbought pound, unchecked.
  const wedPreview = await previewSwap(fx, { ...request, date: WED });
  assert.equal(wedPreview.status, 201, wedPreview.text);
  assert.deepEqual(wedPreview.body.shoppingDiff.restocks.map((entry) => [entry.id, entry.amount]), [[restockId, "1 lb"]]);
  const wedApplied = await applySwap(fx, { baseRevision: wedPreview.body.baseRevision, previewId: wedPreview.body.previewId });
  assert.equal(wedApplied.status, 200, wedApplied.text);
  const owed = byId((await get(fx, "/api/shopping")).items).get(restockId);
  assert.deepEqual([owed.amount, owed.checked, owed.restock.reasons.map((reason) => reason.date)], ["1 lb", false, [WED]]);
});

// --- Owner-entered side on the bundled library -------------------------------

test("the bundled library (carrots, no Brussels sprouts): an owner-entered sprouts side becomes roast carrots, restocks the sprouts, and Undo restores the dinner and list exactly", async (t) => {
  const bundled = parsePaprikaArchive(readFileSync(BUNDLED)).recipes;
  const fx = await startFixture(t, { now: makeClock(MONDAY).now, archive: readFileSync(BUNDLED) });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  const details = new Map();
  for (const { uid } of bundled) details.set(uid, (await get(fx, `/api/recipes/${uid}`)).recipe);
  const keysOf = (detail) => detail.ingredients.flatMap((line) => line.alternatives);
  assert.ok([...details.values()].some((detail) => keysOf(detail).includes(carrotKey)), "the library has carrots");
  assert.ok(![...details.values()].some((detail) => keysOf(detail).includes(sproutKey)), "the library has no Brussels sprouts");
  const dinner = bundled.find((entry) => !keysOf(details.get(entry.uid)).includes(carrotKey) && !entry.categories.includes("Side") && entry.lines.every((line) => !line.optional));
  assert.ok(dinner, "a bundled dinner without carrots");

  await accept(fx, { slots: [{ date: TUE, recipeUid: dinner.uid }, { date: WED, recipeUid: dinner.uid }] });
  const accepted = await get(fx, "/api/dashboard");
  const shoppingBefore = (await get(fx, "/api/shopping")).items;
  const feedBefore = await feedText(fx);
  const sources = await get(fx, `/api/dinner-swaps?date=${TUE}`);
  assert.ok(!sources.sources.some((source) => source.ingredientKey === sproutKey || source.kind === "side"));
  assert.ok(sources.ingredients.some((item) => item.key === carrotKey));
  assert.ok(!sources.ingredients.some((item) => item.key === sproutKey), "sprouts are not a catalogued replacement");

  const request = { date: TUE, sourceId: null, side: { label: SPROUTS, quantity: 1, unit: "lb" }, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 4, unit: "each" };
  const sideOnly = { ...request };
  delete sideOnly.sourceId;
  const omitted = await previewSwap(fx, sideOnly);
  assert.equal(omitted.status, 201, "an omitted sourceId is the same as null");
  const preview = await previewSwap(fx, request);
  assert.equal(preview.status, 201, preview.text);
  const masked = (body) => ({ ...body, previewId: undefined, swapId: undefined, sourceId: undefined });
  assert.deepEqual(masked(preview.body), masked(omitted.body), "side previews are deterministic but for the new side's id");
  assert.match(preview.body.sourceId, /^side:[0-9a-f-]{36}$/);
  assert.deepEqual([preview.body.fromLabel, preview.body.toLabel, preview.body.quantity, preview.body.unit], [SPROUTS, ROAST_CARROTS, 4, "each"]);
  assert.deepEqual([preview.body.restock.label, preview.body.restock.quantity, preview.body.restock.unit, preview.body.restock.amount], [SPROUTS, 1, "lb", "1 lb"]);
  const restockId = `restock|${sproutKey}|mass`;
  assert.deepEqual(preview.body.shoppingDiff.added.map((entry) => [entry.id, entry.amountAfter, entry.name]).sort(), [[`${carrotKey}|each`, "4", "carrot"], [restockId, "1 lb", `${SPROUTS} (restock)`]].sort());
  assert.deepEqual([preview.body.shoppingDiff.removed, preview.body.shoppingDiff.increased, preview.body.shoppingDiff.decreased], [[], [], []]);
  assert.equal(await revision(fx), accepted.revision);
  assert.equal(await feedText(fx), feedBefore);
  assert.deepEqual((await get(fx, "/api/shopping")).items, shoppingBefore);

  // The same side twice is refused once it is on the dinner.
  const applied = await applySwap(fx, { baseRevision: accepted.revision, previewId: preview.body.previewId });
  assert.equal(applied.status, 200, applied.text);
  assert.equal(applied.body.swap.kind, "side");
  assert.equal(applied.body.swap.sourceId, preview.body.sourceId, "the previewed side id is the applied one");
  const again = await previewSwap(fx, request);
  assert.equal(again.status, 422);
  assert.equal(again.body.error.code, "side_in_recipe");

  const shoppingAfter = (await get(fx, "/api/shopping")).items;
  assert.deepEqual(new Map(shoppingAfter.map((item) => [item.id, item.quantity])), expectedShopping(shoppingBefore, preview.body.shoppingDiff));
  const rows = byId(shoppingAfter);
  assert.deepEqual([rows.get(`${carrotKey}|each`).amount, rows.get(`${carrotKey}|each`).dates, rows.get(`${carrotKey}|each`).name], ["4", [TUE], "carrot"]);
  assert.deepEqual([rows.get(restockId).name, rows.get(restockId).amount, rows.get(restockId).kind, rows.get(restockId).restock.reasons[0].toLabel], [SPROUTS, "1 lb", "restock", ROAST_CARROTS]);
  const swapsNow = await get(fx, `/api/dinner-swaps?date=${TUE}`);
  const side = swapsNow.sources.find((source) => source.kind === "side");
  assert.deepEqual([side.id, side.label, side.quantity, side.unit, side.swapped], [preview.body.sourceId, ROAST_CARROTS, 4, "each", true]);
  assert.deepEqual(swapsNow.share.text.split("\n"), [dinner.name, `Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`]);
  assert.deepEqual(slotOn(await get(fx, "/api/dashboard"), WED), slotOn(accepted, WED));
  for (const [uid, detail] of details) assert.deepEqual((await get(fx, `/api/recipes/${uid}`)).recipe, detail, `library recipe ${uid} unchanged`);
  const feedAfter = await feedText(fx);
  assert.ok(descriptionOn(feedAfter, TUE).includes(`Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`));
  assert.deepEqual(eventOn(feedAfter, WED), eventOn(feedBefore, WED));

  // Undo, unbought: dinner, list and feed as before, with a higher SEQUENCE.
  const undone = await undoLatest(fx);
  assert.equal(undone.undone, applied.body.revision);
  const restored = await get(fx, "/api/dashboard");
  const tue = slotOn(restored, TUE);
  assert.deepEqual({ ...tue, sequence: undefined }, { ...slotOn(accepted, TUE), sequence: undefined });
  assert.equal(tue.sequence, slotOn(accepted, TUE).sequence + 2);
  assert.deepEqual(slotOn(restored, WED), slotOn(accepted, WED));
  assert.deepEqual(shoppingShape((await get(fx, "/api/shopping")).items), shoppingShape(shoppingBefore), "the restock is withdrawn and the carrots go");
  assert.deepEqual((await get(fx, `/api/dinner-swaps?date=${TUE}`)).sources, sources.sources);
  const feedUndone = await feedText(fx);
  assert.equal(eventOn(feedUndone, TUE).UID, eventOn(feedBefore, TUE).UID);
  assert.ok(Number(eventOn(feedUndone, TUE).SEQUENCE) > Number(eventOn(feedAfter, TUE).SEQUENCE));
  assert.equal(descriptionOn(feedUndone, TUE), descriptionOn(feedBefore, TUE));
  assert.deepEqual(eventOn(feedUndone, WED), eventOn(feedBefore, WED));

  // Again, bought this time: Undo keeps the checked restock and nothing else.
  const second = await previewSwap(fx, request);
  assert.equal(second.status, 201, second.text);
  const reapplied = await applySwap(fx, { baseRevision: await revision(fx), previewId: second.body.previewId });
  assert.equal(reapplied.status, 200, reapplied.text);
  await checkItem(fx, restockId);
  await undoLatest(fx);
  const kept = (await get(fx, "/api/shopping")).items;
  assert.deepEqual(kept.filter((item) => item.kind === "restock").map((item) => [item.id, item.amount, item.checked]), [[restockId, "1 lb", true]]);
  assert.deepEqual(shoppingShape(kept.filter((item) => item.kind === "plan")), shoppingShape(shoppingBefore));
  assert.deepEqual(slotOn(await get(fx, "/api/dashboard"), TUE).swaps, []);
  for (const [uid, detail] of details) assert.deepEqual((await get(fx, `/api/recipes/${uid}`)).recipe, detail);
});

// --- Undo of one swap keeps an earlier restock --------------------------------

test("Undo of a Wednesday swap restores that dinner and withdraws only its restock; Tuesday's earlier swap and restock stay", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  await accept(fx, { slots: [{ date: TUE, recipeUid: R.traybake }, { date: WED, recipeUid: R.traybake }] });
  const sproutSource = (await get(fx, `/api/dinner-swaps?date=${TUE}`)).sources.find((source) => source.ingredientKey === sproutKey);
  const swap = async (date, quantity) => {
    const preview = await previewSwap(fx, { date, sourceId: sproutSource.id, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity, unit: "lb" });
    assert.equal(preview.status, 201, preview.text);
    const applied = await applySwap(fx, { baseRevision: preview.body.baseRevision, previewId: preview.body.previewId });
    assert.equal(applied.status, 200, applied.text);
    return { preview: preview.body, applied: applied.body };
  };

  await swap(TUE, 1);
  const tuesdayOnly = await get(fx, "/api/dashboard");
  const listTuesdayOnly = (await get(fx, "/api/shopping")).items;
  const feedTuesdayOnly = await feedText(fx);
  const restockId = `restock|${sproutKey}|mass`;
  assert.equal(byId(listTuesdayOnly).get(restockId).amount, "1 lb");

  // Wednesday too: the same restock row now holds both contributions.
  const wednesday = await swap(WED, 1.5);
  assert.deepEqual(wednesday.preview.shoppingDiff.restocks.map((entry) => [entry.id, entry.alreadyListed]), [[restockId, true]]);
  const both = byId((await get(fx, "/api/shopping")).items);
  assert.equal(both.get(restockId).amount, "2 lb");
  assert.deepEqual(both.get(restockId).restock.reasons.map((reason) => reason.date).sort(), [TUE, WED]);
  assert.equal(both.get(`${carrotKey}|mass`).amount, "2.5 lb", "1 lb Tuesday + 1.5 lb Wednesday");
  assert.ok(!both.has(`${sproutKey}|mass`), "no sprouts are cooked any more");

  // Swapping the swapped line again does not restock twice, and swapping it
  // to what it already is is refused.
  const same = await previewSwap(fx, { date: WED, sourceId: sproutSource.id, replacementKey: carrotKey, replacementLabel: "Glazed carrots", quantity: 1, unit: "lb" });
  assert.equal(same.status, 422);
  assert.ok(same.body.error.details.problems.some((problem) => problem.problem === "same_ingredient"));
  const potatoKey = resolveIngredientKey(store, "potatoes");
  const twice = await previewSwap(fx, { date: WED, sourceId: sproutSource.id, replacementKey: potatoKey, replacementLabel: "Roast potatoes", quantity: 1, unit: "lb" });
  assert.equal(twice.status, 201, twice.text);
  assert.equal(twice.body.restock.added, false);
  assert.deepEqual(twice.body.shoppingDiff.restocks, []);

  const undone = await undoLatest(fx);
  assert.equal(undone.undone, wednesday.applied.revision);
  const after = await get(fx, "/api/dashboard");
  assert.deepEqual(slotOn(after, TUE), slotOn(tuesdayOnly, TUE), "Tuesday's swap is untouched");
  const wed = slotOn(after, WED);
  assert.deepEqual({ ...wed, sequence: undefined }, { ...slotOn(tuesdayOnly, WED), sequence: undefined });
  assert.equal(wed.sequence, slotOn(tuesdayOnly, WED).sequence + 2);
  assert.deepEqual(shoppingShape((await get(fx, "/api/shopping")).items), shoppingShape(listTuesdayOnly), "the list is back to Tuesday's swap only, its restock kept");
  const feed = await feedText(fx);
  assert.deepEqual(eventOn(feed, TUE), eventOn(feedTuesdayOnly, TUE));
  assert.equal(eventOn(feed, WED).UID, eventOn(feedTuesdayOnly, WED).UID);
  assert.equal(Number(eventOn(feed, WED).SEQUENCE), Number(eventOn(feedTuesdayOnly, WED).SEQUENCE) + 2);
  assert.equal(descriptionOn(feed, WED), descriptionOn(feedTuesdayOnly, WED));
});

// --- Day rollover ----------------------------------------------------------------

test("a swap preview goes stale across Eastern midnight; after the dinner's day the restock stays listed and the past dinner refuses swaps", async (t) => {
  const clock = makeClock("2026-11-24T04:50:00.000Z"); // Monday 23:50 Eastern
  const fx = await startFixture(t, { now: clock.now });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  await accept(fx, { slots: [{ date: TUE, recipeUid: R.traybake }, { date: WED, recipeUid: R.traybake }] });
  const sproutSource = (await get(fx, `/api/dinner-swaps?date=${TUE}`)).sources.find((source) => source.ingredientKey === sproutKey);
  const request = { date: TUE, sourceId: sproutSource.id, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" };
  const monday = await previewSwap(fx, request);
  assert.equal(monday.status, 201, monday.text);

  clock.advance(11 * 60_000); // Tuesday 00:01 Eastern, before the preview expires
  const base = await revision(fx);
  const turned = await applySwap(fx, { baseRevision: base, previewId: monday.body.previewId });
  assert.equal(turned.status, 409);
  assert.equal(turned.body.error.code, "stale_preview");
  assert.equal(await revision(fx), base);
  assert.deepEqual((await get(fx, `/api/dinner-swaps?date=${TUE}`)).swaps, []);

  const tuesday = await previewSwap(fx, request);
  assert.equal(tuesday.status, 201, tuesday.text);
  const applied = await applySwap(fx, { baseRevision: tuesday.body.baseRevision, previewId: tuesday.body.previewId });
  assert.equal(applied.status, 200, applied.text);
  const restockId = `restock|${sproutKey}|mass`;

  clock.advance(24 * 3_600_000); // Wednesday: Tuesday's dinner is past
  const shopping = await get(fx, "/api/shopping");
  assert.ok(!shopping.dates.includes(TUE), "Tuesday left the window");
  const rows = byId(shopping.items);
  assert.equal(rows.get(restockId)?.amount, "1 lb", "the restock outlives its dinner's day");
  assert.ok(!rows.has(`${carrotKey}|mass`), "Tuesday's carrots are no longer bought");
  assert.equal(rows.get(`${sproutKey}|mass`).amount, "1 lb", "Wednesday still cooks its sprouts");
  const past = await previewSwap(fx, { ...request, sourceId: sproutSource.id });
  assert.equal(past.status, 422);
  assert.equal(past.body.error.details.field, "date");
  assert.ok(descriptionOn(await feedText(fx), TUE).includes(`Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`), "the feed keeps the past dinner as cooked");
});

// --- Hard rules ------------------------------------------------------------------

test("swaps are refused for locked dinners, diet exclusions, unavailable or unknown replacements, mismatched labels, leftover links and bad sources, without any write", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  const porkKey = resolveIngredientKey(store, "pork chops");
  const chickenKey = resolveIngredientKey(store, "chicken thighs");
  const cookedKey = resolveIngredientKey(store, "cooked chicken");
  await accept(fx, {
    slots: [
      { date: TUE, recipeUid: R.traybake },
      { date: THU, recipeUid: R.roast },
      { date: FRI, recipeUid: R.wraps },
      { date: SAT, recipeUid: R.traybake, locked: true },
    ],
    dependencies: [{ producerDate: THU, consumerDate: FRI, servings: 2, ingredientKey: cookedKey, sourceKey: chickenKey }],
  });
  const constraints = await api(fx.app, "PUT", "/api/constraints", { baseRevision: await revision(fx), constraints: { dietaryExclusions: ["pork"] } });
  assert.equal(constraints.status, 200, constraints.text);
  const base = await revision(fx);
  const shopping = (await get(fx, "/api/shopping")).items;
  const feed = await feedText(fx);
  const line = async (date, key) => (await get(fx, `/api/dinner-swaps?date=${date}`)).sources.find((source) => source.ingredientKey === key).id;
  const tueSprouts = await line(TUE, sproutKey);
  const good = { date: TUE, sourceId: tueSprouts, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" };

  const refused = async (name, body, status, code, problem) => {
    const response = await previewSwap(fx, body);
    assert.equal(response.status, status, `${name}: ${response.text}`);
    assert.equal(response.body.error.code, code, name);
    if (problem) assert.ok(response.body.error.details.problems.some((entry) => entry.problem === problem), `${name}: ${JSON.stringify(response.body.error.details)}`);
    return response.body.error;
  };

  await refused("locked dinner", { ...good, date: SAT, sourceId: await line(SAT, sproutKey) }, 409, "slot_locked");
  await refused("diet-excluded replacement", { ...good, replacementKey: porkKey, replacementLabel: "Pork chops" }, 422, "infeasible_swap", "dietary");
  await refused("label naming another food", { ...good, replacementLabel: "Roast parsnips" }, 422, "infeasible_swap", "label_mismatch");
  await refused("label smuggling an excluded food", { ...good, replacementLabel: "Carrots with pork" }, 422, "infeasible_swap");
  await refused("same ingredient", { ...good, replacementKey: sproutKey, replacementLabel: "Roast Brussels sprouts" }, 422, "infeasible_swap", "same_ingredient");
  await refused("uncatalogued replacement", { ...good, replacementKey: "dragon fruit", replacementLabel: "Dragon fruit" }, 422, "infeasible_swap", "unknown_ingredient");
  await refused("leftover source reserved for Friday", { ...good, date: THU, sourceId: await line(THU, chickenKey), replacementLabel: "Roast carrots" }, 422, "infeasible_swap", "leftover_reserved");
  await refused("line fed by Thursday's leftovers", { ...good, date: FRI, sourceId: await line(FRI, cookedKey) }, 422, "infeasible_swap", "leftover_consumer_line");
  await refused("side already in the recipe", { ...good, sourceId: null, side: { label: SPROUTS, quantity: 1, unit: "lb" } }, 422, "side_in_recipe");
  await refused("unknown source", { ...good, sourceId: "line:99" }, 404, "source_not_found");
  await refused("malformed source", { ...good, sourceId: "chicken" }, 422, "invalid_request");
  await refused("both source and side", { ...good, side: { label: "Peas", quantity: 1 } }, 422, "invalid_request");
  await refused("empty dinner", { ...good, date: WED }, 404, "dinner_not_found");
  await refused("immeasurable amount", { ...good, unit: "pinch" }, 422, "invalid_request");
  await refused("no amount", { ...good, quantity: 0 }, 422, "invalid_request");
  await refused("stale base revision", { ...good, baseRevision: base - 1 }, 409, "stale_revision");
  assert.equal((await api(fx.app, "GET", `/api/dinner-swaps?date=${WED}`)).status, 404);

  // An unavailable replacement is refused, and is not offered. The pantry
  // change is a recorded change, so it also clears the earlier preview.
  const preview = await previewSwap(fx, good);
  assert.equal(preview.status, 201, preview.text);
  await setPantry(fx, "carrots", { status: "unavailable" });
  const afterPantry = await revision(fx);
  assert.ok(!(await get(fx, `/api/dinner-swaps?date=${TUE}`)).ingredients.some((item) => item.key === carrotKey), "an unavailable ingredient is not offered");
  await refused("unavailable replacement", good, 422, "infeasible_swap", "unavailable");
  const late = await applySwap(fx, { baseRevision: afterPantry, previewId: preview.body.previewId });
  assert.equal(late.status, 404, late.text);
  assert.equal(late.body.error.code, "preview_not_found");
  assert.ok(!(await get(fx, `/api/dinner-swaps?date=${TUE}`)).ingredients.some((item) => item.key === porkKey), "an excluded ingredient is not offered");

  // Nothing above was written.
  assert.equal(await revision(fx), afterPantry);
  for (const date of [TUE, THU, FRI, SAT]) assert.deepEqual(slotOn(await get(fx, "/api/dashboard"), date).swaps, [], date);
  assert.deepEqual(shoppingShape((await get(fx, "/api/shopping")).items).filter(([id]) => !id.startsWith(`${carrotKey}|`)), shoppingShape(shopping).filter(([id]) => !id.startsWith(`${carrotKey}|`)));
  assert.ok(!(await get(fx, "/api/shopping")).items.some((item) => item.kind === "restock"));
  assert.equal(await feedText(fx), feed);
});

// --- Private boundaries ----------------------------------------------------------

test("swap routes stay on the private listener behind the mutation guards, and no token reaches a swap, a share text or the log", async (t) => {
  const fx = await startFixture(t, { now: makeClock(MONDAY).now });
  const store = fx.running.store;
  const sproutKey = resolveIngredientKey(store, SPROUTS);
  const carrotKey = resolveIngredientKey(store, "carrots");
  await accept(fx, { slots: [{ date: TUE, recipeUid: R.traybake }] });
  const sources = await get(fx, `/api/dinner-swaps?date=${TUE}`);
  const body = { baseRevision: await revision(fx), date: TUE, sourceId: sources.sources.find((source) => source.ingredientKey === sproutKey).id, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" };

  for (const path of [`/api/dinner-swaps?date=${TUE}`, "/api/dinner-swaps/preview", "/api/dinner-swaps/apply"]) {
    const response = await raw(`${fx.feed}${path}`);
    assert.equal(response.status, 404, `feed listener ${path}`);
  }
  for (const [name, headers, code] of [
    ["cross-origin", { origin: "https://evil.example" }, "cross_origin"],
    ["cross-site", { "sec-fetch-site": "cross-site" }, "cross_origin"],
    ["missing header", { "x-kitchen-plan": "0" }, "missing_request_header"],
  ]) {
    const preview = await api(fx.app, "POST", "/api/dinner-swaps/preview", body, { headers });
    assert.equal(preview.body?.error?.code, code, `preview ${name}`);
    const apply = await api(fx.app, "POST", "/api/dinner-swaps/apply", { baseRevision: body.baseRevision, previewId: "x" }, { headers, key: newKey() });
    assert.equal(apply.body?.error?.code, code, `apply ${name}`);
  }
  const form = await raw(`${fx.app}/api/dinner-swaps/preview`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-kitchen-plan": "1" }, body: "date=2026-11-24" });
  assert.equal(form.status, 415);
  const appOrigin = await api(fx.app, "POST", "/api/dinner-swaps/preview", body, { headers: { origin: APP_ORIGIN } });
  assert.equal(appOrigin.status, 201, appOrigin.text);
  const applied = await applySwap(fx, { baseRevision: body.baseRevision, previewId: appOrigin.body.previewId });
  assert.equal(applied.status, 200, applied.text);
  assert.equal(applied.headers["cache-control"], "no-store");

  const texts = [appOrigin.text, applied.text, JSON.stringify(await get(fx, `/api/dinner-swaps?date=${TUE}`)), JSON.stringify(await get(fx, "/api/shopping")), JSON.stringify(fx.logs)];
  for (const text of texts) {
    assert.ok(!text.includes(fx.token), "no token");
    assert.ok(!text.includes("/feed/"), "no feed path");
  }
  assert.ok(!/https?:/.test(applied.body.share.text), "share text carries no links");
});

// --- Storage (file-backed) ---------------------------------------------------------

test("restart on the same file keeps swaps, restocks, check marks, sequences and the feed", needsFileDb, async (t) => {
  const dir = workdir();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "kitchen.sqlite");
  const clock = makeClock(MONDAY);
  const token = generateFeedToken();
  const first = await startFixture(t, { now: clock.now, dbPath, token });
  const sproutKey = resolveIngredientKey(first.running.store, SPROUTS);
  const carrotKey = resolveIngredientKey(first.running.store, "carrots");
  await accept(first, { slots: [{ date: TUE, recipeUid: R.traybake }, { date: WED, recipeUid: R.traybake }] });
  const source = (await get(first, `/api/dinner-swaps?date=${TUE}`)).sources.find((entry) => entry.ingredientKey === sproutKey);
  const preview = await previewSwap(first, { date: TUE, sourceId: source.id, replacementKey: carrotKey, replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" });
  assert.equal((await applySwap(first, { baseRevision: preview.body.baseRevision, previewId: preview.body.previewId })).status, 200);
  await checkItem(first, `restock|${sproutKey}|mass`);
  const dashboard = await get(first, "/api/dashboard");
  const shopping = (await get(first, "/api/shopping")).items;
  const swaps = await get(first, `/api/dinner-swaps?date=${TUE}`);
  const feed = await feedText(first);
  await first.running.close();

  const second = await startFixture(t, { now: clock.now, dbPath, token });
  assert.equal((await get(second, "/api/health")).schemaVersion, SCHEMA_VERSION);
  const reopened = await get(second, "/api/dashboard");
  assert.equal(reopened.revision, dashboard.revision);
  assert.deepEqual(reopened.slots, dashboard.slots);
  assert.deepEqual((await get(second, "/api/shopping")).items, shopping);
  assert.deepEqual(await get(second, `/api/dinner-swaps?date=${TUE}`), swaps);
  assert.deepEqual(parseEvents(await feedText(second)), parseEvents(feed));

  // Undo still works across the restart.
  await undoLatest(second);
  assert.deepEqual(slotOn(await get(second, "/api/dashboard"), TUE).swaps, []);
});

test("a schema-v1 database migrates in place: dinners, UIDs, sequences, revision and Undo of a pre-swap change survive, and swaps then work", needsFileDb, async (t) => {
  const dir = workdir();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "kitchen.sqlite");
  const clock = makeClock(MONDAY);
  const token = generateFeedToken();

  // Build the v1 database: v2 is additive, so a v1 file is this one without
  // the v2 tables, its migration row and with user_version 1.
  const first = await startFixture(t, { now: clock.now, dbPath, token });
  await accept(first, { slots: [{ date: TUE, recipeUid: R.traybake }] });
  const accepted = await accept(first, { slots: [{ date: WED, recipeUid: R.traybake }] });
  const dashboard = await get(first, "/api/dashboard");
  const shopping = (await get(first, "/api/shopping")).items;
  await first.running.close();
  const db = new DatabaseSync(dbPath);
  db.exec("DROP TABLE slot_swaps; DROP TABLE restocks; DELETE FROM schema_migrations WHERE version >= 2; PRAGMA user_version = 1;");
  // Change images written before v2 carry no swaps.
  for (const row of db.prepare("SELECT revision, before_image, after_image FROM changes").all()) {
    const strip = (text) => {
      if (text == null) return text;
      const image = JSON.parse(text);
      delete image.swaps;
      return JSON.stringify(image);
    };
    db.prepare("UPDATE changes SET before_image = ?, after_image = ? WHERE revision = ?").run(strip(row.before_image), strip(row.after_image), row.revision);
  }
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  db.close();

  const second = await startFixture(t, { now: clock.now, dbPath, token });
  assert.equal((await get(second, "/api/health")).schemaVersion, SCHEMA_VERSION);
  const migrated = new DatabaseSync(dbPath, { readOnly: true });
  try {
    assert.deepEqual(migrated.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version), Array.from({ length: SCHEMA_VERSION }, (_, index) => index + 1));
    assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('slot_swaps', 'restocks')").all().length === 2);
  } finally {
    migrated.close();
  }
  const reopened = await get(second, "/api/dashboard");
  assert.equal(reopened.revision, dashboard.revision);
  assert.deepEqual(reopened.slots, dashboard.slots);
  assert.deepEqual((await get(second, "/api/shopping")).items, shopping);

  // Undo of the pre-v2 accept, then a swap on the migrated database.
  const undone = await undoLatest(second);
  assert.equal(undone.undone, accepted.revision);
  assert.equal(slotOn(await get(second, "/api/dashboard"), WED).status, "empty");
  const sproutKey = resolveIngredientKey(second.running.store, SPROUTS);
  const source = (await get(second, `/api/dinner-swaps?date=${TUE}`)).sources.find((entry) => entry.ingredientKey === sproutKey);
  const preview = await previewSwap(second, { date: TUE, sourceId: source.id, replacementKey: resolveIngredientKey(second.running.store, "carrots"), replacementLabel: ROAST_CARROTS, quantity: 1, unit: "lb" });
  assert.equal(preview.status, 201, preview.text);
  const applied = await applySwap(second, { baseRevision: preview.body.baseRevision, previewId: preview.body.previewId });
  assert.equal(applied.status, 200, applied.text);
  assert.ok(descriptionOn(await feedText(second), TUE).includes(`Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`));
});
