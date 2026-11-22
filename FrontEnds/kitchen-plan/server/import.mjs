// Paprika archive import.
//
// The bundled `data/kitchen-recipes.paprikarecipes` is a zip (entries stored,
// method 0) of `<UID>.paprikarecipe` entries, each one plain JSON. Paprika's
// own exports gzip every entry and usually deflate the zip, so both layers are
// detected rather than assumed. Import is idempotent: recipes are keyed by the
// Paprika `uid` and only rewritten when their retained content changes. It
// never touches dinner slots; historical dinners are not imported.

import { createHash } from "node:crypto";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { canonicalJson } from "./store.mjs";

const PARSER_VERSION = 1;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

// --- Zip reading -------------------------------------------------------------

export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("readZipEntries expects a Buffer");
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("Archive is larger than the import limit");
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive: end of central directory not found");
  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error("Zip64 archives are not supported");
  if (count > MAX_ENTRIES) throw new Error(`Archive has more than ${MAX_ENTRIES} entries`);
  if (directoryOffset + directorySize > eocd) throw new Error("Corrupt zip: central directory out of bounds");

  const entries = [];
  let pointer = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error("Corrupt zip: bad central directory entry");
    }
    const flags = buffer.readUInt16LE(pointer + 8);
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    pointer += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x1) throw new Error(`Encrypted zip entry ${name} is not supported`);
    if (size > MAX_ENTRY_BYTES) throw new Error(`Zip entry ${name} is larger than the import limit`);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Corrupt zip: bad local header for ${name}`);
    }
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) throw new Error(`Corrupt zip: ${name} is truncated`);
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
    else throw new Error(`Zip entry ${name} uses unsupported compression method ${method}`);
    if (data.length !== size) throw new Error(`Corrupt zip: ${name} size mismatch`);
    entries.push({ name, data });
  }
  return entries;
}

function decodeRecipeEntry(data) {
  const bytes = data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data, { maxOutputLength: MAX_ENTRY_BYTES }) : data;
  return JSON.parse(bytes.toString("utf8"));
}

// --- Units -------------------------------------------------------------------

// Mass and volume convert inside their dimension (base: grams, millilitres).
// Every other unit is a count bucket of its own and never merges with another.
// "Ounce" is always weight; fluid ounces must say so.
export const UNITS = {
  g: { dimension: "mass", base: 1, label: "g" },
  kg: { dimension: "mass", base: 1000, label: "kg" },
  oz: { dimension: "mass", base: 28.349523125, label: "oz" },
  lb: { dimension: "mass", base: 453.59237, label: "lb" },
  ml: { dimension: "volume", base: 1, label: "ml" },
  l: { dimension: "volume", base: 1000, label: "l" },
  tsp: { dimension: "volume", base: 4.92892159375, label: "tsp" },
  tbsp: { dimension: "volume", base: 14.78676478125, label: "tbsp" },
  floz: { dimension: "volume", base: 29.5735295625, label: "fl oz" },
  cup: { dimension: "volume", base: 236.5882365, label: "cup" },
  pint: { dimension: "volume", base: 473.176473, label: "pint" },
  quart: { dimension: "volume", base: 946.352946, label: "quart" },
  each: { dimension: "count", label: "" },
  can: { dimension: "count", label: "can" },
  jar: { dimension: "count", label: "jar" },
  package: { dimension: "count", label: "package" },
  bag: { dimension: "count", label: "bag" },
  box: { dimension: "count", label: "box" },
  clove: { dimension: "count", label: "clove" },
  slice: { dimension: "count", label: "slice" },
  rib: { dimension: "count", label: "rib" },
  stalk: { dimension: "count", label: "stalk" },
  head: { dimension: "count", label: "head" },
  bunch: { dimension: "count", label: "bunch" },
  sprig: { dimension: "count", label: "sprig" },
  pinch: { dimension: "count", label: "pinch", ambiguous: true },
  dash: { dimension: "count", label: "dash", ambiguous: true },
  handful: { dimension: "count", label: "handful", ambiguous: true },
  splash: { dimension: "count", label: "splash", ambiguous: true },
};

const UNIT_WORDS = new Map(
  Object.entries({
    g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg",
    oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
    l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
    tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    cup: "cup", cups: "cup", pint: "pint", pints: "pint", quart: "quart", quarts: "quart",
    can: "can", cans: "can", jar: "jar", jars: "jar", package: "package", packages: "package",
    bag: "bag", bags: "bag", box: "box", boxes: "box", clove: "clove", cloves: "clove",
    slice: "slice", slices: "slice", rib: "rib", ribs: "rib", stalk: "stalk", stalks: "stalk",
    head: "head", heads: "head", bunch: "bunch", bunches: "bunch", sprig: "sprig", sprigs: "sprig",
    pinch: "pinch", pinches: "pinch", dash: "dash", dashes: "dash", handful: "handful", handfuls: "handful",
    splash: "splash",
  }),
);

// Count units that Paprika lines often put after the ingredient name
// ("3 garlic cloves", "1 celery rib").
const TRAILING_COUNT_UNITS = new Set(["clove", "rib", "stalk", "slice", "head", "sprig"]);

export function normalizeUnit(word) {
  if (typeof word !== "string") return null;
  const lower = word.trim().toLowerCase().replace(/\.$/, "");
  if (lower === "fl oz" || lower === "fluid ounce" || lower === "fluid ounces") return "floz";
  return UNIT_WORDS.get(lower) ?? (UNITS[lower] ? lower : null);
}

export function toBase(quantity, unit) {
  const definition = UNITS[unit];
  if (quantity == null || !definition?.base) return null;
  return quantity * definition.base;
}

// --- Quantities --------------------------------------------------------------

const UNICODE_FRACTIONS = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[½⅓⅔¼¾⅛⅜⅝⅞]|[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)`;
const QUANTITY_PATTERN = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:to|-|–|—)\s*(${NUMBER}))?(?=\s|$|[a-z])`, "i");

export function parseNumber(text) {
  const value = text.trim();
  let match = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (match) return Number(match[3]) === 0 ? null : Number(match[1]) + Number(match[2]) / Number(match[3]);
  match = value.match(/^(\d+)\/(\d+)$/);
  if (match) return Number(match[2]) === 0 ? null : Number(match[1]) / Number(match[2]);
  match = value.match(/^(\d+(?:\.\d+)?)?\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/);
  if (match) return Number(match[1] ?? 0) + UNICODE_FRACTIONS[match[2]];
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

export function parseQuantityPrefix(text) {
  const match = text.match(QUANTITY_PATTERN);
  if (!match) return null;
  const quantity = parseNumber(match[1]);
  const quantityMax = match[2] ? parseNumber(match[2]) : null;
  if (quantity == null || (match[2] && quantityMax == null)) return null;
  return {
    quantity,
    quantityMax: quantityMax != null && quantityMax > quantity ? quantityMax : null,
    rest: text.slice(match[0].length).trim(),
  };
}

// "10 min", "4 hr 30 min", "About 1 hr 15 min" -> minutes; null if unknown.
export function parseDuration(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  if (!hours && !minutes) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

// "4", "8 servings", "6 to 8 servings", "2 generously" -> {min, max}.
export function parseServings(...texts) {
  for (const text of texts) {
    if (typeof text !== "string") continue;
    const match = text.match(/(\d+)(?:\s*(?:to|-|–)\s*(\d+))?/);
    if (match) {
      const min = Number(match[1]);
      const max = match[2] ? Math.max(min, Number(match[2])) : min;
      if (min > 0) return { min, max };
    }
  }
  return { min: null, max: null };
}

// --- Ingredient names --------------------------------------------------------

const DESCRIPTORS = new Set([
  "small", "medium", "large", "very", "extra", "whole", "fresh", "frozen", "dry", "dried", "cold", "hot", "warm",
  "chopped", "diced", "minced", "sliced", "shredded", "grated", "finely", "thinly", "thickly", "roughly", "coarsely",
  "rinsed", "drained", "beaten", "smashed", "crushed", "reserved", "boneless", "skinless", "plain", "good",
  "quality", "ripe", "packed", "heaping", "level", "halved", "quartered", "peeled", "trimmed", "softened",
  "melted", "room", "temperature", "freshly", "lightly", "plenty", "some", "other", "of", "a", "an", "the",
]);

// Words that, before "or", modify the noun after it: "corn or flour tortillas".
const MODIFIERS = new Set([
  "corn", "flour", "yellow", "russet", "red", "black", "green", "brown", "white", "chicken", "vegetable", "beef",
  "pork", "crushed", "diced", "whole", "sweet", "dry", "fresh", "frozen", "canned", "ground", "smoked", "kidney",
  "pinto", "cannellini",
]);

const PREP_PHRASE = /^(?:and\s+)?(?:diced|minced|sliced|chopped|shredded|grated|smashed|drained|rinsed|beaten|peeled|halved|quartered|trimmed|softened|melted|cut\b|finely|thinly|thickly|roughly|coarsely|optional|plus\b|to taste|as needed|for serving|for garnish|if desired|divided|at room|cooled|cubed|torn|crumbled|zested|juiced|sliced or chopped)/i;

// Inside an "a, b, or c" list only these segments are notes; "chopped chicken
// thighs" there is an alternative, not preparation.
const OR_LIST_NOTE = /^(?:cut\b|optional|plus\b|to taste|as needed|for\b|if\b|divided|at room)/i;

const SINGULAR_EXCEPTIONS = new Map(
  Object.entries({
    tomatoes: "tomato", potatoes: "potato", leaves: "leaf", loaves: "loaf", knives: "knife", halves: "half",
    berries: "berry", cherries: "cherry", anchovies: "anchovy", chilies: "chili", chillies: "chilli",
    molasses: "molasses", hummus: "hummus", couscous: "couscous", asparagus: "asparagus", swiss: "swiss",
    lentils: "lentil", peas: "pea", noodles: "noodle", oats: "oat", greens: "greens", grass: "grass",
    flakes: "flakes", chives: "chives", sausages: "sausage",
  }),
);

function singular(word) {
  if (SINGULAR_EXCEPTIONS.has(word)) return SINGULAR_EXCEPTIONS.get(word);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

// Seeded aliases: normalized surface form -> canonical ingredient key. Every
// other name maps to itself. Deterministic and conservative: only forms that
// are the same purchase are merged.
export const SEED_ALIASES = Object.freeze({
  "garlic clove": "garlic",
  "clove garlic": "garlic",
  "celery rib": "celery",
  "celery stalk": "celery",
  "chicken thigh": "chicken",
  "chicken breast": "chicken",
  "pork chop": "pork",
  "pork loin piece": "pork",
  "pork loin": "pork",
  "pork shoulder": "pork",
  "lime juice": "lime",
  "lemon juice": "lemon",
  "lemon zest": "lemon",
  "lime zest": "lime",
  "egg yolk": "egg",
  "pepper": "black pepper",
  "salt and pepper": "salt",
  "pasta water": "water",
  "yellow potato": "potato",
  "russet potato": "potato",
  "salmon fillet": "salmon",
  "can salmon": "salmon",
  "cheddar cheese": "cheddar",
  "parmesan cheese": "parmesan",
  "feta cheese": "feta",
  "cilantro leaf": "cilantro",
  "jalapeno pepper": "jalapeno",
  "neutral oil": "neutral oil",
  "vegetable oil": "neutral oil",
  "canola oil": "neutral oil",
  "crushed tomato": "tomato",
  "diced tomato": "tomato",
  "country bread": "bread",
  "sourdough": "bread",
  "sourdough bread": "bread",
  "kielbasa sausage": "kielbasa",
  "andouille sausage": "andouille",
});

// Assumed on hand unless the pantry says otherwise.
export const STAPLES = Object.freeze(["salt", "black pepper", "water", "olive oil", "neutral oil"]);

function baseForm(name) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(" ")
    .filter((word) => word && !DESCRIPTORS.has(word) && !/^\d/.test(word) && !/^\d+-(?:ounce|oz|inch|pound)$/.test(word));
  return words.map(singular).join(" ");
}

export function normalizeIngredientName(name, aliases = SEED_ALIASES) {
  if (typeof name !== "string") return "";
  const form = baseForm(name);
  return aliases[form] ?? form;
}

// Splits "corn or flour tortillas" into ["corn tortillas", "flour tortillas"],
// "cooked lentils/beans" into ["cooked lentils", "cooked beans"].
function expandAlternatives(name) {
  const slash = name.match(/^(.*?)(\b[\w-]+)\/([\w-]+)$/);
  if (slash) return [`${slash[1]}${slash[2]}`.trim(), `${slash[1]}${slash[3]}`.trim()];
  const parts = name.split(/\s+or\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [name];
  const last = parts.at(-1);
  const lastWords = last.split(/\s+/);
  const allModifiers = parts.slice(0, -1).every((part) => {
    const form = baseForm(part);
    return form && !form.includes(" ") && MODIFIERS.has(form);
  });
  if (allModifiers && lastWords.length >= 2) {
    const noun = lastWords.slice(1).join(" ");
    return [...parts.slice(0, -1).map((part) => `${part} ${noun}`), last];
  }
  return parts;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripLeadingAmount(text) {
  let rest = text.replace(/^(?:about|approximately|roughly|up to)\s+/i, "");
  const quantity = parseQuantityPrefix(rest);
  if (quantity) rest = quantity.rest;
  const words = rest.split(/\s+/);
  if (normalizeUnit(`${words[0]} ${words[1] ?? ""}`) === "floz") rest = words.slice(2).join(" ");
  else if (normalizeUnit(words[0])) rest = words.slice(1).join(" ");
  return rest.replace(/^of\s+/i, "").trim();
}

function keysFor(names) {
  const keys = [];
  for (const name of names) {
    const key = normalizeIngredientName(name.replace(/\s+for (?:serving|garnish)$/i, ""));
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

// Parses one Paprika ingredient line into zero or more structured lines.
// Unquantified "and" lists ("Parmesan, salt, and pepper") become one line per
// item; "or" lists stay one line with alternatives. Anything uncertain keeps
// quantity null and ambiguous true rather than guessing.
export function parseIngredientLine(text, section = null) {
  const verbatim = text.trim();
  if (!verbatim) return [];
  const optional = /\boptional\b|\bfor serving\b|\bif desired\b|\bfor garnish\b/i.test(verbatim);
  let rest = verbatim;
  let approximate = false;
  let quantity = null;
  let quantityMax = null;
  let unit = null;
  let packageSize = null;
  let note = null;

  const juice = rest.match(/^(juice|zest)\s+of\s+(.+)$/i);
  if (juice) {
    rest = juice[2];
    note = juice[1].toLowerCase();
  }
  const approximation = rest.match(/^(about|approximately|roughly|up to|plenty of)\s+/i);
  if (approximation) {
    approximate = true;
    rest = rest.slice(approximation[0].length);
  }
  const pinch = rest.match(/^(?:a\s+)?(pinch|dash|handful|splash)\s+of\s+/i);
  if (pinch) {
    quantity = 1;
    unit = normalizeUnit(pinch[1]);
    rest = rest.slice(pinch[0].length);
  } else {
    const parsed = parseQuantityPrefix(rest);
    if (parsed) {
      ({ quantity, quantityMax } = parsed);
      rest = parsed.rest;
    }
  }

  if (quantity != null && !unit) {
    const packaged = rest.match(/^(\d+(?:\.\d+)?)[- ](ounce|oz|pound|lb|gram|g|ml|liter|litre)s?\s+(cans?|jars?|packages?|bags?|boxes?)\b\s*/i);
    if (packaged) {
      packageSize = `${packaged[1]} ${UNITS[normalizeUnit(packaged[2])].label}`;
      unit = normalizeUnit(packaged[3]);
      rest = rest.slice(packaged[0].length);
    } else {
      const words = rest.split(/\s+/);
      const twoWord = normalizeUnit(`${words[0]} ${words[1] ?? ""}`);
      if (twoWord === "floz") {
        unit = twoWord;
        rest = words.slice(2).join(" ");
      } else if (normalizeUnit(words[0])) {
        unit = normalizeUnit(words[0]);
        rest = words.slice(1).join(" ");
      }
    }
    rest = rest.replace(/^of\s+/i, "");
  }

  const segments = splitTopLevel(rest);
  let primary = segments[0] ?? "";
  const plus = primary.match(/^(.*?)\s+plus\s+(.+)$/i);
  if (plus) {
    primary = plus[1];
    note = [note, `plus ${plus[2]}`].filter(Boolean).join("; ");
  }
  const tail = segments.slice(1);
  const example = primary.match(/^(.*?)\s+such as\s+(.+)$/i);
  if (example) {
    primary = example[1];
    tail.unshift(example[2]);
  }
  const orList = tail.some((segment) => /^or\s+/i.test(segment));
  const alternatives = [];
  const notes = [];
  for (const segment of tail) {
    if (/^or\s+/i.test(segment)) {
      const alternative = stripLeadingAmount(segment.replace(/^or\s+/i, ""))
        .replace(/^an?\s+equivalent\s+amount\s+of\s+/i, "");
      if (alternative && baseForm(alternative)) alternatives.push(alternative);
    } else if (orList && !OR_LIST_NOTE.test(segment) && baseForm(segment)) {
      alternatives.push(stripLeadingAmount(segment));
    } else if (PREP_PHRASE.test(segment)) {
      notes.push(segment);
    } else {
      notes.push(segment);
    }
  }
  if (note) notes.unshift(note);
  const noteText = notes.length ? notes.join(", ") : null;

  // Unquantified "and" list: one line per item.
  if (quantity == null && !orList) {
    const items = [primary, ...tail.filter((segment) => !PREP_PHRASE.test(segment))]
      .flatMap((item) => item.split(/\s+and\s+/i))
      .map((item) => item.replace(/^and\s+/i, "").replace(/\s+for serving$/i, "").trim())
      .filter((item) => baseForm(item));
    if (items.length > 1) {
      const prepNotes = tail.filter((segment) => PREP_PHRASE.test(segment));
      const itemNote = prepNotes.length ? prepNotes.join(", ") : null;
      return items.map((item) => buildLine({ verbatim, section, name: item, names: expandAlternatives(item), optional, note: itemNote }));
    }
  }

  const names = [...expandAlternatives(primary.replace(/\s+for serving$/i, "")), ...alternatives.flatMap(expandAlternatives)];
  if (!unit && quantity != null) {
    const last = singular(baseForm(primary).split(" ").at(-1) ?? "");
    unit = TRAILING_COUNT_UNITS.has(last) ? last : "each";
  }
  return [
    buildLine({ verbatim, section, name: primary, names, quantity, quantityMax, unit, packageSize, optional, approximate, note: noteText }),
  ];
}

function buildLine({ verbatim, section, name, names, quantity = null, quantityMax = null, unit = null, packageSize = null, optional, approximate = false, note }) {
  const alternatives = keysFor(names);
  const ingredientKey = alternatives[0] ?? (baseForm(verbatim) || "unknown");
  if (!alternatives.length) alternatives.push(ingredientKey);
  const definition = unit ? UNITS[unit] : null;
  const dimension = quantity == null ? null : definition?.dimension ?? "count";
  const upper = quantityMax ?? quantity;
  return {
    section,
    verbatim,
    name: name.trim(),
    ingredientKey,
    alternatives,
    quantity,
    quantityMax,
    unit: quantity == null ? null : unit,
    dimension,
    // Shopping buys the top of a range; only mass and volume have a base.
    baseQuantity: definition?.base && upper != null ? upper * definition.base : null,
    package: packageSize,
    optional,
    ambiguous: quantity == null || approximate || quantityMax != null || Boolean(definition?.ambiguous),
    note,
  };
}

export function parseIngredients(text) {
  const lines = [];
  let section = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const value = raw.trim();
    if (!value || /^ingredients:?$/i.test(value)) continue;
    if (value.endsWith(":") && !/\d/.test(value)) {
      section = value.slice(0, -1).trim();
      continue;
    }
    for (const line of parseIngredientLine(value, section)) lines.push({ ...line, position: lines.length });
  }
  return lines;
}

// --- Recipes -----------------------------------------------------------------

const text = (value, limit = 20_000) => (typeof value === "string" ? value.slice(0, limit) : "");

export function parseRecipe(source) {
  if (!source || typeof source !== "object") throw new Error("Recipe entry is not an object");
  const uid = typeof source.uid === "string" ? source.uid.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uid)) {
    throw new Error("Recipe entry has no valid Paprika uid");
  }
  const name = text(source.name, 300).trim();
  if (!name) throw new Error(`Recipe ${uid} has no name`);
  const servings = parseServings(source.servings, source.description);
  const prepMinutes = parseDuration(source.prep_time);
  const cookMinutes = parseDuration(source.cook_time);
  const totalMinutes = parseDuration(source.total_time) ?? (prepMinutes != null || cookMinutes != null ? (prepMinutes ?? 0) + (cookMinutes ?? 0) : null);
  const recipe = {
    uid,
    name,
    description: text(source.description, 2000),
    ingredientsText: text(source.ingredients),
    directions: text(source.directions),
    notes: text(source.notes),
    servingsText: text(source.servings, 200),
    servingsMin: servings.min,
    servingsMax: servings.max,
    prepText: text(source.prep_time, 100),
    cookText: text(source.cook_time, 100),
    totalText: text(source.total_time, 100),
    prepMinutes,
    cookMinutes,
    totalMinutes,
    categories: Array.isArray(source.categories)
      ? [...new Set(source.categories.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 80)))]
      : [],
    source: text(source.source, 300),
    sourceUrl: text(source.source_url, 2000),
  };
  recipe.lines = parseIngredients(recipe.ingredientsText);
  recipe.sourceHash = createHash("sha256")
    .update(canonicalJson({ parser: PARSER_VERSION, ...recipe, lines: undefined }))
    .digest("hex");
  return recipe;
}

export function parsePaprikaArchive(buffer) {
  const recipes = [];
  const skipped = [];
  for (const entry of readZipEntries(buffer)) {
    if (entry.name.endsWith("/")) continue;
    if (!entry.name.toLowerCase().endsWith(".paprikarecipe")) {
      skipped.push({ entry: entry.name, reason: "not a .paprikarecipe entry" });
      continue;
    }
    try {
      recipes.push(parseRecipe(decodeRecipeEntry(entry.data)));
    } catch (error) {
      skipped.push({ entry: entry.name, reason: error.message });
    }
  }
  recipes.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  const seen = new Set();
  return {
    recipes: recipes.filter((recipe) => {
      if (seen.has(recipe.uid)) {
        skipped.push({ entry: recipe.uid, reason: "duplicate uid" });
        return false;
      }
      seen.add(recipe.uid);
      return true;
    }),
    skipped,
  };
}

export function seedIngredientCatalog(store) {
  store.tx(() => {
    for (const key of STAPLES) {
      store.ensureIngredient(key, key, true);
      store.setIngredientStaple(key, true);
    }
    for (const [alias, key] of Object.entries(SEED_ALIASES)) store.setAlias(alias, key);
  });
}

// Upserts every recipe whose retained content changed. Returns counts and the
// uids written; the caller records a revision when anything changed.
export function importPaprikaArchive(store, buffer) {
  const { recipes, skipped } = parsePaprikaArchive(buffer);
  return store.tx(() => {
    seedIngredientCatalog(store);
    const result = { added: 0, updated: 0, unchanged: 0, skipped, changed: [] };
    for (const recipe of recipes) {
      const existing = store.recipeHash(recipe.uid);
      if (existing === recipe.sourceHash) {
        result.unchanged += 1;
        continue;
      }
      store.upsertRecipe(recipe);
      for (const line of recipe.lines) {
        for (const name of [line.name]) {
          const form = baseForm(name);
          if (form) store.setAlias(form, normalizeIngredientName(name));
        }
      }
      result[existing ? "updated" : "added"] += 1;
      result.changed.push(recipe.uid);
    }
    return result;
  });
}

// Resolves free text from a client ("Cherry Tomatoes", "garlic cloves") to an
// ingredient key using the same normalizer and the stored alias table.
export function resolveIngredientKey(store, name) {
  const form = baseForm(String(name ?? ""));
  if (!form) return "";
  return store.aliasFor(form) ?? normalizeIngredientName(name);
}
