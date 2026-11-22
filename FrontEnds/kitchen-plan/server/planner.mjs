// Kitchen Plan domain service: explicit plan acceptance, the three-day
// ingredient review, the derived shopping list, deterministic swap previews,
// revalidated commits, slot-scoped ingredient swaps (swaps.mjs) and
// compensating Undo.
//
// Consent rule: a slot becomes (or stops being) an accepted dinner only via
// acceptPlan() with `accept: true`, commit() of a server-generated preview
// option, or undo() of one of those. An ingredient swap is accepted only by
// applyDinnerSwap() of a stored server preview. Imports, pantry edits and
// previews never change accepted dinners; they may only recalculate the
// shopping list.
//
// The pure functions (resolveLine, computeShopping, reviewDays,
// enumerateOptions, ...) take a context loaded once per transaction and do no
// I/O, so the same inputs always rank the same options.

import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_DINERS,
  HORIZON_DAYS,
  ServiceError,
  TIME_ZONE,
  addDays,
  canonicalJson,
  dateRange,
  isValidDate,
  weekdayKey,
} from "./store.mjs";
import { UNITS, importPaprikaArchive, normalizeIngredientName, normalizeUnit, resolveIngredientKey } from "./import.mjs";
import {
  amountOf,
  effectiveLines,
  isRestockRow,
  labelForm,
  labelNamesKey,
  parseSourceId,
  restockInfo,
  restockItems,
  restockRowId,
  shareText,
  slotSwaps,
  sourceIdOf,
  sourceView,
  swapAmount,
  swapLabel,
  swapSentence,
  swapView,
} from "./swaps.mjs";

export const PREVIEW_TTL_MS = 15 * 60 * 1000;
export const MAX_OPTIONS = 3;
const MAX_EXPLORED = 5000;
const MAX_CHANGED_SLOTS = 3;
const VARIETY_WINDOW_DAYS = 6;
const MAX_PLAN_DAYS_AHEAD = 366;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const LEFTOVER_CATEGORIES = /^(?:freezer|batch|leftovers)$/i;
const SOURCE_BLOCKED = new Set(["leftover_source_excluded", "leftover_source_unavailable", "leftover_source_conflict"]);
// Every accepted dinner feeds at least both adults, whatever `diners` says.
const MIN_SERVINGS = DEFAULT_DINERS;

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const round = (value) => Math.round(value * 1000) / 1000;
const trimNumber = (value) => String(Math.round(value * 100) / 100);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

// --- Validation ----------------------------------------------------------------

function invalid(field, message) {
  return new ServiceError(422, "invalid_request", message, { field });
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(field, `${field} must be an object`);
  return value;
}

function rejectUnknown(value, allowed, field) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw invalid(field, `${field} has unknown field(s): ${unknown.join(", ")}`);
}

