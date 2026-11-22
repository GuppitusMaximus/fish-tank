// Normal-entrypoint checks: `node server/main.mjs` as deployed, on a fresh
// disposable database with the bundled Paprika archive. The seed-meal vinext
// worker (dist/server/index.js) is no longer what the household runs.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateFeedToken } from "../server/calendar.mjs";
import { parsePaprikaArchive } from "../server/import.mjs";
import { SCHEMA_VERSION, addDays, easternDate } from "../server/store.mjs";
import { DatabaseSync } from "node:sqlite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLED = join(ROOT, "data", "kitchen-recipes.paprikarecipes");
const APP_ORIGIN = "https://kitchen.example.test";

function startEntrypoint(env) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(ROOT, "server", "main.mjs")], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, KITCHEN_HOST: "127.0.0.1", KITCHEN_PORT: "0", KITCHEN_FEED_HOST: "127.0.0.1", KITCHEN_FEED_PORT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  const events = [];
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  const ready = new Promise((resolve, reject) => {
    let buffered = "";
    child.stderr.on("data", (chunk) => {
      output.stderr += chunk;
      buffered += chunk;
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        let event = null;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        events.push(event);
        if (event.event === "listening") resolve(event);
      }
    });
    exited.then(({ code }) => reject(Object.assign(new Error(`entrypoint exited with ${code} before listening`), { code, events })));
  });
  return {
    child,
    ready,
    events,
    output,
    exited,
    async stop() {
      if (child.exitCode == null) child.kill("SIGTERM");
      return exited;
    },
  };
}

