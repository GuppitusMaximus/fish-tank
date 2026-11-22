// SQLite storage for the Kitchen Plan service (Node 22 `node:sqlite`).
//
// Only service code (planner.mjs, import.mjs, backup.mjs) writes through this
// module. Every write runs inside `store.tx()`, which opens a BEGIN IMMEDIATE
// transaction; the synchronous driver serializes transactions inside one
// process and the immediate lock serializes them against other processes.

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const TIME_ZONE = "America/New_York";
export const HORIZON_DAYS = 14;
export const DEFAULT_DINERS = 2;

export const DEFAULT_CONSTRAINTS = Object.freeze({
  diners: DEFAULT_DINERS,
  dietaryExclusions: [],
  excludedCategories: [],
  workload: { default: { maxPrepMinutes: null, maxTotalMinutes: null }, byWeekday: {} },
  shoppingDays: 3,
});

export class ServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// --- Dates -----------------------------------------------------------------

const easternFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function easternDate(instant) {
  const parts = Object.fromEntries(easternFormat.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayKey(date) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function dateRange(from, count) {
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

// Stable JSON for hashing and before/after comparison.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

// --- Migrations --------------------------------------------------------------

// Forward-only. Each entry runs in its own transaction together with its
// schema_migrations row and PRAGMA user_version, so a failed migration leaves
// the previous version intact.
const MIGRATIONS = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE plan_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL CHECK (revision >= 0),
        updated_at TEXT NOT NULL
      );
      INSERT INTO plan_state (id, revision, updated_at) VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE recipes (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        ingredients_text TEXT NOT NULL DEFAULT '',
        directions TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        servings_text TEXT NOT NULL DEFAULT '',
        servings_min INTEGER,
        servings_max INTEGER,
        prep_text TEXT NOT NULL DEFAULT '',
        cook_text TEXT NOT NULL DEFAULT '',
        total_text TEXT NOT NULL DEFAULT '',
        prep_minutes INTEGER,
        cook_minutes INTEGER,
        total_minutes INTEGER,
        categories TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        source_hash TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE ingredients (
        key TEXT PRIMARY KEY,
        display TEXT NOT NULL,
        staple INTEGER NOT NULL DEFAULT 0 CHECK (staple IN (0, 1))
      );
      CREATE TABLE ingredient_aliases (
        alias TEXT PRIMARY KEY,
        ingredient_key TEXT NOT NULL REFERENCES ingredients(key)
      );
      CREATE TABLE recipe_ingredients (
        recipe_uid TEXT NOT NULL REFERENCES recipes(uid) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        section TEXT,
        verbatim TEXT NOT NULL,
        name TEXT NOT NULL,
        ingredient_key TEXT NOT NULL REFERENCES ingredients(key),
        alternatives TEXT NOT NULL DEFAULT '[]',
        quantity REAL,
        quantity_max REAL,
        unit TEXT,
        dimension TEXT CHECK (dimension IN ('mass', 'volume', 'count')),
        base_quantity REAL,
        package TEXT,
        optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1)),
        ambiguous INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous IN (0, 1)),
        note TEXT,
        PRIMARY KEY (recipe_uid, position)
      );
      CREATE INDEX recipe_ingredients_key ON recipe_ingredients (ingredient_key);
      CREATE TABLE slots (
        date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        uid TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('empty', 'accepted')),
        recipe_uid TEXT REFERENCES recipes(uid),
        servings INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 20),
        prep_minutes INTEGER CHECK (prep_minutes IS NULL OR prep_minutes BETWEEN 0 AND 720),
        locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
        note TEXT NOT NULL DEFAULT '',
        sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        CHECK ((status = 'accepted') = (recipe_uid IS NOT NULL))
      );
      CREATE TABLE dependencies (
        consumer_date TEXT NOT NULL REFERENCES slots(date),
        producer_date TEXT NOT NULL REFERENCES slots(date),
        producer_recipe_uid TEXT NOT NULL REFERENCES recipes(uid),
        ingredient_key TEXT,
        source_key TEXT,
        servings INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 20),
        PRIMARY KEY (consumer_date, producer_date),
        CHECK (producer_date < consumer_date)
      );
      CREATE TABLE pantry (
        ingredient_key TEXT PRIMARY KEY REFERENCES ingredients(key),
        status TEXT NOT NULL CHECK (status IN ('have', 'need', 'unavailable')),
        quantity REAL CHECK (quantity IS NULL OR quantity >= 0),
        unit TEXT,
        use_soon INTEGER NOT NULL DEFAULT 0 CHECK (use_soon IN (0, 1)),
        rev INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE shopping_items (
        id TEXT PRIMARY KEY,
        ingredient_key TEXT NOT NULL REFERENCES ingredients(key),
        bucket TEXT NOT NULL,
        quantity REAL,
        unit TEXT,
        dates TEXT NOT NULL DEFAULT '[]',
        recipes TEXT NOT NULL DEFAULT '[]',
        checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
        rev INTEGER NOT NULL DEFAULT 1,
        updated_revision INTEGER NOT NULL
      );
      CREATE TABLE changes (
        revision INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('accept', 'commit', 'undo', 'pantry', 'constraints', 'import')),
        label TEXT NOT NULL,
        dates TEXT NOT NULL DEFAULT '[]',
        before_image TEXT,
        after_image TEXT,
        undoes INTEGER REFERENCES changes(revision),
        undone_by INTEGER REFERENCES changes(revision),
        created_at TEXT NOT NULL
      );
      CREATE TABLE previews (
        id TEXT PRIMARY KEY,
        base_revision INTEGER NOT NULL,
        day TEXT NOT NULL,
        target_date TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE idempotency_keys (
        key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        status INTEGER NOT NULL,
        response TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    // Additive: v1 rows and change images are read unchanged. A swap belongs
    // to one slot and the recipe it was accepted with; a restock row outlives
    // its swap and its dinner.
    version: 2,
    name: "dinner swaps and restocks",
    sql: `
      CREATE TABLE slot_swaps (
        id TEXT PRIMARY KEY,
        slot_date TEXT NOT NULL REFERENCES slots(date),
        recipe_uid TEXT NOT NULL REFERENCES recipes(uid),
        source_position INTEGER,
        source_verbatim TEXT,
        from_key TEXT NOT NULL,
        from_label TEXT NOT NULL,
        from_quantity REAL CHECK (from_quantity IS NULL OR from_quantity >= 0),
        from_unit TEXT,
        to_key TEXT NOT NULL REFERENCES ingredients(key),
        to_label TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        unit TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((source_position IS NULL) = (source_verbatim IS NULL))
      );
      CREATE UNIQUE INDEX slot_swaps_line ON slot_swaps (slot_date, source_position) WHERE source_position IS NOT NULL;
      CREATE TABLE restocks (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        ingredient_key TEXT NOT NULL REFERENCES ingredients(key),
        label TEXT NOT NULL,
        quantity REAL CHECK (quantity IS NULL OR quantity >= 0),
        unit TEXT,
        slot_date TEXT NOT NULL,
        recipe_uid TEXT,
        swap_label TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'undone')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX restocks_origin ON restocks (origin);
      CREATE INDEX restocks_revision ON restocks (revision);
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1).version;

function migrate(db, nowIso) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema version ${current} is newer than this service (${SCHEMA_VERSION}); refusing to start`);
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        nowIso(),
      );
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) throw new Error(`Database has ${violations.length} foreign key violations; refusing to start`);
}

