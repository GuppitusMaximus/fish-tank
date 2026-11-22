// Slot-scoped dinner swaps and the restocks they leave on the shopping list.
//
// A swap replaces one ingredient line of one accepted dinner, or a side the
// owner entered for it, with another ingredient on that date only. It never
// edits the shared recipe: effectiveLines() overlays a slot's swaps on its
// recipe's lines, and only while the slot still holds the recipe the swap
// was accepted with and the swapped line still reads as it did. An owner-
// entered side is shown as a side, never as a recipe line.
//
// Swapping out an ingredient restocks it: a durable contribution in the
// restocks table, independent of the dinner, that restockItems() turns into
// its own shopping line until it is cleared (or the swap that added it is
// undone before it was bought).
//
// The service methods live in planner.mjs; this module is pure.

import { ServiceError } from "./store.mjs";
import { UNITS, baseForm, normalizeUnit } from "./import.mjs";

export const MAX_SWAP_LABEL = 80;
const MAX_SWAP_QUANTITY = 100_000;
const RESTOCK_PREFIX = "restock|";

// Cooking words a label may add around its ingredient ("Roast carrots").
const COOKING_WORDS = new Set([
  "roast", "roasted", "steamed", "glazed", "mash", "mashed", "sauteed", "grilled", "braised", "boiled", "baked",
  "fried", "pan", "sheet", "charred", "blistered", "buttered", "creamed", "side", "with", "and", "style",
]);

function invalid(field, message) {
  return new ServiceError(422, "invalid_request", message, { field });
}

const trimNumber = (value) => String(Math.round(value * 100) / 100);

// --- Request parts -------------------------------------------------------------

export const lineSourceId = (position) => `line:${position}`;
export const sideSourceId = (id) => `side:${id}`;

export function parseSourceId(value) {
  if (typeof value !== "string") return null;
  const line = value.match(/^line:(\d{1,4})$/);
  if (line) return { kind: "line", position: Number(line[1]) };
  const side = value.match(/^side:([0-9a-f-]{36})$/);
  return side ? { kind: "side", id: side[1] } : null;
}

// A display label: trimmed, single-line, 1 to MAX_SWAP_LABEL characters.
export function swapLabel(value, field) {
  // eslint-disable-next-line no-control-regex -- labels are single-line text
  const label = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!label || label.length > MAX_SWAP_LABEL) throw invalid(field, `${field} must be 1 to ${MAX_SWAP_LABEL} characters`);
  return label;
}

// A shoppable amount: a positive quantity and a measurable unit (default
// each). Pinches, dashes and the like cannot be bought.
export function swapAmount(value, prefix) {
  const field = (name) => (prefix ? `${prefix}.${name}` : name);
  const quantity = value.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_SWAP_QUANTITY) {
    throw invalid(field("quantity"), `${field("quantity")} must be a number above 0 and at most ${MAX_SWAP_QUANTITY}`);
  }
  let unit = "each";
  if (value.unit != null) {
    unit = typeof value.unit === "string" && value.unit.length <= 20 ? normalizeUnit(value.unit) : null;
    if (!unit) throw invalid(field("unit"), `${field("unit")} is not a recognised unit`);
  }
  if (UNITS[unit].ambiguous) throw invalid(field("unit"), `${field("unit")} must be a measurable unit`);
  return { quantity, unit };
}

// The normalized words of a label, hyphenated words split.
export function labelForm(label) {
  return baseForm(String(label ?? "").replaceAll("-", " "));
}

// Whether a display label names the shopping key: "Roast carrots" names
// carrot, "Carrot-ginger mash" does not (it also names ginger), and neither
// does "Roast parsnips". `resolve` maps text to a key with the alias table;
// `known(key)` says whether a key is a catalogued ingredient.
export function labelNamesKey(label, key, resolve, known) {
  const form = labelForm(label);
  if (!form) return false;
  if (resolve(label) === key) return true;
  if (!` ${form} `.includes(` ${key} `)) return false;
  const rest = ` ${form} `.replace(` ${key} `, " ").trim();
  if (!rest) return true;
  const other = (text) => {
    const resolved = resolve(text);
    return Boolean(resolved) && resolved !== key && known(resolved);
  };
  if (other(rest)) return false;
  return rest.split(" ").every((word) => COOKING_WORDS.has(word) || !other(word));
}

// --- Effective lines -----------------------------------------------------------

// The swaps in force on `date`: those accepted with the slot's current
// recipe whose swapped line is still the line they replaced.
export function slotSwaps(ctx, view, date) {
  const slot = view.slots.get(date);
  const recipe = slot?.status === "accepted" ? ctx.recipes.get(slot.recipeUid) : null;
  if (!recipe) return [];
  return (view.swaps?.get(date) ?? []).filter(
    (swap) =>
      swap.recipeUid === recipe.uid &&
      (swap.sourcePosition == null || recipe.lines.some((line) => line.position === swap.sourcePosition && line.verbatim === swap.sourceVerbatim)),
  );
}

function swappedLine(line, swap) {
  const definition = UNITS[swap.unit];
  return {
    ...line,
    verbatim: swap.toLabel,
    name: swap.toLabel,
    ingredientKey: swap.toKey,
    alternatives: [swap.toKey],
    quantity: swap.quantity,
    quantityMax: null,
    unit: swap.unit,
    dimension: definition?.dimension ?? "count",
    baseQuantity: definition?.base ? swap.quantity * definition.base : null,
    package: null,
    optional: false,
    ambiguous: false,
    note: null,
    side: Boolean(line.side),
    swap: { id: swap.id, fromLabel: swap.fromLabel, toLabel: swap.toLabel },
  };
}