function requireInt(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalid(field, `${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function optionalInt(value, field, min, max) {
  return value == null ? null : requireInt(value, field, min, max);
}

function requireBool(value, field) {
  if (typeof value !== "boolean") throw invalid(field, `${field} must be true or false`);
  return value;
}

function optionalString(value, field, max) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) throw invalid(field, `${field} must be a string of at most ${max} characters`);
  return value;
}

function requireArray(value, field, max) {
  if (!Array.isArray(value) || value.length > max) throw invalid(field, `${field} must be an array of at most ${max} items`);
  return value;
}

function requireDate(value, field) {
  if (!isValidDate(value)) throw invalid(field, `${field} must be a YYYY-MM-DD date`);
  return value;
}

// Recipe uids are kept as Paprika supplied them, and older databases hold
// them upper-cased, so a client uid matches exactly first, then ignoring case.
function resolveRecipeUid(recipes, uid) {
  if (uid == null) return null;
  if (recipes.has(uid)) return uid;
  const wanted = uid.toUpperCase();
  for (const key of recipes.keys()) if (key.toUpperCase() === wanted) return key;
  return null;
}

function validateWorkload(value, field) {
  requireObject(value, field);
  rejectUnknown(value, ["maxPrepMinutes", "maxTotalMinutes"], field);
  return {
    maxPrepMinutes: optionalInt(value.maxPrepMinutes, `${field}.maxPrepMinutes`, 0, 720),
    maxTotalMinutes: optionalInt(value.maxTotalMinutes, `${field}.maxTotalMinutes`, 0, 1440),
  };
}

export function validateConstraints(input, current) {
  requireObject(input, "constraints");
  rejectUnknown(input, ["diners", "dietaryExclusions", "excludedCategories", "workload", "shoppingDays"], "constraints");
  const next = structuredClone(current);
  if (input.diners !== undefined) next.diners = requireInt(input.diners, "constraints.diners", 1, 12);
  if (input.dietaryExclusions !== undefined) {
    const terms = requireArray(input.dietaryExclusions, "constraints.dietaryExclusions", 50).map((term, index) => {
      const key = normalizeIngredientName(optionalString(term, `constraints.dietaryExclusions[${index}]`, 60) ?? "");
      if (!key) throw invalid(`constraints.dietaryExclusions[${index}]`, "Dietary exclusions must name an ingredient");
      return key;
    });
    next.dietaryExclusions = [...new Set(terms)].sort();
  }
  if (input.excludedCategories !== undefined) {
    const categories = requireArray(input.excludedCategories, "constraints.excludedCategories", 50).map((category, index) => {
      const value = optionalString(category, `constraints.excludedCategories[${index}]`, 80)?.trim().toLowerCase();
      if (!value) throw invalid(`constraints.excludedCategories[${index}]`, "Categories must be non-empty strings");
      return value;
    });
    next.excludedCategories = [...new Set(categories)].sort();
  }
  if (input.workload !== undefined) {
    requireObject(input.workload, "constraints.workload");
    rejectUnknown(input.workload, ["default", "byWeekday"], "constraints.workload");
    const workload = { default: next.workload.default, byWeekday: { ...next.workload.byWeekday } };
    if (input.workload.default !== undefined) workload.default = validateWorkload(input.workload.default, "constraints.workload.default");
    if (input.workload.byWeekday !== undefined) {
      requireObject(input.workload.byWeekday, "constraints.workload.byWeekday");
      rejectUnknown(input.workload.byWeekday, WEEKDAYS, "constraints.workload.byWeekday");
      workload.byWeekday = {};
      for (const [day, value] of Object.entries(input.workload.byWeekday)) {
        if (value != null) workload.byWeekday[day] = validateWorkload(value, `constraints.workload.byWeekday.${day}`);
      }
    }
    next.workload = workload;
  }
  if (input.shoppingDays !== undefined) next.shoppingDays = requireInt(input.shoppingDays, "constraints.shoppingDays", 1, HORIZON_DAYS);
  return next;
}

// --- Context -----------------------------------------------------------------

export function loadContext(store) {
  return {
    today: store.today(),
    revision: store.revision(),
    recipes: store.loadRecipes(),
    ingredients: store.loadIngredients(),
    pantry: store.loadPantry(),
    constraints: store.constraints(),
    restocks: store.listRestocks(),
    view: {
      slots: new Map(store.listAllSlots().map((slot) => [slot.date, slot])),
      deps: store.listDependencies(),
      swaps: store.swapsByDate(),
    },
  };
}

export function shoppingWindow(ctx) {
  return dateRange(ctx.today, ctx.constraints.shoppingDays);
}

// --- Ingredient resolution ---------------------------------------------------

const termMatches = (key, term) => ` ${key} `.includes(` ${term} `);

export function isExcluded(ctx, key) {
  return ctx.constraints.dietaryExclusions.some((term) => termMatches(key, term));
}

function categoryExcluded(ctx, recipe) {
  const categories = recipe.categories.map((category) => category.toLowerCase());
  return ctx.constraints.excludedCategories.some((category) => categories.includes(category));
}

function pantryHas(ctx, key) {
  const item = ctx.pantry.get(key);
  if (item) return item.status === "have";
  return Boolean(ctx.ingredients.get(key)?.staple);
}

// One ingredient line against the pantry and dietary rules. The first
// alternative on hand wins, then the first that can still be bought. A line
// is unavailable only when every allowed alternative is unavailable.
export function resolveLine(ctx, line) {
  const alternatives = line.alternatives.length ? line.alternatives : [line.ingredientKey];
  const allowed = alternatives.filter((key) => !isExcluded(ctx, key));
  if (!allowed.length) return { status: "excluded", key: alternatives[0], useSoon: false };
  for (const key of allowed) {
    if (pantryHas(ctx, key)) return { status: "have", key, useSoon: Boolean(ctx.pantry.get(key)?.useSoon) };
  }
  for (const key of allowed) {
    if (ctx.pantry.get(key)?.status !== "unavailable") return { status: "need", key, useSoon: false };
  }
  return { status: "unavailable", key: allowed[0], useSoon: false };
}

// --- Dependencies and yield --------------------------------------------------

function demandFor(view, date) {
  const slot = view.slots.get(date);
  return slot.servings + view.deps.filter((dep) => dep.producerDate === date).reduce((sum, dep) => sum + dep.servings, 0);
}

function yieldCovers(ctx, view, date) {
  const slot = view.slots.get(date);
  const recipe = slot?.recipeUid ? ctx.recipes.get(slot.recipeUid) : null;
  return recipe?.servingsMin != null && recipe.servingsMin >= demandFor(view, date);
}

function recipeContains(recipe, key) {
  return recipe.lines.some((line) => line.alternatives.includes(key));
}

const linkKey = (dep) => `${dep.consumerDate}|${dep.producerDate}`;

// The producer line each source-named leftover reserves on `producerDate`,
// keyed by link: a line position, or why the source cannot be cooked there.
// The source must be allowed by the diet and not unavailable, and a line
// listing it must not already be reserved for a different alternative, so
// "chicken or pork" cannot feed both a chicken and a pork leftover. Links
// claim lines in consumer-date order.
function sourceReservations(ctx, view, producerDate) {
  const result = new Map();
  const recipe = ctx.recipes.get(view.slots.get(producerDate)?.recipeUid);
  if (!recipe) return result;
  const recipeLines = effectiveLines(ctx, view, producerDate);
  const pinned = new Map();
  const deps = view.deps
    .filter((dep) => dep.producerDate === producerDate && dep.sourceKey && view.slots.get(dep.consumerDate)?.status === "accepted")
    .sort((a, b) => compareText(linkKey(a), linkKey(b)));
  for (const dep of deps) {
    const lines = recipeLines.filter((line) => line.alternatives.includes(dep.sourceKey));
    let reserved;
    if (!lines.length) reserved = "leftover_source_missing";
    else if (isExcluded(ctx, dep.sourceKey)) reserved = "leftover_source_excluded";
    else if (ctx.pantry.get(dep.sourceKey)?.status === "unavailable") reserved = "leftover_source_unavailable";
    else {
      const line = lines.find((candidate) => (pinned.get(candidate.position) ?? dep.sourceKey) === dep.sourceKey);
      if (line) {
        pinned.set(line.position, dep.sourceKey);
        reserved = line.position;
      } else reserved = "leftover_source_conflict";
    }
    result.set(linkKey(dep), reserved);
  }
  return result;
}

// Why a leftover dependency no longer holds, or null when it does. With a
// source ingredient the producer must really cook it (see
// sourceReservations); without one the dependency is tied to the exact
// producing recipe.
export function dependencyProblem(ctx, view, dep) {
  const producer = view.slots.get(dep.producerDate);
  const consumer = view.slots.get(dep.consumerDate);
  if (producer?.status !== "accepted") return "producer_not_accepted";
  if (consumer?.status !== "accepted") return "consumer_not_accepted";
  const recipe = ctx.recipes.get(producer.recipeUid);
  if (!recipe) return "producer_recipe_missing";
  if (dep.sourceKey) {
    const reserved = sourceReservations(ctx, view, dep.producerDate).get(linkKey(dep));
    if (typeof reserved === "string") return reserved;
  } else if (producer.recipeUid !== dep.producerRecipeUid) {
    return "leftover_source_missing";
  }
  if (!yieldCovers(ctx, view, dep.producerDate)) return "insufficient_yield";
  return null;
}

// Leftovers are still food: an excluded leftover never covers a line, so the
// line falls back to its other alternatives or shows as excluded.
function leftoverExcluded(ctx, dep) {
  return [dep.ingredientKey, dep.sourceKey].some((key) => key && isExcluded(ctx, key));
}

function coveringDependency(ctx, view, date, line) {
  for (const dep of view.deps) {
    if (dep.consumerDate !== date || !dep.ingredientKey || !line.alternatives.includes(dep.ingredientKey)) continue;
    if (!leftoverExcluded(ctx, dep) && !dependencyProblem(ctx, view, dep)) return dep;
  }
  return null;
}

// The source ingredient a live leftover reserves on this producer line, or
// null. A reserved line is cooked with that ingredient, even when another
// alternative is on hand or the line is optional.
function reservedSource(ctx, view, date, line) {
  let reservations = null;
  for (const dep of view.deps) {
    if (dep.producerDate !== date || !dep.sourceKey || !line.alternatives.includes(dep.sourceKey)) continue;
    reservations ??= sourceReservations(ctx, view, date);
    if (reservations.get(linkKey(dep)) !== line.position) continue;
    if (!leftoverExcluded(ctx, dep) && !dependencyProblem(ctx, view, dep)) return dep.sourceKey;
  }
  return null;
}

// One line of the dinner on `date` as planned in `view`: a reserved line
// uses its source ingredient; any other line resolves as usual.
function planLine(ctx, view, date, line) {
  const key = reservedSource(ctx, view, date, line);
  if (!key) return { ...resolveLine(ctx, line), reserved: false };
  const have = pantryHas(ctx, key);
  return { status: have ? "have" : "need", key, useSoon: have && Boolean(ctx.pantry.get(key)?.useSoon), reserved: true };
}

// --- Amounts -----------------------------------------------------------------

function lineAmount(line) {
  if (line.quantity == null) return { bucket: "unquantified", amount: null, unit: null };
  if (line.dimension === "mass") return { bucket: "mass", amount: line.baseQuantity, unit: "g" };
  if (line.dimension === "volume") return { bucket: "volume", amount: line.baseQuantity, unit: "ml" };
  const unit = line.unit ?? "each";
  return { bucket: line.package ? `${unit}:${line.package}` : unit, amount: line.quantityMax ?? line.quantity, unit };
}

function pantryAmount(item) {
  if (item.quantity == null) return null;
  const unit = item.unit ?? "each";
  const definition = UNITS[unit];
  if (definition?.base) return { bucket: definition.dimension, amount: item.quantity * definition.base };
  return { bucket: unit, amount: item.quantity };
}

const PLURALS = { box: "boxes", pinch: "pinches", dash: "dashes", bunch: "bunches" };

function countLabel(quantity, unit) {
  const label = UNITS[unit]?.label ?? unit ?? "";
  if (!label) return trimNumber(quantity);
  return `${trimNumber(quantity)} ${quantity === 1 ? label : PLURALS[label] ?? `${label}s`}`;
}

export function formatAmount(bucket, quantity, unit) {
  if (quantity == null) return "as needed";
  if (bucket === "mass") {
    return quantity >= 340 ? `${trimNumber(quantity / UNITS.lb.base)} lb` : `${trimNumber(quantity / UNITS.oz.base)} oz`;
  }
  if (bucket === "volume") {
    if (quantity >= 59) return `${trimNumber(quantity / UNITS.cup.base)} cup`;
    if (quantity >= 14.7) return `${trimNumber(quantity / UNITS.tbsp.base)} tbsp`;
    return `${trimNumber(quantity / UNITS.tsp.base)} tsp`;
  }
  const size = bucket.includes(":") ? ` (${bucket.split(":")[1]})` : "";
  return `${countLabel(quantity, unit)}${size}`;
}

function formatLineAmount(line) {
  if (line.quantity == null) return "as needed";
  const range = line.quantityMax != null ? `${trimNumber(line.quantity)}–${trimNumber(line.quantityMax)}` : trimNumber(line.quantity);
  const label = line.unit && line.unit !== "each" ? ` ${UNITS[line.unit]?.label ?? line.unit}` : "";
  return `${range}${label}${line.package ? ` (${line.package})` : ""}`;
}

// --- Shopping ----------------------------------------------------------------

// Quantity-aware list for the accepted dinners on `dates`: lines are merged
// per ingredient and compatible unit bucket, the top of a range is bought,
// pantry quantities in the same bucket are subtracted, and quantities in an
// incompatible unit are not trusted to cover anything.
export function computeShopping(ctx, view, dates) {
  const totals = new Map();
  for (const date of [...new Set(dates)].sort()) {
    const slot = view.slots.get(date);
    if (slot?.status !== "accepted") continue;
    const recipe = ctx.recipes.get(slot.recipeUid);
    if (!recipe) continue;
    for (const line of effectiveLines(ctx, view, date)) {
      if (coveringDependency(ctx, view, date, line)) continue;
      const resolved = planLine(ctx, view, date, line);
      if ((line.optional && !resolved.reserved) || resolved.status === "unavailable" || resolved.status === "excluded") continue;
      const item = ctx.pantry.get(resolved.key);
      if (resolved.status === "have" && (!item || item.quantity == null || line.quantity == null)) continue;
      const amount = lineAmount(line);
      const id = `${resolved.key}|${amount.bucket}`;
      let total = totals.get(id);
      if (!total) {
        total = { id, ingredientKey: resolved.key, bucket: amount.bucket, quantity: amount.amount == null ? null : 0, unit: amount.unit, dates: new Set(), recipes: new Set() };
        totals.set(id, total);
      }
      if (total.quantity != null && amount.amount != null) total.quantity += amount.amount;
      total.dates.add(date);
      total.recipes.add(recipe.uid);
    }
  }
  const items = [];
  for (const total of totals.values()) {
    const item = ctx.pantry.get(total.ingredientKey);
    if (item?.status === "have" && total.quantity != null) {
      const have = pantryAmount(item);
      if (have && have.bucket === total.bucket) {
        total.quantity -= have.amount;
        if (total.quantity <= 1e-6) continue;
      }
    }
    items.push({
      ...total,
      quantity: total.quantity == null ? null : round(total.quantity),
      dates: [...total.dates].sort(),
      recipes: [...total.recipes].sort(),
    });
  }
  return items.sort((a, b) => compareText(a.id, b.id));
}

// The stored shopping list: the accepted dinners' needs plus open restocks.
export function planShopping(ctx, view, dates) {
  return [...computeShopping(ctx, view, dates), ...restockItems(ctx.restocks ?? [])].sort((a, b) => compareText(a.id, b.id));
}

export function diffShopping(before, after) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const entry = (item, from, to) => ({
    id: item.id,
    ingredientKey: item.ingredientKey,
    bucket: item.bucket,
    before: from?.quantity ?? null,
    after: to?.quantity ?? null,
    amountBefore: from ? formatAmount(from.bucket, from.quantity, from.unit) : null,
    amountAfter: to ? formatAmount(to.bucket, to.quantity, to.unit) : null,
    dates: [...new Set([...(from?.dates ?? []), ...(to?.dates ?? [])])].sort(),
  });
  const diff = { added: [], removed: [], increased: [], decreased: [] };
  for (const item of after) {
    const old = previous.get(item.id);
    if (!old) diff.added.push(entry(item, null, item));
    else if (item.quantity != null && old.quantity != null && item.quantity > old.quantity + 1e-6) diff.increased.push(entry(item, old, item));
    else if (item.quantity != null && old.quantity != null && item.quantity < old.quantity - 1e-6) diff.decreased.push(entry(item, old, item));
  }
  for (const item of before) if (!next.has(item.id)) diff.removed.push(entry(item, item, null));
  return diff;
}

// --- Views -------------------------------------------------------------------

function ingredientName(ctx, key) {
  return ctx.ingredients.get(key)?.display ?? key;
}

function recipeSummary(recipe) {
  return {
    uid: recipe.uid,
    name: recipe.name,
    description: recipe.description,
    servings: { min: recipe.servingsMin, max: recipe.servingsMax, text: recipe.servingsText },
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    categories: recipe.categories,
    path: `/recipes/${encodeURIComponent(recipe.uid)}`,
  };
}

function dependencyView(ctx, view, dep) {
  return {
    producerDate: dep.producerDate,
    consumerDate: dep.consumerDate,
    ingredientKey: dep.ingredientKey,
    sourceKey: dep.sourceKey,
    servings: dep.servings,
    problem: dependencyProblem(ctx, view, dep),
  };
}

function slotIssues(ctx, view, date) {
  const slot = view.slots.get(date);
  const recipe = slot?.recipeUid ? ctx.recipes.get(slot.recipeUid) : null;
  if (!recipe) return [];
  const issues = [];
  for (const line of effectiveLines(ctx, view, date)) {
    if (line.optional || coveringDependency(ctx, view, date, line)) continue;
    const resolved = planLine(ctx, view, date, line);
    if (resolved.status === "unavailable" || resolved.status === "excluded") {
      issues.push({ kind: resolved.status, ingredientKey: resolved.key, verbatim: line.verbatim });
    }
  }
  for (const dep of view.deps) {
    if (dep.consumerDate !== date && dep.producerDate !== date) continue;
    const problem = dependencyProblem(ctx, view, dep);
    if (problem) issues.push({ kind: "dependency", problem, producerDate: dep.producerDate, consumerDate: dep.consumerDate, sourceKey: dep.sourceKey });
  }
  return issues;
}

function slotView(ctx, view, slot) {
  const recipe = slot.recipeUid ? ctx.recipes.get(slot.recipeUid) : null;
  return {
    date: slot.date,
    weekday: weekdayKey(slot.date),
    uid: slot.uid,
    status: slot.status,
    servings: slot.servings,
    prepMinutes: slot.prepMinutes ?? recipe?.prepMinutes ?? null,
    prepOverride: slot.prepMinutes != null,
    locked: slot.locked,
    note: slot.note,
    sequence: slot.sequence,
    recipe: recipe ? recipeSummary(recipe) : null,
    swaps: slot.status === "accepted" ? slotSwaps(ctx, view, slot.date).map(swapView) : [],
    consumes: view.deps.filter((dep) => dep.consumerDate === slot.date).map((dep) => dependencyView(ctx, view, dep)),
    feeds: view.deps.filter((dep) => dep.producerDate === slot.date).map((dep) => dependencyView(ctx, view, dep)),
    issues: slot.status === "accepted" ? slotIssues(ctx, view, slot.date) : [],
  };
}

function shoppingItemView(ctx, item) {
  const restock = restockInfo(ctx.restocks ?? [], item);
  return {
    id: item.id,
    ingredientKey: item.ingredientKey,
    name: restock?.label ?? ingredientName(ctx, item.ingredientKey),
    bucket: item.bucket,
    quantity: item.quantity,
    unit: item.unit,
    amount: formatAmount(item.bucket, item.quantity, item.unit),
    dates: item.dates,
    recipes: item.recipes.map((uid) => ({ uid, name: ctx.recipes.get(uid)?.name ?? uid })),
    checked: item.checked ?? false,
    rev: item.rev ?? null,
    kind: isRestockRow(item.id) ? "restock" : "plan",
    restock: restock && { ...restock, amount: formatAmount(item.bucket, item.quantity, item.unit) },
  };
}

// Three-day ingredient review: every line of every accepted dinner with its
// have / need / unavailable / excluded / leftover state and use-soon flag. A
// pantry quantity that falls short shows the line as a partial need.
export function reviewDays(ctx, view, dates) {
  const short = new Set(computeShopping(ctx, view, dates).filter((item) => item.quantity != null).map((item) => item.ingredientKey));
  return dates.map((date) => {
    const slot = view.slots.get(date);
    if (slot?.status !== "accepted") {
      return { date, weekday: weekdayKey(date), status: "empty", slot: slot ? slotView(ctx, view, slot) : null, lines: [], counts: null };
    }
    const lines = effectiveLines(ctx, view, date).map((line) => {
      const base = {
        position: line.position,
        section: line.section,
        verbatim: line.verbatim,
        name: line.name,
        amount: formatLineAmount(line),
        alternatives: line.alternatives,
        optional: line.optional,
        ambiguous: line.ambiguous,
        side: Boolean(line.side),
        swap: line.swap ?? null,
      };
      const dep = coveringDependency(ctx, view, date, line);
      if (dep) return { ...base, ingredientKey: dep.ingredientKey, status: "leftover", leftoverFrom: dep.producerDate, useSoon: false, partial: false };
      // A line reserved for a later leftover shows its source ingredient and
      // is required, since that dinner depends on it.
      const resolved = planLine(ctx, view, date, line);
      const optional = line.optional && !resolved.reserved;
      const partial = resolved.status === "have" && !optional && line.quantity != null && short.has(resolved.key) && ctx.pantry.get(resolved.key)?.quantity != null;
      return { ...base, optional, ingredientKey: resolved.key, status: partial ? "need" : resolved.status, useSoon: resolved.useSoon, partial };
    });
    const counts = { have: 0, need: 0, unavailable: 0, excluded: 0, leftover: 0, useSoon: 0 };
    for (const line of lines) {
      if (line.optional && line.status !== "have") continue;
      counts[line.status] += 1;
      if (line.useSoon) counts.useSoon += 1;
    }
    return { date, weekday: weekdayKey(date), status: "accepted", slot: slotView(ctx, view, slot), lines, counts };
  });
}

// --- Candidate enumeration ---------------------------------------------------

function workloadLimits(ctx, date) {
  const day = ctx.constraints.workload.byWeekday?.[weekdayKey(date)] ?? {};
  const base = ctx.constraints.workload.default ?? {};
  return {
    maxPrepMinutes: day.maxPrepMinutes ?? base.maxPrepMinutes ?? null,
    maxTotalMinutes: day.maxTotalMinutes ?? base.maxTotalMinutes ?? null,
  };
}

// Prep and total minutes with the slot's prep override applied. The override
// replaces the recipe's prep inside its total; without a known total it is
// added to the cook time. Unknown minutes stay null and fail a set limit.
function effectiveMinutes(recipe, prepOverride) {
  if (prepOverride == null) return { prep: recipe.prepMinutes, total: recipe.totalMinutes };
  let total = recipe.totalMinutes;
  if (recipe.totalMinutes != null && recipe.prepMinutes != null) total = recipe.totalMinutes - recipe.prepMinutes + prepOverride;
  else if (recipe.cookMinutes != null) total = prepOverride + recipe.cookMinutes;
  return { prep: prepOverride, total };
}

// Hard rules for one accepted dinner as planned in `view`: servings, dietary
// (category, lines and leftovers), unavailable ingredients and workload with
// the effective prep. Locks and yield are checked by the callers.
function mealProblems(ctx, view, date) {
  const slot = view.slots.get(date);
  const recipe = ctx.recipes.get(slot.recipeUid);
  if (!recipe) return ["unknown_recipe"];
  const problems = new Set();
  if (slot.servings < MIN_SERVINGS) problems.add("servings");
  if (categoryExcluded(ctx, recipe)) problems.add("dietary");
  for (const line of effectiveLines(ctx, view, date)) {
    if (line.optional || coveringDependency(ctx, view, date, line)) continue;
    const resolved = planLine(ctx, view, date, line);
    if (resolved.status === "excluded") problems.add("dietary");
    else if (resolved.status === "unavailable") problems.add("unavailable");
  }
  const limits = workloadLimits(ctx, date);
  const minutes = effectiveMinutes(recipe, slot.prepMinutes);
  const overPrep = limits.maxPrepMinutes != null && (minutes.prep == null || minutes.prep > limits.maxPrepMinutes);
  const overTotal = limits.maxTotalMinutes != null && (minutes.total == null || minutes.total > limits.maxTotalMinutes);
  if (overPrep || overTotal) problems.add("workload");
  return [...problems];
}

// Hard rules for one changed slot. Yield is checked separately because a
// dependent slot can be changed to free servings.
function slotProblems(ctx, original, next, date) {
  const problems = mealProblems(ctx, next, date);
  if (!original.slots.get(date)?.locked || problems[0] === "unknown_recipe") return problems;
  return ["locked", ...problems];
}

// Leftover links whose producer changes under a consumer that stays locked:
// the locked dinner would silently eat leftovers of a different recipe.
function lockedThroughLinks(original, next, assignments) {
  return next.deps
    .filter((dep) => assignments.has(dep.producerDate) && !assignments.has(dep.consumerDate) && original.slots.get(dep.consumerDate)?.locked)
    .sort((a, b) => compareText(a.consumerDate, b.consumerDate) || compareText(a.producerDate, b.producerDate));
}

function applyAssignments(view, assignments) {
  const slots = new Map(view.slots);
  for (const [date, recipeUid] of assignments) {
    slots.set(date, { ...slots.get(date), status: "accepted", recipeUid, prepMinutes: null });
  }
  return { slots, deps: view.deps.filter((dep) => !assignments.has(dep.consumerDate)), swaps: view.swaps };
}

function brokenByAssignments(ctx, next, assignments) {
  return next.deps
    .filter((dep) => assignments.has(dep.producerDate) && dependencyProblem(ctx, next, dep))
    .sort((a, b) => compareText(a.consumerDate, b.consumerDate) || compareText(a.producerDate, b.producerDate));
}

// Every hard rule for a full assignment; [] means feasible. Used both while
// enumerating and to revalidate a chosen option at commit.
export function assignmentProblems(ctx, assignments) {
  const original = ctx.view;
  const next = applyAssignments(original, assignments);
  const problems = [];
  for (const date of [...assignments.keys()].sort()) {
    for (const problem of slotProblems(ctx, original, next, date)) problems.push({ date, problem });
  }
  for (const dep of lockedThroughLinks(original, next, assignments)) {
    problems.push({ date: dep.consumerDate, problem: "locked_dependent", producerDate: dep.producerDate });
  }
  for (const dep of brokenByAssignments(ctx, next, assignments)) {
    problems.push({ date: dep.consumerDate, problem: "broken_dependency", producerDate: dep.producerDate });
  }
  for (const date of [...assignments.keys()].sort()) {
    if (!yieldCovers(ctx, next, date)) problems.push({ date, problem: "insufficient_yield" });
  }
  return problems;
}

function optionIdFor(baseRevision, changes) {
  return createHash("sha256")
    .update(canonicalJson({ baseRevision, changes: changes.map((change) => [change.date, change.fromRecipeUid, change.toRecipeUid]) }))
    .digest("hex")
    .slice(0, 32);
}

function scoreOption(ctx, assignments) {
  const original = ctx.view;
  const next = applyAssignments(original, assignments);
  const changedDates = [...assignments.keys()].sort();
  let total = 0;
  let covered = 0;
  let prepMinutes = 0;
  let totalMinutes = 0;
  let leftoverServings = 0;
  let repeats = 0;
  const useSoon = new Set();
  for (const date of changedDates) {
    const recipe = ctx.recipes.get(assignments.get(date));
    for (const line of recipe.lines) {
      const resolved = planLine(ctx, next, date, line);
      if (line.optional && !resolved.reserved) continue;
      total += 1;
      if (coveringDependency(ctx, next, date, line)) {
        covered += 1;
        continue;
      }
      if (resolved.status === "have") {
        covered += 1;
        if (resolved.useSoon) useSoon.add(resolved.key);
      }
    }
    prepMinutes += recipe.prepMinutes ?? 0;
    totalMinutes += recipe.totalMinutes ?? 0;
    const surplus = recipe.servingsMin - demandFor(next, date);
    if (surplus > 0 && recipe.categories.some((category) => LEFTOVER_CATEGORIES.test(category))) leftoverServings += surplus;
    for (const [other, slot] of next.slots) {
      if (other !== date && slot.status === "accepted" && slot.recipeUid === recipe.uid && Math.abs(dayDiff(other, date)) <= VARIETY_WINDOW_DAYS) {
        repeats += 1;
      }
    }
  }
  const dropped = original.deps.filter((dep) => assignments.has(dep.consumerDate));
  const shoppingDates = [...new Set([...shoppingWindow(ctx), ...changedDates])];
  const shoppingDiff = diffShopping(computeShopping(ctx, original, shoppingDates), computeShopping(ctx, next, shoppingDates));
  const purchases = shoppingDiff.added.length + shoppingDiff.increased.length;

  const impacted = new Set(changedDates);
  for (const dep of dropped) impacted.add(dep.producerDate);
  for (const list of Object.values(shoppingDiff)) for (const item of list) for (const date of item.dates) impacted.add(date);

  const changes = changedDates.map((date) => {
    const before = original.slots.get(date);
    return {
      date,
      fromRecipeUid: before.recipeUid,
      fromRecipeName: before.recipeUid ? ctx.recipes.get(before.recipeUid)?.name ?? null : null,
      toRecipeUid: assignments.get(date),
      toRecipeName: ctx.recipes.get(assignments.get(date)).name,
      servings: before.servings,
    };
  });

  const reasons = [`Covers ${covered} of ${total} ingredients from the pantry`];
  reasons.push(purchases ? `Adds or increases ${purchases} shopping item${purchases === 1 ? "" : "s"}` : "No new shopping");
  if (useSoon.size) reasons.push(`Uses soon: ${[...useSoon].sort().map((key) => ingredientName(ctx, key)).join(", ")}`);
  for (const change of changes.slice(1)) {
    reasons.push(`Also changes ${change.date} to ${change.toRecipeName} because it relied on leftovers from a changed dinner`);
  }
  for (const dep of dropped) reasons.push(`Drops the planned leftovers from ${dep.producerDate}`);
  if (repeats) reasons.push(`Repeats a recipe within ${VARIETY_WINDOW_DAYS} days`);
  reasons.push(`${prepMinutes} min prep, ${totalMinutes} min total`);
  if (leftoverServings) reasons.push(`${leftoverServings} extra serving${leftoverServings === 1 ? "" : "s"} for leftovers or the freezer`);

  return {
    optionId: optionIdFor(ctx.revision, changes),
    changes,
    droppedDependencies: dropped.map((dep) => ({ producerDate: dep.producerDate, consumerDate: dep.consumerDate, ingredientKey: dep.ingredientKey, servings: dep.servings })),
    impactedDates: [...impacted].sort(),
    reasons,
    metrics: {
      coverage: { covered, total },
      purchases,
      useSoon: useSoon.size,
      disruption: changes.length + dropped.length,
      repeats,
      prepMinutes,
      totalMinutes,
      leftoverServings,
    },
    shoppingDiff,
    tieBreak: changes.map((change) => `${change.date}:${change.toRecipeUid}`).join(","),
  };
}

// Lexicographic: pantry coverage, few purchases, use-soon produce, minimal
// disruption, variety, workload, useful leftovers, then recipe UID.
export function compareOptions(a, b) {
  const ca = a.metrics.coverage.total ? a.metrics.coverage : { covered: 1, total: 1 };
  const cb = b.metrics.coverage.total ? b.metrics.coverage : { covered: 1, total: 1 };
  return (
    cb.covered * ca.total - ca.covered * cb.total ||
    a.metrics.purchases - b.metrics.purchases ||
    b.metrics.useSoon - a.metrics.useSoon ||
    a.metrics.disruption - b.metrics.disruption ||
    a.metrics.repeats - b.metrics.repeats ||
    a.metrics.prepMinutes - b.metrics.prepMinutes ||
    a.metrics.totalMinutes - b.metrics.totalMinutes ||
    b.metrics.leftoverServings - a.metrics.leftoverServings ||
    compareText(a.tieBreak, b.tieBreak)
  );
}

// Enumerates replacement recipes for the target slot. When a replacement
// breaks a leftover dependency (source ingredient missing, excluded,
// unavailable or reserved by another leftover, or not enough
// yield for diners plus dependents), the dependent slot is enumerated in the
// same option, up to MAX_CHANGED_SLOTS slots.
export function enumerateOptions(ctx, targetDate) {
  const original = ctx.view;
  const target = original.slots.get(targetDate);
  const recipes = [...ctx.recipes.values()].sort((a, b) => compareText(a.uid, b.uid));
  const rejected = {};
  const options = new Map();
  let explored = 0;
  const reject = (reason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };

  const visit = (assignments) => {
    explored += 1;
    if (explored > MAX_EXPLORED) return reject("search_limit");
    const next = applyAssignments(original, assignments);
    for (const date of assignments.keys()) {
      const problems = slotProblems(ctx, original, next, date);
      if (problems.length) return problems.forEach(reject);
    }
    if (lockedThroughLinks(original, next, assignments).length) return reject("locked_dependent");
    const broken = brokenByAssignments(ctx, next, assignments);
    if (broken.length) {
      const consumer = original.slots.get(broken[0].consumerDate);
      if (consumer.locked) return reject("locked_dependent");
      if (assignments.size >= MAX_CHANGED_SLOTS) return reject("broken_dependency");
      for (const recipe of recipes) {
        if (recipe.uid !== consumer.recipeUid) visit(new Map([...assignments, [consumer.date, recipe.uid]]));
      }
      return undefined;
    }
    for (const date of assignments.keys()) if (!yieldCovers(ctx, next, date)) return reject("insufficient_yield");
    const option = scoreOption(ctx, assignments);
    options.set(option.optionId, option);
    return undefined;
  };

  for (const recipe of recipes) if (recipe.uid !== target.recipeUid) visit(new Map([[targetDate, recipe.uid]]));
  const ranked = [...options.values()].sort(compareOptions);
  return {
    considered: options.size,
    explored: Math.min(explored, MAX_EXPLORED),
    rejected,
    options: ranked.slice(0, MAX_OPTIONS).map((option, index) => ({ rank: index + 1, ...option })),
  };
}

// --- Snapshots for undo ------------------------------------------------------

function slotFields(slot) {
  return {
    date: slot.date,
    status: slot.status,
    recipeUid: slot.recipeUid,
    servings: slot.servings,
    prepMinutes: slot.prepMinutes,
    locked: slot.locked,
    note: slot.note,
  };
}

// Before/after image of a change. `withConstraints` adds the planning
// constraints, for an accept that also changed them, so Undo restores both.
// `withSwaps` adds the dates' ingredient swaps; images written before swaps
// existed have none and are compared and restored without them.
function snapshot(store, dates, withConstraints = false, withSwaps = true) {
  const constraints = store.constraints();
  const set = new Set(dates);
  const image = {
    slots: [...set].sort().map((date) => {
      const slot = store.getSlot(date);
      return slot ? slotFields(slot) : { date, status: "empty", recipeUid: null, servings: constraints.diners, prepMinutes: null, locked: false, note: "" };
    }),
    dependencies: store.listDependencies().filter((dep) => set.has(dep.consumerDate) || set.has(dep.producerDate)),
  };
  if (withConstraints) image.constraints = constraints;
  if (withSwaps) image.swaps = store.listSwaps([...set]);
  return image;
}

function writeDependencies(store, dates, deps) {
  const set = new Set(dates);
  store.deleteDependenciesTouching(set);
  const written = new Set();
  for (const dep of deps) {
    const key = `${dep.consumerDate}|${dep.producerDate}`;
    if (written.has(key) || !(set.has(dep.consumerDate) || set.has(dep.producerDate))) continue;
    written.add(key);
    store.ensureSlot(dep.consumerDate);
    store.ensureSlot(dep.producerDate);
    store.insertDependency(dep);
  }
}

const sameFields = (a, b) => canonicalJson(slotFields(a)) === canonicalJson(slotFields(b));

function changeView(change, latestUndoable) {
  return change && {
    revision: change.revision,
    kind: change.kind,
    label: change.label,
    dates: change.dates,
    undoes: change.undoes,
    undoneBy: change.undoneBy,
    createdAt: change.createdAt,
    undoable: latestUndoable?.revision === change.revision,
  };
}

// --- Dinner swaps --------------------------------------------------------------

const SWAP_FIELDS = ["baseRevision", "date", "sourceId", "side", "replacementKey", "replacementLabel", "quantity", "unit"];

// Validates a swap request's shape. Exactly one of sourceId (a line or an
// already swapped side of the dinner) and side (an accompaniment the owner
// enters, absent from the recipe) is given; the other is null or omitted.
function parseSwapRequest(store, body) {
  requireObject(body, "body");
  rejectUnknown(body, SWAP_FIELDS, "body");
  const date = requireDate(body.date, "date");
  if ((body.sourceId == null) === (body.side == null)) throw invalid("sourceId", "Send either sourceId or side");
  let sourceId = null;
  let side = null;
  if (body.sourceId != null) {
    if (!parseSourceId(body.sourceId)) throw invalid("sourceId", "sourceId must be a source id from GET /api/dinner-swaps");
    sourceId = body.sourceId;
  } else {
    requireObject(body.side, "side");
    rejectUnknown(body.side, ["label", "quantity", "unit"], "side");
    const label = swapLabel(body.side.label, "side.label");
    const key = resolveIngredientKey(store, label);
    if (!key || key.length > 80) throw invalid("side.label", "side.label must name an ingredient");
    side = { label, key, ...swapAmount(body.side, "side") };
  }
  const rawKey = optionalString(body.replacementKey, "replacementKey", 80);
  const toKey = rawKey ? resolveIngredientKey(store, rawKey) : "";
  if (!toKey || toKey.length > 80) throw invalid("replacementKey", "replacementKey must name an ingredient");
  const toLabel = swapLabel(body.replacementLabel, "replacementLabel");
  return { date, sourceId, side, toKey, toLabel, ...swapAmount(body, "") };
}

// Plans one swap against `ctx` without writing: the swap row, the restock
// contribution (null when this source's original is already restocked) and
// the resulting view. Every hard rule is checked; a violation throws.
// `swapId` keeps a preview's new side id stable through its apply.
function planDinnerSwap(store, ctx, request, swapId = null) {
  const { date, toKey, toLabel, quantity, unit } = request;
  if (date < ctx.today) throw invalid("date", "Past dinners cannot be changed");
  const view = ctx.view;
  const slot = view.slots.get(date);
  const recipe = slot?.status === "accepted" ? ctx.recipes.get(slot.recipeUid) : null;
  if (!recipe) throw new ServiceError(404, "dinner_not_found", "No accepted dinner on that date");
  if (slot.locked) throw new ServiceError(409, "slot_locked", "That dinner is locked");
  const lines = effectiveLines(ctx, view, date);
  const current = slotSwaps(ctx, view, date);
  const problems = [];

  // The source as cooked now, the swap it replaces (if any) and the original
  // ingredient that is restocked.
  let source;
  let previous = null;
  let original;
  let fromKey;
  if (request.sourceId) {
    source = lines.find((line) => sourceIdOf(line) === request.sourceId);
    if (!source) throw new ServiceError(404, "source_not_found", "sourceId is not part of that dinner", { field: "sourceId" });
    previous = source.swap ? current.find((swap) => swap.id === source.swap.id) : null;
    fromKey = source.swap ? source.ingredientKey : planLine(ctx, view, date, source).key;
    const amount = source.quantityMax ?? source.quantity;
    original = previous
      ? { key: previous.fromKey, label: previous.fromLabel, quantity: previous.fromQuantity, unit: previous.fromUnit }
      : { key: fromKey, label: source.name, quantity: amount ?? null, unit: amount == null ? null : source.unit ?? "each" };
  } else {
    const { key, label } = request.side;
    const inDinner =
      recipe.lines.find((line) => line.ingredientKey === key || line.alternatives.includes(key)) ??
      lines.find((line) => line.alternatives.includes(key));
    if (inDinner) {
      throw new ServiceError(422, "side_in_recipe", `${label} is already part of this dinner; swap that line instead`, { sourceId: sourceIdOf(inDinner) });
    }
    const sameSide = current.find((swap) => swap.sourcePosition == null && swap.fromKey === key);
    if (sameSide) {
      throw new ServiceError(422, "side_in_recipe", `${label} was already swapped on this dinner; swap that side instead`, { sourceId: sourceIdOf(lines.find((line) => line.swap?.id === sameSide.id)) });
    }
    fromKey = key;
    original = { key, label, quantity: request.side.quantity, unit: request.side.unit };
    source = { position: null, name: label, alternatives: [key], ingredientKey: key, side: true };
  }
  const fromLabel = source.name;
  if (toKey === fromKey) problems.push({ date, problem: "same_ingredient", ingredientKey: toKey });

  // The replacement: a catalogued ingredient, named by its label, allowed by
  // the diet (key and label alike, so a label cannot smuggle in an excluded
  // food) and not marked unavailable.
  const known = (key) => ctx.ingredients.has(key);
  if (!known(toKey)) problems.push({ date, problem: "unknown_ingredient", ingredientKey: toKey });
  else if (!labelNamesKey(toLabel, toKey, (text) => resolveIngredientKey(store, text), known)) {
    problems.push({ date, problem: "label_mismatch", ingredientKey: toKey, label: toLabel });
  }
  if (isExcluded(ctx, toKey) || isExcluded(ctx, labelForm(toLabel))) problems.push({ date, problem: "dietary", ingredientKey: toKey });
  if (ctx.pantry.get(toKey)?.status === "unavailable") problems.push({ date, problem: "unavailable", ingredientKey: toKey });

  // Leftovers: a line fed by leftovers, or one a later dinner's leftovers are
  // pinned to, stays as it is.
  if (!source.side || source.swap) {
    const covering = coveringDependency(ctx, view, date, source);
    if (covering) problems.push({ date, problem: "leftover_consumer_line", producerDate: covering.producerDate, consumerDate: date });
    let reservations = null;
    for (const dep of view.deps) {
      if (dep.producerDate !== date || !dep.sourceKey || !source.alternatives.includes(dep.sourceKey)) continue;
      reservations ??= sourceReservations(ctx, view, date);
      if (reservations.get(linkKey(dep)) === source.position) {
        problems.push({ date, problem: "leftover_reserved", producerDate: date, consumerDate: dep.consumerDate, sourceKey: dep.sourceKey });
      }
    }
  }

  const swap = {
    id: previous?.id ?? swapId ?? randomUUID(),
    date,
    recipeUid: recipe.uid,
    sourcePosition: source.side ? null : source.position,
    sourceVerbatim: source.side ? null : recipe.lines.find((line) => line.position === source.position).verbatim,
    fromKey: original.key,
    fromLabel: original.label,
    fromQuantity: original.quantity,
    fromUnit: original.unit,
    toKey,
    toLabel,
    quantity,
    unit,
    revision: ctx.revision + 1,
  };
  const swaps = new Map(view.swaps);
  swaps.set(date, [...current.filter((existing) => existing.id !== swap.id), swap]);
  const next = { ...view, swaps };

  // The dinner as it would be cooked, and every leftover link through it.
  if (!problems.length) {
    for (const problem of mealProblems(ctx, next, date)) problems.push({ date, problem });
    for (const dep of next.deps) {
      if (dep.producerDate !== date && dep.consumerDate !== date) continue;
      const problem = dependencyProblem(ctx, next, dep);
      if (problem && !dependencyProblem(ctx, view, dep)) {
        problems.push({ date, problem: problem === "insufficient_yield" ? "insufficient_yield" : "broken_dependency", producerDate: dep.producerDate, consumerDate: dep.consumerDate, detail: problem });
      }
    }
  }
  if (problems.length) {
    throw new ServiceError(422, "infeasible_swap", `This swap breaks a hard rule: ${problems[0].problem.replaceAll("_", " ")}`, { problems });
  }

  // One restock per original source: swapping a swapped line or side again
  // does not restock twice.
  const sourceId = source.side ? `side:${swap.id}` : `line:${source.position}`;
  const origin = `${date}|${recipe.uid}|${sourceId}`;
  const restocked = ctx.restocks.some((restock) => restock.origin === origin);
  const amount = amountOf(original.quantity, original.unit);
  const restock =
    restocked || isExcluded(ctx, original.key)
      ? null
      : { id: randomUUID(), origin, ingredientKey: original.key, label: original.label, quantity: original.quantity, unit: original.unit, date, recipeUid: recipe.uid, swapLabel: toLabel, revision: ctx.revision + 1, status: "open" };
  return {
    date,
    slot,
    recipe,
    sourceId,
    fromLabel,
    toLabel,
    swap,
    restock,
    restockView: {
      ingredientKey: original.key,
      label: original.label,
      quantity: original.quantity,
      unit: original.unit,
      amount: formatAmount(amount.bucket, amount.amount, amount.unit),
      added: Boolean(restock),
    },
    next,
    nextCtx: restock ? { ...ctx, restocks: [...ctx.restocks, restock] } : ctx,
  };
}

// --- Service -----------------------------------------------------------------

export function createKitchenService(store) {
  return new KitchenService(store);
}

export class KitchenService {
  constructor(store) {
    this.store = store;
  }

  checkRevision(baseRevision) {
    requireInt(baseRevision, "baseRevision", 0, Number.MAX_SAFE_INTEGER);
    const current = this.store.revision();
    if (baseRevision !== current) {
      throw new ServiceError(409, "stale_revision", "The plan changed since this screen loaded; reload and try again", { currentRevision: current });
    }
    return current;
  }

  // Rolls the horizon to Eastern today and recalculates shopping once per day.
  refresh() {
    const today = this.store.today();
    if (this.store.getSetting("horizon_day") === today) return;
    this.store.tx(() => {
      this.store.ensureHorizon(today);
      this.recalculateShopping(this.store.revision());
      this.store.setSetting("horizon_day", today);
    });
  }

  recalculateShopping(revision) {
    const ctx = loadContext(this.store);
    this.store.writeShopping(planShopping(ctx, ctx.view, shoppingWindow(ctx)), revision);
  }

  importArchive(buffer) {
    return this.store.tx(() => {
      const result = importPaprikaArchive(this.store, buffer);
      if (result.changed.length) {
        const revision = this.store.recordChange({
          kind: "import",
          label: `Imported ${result.added} new and ${result.updated} updated recipes`,
        });
        this.recalculateShopping(revision);
      }
      return result;
    });
  }

  // Runs a mutation once per Idempotency-Key. A retry with the same key and
  // body returns the stored response; a different body is rejected.
  runIdempotent(key, fingerprint, fn) {
    return this.store.tx(() => {
      if (!key) return fn();
      const existing = this.store.getIdempotent(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ServiceError(422, "idempotency_key_reused", "This Idempotency-Key was already used for a different request");
        }
        return { ...existing.response, replayed: true };
      }
      const result = fn();
      this.store.saveIdempotent(key, fingerprint, result.status, result);
      return result;
    });
  }

  // --- Reads ---

  dashboard() {
    const ctx = loadContext(this.store);
    const horizonEnd = addDays(ctx.today, HORIZON_DAYS - 1);
    const slots = [...ctx.view.slots.values()].filter((slot) => slot.date >= ctx.today && (slot.date <= horizonEnd || slot.status === "accepted"));
    const review = reviewDays(ctx, ctx.view, dateRange(ctx.today, 3));
    const shopping = this.store.listShopping();
    const latest = this.store.latestUndoableChange();
    return {
      revision: ctx.revision,
      today: ctx.today,
      timeZone: TIME_ZONE,
      diners: ctx.constraints.diners,
      slots: slots.map((slot) => slotView(ctx, ctx.view, slot)),
      review: review.map((day) => ({ date: day.date, weekday: day.weekday, status: day.status, recipeName: day.slot?.recipe?.name ?? null, counts: day.counts })),
      shopping: { total: shopping.length, unchecked: shopping.filter((item) => !item.checked).length },
      undo: changeView(latest, latest),
    };
  }

  slots(from, to) {
    const today = this.store.today();
    const start = from == null ? today : requireDate(from, "from");
    const end = to == null ? addDays(start, HORIZON_DAYS - 1) : requireDate(to, "to");
    if (end < start || dayDiff(end, start) > 92) throw invalid("to", "to must be on or after from and within 92 days");
    const ctx = loadContext(this.store);
    return { revision: ctx.revision, today, slots: this.store.listSlots(start, end).map((slot) => slotView(ctx, ctx.view, slot)) };
  }

  review(days = 3) {
    requireInt(days, "days", 1, 7);
    const ctx = loadContext(this.store);
    const dates = dateRange(ctx.today, days);
    return { revision: ctx.revision, today: ctx.today, days: reviewDays(ctx, ctx.view, dates) };
  }

  recipes() {
    return {
      recipes: Array.from(this.store.loadRecipes().values(), (recipe) => ({ ...recipeSummary(recipe), ingredientCount: recipe.lines.length })),
    };
  }

  recipe(uid) {
    const stored = typeof uid === "string" && uid.length <= 64 ? this.store.findRecipeUid(uid) : null;
    const recipe = stored ? this.store.getRecipe(stored) : null;
    if (!recipe) throw new ServiceError(404, "recipe_not_found", "No recipe with that uid");
    return {
      recipe: {
        ...recipeSummary(recipe),
        directions: recipe.directions,
        notes: recipe.notes,
        ingredientsText: recipe.ingredientsText,
        source: recipe.source,
        sourceUrl: recipe.sourceUrl,
        prepText: recipe.prepText,
        cookText: recipe.cookText,
        totalText: recipe.totalText,
        ingredients: recipe.lines.map((line) => ({ ...line, amount: formatLineAmount(line) })),
      },
    };
  }

  pantry() {
    const ctx = loadContext(this.store);
    return {
      revision: ctx.revision,
      items: [...ctx.pantry.values()].map((item) => ({ ...item, name: ingredientName(ctx, item.ingredientKey) })),
      ingredients: [...ctx.ingredients.values()],
    };
  }

  constraints() {
    return { revision: this.store.revision(), constraints: this.store.constraints() };
  }

  shopping() {
    const ctx = loadContext(this.store);
    const blocked = [];
    for (const date of shoppingWindow(ctx)) {
      for (const issue of slotIssues(ctx, ctx.view, date)) {
        if (issue.kind !== "dependency") blocked.push({ date, ...issue });
        // A leftover source the producer cannot cook is shown on its day.
        else if (issue.producerDate === date && SOURCE_BLOCKED.has(issue.problem)) blocked.push({ date, ...issue, ingredientKey: issue.sourceKey });
      }
    }
    return {
      revision: ctx.revision,
      dates: shoppingWindow(ctx),
      items: this.store.listShopping().map((item) => shoppingItemView(ctx, item)),
      blocked,
    };
  }

  getPreview(id) {
    const preview = typeof id === "string" && id.length <= 64 ? this.store.getPreview(id) : null;
    if (!preview || preview.expiresAt <= this.store.nowIso()) throw new ServiceError(404, "preview_not_found", "Preview not found or expired");
    return preview.body;
  }

  // One accepted dinner's swappable sources (its lines as cooked now, and its
  // swapped sides), the ingredients a source can be swapped to, and the
  // swaps in force.
  dinnerSwaps(date) {
    const day = requireDate(date, "date");
    const ctx = loadContext(this.store);
    const slot = ctx.view.slots.get(day);
    const recipe = slot?.status === "accepted" ? ctx.recipes.get(slot.recipeUid) : null;
    if (!recipe) throw new ServiceError(404, "dinner_not_found", "No accepted dinner on that date");
    const swaps = slotSwaps(ctx, ctx.view, day);
    return {
      revision: ctx.revision,
      date: day,
      locked: slot.locked,
      recipe: { uid: recipe.uid, name: recipe.name },
      sources: effectiveLines(ctx, ctx.view, day).map(sourceView),
      ingredients: [...ctx.ingredients.values()]
        .filter((item) => !isExcluded(ctx, item.key) && ctx.pantry.get(item.key)?.status !== "unavailable")
        .map((item) => ({ key: item.key, label: item.display })),
      swaps: swaps.map(swapView),
      share: shareText(day, recipe.name, swaps),
    };
  }

  changes(limit = 20) {
    requireInt(limit, "limit", 1, 200);
    const latest = this.store.latestUndoableChange();
    return { revision: this.store.revision(), changes: this.store.listChanges(limit).map((change) => changeView(change, latest)) };
  }

  // Accepted slots for the calendar feed, newest 30 days back onward, with
  // the accepted swaps in force on each (never previews).
  calendarEntries() {
    const recipes = this.store.loadRecipes();
    const slots = this.store.listAcceptedSlots(addDays(this.store.today(), -30));
    const ctx = { recipes };
    const view = { slots: new Map(slots.map((slot) => [slot.date, slot])), swaps: this.store.swapsByDate() };
    return slots
      .map((slot) => ({ slot, recipe: recipes.get(slot.recipeUid), swaps: slotSwaps(ctx, view, slot.date).map(swapView) }))
      .filter((entry) => entry.recipe);
  }

  // --- Mutations (call inside runIdempotent) ---

  setPantryItem(rawKey, body) {
    requireObject(body, "body");
    rejectUnknown(body, ["status", "quantity", "unit", "useSoon", "rev"], "body");
    if (!["have", "need", "unavailable", "clear"].includes(body.status)) {
      throw invalid("status", "status must be have, need, unavailable or clear");
    }
    const rev = requireInt(body.rev, "rev", 0, Number.MAX_SAFE_INTEGER);
    let quantity = null;
    if (body.quantity != null) {
      if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 0 || body.quantity > 100_000) {
        throw invalid("quantity", "quantity must be a number from 0 to 100000");
      }
      quantity = body.quantity;
    }
    let unit = null;
    if (body.unit != null) {
      unit = typeof body.unit === "string" && body.unit.length <= 20 ? normalizeUnit(body.unit) : null;
      if (!unit) throw invalid("unit", "unit is not a recognised unit");
    }
    const useSoon = body.useSoon == null ? false : requireBool(body.useSoon, "useSoon");
    const key = typeof rawKey === "string" && rawKey.length <= 120 ? resolveIngredientKey(this.store, rawKey) : "";
    if (!key || key.length > 80) throw invalid("ingredient", "ingredient must name an ingredient");

    const current = this.store.getPantryItem(key);
    if (rev !== (current?.rev ?? 0)) {
      throw new ServiceError(409, "stale_item", "This pantry item changed on another device; reload and try again", { currentRev: current?.rev ?? 0 });
    }
    if (body.status === "clear") {
      if (!current) return { status: 200, body: { revision: this.store.revision(), item: null, changed: false } };
      this.store.deletePantryItem(key);
    } else {
      this.store.writePantryItem(key, { status: body.status, quantity, unit: quantity == null ? null : unit, useSoon });
    }
    const revision = this.store.recordChange({ kind: "pantry", label: `Pantry: ${key} ${body.status}` });
    this.recalculateShopping(revision);
    return { status: 200, body: { revision, item: this.store.getPantryItem(key), changed: true } };
  }

  setConstraints(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["baseRevision", "constraints"], "body");
    this.checkRevision(body.baseRevision);
    const constraints = validateConstraints(body.constraints, this.store.constraints());
    this.store.setSetting("constraints", constraints);
    const revision = this.store.recordChange({ kind: "constraints", label: "Updated planning constraints" });
    this.recalculateShopping(revision);
    return { status: 200, body: { revision, constraints } };
  }

  // Checks a shopping line off (a checked restock counts as bought), or, with
  // `clear: true`, removes a restock line and its open contributions.
  setShoppingChecked(id, body) {
    requireObject(body, "body");
    rejectUnknown(body, ["checked", "rev", "clear"], "body");
    const clear = body.clear == null ? false : requireBool(body.clear, "clear");
    const checked = clear && body.checked === undefined ? null : requireBool(body.checked, "checked");
    const rev = requireInt(body.rev, "rev", 0, Number.MAX_SAFE_INTEGER);
    const item = typeof id === "string" && id.length <= 200 ? this.store.getShoppingItem(id) : null;
    if (!item) throw new ServiceError(404, "shopping_item_not_found", "That shopping item is no longer on the list");
    if (item.rev !== rev) {
      throw new ServiceError(409, "stale_item", "This shopping item changed; reload and try again", { currentRev: item.rev });
    }
    if (clear) {
      if (!isRestockRow(id)) throw invalid("clear", "Only restock lines can be cleared");
      for (const restock of this.store.listRestocks()) {
        if (restock.status === "open" && restockRowId(restock) === id) this.store.setRestockStatus(restock.id, "cleared");
      }
      this.recalculateShopping(this.store.revision());
      return { status: 200, body: { revision: this.store.revision(), item: null, cleared: true } };
    }
    this.store.setShoppingChecked(id, checked);
    const ctx = loadContext(this.store);
    return { status: 200, body: { revision: ctx.revision, item: shoppingItemView(ctx, this.store.getShoppingItem(id)) } };
  }

  // Owner-supplied plan: dates, recipes, servings, prep, locks, leftover
  // dependencies and constraints, accepted explicitly in one revision. The
  // final linked plan is checked against the same hard rules as a swap
  // before anything is written, so a rejected request changes nothing. A
  // locked dinner only accepts being unlocked; dinners whose content does not
  // change (a note, a lock, an unchanged re-send) are not re-judged, so one
  // flagged for review by a later pantry or constraint change stays as it is.
  acceptPlan(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["accept", "baseRevision", "slots", "dependencies", "removeDependencies", "constraints", "label"], "body");
    if (body.accept !== true) {
      throw new ServiceError(422, "explicit_acceptance_required", "Set accept: true to accept these dinners");
    }
    this.checkRevision(body.baseRevision);
    const label = optionalString(body.label, "label", 120)?.trim() || "Accepted dinners";
    const slotInputs = requireArray(body.slots ?? [], "slots", 62);
    const depInputs = requireArray(body.dependencies ?? [], "dependencies", 62);
    const removeInputs = requireArray(body.removeDependencies ?? [], "removeDependencies", 62);
    if (!slotInputs.length && !depInputs.length && !removeInputs.length && body.constraints === undefined) {
      throw invalid("slots", "Nothing to accept");
    }

    const store = this.store;
    const today = store.today();
    const lastDate = addDays(today, MAX_PLAN_DAYS_AHEAD);
    const checkPlanDate = (value, field) => {
      requireDate(value, field);
      if (value < today || value > lastDate) throw invalid(field, `${field} must be from ${today} to ${lastDate}`);
      return value;
    };

    const currentConstraints = store.constraints();
    const constraints = body.constraints === undefined ? currentConstraints : validateConstraints(body.constraints, currentConstraints);
    const constraintsChanged = canonicalJson(constraints) !== canonicalJson(currentConstraints);
    const ctx = { ...loadContext(store), constraints };
    const original = ctx.view;
    const diners = constraints.diners;
    const nextSlots = new Map(original.slots);
    const touched = new Set();

    slotInputs.forEach((input, index) => {
      const field = `slots[${index}]`;
      requireObject(input, field);
      rejectUnknown(input, ["date", "recipeUid", "servings", "prepMinutes", "locked", "note"], field);
      const date = checkPlanDate(input.date, `${field}.date`);
      if (touched.has(date)) throw invalid(`${field}.date`, `${date} appears more than once`);
      touched.add(date);
      const existing = nextSlots.get(date) ?? { date, uid: null, status: "empty", recipeUid: null, servings: diners, prepMinutes: null, locked: false, note: "" };
      let recipeUid = existing.recipeUid;
      if (input.recipeUid !== undefined) {
        if (input.recipeUid === null) recipeUid = null;
        else {
          const uid = resolveRecipeUid(ctx.recipes, optionalString(input.recipeUid, `${field}.recipeUid`, 64));
          if (!uid) throw new ServiceError(422, "unknown_recipe", `${field}.recipeUid is not a known recipe`, { field: `${field}.recipeUid` });
          recipeUid = uid;
        }
      }
      nextSlots.set(date, {
        ...existing,
        status: recipeUid ? "accepted" : "empty",
        recipeUid,
        servings: input.servings === undefined ? existing.servings : requireInt(input.servings, `${field}.servings`, 1, 20),
        prepMinutes: input.prepMinutes === undefined ? (recipeUid === existing.recipeUid ? existing.prepMinutes : null) : optionalInt(input.prepMinutes, `${field}.prepMinutes`, 0, 720),
        locked: input.locked === undefined ? existing.locked : requireBool(input.locked, `${field}.locked`),
        note: input.note === undefined ? existing.note : optionalString(input.note, `${field}.note`, 200) ?? "",
      });
    });

    // Dependencies: a consumer whose recipe changed or emptied loses its
    // leftover links unless they are re-supplied (`dropped` keeps the ones
    // lost that way). A link that names its source ingredient follows a
    // changed producer recipe as long as the new recipe can still cook it.
    const depKey = (dep) => `${dep.consumerDate}|${dep.producerDate}`;
    const nextDeps = new Map();
    const dropped = new Map();
    for (const dep of original.deps) {
      const consumer = nextSlots.get(dep.consumerDate);
      if (consumer.recipeUid !== original.slots.get(dep.consumerDate)?.recipeUid || consumer.status !== "accepted") {
        dropped.set(depKey(dep), dep);
        continue;
      }
      nextDeps.set(depKey(dep), dep);
    }
    removeInputs.forEach((input, index) => {
      const field = `removeDependencies[${index}]`;
      requireObject(input, field);
      rejectUnknown(input, ["producerDate", "consumerDate"], field);
      const key = depKey({ consumerDate: requireDate(input.consumerDate, `${field}.consumerDate`), producerDate: requireDate(input.producerDate, `${field}.producerDate`) });
      nextDeps.delete(key);
      const [consumerDate, producerDate] = key.split("|");
      touched.add(consumerDate);
      touched.add(producerDate);
    });
    depInputs.forEach((input, index) => {
      const field = `dependencies[${index}]`;
      requireObject(input, field);
      rejectUnknown(input, ["producerDate", "consumerDate", "servings", "ingredientKey", "sourceKey"], field);
      const producerDate = checkPlanDate(input.producerDate, `${field}.producerDate`);
      const consumerDate = checkPlanDate(input.consumerDate, `${field}.consumerDate`);
      if (producerDate >= consumerDate) throw invalid(field, "producerDate must be before consumerDate");
      const producer = nextSlots.get(producerDate);
      const consumer = nextSlots.get(consumerDate);
      if (producer?.status !== "accepted" || consumer?.status !== "accepted") {
        throw new ServiceError(422, "broken_dependency", `${field} must link two accepted dinners`, { field });
      }
      let ingredientKey = null;
      if (input.ingredientKey != null) {
        ingredientKey = resolveIngredientKey(store, optionalString(input.ingredientKey, `${field}.ingredientKey`, 80));
        if (!recipeContains(ctx.recipes.get(consumer.recipeUid), ingredientKey)) {
          throw new ServiceError(422, "broken_dependency", `${field}.ingredientKey is not an ingredient of the ${consumerDate} recipe`, { field: `${field}.ingredientKey` });
        }
      }
      let sourceKey = null;
      if (input.sourceKey != null) sourceKey = resolveIngredientKey(store, optionalString(input.sourceKey, `${field}.sourceKey`, 80));
      else if (ingredientKey) {
        const derived = ingredientKey.replace(/^(?:cooked|leftover|roasted|pulled|cold cooked)\s+/, "");
        if (derived !== ingredientKey) sourceKey = derived;
      }
      const dep = {
        consumerDate,
        producerDate,
        producerRecipeUid: producer.recipeUid,
        ingredientKey,
        sourceKey: sourceKey || null,
        servings: requireInt(input.servings, `${field}.servings`, 1, 20),
      };
      nextDeps.set(depKey(dep), dep);
      dropped.delete(depKey(dep));
      touched.add(consumerDate);
      touched.add(producerDate);
    });
    for (const [key, dep] of nextDeps) {
      const producer = nextSlots.get(dep.producerDate);
      if (dep.sourceKey && producer?.status === "accepted" && producer.recipeUid !== dep.producerRecipeUid) {
        nextDeps.set(key, { ...dep, producerRecipeUid: producer.recipeUid });
      }
    }
    const next = { slots: nextSlots, deps: [...nextDeps.values()].sort((a, b) => compareText(depKey(a), depKey(b))), swaps: original.swaps };

    // What really changes: slot fields, and links added, removed or altered.
    const linksBefore = new Map(original.deps.map((dep) => [depKey(dep), dep]));
    const changedLinks = [];
    for (const key of [...new Set([...linksBefore.keys(), ...nextDeps.keys()])].sort()) {
      const previous = linksBefore.get(key);
      const updated = nextDeps.get(key);
      if (previous && updated && canonicalJson(previous) === canonicalJson(updated)) continue;
      changedLinks.push({ dep: updated ?? previous, kept: Boolean(updated), implicit: !updated && dropped.has(key) });
    }
    const affected = new Set(touched);
    for (const { dep } of changedLinks) {
      affected.add(dep.consumerDate);
      affected.add(dep.producerDate);
    }
    const dates = [...affected].sort();
    const changedSlots = dates.filter((date) => {
      const previous = original.slots.get(date);
      const updated = nextSlots.get(date);
      return updated && (!previous ? updated.status === "accepted" : !sameFields(previous, updated));
    });
    if (!changedSlots.length && !changedLinks.length && !constraintsChanged) {
      return { status: 200, body: { revision: store.revision(), changed: [], change: null, warnings: [] } };
    }

    // Locks, including changes that reach a locked dinner through a link.
    const wasLocked = (date) => Boolean(original.slots.get(date)?.locked);
    const lockProblems = new Map();
    const lockProblem = (problem) => lockProblems.set(canonicalJson(problem), problem);
    for (const date of changedSlots) {
      const previous = original.slots.get(date);
      const updated = nextSlots.get(date);
      if (wasLocked(date) && !sameFields({ ...previous, locked: updated.locked }, updated)) lockProblem({ date, problem: "locked" });
    }
    for (const { dep, implicit } of changedLinks) {
      if (implicit) continue; // follows from its consumer's own change, checked above
      for (const date of [dep.consumerDate, dep.producerDate]) {
        if (wasLocked(date)) lockProblem({ date, problem: "locked_dependency", producerDate: dep.producerDate, consumerDate: dep.consumerDate });
      }
    }
    for (const dep of next.deps) {
      if (wasLocked(dep.consumerDate) && original.slots.get(dep.producerDate)?.recipeUid !== nextSlots.get(dep.producerDate)?.recipeUid) {
        lockProblem({ date: dep.consumerDate, problem: "locked_dependency", producerDate: dep.producerDate, consumerDate: dep.consumerDate });
      }
    }
    if (lockProblems.size) {
      const problems = [...lockProblems.values()];
      throw new ServiceError(409, "slot_locked", `The ${problems[0].date} dinner is locked; unlock it on its own first`, { problems });
    }

    // Every dinner whose meal or consumed leftovers change is judged in full;
    // every producer whose demand changes must still cover all reservations.
    const sameMeal = (a, b) => a.status === b.status && a.recipeUid === b.recipeUid && a.servings === b.servings && (a.prepMinutes ?? null) === (b.prepMinutes ?? null);
    const accepted = (date) => nextSlots.get(date)?.status === "accepted";
    const judged = new Set(changedSlots.filter((date) => accepted(date) && (!original.slots.get(date) || !sameMeal(original.slots.get(date), nextSlots.get(date)))));
    const yieldDates = new Set(judged);
    const keptLinks = new Set();
    for (const { dep, kept } of changedLinks) {
      if (kept) keptLinks.add(depKey(dep));
      if (accepted(dep.consumerDate)) judged.add(dep.consumerDate);
      if (accepted(dep.producerDate)) yieldDates.add(dep.producerDate);
    }

    for (const dep of next.deps) {
      if (!keptLinks.has(depKey(dep)) && !judged.has(dep.consumerDate) && !yieldDates.has(dep.producerDate)) continue;
      const problem = dependencyProblem(ctx, next, dep);
      if (problem) {
        throw new ServiceError(422, problem === "insufficient_yield" ? "insufficient_yield" : "broken_dependency", `Leftovers from ${dep.producerDate} for ${dep.consumerDate}: ${problem.replaceAll("_", " ")}`, { producerDate: dep.producerDate, consumerDate: dep.consumerDate, problem });
      }
    }

    const problems = [];
    for (const { dep, kept } of changedLinks) {
      if (kept && leftoverExcluded(ctx, dep)) {
        problems.push({ date: dep.consumerDate, problem: "dietary", producerDate: dep.producerDate, ingredientKey: dep.ingredientKey });
      }
    }
    for (const dep of dropped.values()) {
      if (!dep.ingredientKey || !accepted(dep.consumerDate)) continue;
      const stranded = effectiveLines(ctx, next, dep.consumerDate).some(
        (line) =>
          !line.optional &&
          line.alternatives.includes(dep.ingredientKey) &&
          !coveringDependency(ctx, next, dep.consumerDate, line) &&
          ["unavailable", "excluded"].includes(planLine(ctx, next, dep.consumerDate, line).status),
      );
      if (stranded) {
        problems.push({ date: dep.consumerDate, problem: "leftover_link_required", producerDate: dep.producerDate, ingredientKey: dep.ingredientKey });
      }
    }
    for (const date of [...judged].sort()) for (const problem of mealProblems(ctx, next, date)) problems.push({ date, problem });
    for (const date of [...yieldDates].sort()) if (!yieldCovers(ctx, next, date)) problems.push({ date, problem: "insufficient_yield" });
    if (problems.length) {
      throw new ServiceError(422, "infeasible_plan", `The ${problems[0].date} dinner breaks a hard rule: ${problems[0].problem.replaceAll("_", " ")}`, { problems });
    }

    // Dinners that change only in note or lock keep any existing issues as
    // warnings for review.
    const warnings = [];
    for (const date of changedSlots) {
      if (!accepted(date) || judged.has(date)) continue;
      for (const problem of mealProblems(ctx, next, date)) warnings.push({ date, problem });
      if (!yieldCovers(ctx, next, date)) warnings.push({ date, problem: "insufficient_yield" });
    }

    return store.tx(() => {
      const before = snapshot(store, dates, constraintsChanged);
      if (constraintsChanged) store.setSetting("constraints", constraints);
      const revision = store.revision() + 1;
      for (const date of changedSlots) store.writeSlot(date, nextSlots.get(date), revision);
      writeDependencies(store, dates, next.deps);
      store.deleteStaleSwaps(changedSlots);
      const after = snapshot(store, dates, constraintsChanged);
      const recorded = store.recordChange({ kind: "accept", label, dates, before, after });
      if (recorded !== revision) throw new Error("Revision changed inside a transaction");
      this.recalculateShopping(revision);

      const result = loadContext(store);
      const latest = store.latestUndoableChange();
      return {
        status: 200,
        body: {
          revision,
          change: changeView(store.getChange(revision), latest),
          changed: changedSlots.map((date) => slotView(result, result.view, result.view.slots.get(date))),
          warnings,
        },
      };
    });
  }

  // Deterministic swap preview for one dinner. Writes only the preview row;
  // accepted dinners, shopping and the calendar feed are untouched.
  preview(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["baseRevision", "date"], "body");
    this.checkRevision(body.baseRevision);
    const store = this.store;
    const today = store.today();
    const date = requireDate(body.date, "date");
    if (date < today) throw invalid("date", "Past dinners cannot be changed");
    const ctx = loadContext(store);
    const slot = ctx.view.slots.get(date);
    if (!slot) throw new ServiceError(404, "slot_not_found", "No dinner slot on that date");
    if (slot.locked) throw new ServiceError(409, "slot_locked", "That dinner is locked");
    const result = enumerateOptions(ctx, date);
    const createdAt = store.nowIso();
    const preview = {
      previewId: randomUUID(),
      baseRevision: ctx.revision,
      targetDate: date,
      createdAt,
      expiresAt: new Date(store.now().getTime() + PREVIEW_TTL_MS).toISOString(),
      current: slotView(ctx, ctx.view, slot),
      ...result,
    };
    store.insertPreview({ id: preview.previewId, baseRevision: ctx.revision, day: today, targetDate: date, body: preview, createdAt, expiresAt: preview.expiresAt });
    return { status: 201, body: preview };
  }

  // Commits one server-generated preview option after revalidating it against
  // current state: same revision, same day, same source recipes, and every
  // hard rule still satisfied. Slots, dependencies, calendar sequence,
  // shopping and the revision change in this one transaction.
  commit(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["baseRevision", "previewId", "optionId"], "body");
    const current = this.checkRevision(body.baseRevision);
    const store = this.store;
    const preview = typeof body.previewId === "string" && body.previewId.length <= 64 ? store.getPreview(body.previewId) : null;
    if (!preview) throw new ServiceError(404, "preview_not_found", "Preview not found; it may have been replaced by a newer change");
    if (preview.expiresAt <= store.nowIso()) throw new ServiceError(409, "preview_expired", "This preview expired; preview again");
    if (preview.baseRevision !== current || preview.day !== store.today()) {
      throw new ServiceError(409, "stale_preview", "The plan changed since this preview; preview again");
    }
    const option = (preview.body.options ?? []).find((candidate) => candidate.optionId === body.optionId);
    if (!option) throw new ServiceError(422, "unknown_option", "optionId is not one of this preview's options");

    const ctx = loadContext(store);
    const assignments = new Map(option.changes.map((change) => [change.date, change.toRecipeUid]));
    const problems = [];
    for (const change of option.changes) {
      const slot = ctx.view.slots.get(change.date);
      if (!slot || slot.recipeUid !== change.fromRecipeUid) problems.push({ date: change.date, problem: "slot_changed" });
      if (!ctx.recipes.has(change.toRecipeUid)) problems.push({ date: change.date, problem: "unknown_recipe" });
    }
    if (!problems.length) problems.push(...assignmentProblems(ctx, assignments));
    if (problems.length) throw new ServiceError(409, "option_invalid", "This option is no longer valid; preview again", { problems });
    if (optionIdFor(current, option.changes) !== option.optionId) throw new ServiceError(422, "unknown_option", "optionId does not match its changes");

    const next = applyAssignments(ctx.view, assignments);
    const dates = new Set(assignments.keys());
    for (const dep of ctx.view.deps) if (assignments.has(dep.consumerDate)) dates.add(dep.producerDate);
    for (const dep of next.deps) if (assignments.has(dep.producerDate)) dates.add(dep.consumerDate);
    const sortedDates = [...dates].sort();
    return store.tx(() => {
      const revision = current + 1;
      const before = snapshot(store, sortedDates);
      for (const [date, recipeUid] of assignments) {
        store.writeSlot(date, { ...slotFields(ctx.view.slots.get(date)), recipeUid, prepMinutes: null }, revision);
      }
      writeDependencies(
        store,
        sortedDates,
        next.deps.map((dep) => (assignments.has(dep.producerDate) ? { ...dep, producerRecipeUid: assignments.get(dep.producerDate) } : dep)),
      );
      store.deleteStaleSwaps(assignments.keys());
      const after = snapshot(store, sortedDates);
      const label = option.changes.map((change) => `${change.date}: ${change.toRecipeName}`).join("; ");
      store.recordChange({ kind: "commit", label: `Swapped ${label}`, dates: sortedDates, before, after });
      this.recalculateShopping(revision);

      const result = loadContext(store);
      const latest = store.latestUndoableChange();
      return {
        status: 200,
        body: {
          revision,
          change: changeView(store.getChange(revision), latest),
          changed: option.changes.map((change) => slotView(result, result.view, result.view.slots.get(change.date))),
        },
      };
    });
  }

  // Previews swapping one ingredient (or an owner-entered side) of one
  // accepted dinner. Writes only the preview row: nothing is accepted, and
  // shopping and the calendar feed are untouched. The shopping diff shows the
  // replacement's effect and the original's restock line.
  previewDinnerSwap(body) {
    const store = this.store;
    const request = parseSwapRequest(store, body);
    this.checkRevision(body.baseRevision);
    const ctx = loadContext(store);
    const plan = planDinnerSwap(store, ctx, request);
    const dates = [...new Set([...shoppingWindow(ctx), plan.date])];
    const shoppingDiff = diffShopping(planShopping(ctx, ctx.view, dates), planShopping(plan.nextCtx, plan.next, dates));
    const restockId = plan.restock ? restockRowId(plan.restock) : null;
    const listed = restockId ? store.getShoppingItem(restockId) : null;
    for (const entries of Object.values(shoppingDiff)) {
      for (const entry of entries) {
        entry.name = isRestockRow(entry.id) ? `${entry.id === restockId ? plan.restock.label : ingredientName(ctx, entry.ingredientKey)} (restock)` : ingredientName(ctx, entry.ingredientKey);
      }
    }
    shoppingDiff.restocks = plan.restock
      ? [{ id: restockId, ingredientKey: plan.restock.ingredientKey, label: plan.restock.label, quantity: plan.restock.quantity, unit: plan.restock.unit, amount: plan.restockView.amount, alreadyListed: Boolean(listed) }]
      : [];
    const createdAt = store.nowIso();
    const preview = {
      kind: "dinner_swap",
      previewId: randomUUID(),
      baseRevision: ctx.revision,
      date: plan.date,
      createdAt,
      expiresAt: new Date(store.now().getTime() + PREVIEW_TTL_MS).toISOString(),
      sourceId: plan.sourceId,
      fromLabel: plan.fromLabel,
      toLabel: plan.toLabel,
      replacementKey: plan.swap.toKey,
      quantity: plan.swap.quantity,
      unit: plan.swap.unit,
      restock: plan.restockView,
      shoppingDiff,
      request: { ...request, baseRevision: ctx.revision },
      swapId: plan.swap.id,
    };
    store.insertPreview({ id: preview.previewId, baseRevision: ctx.revision, day: ctx.today, targetDate: plan.date, body: preview, createdAt, expiresAt: preview.expiresAt });
    return { status: 201, body: preview };
  }

  // Applies a stored swap preview after revalidating it: same revision and
  // day, and every hard rule still holding. The swap, its restock, the
  // shopping list, the revision and the slot's calendar SEQUENCE change in
  // this one transaction; Undo reverses it like any accepted change.
  applyDinnerSwap(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["baseRevision", "previewId"], "body");
    const current = this.checkRevision(body.baseRevision);
    const store = this.store;
    const preview = typeof body.previewId === "string" && body.previewId.length <= 64 ? store.getPreview(body.previewId) : null;
    if (!preview || preview.body.kind !== "dinner_swap") {
      throw new ServiceError(404, "preview_not_found", "Preview not found; it may have been replaced by a newer change");
    }
    if (preview.expiresAt <= store.nowIso()) throw new ServiceError(409, "preview_expired", "This preview expired; preview again");
    if (preview.baseRevision !== current || preview.day !== store.today()) {
      throw new ServiceError(409, "stale_preview", "The plan changed since this preview; preview again");
    }
    const ctx = loadContext(store);
    let plan;
    try {
      plan = planDinnerSwap(store, ctx, preview.body.request, preview.body.swapId);
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error;
      throw new ServiceError(409, "swap_invalid", "This swap is no longer valid; preview again", { reason: error.code, ...(error.details ?? {}) });
    }
    if (plan.fromLabel !== preview.body.fromLabel || canonicalJson(plan.restockView) !== canonicalJson(preview.body.restock)) {
      throw new ServiceError(409, "swap_invalid", "This swap is no longer valid; preview again");
    }

    return store.tx(() => {
      const revision = current + 1;
      const dates = [plan.date];
      const before = snapshot(store, dates);
      store.writeSwap({ ...plan.swap, revision, createdAt: store.nowIso() });
      if (plan.restock) store.insertRestock({ ...plan.restock, revision });
      store.writeSlot(plan.date, slotFields(store.getSlot(plan.date)), revision);
      const after = snapshot(store, dates);
      const label = `Swapped ${plan.date}: ${swapSentence(plan.swap)}`.slice(0, 200);
      const recorded = store.recordChange({ kind: "commit", label, dates, before, after });
      if (recorded !== revision) throw new Error("Revision changed inside a transaction");
      this.recalculateShopping(revision);

      const result = loadContext(store);
      const latest = store.latestUndoableChange();
      const swaps = slotSwaps(result, result.view, plan.date);
      return {
        status: 200,
        body: {
          revision,
          date: plan.date,
          change: changeView(store.getChange(revision), latest),
          changed: [slotView(result, result.view, result.view.slots.get(plan.date))],
          swap: swapView(swaps.find((swap) => swap.id === plan.swap.id)),
          restock: plan.restockView,
          share: shareText(plan.date, plan.recipe.name, swaps),
        },
      };
    });
  }

  // Undoes the latest accepted change (accept, commit or ingredient swap)
  // with a new compensating revision. Refused when any of its dinners changed
  // since, so intervening edits are never overwritten. Restored slots, and
  // slots whose swaps are restored, get a new, higher calendar SEQUENCE.
  // Restocks the change added are withdrawn unless already bought (checked)
  // or cleared; every other restock stays.
  undo(body) {
    requireObject(body, "body");
    rejectUnknown(body, ["baseRevision", "revision"], "body");
    const current = this.checkRevision(body.baseRevision);
    const target = requireInt(body.revision, "revision", 1, Number.MAX_SAFE_INTEGER);
    const store = this.store;
    const latest = store.latestUndoableChange();
    if (!latest) throw new ServiceError(409, "nothing_to_undo", "There is no accepted change to undo");
    if (latest.revision !== target) {
      throw new ServiceError(409, "not_latest_change", "Only the latest accepted change can be undone", { latestRevision: latest.revision });
    }
    // An accept that also changed constraints recorded them in its images;
    // Undo then requires them unchanged since and restores them too. No hard
    // rule is re-applied: Undo restores the accepted state exactly, even if
    // the pantry has changed since.
    const withConstraints = latest.after?.constraints !== undefined;
    const withSwaps = latest.after?.swaps !== undefined;
    const now = snapshot(store, latest.dates, withConstraints, withSwaps);
    if (canonicalJson(now) !== canonicalJson(latest.after)) {
      throw new ServiceError(409, "undo_conflict", "These dinners changed after that change; undo is no longer safe", { dates: latest.dates });
    }
    return store.tx(() => {
      const revision = current + 1;
      if (withConstraints) store.setSetting("constraints", latest.before.constraints);
      const swapsOf = (image, date) => canonicalJson((image.swaps ?? []).filter((swap) => swap.date === date));
      for (const fields of latest.before.slots) {
        const slot = store.getSlot(fields.date);
        const swapsChange = withSwaps && swapsOf(now, fields.date) !== swapsOf(latest.before, fields.date);
        if (slot && (!sameFields(slot, fields) || swapsChange)) store.writeSlot(fields.date, fields, revision);
      }
      writeDependencies(store, latest.dates, latest.before.dependencies);
      if (withSwaps) store.replaceSwaps(latest.dates, latest.before.swaps ?? []);
      store.deleteStaleSwaps(latest.dates);
      for (const restock of store.openRestocksOf(latest.revision)) {
        if (!store.getShoppingItem(restockRowId(restock))?.checked) store.setRestockStatus(restock.id, "undone");
      }
      const after = snapshot(store, latest.dates, withConstraints, withSwaps);
      store.recordChange({ kind: "undo", label: `Undo: ${latest.label}`.slice(0, 200), dates: latest.dates, before: now, after, undoes: latest.revision });
      this.recalculateShopping(revision);

      const result = loadContext(store);
      const nextLatest = store.latestUndoableChange();
      return {
        status: 200,
        body: {
          revision,
          change: changeView(store.getChange(revision), nextLatest),
          undone: latest.revision,
          changed: latest.dates.filter((date) => result.view.slots.has(date)).map((date) => slotView(result, result.view, result.view.slots.get(date))),
        },
      };
    });
  }
}