export function openStore({ path, now = () => new Date() } = {}) {
  if (!path) throw new Error("openStore requires a database path");
  const memory = path === ":memory:";
  if (!memory) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    if (!memory) {
      const mode = db.prepare("PRAGMA journal_mode = WAL").get().journal_mode;
      if (mode !== "wal") throw new Error(`Could not enable WAL journal mode (got ${mode})`);
    }
    db.exec("PRAGMA synchronous = FULL");
    migrate(db, () => now().toISOString());
  } catch (error) {
    db.close();
    throw error;
  }
  return new Store(db, now, path);
}

// --- Row mapping -------------------------------------------------------------

const bool = (value) => (value ? 1 : 0);
const json = (text, fallback) => (text == null ? fallback : JSON.parse(text));

function slotFromRow(row) {
  return row && {
    date: row.date,
    uid: row.uid,
    status: row.status,
    recipeUid: row.recipe_uid,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    locked: row.locked === 1,
    note: row.note,
    sequence: row.sequence,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function dependencyFromRow(row) {
  return {
    consumerDate: row.consumer_date,
    producerDate: row.producer_date,
    producerRecipeUid: row.producer_recipe_uid,
    ingredientKey: row.ingredient_key,
    sourceKey: row.source_key,
    servings: row.servings,
  };
}

function recipeFromRow(row) {
  return row && {
    uid: row.uid,
    name: row.name,
    description: row.description,
    ingredientsText: row.ingredients_text,
    directions: row.directions,
    notes: row.notes,
    servingsText: row.servings_text,
    servingsMin: row.servings_min,
    servingsMax: row.servings_max,
    prepText: row.prep_text,
    cookText: row.cook_text,
    totalText: row.total_text,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    totalMinutes: row.total_minutes,
    categories: json(row.categories, []),
    source: row.source,
    sourceUrl: row.source_url,
    sourceHash: row.source_hash,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

function lineFromRow(row) {
  return {
    position: row.position,
    section: row.section,
    verbatim: row.verbatim,
    name: row.name,
    ingredientKey: row.ingredient_key,
    alternatives: json(row.alternatives, []),
    quantity: row.quantity,
    quantityMax: row.quantity_max,
    unit: row.unit,
    dimension: row.dimension,
    baseQuantity: row.base_quantity,
    package: row.package,
    optional: row.optional === 1,
    ambiguous: row.ambiguous === 1,
    note: row.note,
  };
}

function pantryFromRow(row) {
  return {
    ingredientKey: row.ingredient_key,
    status: row.status,
    quantity: row.quantity,
    unit: row.unit,
    useSoon: row.use_soon === 1,
    rev: row.rev,
    updatedAt: row.updated_at,
  };
}

function shoppingFromRow(row) {
  return {
    id: row.id,
    ingredientKey: row.ingredient_key,
    bucket: row.bucket,
    quantity: row.quantity,
    unit: row.unit,
    dates: json(row.dates, []),
    recipes: json(row.recipes, []),
    checked: row.checked === 1,
    rev: row.rev,
    updatedRevision: row.updated_revision,
  };
}

function swapFromRow(row) {
  return {
    id: row.id,
    date: row.slot_date,
    recipeUid: row.recipe_uid,
    sourcePosition: row.source_position,
    sourceVerbatim: row.source_verbatim,
    fromKey: row.from_key,
    fromLabel: row.from_label,
    fromQuantity: row.from_quantity,
    fromUnit: row.from_unit,
    toKey: row.to_key,
    toLabel: row.to_label,
    quantity: row.quantity,
    unit: row.unit,
    revision: row.revision,
    createdAt: row.created_at,
  };
}

function restockFromRow(row) {
  return {
    id: row.id,
    origin: row.origin,
    ingredientKey: row.ingredient_key,
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    date: row.slot_date,
    recipeUid: row.recipe_uid,
    swapLabel: row.swap_label,
    revision: row.revision,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function changeFromRow(row) {
  return row && {
    revision: row.revision,
    kind: row.kind,
    label: row.label,
    dates: json(row.dates, []),
    before: json(row.before_image, null),
    after: json(row.after_image, null),
    undoes: row.undoes,
    undoneBy: row.undone_by,
    createdAt: row.created_at,
  };
}

// --- Store -------------------------------------------------------------------

export class Store {
  constructor(db, now, path) {
    this.db = db;
    this.now = now;
    this.path = path;
    this.statements = new Map();
    this.inTransaction = false;
  }

  close() {
    this.statements.clear();
    if (this.db.isOpen) this.db.close();
  }

  statement(sql) {
    let prepared = this.statements.get(sql);
    if (!prepared) {
      prepared = this.db.prepare(sql);
      this.statements.set(sql, prepared);
    }
    return prepared;
  }

  all(sql, ...params) {
    return this.statement(sql).all(...params);
  }

  get(sql, ...params) {
    return this.statement(sql).get(...params);
  }

  run(sql, ...params) {
    return this.statement(sql).run(...params);
  }

  // Runs fn inside one immediate transaction. Nested calls join the outer
  // transaction. fn must be synchronous so no other request can interleave.
  tx(fn) {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        throw new Error("Store transactions must be synchronous");
      }
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  requireTransaction() {
    if (!this.inTransaction) throw new Error("Store writes must run inside store.tx()");
  }

  nowIso() {
    return this.now().toISOString();
  }

  today() {
    return easternDate(this.now());
  }

  schemaVersion() {
    return this.get("PRAGMA user_version").user_version;
  }

  // --- Revision and change log ---

  revision() {
    return this.get("SELECT revision FROM plan_state WHERE id = 1").revision;
  }

  // Every write that can change what a preview or the shopping list would
  // compute goes through here: one new revision, one change row, and every
  // outstanding preview invalidated.
  recordChange({ kind, label, dates = [], before = null, after = null, undoes = null }) {
    this.requireTransaction();
    const revision = this.revision() + 1;
    const at = this.nowIso();
    this.run("UPDATE plan_state SET revision = ?, updated_at = ? WHERE id = 1", revision, at);
    this.run(
      `INSERT INTO changes (revision, kind, label, dates, before_image, after_image, undoes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      revision,
      kind,
      label,
      JSON.stringify(dates),
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      undoes,
      at,
    );
    if (undoes != null) this.run("UPDATE changes SET undone_by = ? WHERE revision = ?", revision, undoes);
    this.run("DELETE FROM previews");
    return revision;
  }

  getChange(revision) {
    return changeFromRow(this.get("SELECT * FROM changes WHERE revision = ?", revision));
  }

  listChanges(limit = 50) {
    return this.all("SELECT * FROM changes ORDER BY revision DESC LIMIT ?", limit).map(changeFromRow);
  }

  latestUndoableChange() {
    return changeFromRow(
      this.get(
        `SELECT * FROM changes WHERE kind IN ('accept', 'commit') AND undone_by IS NULL
         ORDER BY revision DESC LIMIT 1`,
      ),
    );
  }

  planChangesAfter(revision) {
    return this.all(
      "SELECT * FROM changes WHERE revision > ? AND kind IN ('accept', 'commit', 'undo') ORDER BY revision",
      revision,
    ).map(changeFromRow);
  }

  // --- Settings ---

  getSetting(key, fallback = null) {
    const row = this.get("SELECT value FROM settings WHERE key = ?", key);
    return row ? JSON.parse(row.value) : fallback;
  }

  setSetting(key, value) {
    this.requireTransaction();
    this.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }

  constraints() {
    return { ...structuredClone(DEFAULT_CONSTRAINTS), ...this.getSetting("constraints", {}) };
  }

  // --- Slots ---

  // Creates the empty dinner dates of the rolling horizon. Existing rows,
  // accepted or not, are never touched, so accepted dates survive restarts
  // and the horizon moving forward.
  ensureHorizon(today = this.today()) {
    this.requireTransaction();
    const diners = this.constraints().diners;
    let created = 0;
    for (const date of dateRange(today, HORIZON_DAYS)) created += this.ensureSlot(date, diners);
    return created;
  }

  ensureSlot(date, servings = this.constraints().diners) {
    this.requireTransaction();
    return this.run(
      `INSERT OR IGNORE INTO slots (date, uid, status, recipe_uid, servings, updated_at)
       VALUES (?, ?, 'empty', NULL, ?, ?)`,
      date,
      randomUUID(),
      servings,
      this.nowIso(),
    ).changes;
  }

  getSlot(date) {
    return slotFromRow(this.get("SELECT * FROM slots WHERE date = ?", date));
  }

  listSlots(from, to) {
    return this.all("SELECT * FROM slots WHERE date >= ? AND date <= ? ORDER BY date", from, to).map(slotFromRow);
  }

  listAllSlots() {
    return this.all("SELECT * FROM slots ORDER BY date").map(slotFromRow);
  }

  listAcceptedSlots(from = "0000-00-00") {
    return this.all("SELECT * FROM slots WHERE status = 'accepted' AND date >= ? ORDER BY date", from).map(
      slotFromRow,
    );
  }

  // Writes a slot's plan fields. The calendar SEQUENCE advances once per
  // write, so callers only call this for slots whose fields really change.
  writeSlot(date, fields, revision) {
    this.requireTransaction();
    this.ensureSlot(date);
    const recipeUid = fields.recipeUid ?? null;
    this.run(
      `UPDATE slots SET status = ?, recipe_uid = ?, servings = ?, prep_minutes = ?, locked = ?, note = ?,
         sequence = sequence + 1, revision = ?, updated_at = ?
       WHERE date = ?`,
      recipeUid ? "accepted" : "empty",
      recipeUid,
      fields.servings,
      fields.prepMinutes ?? null,
      bool(fields.locked),
      fields.note ?? "",
      revision,
      this.nowIso(),
      date,
    );
  }

  // --- Dependencies ---

  listDependencies() {
    return this.all("SELECT * FROM dependencies ORDER BY consumer_date, producer_date").map(dependencyFromRow);
  }

  deleteDependenciesTouching(dates) {
    this.requireTransaction();
    for (const date of dates) {
      this.run("DELETE FROM dependencies WHERE consumer_date = ? OR producer_date = ?", date, date);
    }
  }

  insertDependency(dependency) {
    this.requireTransaction();
    this.run(
      `INSERT INTO dependencies (consumer_date, producer_date, producer_recipe_uid, ingredient_key, source_key, servings)
       VALUES (?, ?, ?, ?, ?, ?)`,
      dependency.consumerDate,
      dependency.producerDate,
      dependency.producerRecipeUid,
      dependency.ingredientKey ?? null,
      dependency.sourceKey ?? null,
      dependency.servings,
    );
  }

  // --- Recipes and ingredients ---

  recipeHash(uid) {
    return this.get("SELECT source_hash FROM recipes WHERE uid = ?", uid)?.source_hash ?? null;
  }

  // The stored key for a Paprika uid: an exact match first, then one that
  // differs only in case (databases written before uids kept their case hold
  // them upper-cased).
  findRecipeUid(uid) {
    return (
      this.get("SELECT uid FROM recipes WHERE uid = ? COLLATE NOCASE ORDER BY uid = ? DESC, uid LIMIT 1", uid, uid)?.uid ?? null
    );
  }

  // Dates from `from` on whose accepted dinner, or whose leftovers, come
  // from this recipe.
  recipeUses(uid, from) {
    return this.all(
      `SELECT date FROM slots WHERE recipe_uid = ? AND status = 'accepted' AND date >= ?
       UNION SELECT consumer_date AS date FROM dependencies WHERE producer_recipe_uid = ? AND consumer_date >= ?
       ORDER BY date`,
      uid,
      from,
      uid,
      from,
    ).map((row) => row.date);
  }

  upsertRecipe(recipe) {
    this.requireTransaction();
    const at = this.nowIso();
    this.run(
      `INSERT INTO recipes (uid, name, description, ingredients_text, directions, notes, servings_text, servings_min,
         servings_max, prep_text, cook_text, total_text, prep_minutes, cook_minutes, total_minutes, categories, source,
         source_url, source_hash, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET name = excluded.name, description = excluded.description,
         ingredients_text = excluded.ingredients_text, directions = excluded.directions, notes = excluded.notes,
         servings_text = excluded.servings_text, servings_min = excluded.servings_min,
         servings_max = excluded.servings_max, prep_text = excluded.prep_text, cook_text = excluded.cook_text,
         total_text = excluded.total_text, prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes,
         total_minutes = excluded.total_minutes, categories = excluded.categories, source = excluded.source,
         source_url = excluded.source_url, source_hash = excluded.source_hash, updated_at = excluded.updated_at`,
      recipe.uid,
      recipe.name,
      recipe.description,
      recipe.ingredientsText,
      recipe.directions,
      recipe.notes,
      recipe.servingsText,
      recipe.servingsMin,
      recipe.servingsMax,
      recipe.prepText,
      recipe.cookText,
      recipe.totalText,
      recipe.prepMinutes,
      recipe.cookMinutes,
      recipe.totalMinutes,
      JSON.stringify(recipe.categories),
      recipe.source,
      recipe.sourceUrl,
      recipe.sourceHash,
      at,
      at,
    );
    this.run("DELETE FROM recipe_ingredients WHERE recipe_uid = ?", recipe.uid);
    for (const line of recipe.lines) {
      this.ensureIngredient(line.ingredientKey, line.ingredientKey);
      for (const key of line.alternatives) this.ensureIngredient(key, key);
      this.run(
        `INSERT INTO recipe_ingredients (recipe_uid, position, section, verbatim, name, ingredient_key, alternatives,
           quantity, quantity_max, unit, dimension, base_quantity, package, optional, ambiguous, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        recipe.uid,
        line.position,
        line.section ?? null,
        line.verbatim,
        line.name,
        line.ingredientKey,
        JSON.stringify(line.alternatives),
        line.quantity ?? null,
        line.quantityMax ?? null,
        line.unit ?? null,
        line.dimension ?? null,
        line.baseQuantity ?? null,
        line.package ?? null,
        bool(line.optional),
        bool(line.ambiguous),
        line.note ?? null,
      );
    }
  }

  getRecipe(uid) {
    const recipe = recipeFromRow(this.get("SELECT * FROM recipes WHERE uid = ?", uid));
    if (!recipe) return null;
    recipe.lines = this.all("SELECT * FROM recipe_ingredients WHERE recipe_uid = ? ORDER BY position", uid).map(
      lineFromRow,
    );
    return recipe;
  }

  listRecipes() {
    return this.all("SELECT * FROM recipes ORDER BY name COLLATE NOCASE, uid").map(recipeFromRow);
  }

  // Every recipe with its parsed lines, keyed by uid, for the planner.
  loadRecipes() {
    const recipes = new Map(this.listRecipes().map((recipe) => [recipe.uid, { ...recipe, lines: [] }]));
    for (const row of this.all("SELECT * FROM recipe_ingredients ORDER BY recipe_uid, position")) {
      recipes.get(row.recipe_uid)?.lines.push(lineFromRow(row));
    }
    return recipes;
  }

  ensureIngredient(key, display, staple = false) {
    this.requireTransaction();
    this.run("INSERT OR IGNORE INTO ingredients (key, display, staple) VALUES (?, ?, ?)", key, display, bool(staple));
  }

  setIngredientStaple(key, staple) {
    this.requireTransaction();
    this.run("UPDATE ingredients SET staple = ? WHERE key = ?", bool(staple), key);
  }

  setAlias(alias, key) {
    this.requireTransaction();
    this.ensureIngredient(key, key);
    this.run(
      `INSERT INTO ingredient_aliases (alias, ingredient_key) VALUES (?, ?)
       ON CONFLICT(alias) DO UPDATE SET ingredient_key = excluded.ingredient_key`,
      alias,
      key,
    );
  }

  aliasFor(alias) {
    return this.get("SELECT ingredient_key FROM ingredient_aliases WHERE alias = ?", alias)?.ingredient_key ?? null;
  }

  loadIngredients() {
    return new Map(
      this.all("SELECT * FROM ingredients ORDER BY key").map((row) => [
        row.key,
        { key: row.key, display: row.display, staple: row.staple === 1 },
      ]),
    );
  }

  listAliases() {
    return this.all("SELECT alias, ingredient_key FROM ingredient_aliases ORDER BY alias").map((row) => ({
      alias: row.alias,
      ingredientKey: row.ingredient_key,
    }));
  }

  // --- Pantry ---

  loadPantry() {
    return new Map(this.all("SELECT * FROM pantry ORDER BY ingredient_key").map((row) => [row.ingredient_key, pantryFromRow(row)]));
  }

  getPantryItem(key) {
    const row = this.get("SELECT * FROM pantry WHERE ingredient_key = ?", key);
    return row ? pantryFromRow(row) : null;
  }

  writePantryItem(key, item) {
    this.requireTransaction();
    this.ensureIngredient(key, key);
    this.run(
      `INSERT INTO pantry (ingredient_key, status, quantity, unit, use_soon, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(ingredient_key) DO UPDATE SET status = excluded.status, quantity = excluded.quantity,
         unit = excluded.unit, use_soon = excluded.use_soon, rev = pantry.rev + 1, updated_at = excluded.updated_at`,
      key,
      item.status,
      item.quantity ?? null,
      item.unit ?? null,
      bool(item.useSoon),
      this.nowIso(),
    );
  }

  deletePantryItem(key) {
    this.requireTransaction();
    this.run("DELETE FROM pantry WHERE ingredient_key = ?", key);
  }

  // --- Shopping ---

  listShopping() {
    return this.all("SELECT * FROM shopping_items ORDER BY ingredient_key, bucket").map(shoppingFromRow);
  }

  getShoppingItem(id) {
    const row = this.get("SELECT * FROM shopping_items WHERE id = ?", id);
    return row ? shoppingFromRow(row) : null;
  }

  // Replaces the derived list, keeping check marks on lines whose quantity did
  // not grow. A line that now needs more than was checked off is unchecked.
  writeShopping(items, revision) {
    this.requireTransaction();
    const existing = new Map(this.listShopping().map((item) => [item.id, item]));
    for (const item of items) {
      const previous = existing.get(item.id);
      existing.delete(item.id);
      const dates = JSON.stringify(item.dates);
      const recipes = JSON.stringify(item.recipes);
      if (!previous) {
        this.ensureIngredient(item.ingredientKey, item.ingredientKey);
        this.run(
          `INSERT INTO shopping_items (id, ingredient_key, bucket, quantity, unit, dates, recipes, checked, rev, updated_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
          item.id,
          item.ingredientKey,
          item.bucket,
          item.quantity,
          item.unit,
          dates,
          recipes,
          revision,
        );
        continue;
      }
      const same =
        previous.quantity === item.quantity &&
        previous.unit === item.unit &&
        JSON.stringify(previous.dates) === dates &&
        JSON.stringify(previous.recipes) === recipes;
      if (same) continue;
      const grew = item.quantity != null && previous.quantity != null && item.quantity > previous.quantity + 1e-9;
      this.run(
        `UPDATE shopping_items SET quantity = ?, unit = ?, dates = ?, recipes = ?, checked = ?, rev = rev + 1,
           updated_revision = ?
         WHERE id = ?`,
        item.quantity,
        item.unit,
        dates,
        recipes,
        grew ? 0 : bool(previous.checked),
        revision,
        item.id,
      );
    }
    for (const id of existing.keys()) this.run("DELETE FROM shopping_items WHERE id = ?", id);
  }

  setShoppingChecked(id, checked) {
    this.requireTransaction();
    this.run("UPDATE shopping_items SET checked = ?, rev = rev + 1 WHERE id = ?", bool(checked), id);
  }

  // --- Dinner swaps ---

  listSwaps(dates) {
    const swaps = [];
    for (const date of [...new Set(dates)].sort()) {
      swaps.push(...this.all("SELECT * FROM slot_swaps WHERE slot_date = ? ORDER BY id", date).map(swapFromRow));
    }
    return swaps;
  }

  // Every stored swap, keyed by slot date.
  swapsByDate() {
    const byDate = new Map();
    for (const row of this.all("SELECT * FROM slot_swaps ORDER BY slot_date, id")) {
      const swap = swapFromRow(row);
      if (!byDate.has(swap.date)) byDate.set(swap.date, []);
      byDate.get(swap.date).push(swap);
    }
    return byDate;
  }

  // Inserts or replaces a swap; a line swap also replaces any other swap of
  // the same line on that date.
  writeSwap(swap) {
    this.requireTransaction();
    this.run("DELETE FROM slot_swaps WHERE id = ?", swap.id);
    if (swap.sourcePosition != null) {
      this.run("DELETE FROM slot_swaps WHERE slot_date = ? AND source_position = ?", swap.date, swap.sourcePosition);
    }
    this.ensureIngredient(swap.toKey, swap.toKey);
    this.run(
      `INSERT INTO slot_swaps (id, slot_date, recipe_uid, source_position, source_verbatim, from_key, from_label, from_quantity,
         from_unit, to_key, to_label, quantity, unit, revision, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      swap.id,
      swap.date,
      swap.recipeUid,
      swap.sourcePosition ?? null,
      swap.sourceVerbatim ?? null,
      swap.fromKey,
      swap.fromLabel,
      swap.fromQuantity ?? null,
      swap.fromUnit ?? null,
      swap.toKey,
      swap.toLabel,
      swap.quantity,
      swap.unit,
      swap.revision,
      swap.createdAt,
    );
  }

  // Restores the swaps of `dates` to exactly `swaps` (an undo image).
  replaceSwaps(dates, swaps) {
    this.requireTransaction();
    const set = new Set(dates);
    for (const date of set) this.run("DELETE FROM slot_swaps WHERE slot_date = ?", date);
    for (const swap of swaps) if (set.has(swap.date)) this.writeSwap(swap);
  }

  // Drops the swaps of `dates` whose slot no longer holds the accepted
  // recipe they were made for: a different dinner was accepted there.
  deleteStaleSwaps(dates) {
    this.requireTransaction();
    for (const date of new Set(dates)) {
      this.run(
        `DELETE FROM slot_swaps WHERE slot_date = ? AND NOT EXISTS (
           SELECT 1 FROM slots WHERE slots.date = slot_swaps.slot_date AND slots.status = 'accepted'
             AND slots.recipe_uid = slot_swaps.recipe_uid)`,
        date,
      );
    }
  }

  // --- Restocks ---

  // Every restock not undone, oldest first.
  listRestocks() {
    return this.all("SELECT * FROM restocks WHERE status != 'undone' ORDER BY created_at, id").map(restockFromRow);
  }

  openRestocksOf(revision) {
    return this.all("SELECT * FROM restocks WHERE revision = ? AND status = 'open' ORDER BY id", revision).map(restockFromRow);
  }

  insertRestock(restock) {
    this.requireTransaction();
    this.ensureIngredient(restock.ingredientKey, restock.ingredientKey);
    const at = this.nowIso();
    this.run(
      `INSERT INTO restocks (id, origin, ingredient_key, label, quantity, unit, slot_date, recipe_uid, swap_label, revision,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      restock.id,
      restock.origin,
      restock.ingredientKey,
      restock.label,
      restock.quantity ?? null,
      restock.unit ?? null,
      restock.date,
      restock.recipeUid ?? null,
      restock.swapLabel ?? "",
      restock.revision,
      at,
      at,
    );
  }

  setRestockStatus(id, status) {
    this.requireTransaction();
    this.run("UPDATE restocks SET status = ?, updated_at = ? WHERE id = ?", status, this.nowIso(), id);
  }

  // --- Previews ---

  insertPreview(preview) {
    this.requireTransaction();
    this.run("DELETE FROM previews WHERE expires_at <= ?", this.nowIso());
    this.run(
      `INSERT INTO previews (id, base_revision, day, target_date, body, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      preview.id,
      preview.baseRevision,
      preview.day,
      preview.targetDate,
      JSON.stringify(preview.body),
      preview.createdAt,
      preview.expiresAt,
    );
  }

  getPreview(id) {
    const row = this.get("SELECT * FROM previews WHERE id = ?", id);
    return row && {
      id: row.id,
      baseRevision: row.base_revision,
      day: row.day,
      targetDate: row.target_date,
      body: JSON.parse(row.body),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  // --- Idempotency ---

  getIdempotent(key) {
    const row = this.get("SELECT * FROM idempotency_keys WHERE key = ?", key);
    return row && { fingerprint: row.fingerprint, status: row.status, response: JSON.parse(row.response) };
  }

  saveIdempotent(key, fingerprint, status, response) {
    this.requireTransaction();
    const cutoff = new Date(this.now().getTime() - 86_400_000).toISOString();
    this.run("DELETE FROM idempotency_keys WHERE created_at < ?", cutoff);
    this.run(
      "INSERT INTO idempotency_keys (key, fingerprint, status, response, created_at) VALUES (?, ?, ?, ?, ?)",
      key,
      fingerprint,
      status,
      JSON.stringify(response),
      this.nowIso(),
    );
  }
}