// The lines the dinner on `date` is cooked with: its recipe's lines with this
// slot's swaps applied, then its swapped sides. The recipe is not changed.
export function effectiveLines(ctx, view, date) {
  const slot = view.slots.get(date);
  const recipe = slot?.recipeUid ? ctx.recipes.get(slot.recipeUid) : null;
  if (!recipe) return [];
  const swaps = slotSwaps(ctx, view, date);
  if (!swaps.length) return recipe.lines;
  const byPosition = new Map(swaps.filter((swap) => swap.sourcePosition != null).map((swap) => [swap.sourcePosition, swap]));
  const lines = recipe.lines.map((line) => (byPosition.has(line.position) ? swappedLine(line, byPosition.get(line.position)) : line));
  for (const swap of swaps) {
    if (swap.sourcePosition == null) lines.push(swappedLine({ position: sideSourceId(swap.id), section: null, side: true }, swap));
  }
  return lines;
}

export function sourceIdOf(line) {
  return line.side ? line.position : lineSourceId(line.position);
}

// --- Amounts and views ---------------------------------------------------------

// Shopping bucket and amount, the same buckets as the planner's recipe lines.
export function amountOf(quantity, unit) {
  if (quantity == null) return { bucket: "unquantified", amount: null, unit: null };
  const definition = UNITS[unit ?? "each"];
  if (definition?.base) {
    return definition.dimension === "mass"
      ? { bucket: "mass", amount: quantity * definition.base, unit: "g" }
      : { bucket: "volume", amount: quantity * definition.base, unit: "ml" };
  }
  const count = unit ?? "each";
  return { bucket: count, amount: quantity, unit: count };
}

export function describeAmount(quantity, unit) {
  if (quantity == null) return "as needed";
  const label = unit && unit !== "each" ? ` ${UNITS[unit]?.label ?? unit}` : "";
  return `${trimNumber(quantity)}${label}`;
}

export function sourceView(line) {
  const quantity = line.quantityMax ?? line.quantity;
  return {
    id: sourceIdOf(line),
    kind: line.side ? "side" : "line",
    label: line.name,
    quantity: quantity ?? null,
    unit: quantity == null ? null : line.unit ?? "each",
    amount: describeAmount(quantity, line.unit),
    ingredientKey: line.ingredientKey,
    verbatim: line.verbatim,
    optional: line.optional,
    swapped: Boolean(line.swap),
  };
}

export function swapView(swap) {
  return {
    id: swap.id,
    sourceId: swap.sourcePosition == null ? sideSourceId(swap.id) : lineSourceId(swap.sourcePosition),
    kind: swap.sourcePosition == null ? "side" : "line",
    fromLabel: swap.fromLabel,
    toLabel: swap.toLabel,
    ingredientKey: swap.toKey,
    quantity: swap.quantity,
    unit: swap.unit,
    amount: describeAmount(swap.quantity, swap.unit),
    revision: swap.revision,
  };
}

export function swapSentence(swap) {
  return `${swap.toLabel} instead of ${swap.fromLabel}`;
}

// Text for sharing one dinner's swaps: this dinner only, no links.
export function shareText(date, recipeName, swaps) {
  return {
    title: `Dinner on ${date}`,
    text: [recipeName, ...swaps.map((swap) => `Swap: ${swapSentence(swap)}`)].join("\n"),
  };
}

// --- Restocks ----------------------------------------------------------------

export function restockRowId(restock) {
  return `${RESTOCK_PREFIX}${restock.ingredientKey}|${amountOf(restock.quantity, restock.unit).bucket}`;
}

export function isRestockRow(id) {
  return typeof id === "string" && id.startsWith(RESTOCK_PREFIX);
}

// Open restock contributions as shopping lines, one per ingredient and
// compatible unit bucket. Pantry stock does not cancel a restock: it was
// asked for explicitly.
export function restockItems(restocks) {
  const totals = new Map();
  for (const restock of restocks) {
    if (restock.status !== "open") continue;
    const amount = amountOf(restock.quantity, restock.unit);
    const id = restockRowId(restock);
    let total = totals.get(id);
    if (!total) {
      total = { id, ingredientKey: restock.ingredientKey, bucket: amount.bucket, quantity: amount.amount == null ? null : 0, unit: amount.unit, dates: new Set(), recipes: new Set() };
      totals.set(id, total);
    }
    if (total.quantity != null && amount.amount != null) total.quantity += amount.amount;
    total.dates.add(restock.date);
  }
  return [...totals.values()].map((total) => ({
    ...total,
    quantity: total.quantity == null ? null : Math.round(total.quantity * 1000) / 1000,
    dates: [...total.dates].sort(),
    recipes: [],
  }));
}

// Displayable restock detail for one shopping row, or null for plan rows.
export function restockInfo(restocks, item) {
  if (!isRestockRow(item.id)) return null;
  const contributions = restocks.filter((restock) => restock.status === "open" && restockRowId(restock) === item.id);
  const labels = [...new Set(contributions.map((restock) => restock.label))];
  return {
    label: `Restock: ${labels.join(", ") || item.ingredientKey}`,
    labels,
    reasons: contributions.map((restock) => ({
      date: restock.date,
      fromLabel: restock.label,
      toLabel: restock.swapLabel,
      quantity: restock.quantity,
      unit: restock.unit,
      amount: describeAmount(restock.quantity, restock.unit),
    })),
  };
}