function request(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const json = async (url, options) => {
  const response = await request(url, options);
  return { ...response, body: JSON.parse(response.text) };
};

const workdir = () => mkdtempSync(join(tmpdir(), "kitchen-entry-"));

// File-backed SQLite needs POSIX file locks. Confined QA workers deny them
// ("database is locked" on the first write), so the tests that need a real
// database file are skipped there with the probe's error, and must run on the
// dev VM, where KITCHEN_TEST_REQUIRE_FILE_DB=1 turns any skip into a failure.
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

// Storage-independent, so it runs on a fresh in-memory database everywhere;
// the file-backed first boot is covered by the restart test below.
test("server/main.mjs on a fresh database serves the private page, 14 empty dinners, an empty 3-day review and a feed with zero events", async (t) => {
  const token = generateFeedToken();
  const before = easternDate(new Date());
  const service = startEntrypoint({ KITCHEN_DB_PATH: ":memory:", KITCHEN_FEED_TOKEN: token, KITCHEN_APP_ORIGIN: APP_ORIGIN });
  t.after(() => service.stop());
  const listening = await service.ready;
  assert.match(listening.app, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(listening.feed, /^http:\/\/127\.0\.0\.1:\d+$/);

  // Private page: the app shell, no plan data and no seed meals.
  const page = await request(`${listening.app}/`, { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /^text\/html\b/i);
  assert.match(page.text, /<title>Kitchen Plan<\/title>/);
  assert.match(page.text, /<script type="module" src="\/app\.js"><\/script>/);
  assert.match(page.text, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.doesNotMatch(page.text, /Beef Tacos|Black Beans|codex-preview|SkeletonPreview/);
  assert.match(page.headers["content-security-policy"], /default-src 'none'/);
  assert.match(page.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(page.headers["x-frame-options"], "DENY");
  assert.equal(page.headers["referrer-policy"], "no-referrer");
  const recipePage = await request(`${listening.app}/recipes/03C29A87-943A-5638-BD1C-37C2A2FB43A5`);
  assert.equal(recipePage.status, 200);
  assert.equal(recipePage.text, page.text);
  assert.equal((await request(`${listening.app}/calendar/kitchen-plan.ics`)).status, 404, "the seed feed route is gone");

  const health = await json(`${listening.app}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  // A fresh database runs every migration: health reports the newest one.
  assert.equal(health.body.schemaVersion, SCHEMA_VERSION);
  assert.ok(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 2, "the swap migration (v2) is in the service");

  // 14 empty dinner dates from Eastern today for two adults; nothing accepted.
  const dashboard = await json(`${listening.app}/api/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers["cache-control"], "no-store");
  const today = dashboard.body.today;
  assert.ok([before, easternDate(new Date())].includes(today), `today ${today} is Eastern today`);
  assert.equal(dashboard.body.timeZone, "America/New_York");
  assert.equal(dashboard.body.diners, 2);
  assert.equal(dashboard.body.slots.length, 14);
  dashboard.body.slots.forEach((slot, index) => {
    assert.equal(slot.date, addDays(today, index));
    assert.equal(slot.status, "empty");
    assert.equal(slot.recipe, null);
    assert.equal(slot.servings, 2);
    assert.equal(slot.sequence, 0);
    assert.match(slot.uid, /^[0-9a-f-]{36}$/);
  });
  assert.equal(new Set(dashboard.body.slots.map((slot) => slot.uid)).size, 14);
  assert.deepEqual(dashboard.body.review.map((day) => [day.date, day.status, day.counts]), [0, 1, 2].map((n) => [addDays(today, n), "empty", null]));
  assert.deepEqual(dashboard.body.shopping, { total: 0, unchecked: 0 });
  assert.equal(dashboard.body.undo ?? null, null, "nothing to undo");

  // The v2 tables exist: the swap route reads them and finds no dinner.
  const swaps = await json(`${listening.app}/api/dinner-swaps?date=${today}`);
  assert.equal(swaps.status, 404, swaps.text);
  assert.equal(swaps.body.error.code, "dinner_not_found");

  const review = await json(`${listening.app}/api/review`);
  assert.deepEqual(review.body.days.map((day) => [day.date, day.status, day.lines.length]), [0, 1, 2].map((n) => [addDays(today, n), "empty", 0]));

  // The bundled archive is imported with its uids exactly as supplied.
  const recipes = await json(`${listening.app}/api/recipes`);
  const bundled = parsePaprikaArchive(readFileSync(BUNDLED)).recipes.map((recipe) => recipe.uid).sort();
  assert.deepEqual(recipes.body.recipes.map((recipe) => recipe.uid).sort(), bundled);
  const imported = service.events.find((event) => event.event === "recipes_imported");
  assert.deepEqual({ ...imported, at: undefined }, { at: undefined, event: "recipes_imported", added: bundled.length, updated: 0, unchanged: 0, skipped: 0, conflicts: 0 });

  // The public listener: one route, zero events on a fresh database.
  const feed = await request(`${listening.feed}/feed/${token}.ics`);
  assert.equal(feed.status, 200);
  assert.match(feed.headers["content-type"], /^text\/calendar\b/i);
  assert.match(feed.text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(feed.text, /\r\nEND:VCALENDAR\r\n$/);
  assert.equal((feed.text.match(/BEGIN:VEVENT/g) ?? []).length, 0);
  assert.doesNotMatch(feed.text.replace(/\r\n/g, ""), /\n/, "every line ends in CRLF");
  assert.equal((await request(`${listening.feed}/feed/${generateFeedToken()}.ics`)).status, 404);
  assert.equal((await request(`${listening.feed}/`)).status, 404);
  assert.equal((await request(`${listening.feed}/api/dashboard`)).status, 404);
  assert.equal((await request(`${listening.app}/feed/${token}.ics`)).status, 404, "the private listener never serves the feed");

  await service.stop();
  const exit = await service.exited;
  assert.equal(exit.code, 0);
  assert.ok(service.events.some((event) => event.event === "stopping"));
  assert.ok(!service.output.stderr.includes(token), "the token never reaches the log");
  assert.ok(!service.output.stderr.includes("/feed/"), "feed paths never reach the log");
});

test("server/main.mjs restarted on the same database re-imports the bundled archive as unchanged and keeps every slot", needsFileDb, async (t) => {
  const dir = workdir();
  const env = { KITCHEN_DB_PATH: join(dir, "kitchen.sqlite"), KITCHEN_APP_ORIGIN: APP_ORIGIN };
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const first = startEntrypoint(env);
  const one = await first.ready;
  const before = (await json(`${one.app}/api/dashboard`)).body;
  assert.equal(before.slots.length, 14);
  assert.ok(before.slots.every((slot) => slot.status === "empty"));
  assert.equal(first.events.find((event) => event.event === "recipes_imported").added, 15);
  assert.equal((await first.stop()).code, 0);

  const second = startEntrypoint(env);
  t.after(() => second.stop());
  const two = await second.ready;
  const after = (await json(`${two.app}/api/dashboard`)).body;
  const imported = second.events.find((event) => event.event === "recipes_imported");
  assert.equal(imported.added, 0);
  assert.equal(imported.updated, 0);
  assert.equal(imported.unchanged, (await json(`${two.app}/api/recipes`)).body.recipes.length);
  assert.equal(after.revision, before.revision, "an unchanged import records no revision");
  assert.deepEqual(after.slots.map((slot) => [slot.date, slot.uid, slot.sequence]), before.slots.map((slot) => [slot.date, slot.uid, slot.sequence]));
  assert.ok(second.events.some((event) => event.event === "feed_disabled" && event.reason === "token_missing"));
  assert.equal(two.feed, null);
});

test("server/main.mjs keeps the feed listener off for a token under 256 bits and never logs it", async (t) => {
  const service = startEntrypoint({ KITCHEN_DB_PATH: ":memory:", KITCHEN_FEED_TOKEN: "short-token" });
  t.after(() => service.stop());
  const listening = await service.ready;
  assert.equal(listening.feed, null);
  assert.ok(service.events.some((event) => event.event === "feed_disabled" && event.reason === "token_too_weak"));
  assert.equal((await request(`${listening.app}/feed/short-token.ics`)).status, 404);
  await service.stop();
  assert.ok(!service.output.stderr.includes("short-token"));
});

test("server/main.mjs refuses a database another process holds", needsFileDb, async (t) => {
  const dir = workdir();
  const dbPath = join(dir, "kitchen.sqlite");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const holder = startEntrypoint({ KITCHEN_DB_PATH: dbPath });
  t.after(() => holder.stop());
  const listening = await holder.ready;

  const intruder = startEntrypoint({ KITCHEN_DB_PATH: dbPath });
  await assert.rejects(intruder.ready, (error) => error.code === 1);
  const failure = intruder.events.find((event) => event.event === "startup_failed");
  assert.match(failure.message, /in use by process \d+/);
  assert.equal((await json(`${listening.app}/api/health`)).body.ok, true, "the holder keeps serving");
});
