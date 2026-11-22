// Read-only ICS feed of accepted dinners.
//
// The feed is served by its own listener (see main.mjs) on exactly one route,
// `/feed/<token>.ics`, where <token> is a configured opaque random secret of
// at least 256 bits. Without a valid configured token every request is a 404
// (fail closed). Request URLs are never logged. Only accepted slots are
// serialized; empty slots and historical fixtures never become events.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addDays } from "./store.mjs";

const FEED_PATH = /^\/feed\/([A-Za-z0-9_-]{43,256})\.ics$/;

export function generateFeedToken() {
  return randomBytes(32).toString("base64url");
}

// Accepts base64url of at least 32 bytes (43+ chars) or hex of at least 32
// bytes (64+ chars). Returns the SHA-256 digest used for comparison, or null.
export function feedTokenDigest(token) {
  if (typeof token !== "string") return null;
  const value = token.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 256) return null;
  const hexOnly = /^[0-9a-fA-F]+$/.test(value);
  if (value.length < (hexOnly ? 64 : 43)) return null;
  if (new Set(value).size < 12) return null;
  return createHash("sha256").update(value).digest();
}

export function normalizeAppOrigin(value) {
  if (value == null || value === "") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("KITCHEN_APP_ORIGIN must be an absolute https:// origin");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("KITCHEN_APP_ORIGIN must be an https:// origin without path, query or credentials");
  }
  return url.origin;
}

// RFC 5545 §3.3.11 TEXT escaping. Control characters other than newline are
// dropped; any newline form becomes the literal \n escape.
export function escapeText(value) {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space,
// never inside a UTF-8 sequence or surrogate pair.
export function foldLine(line) {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += character;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const icsDate = (date) => date.replaceAll("-", "");
const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function mealPlanId(date) {
  return `kp-${icsDate(date)}`;
}

export function recipeUrl(appOrigin, recipeUid) {
  return appOrigin ? `${appOrigin}/recipes/${encodeURIComponent(recipeUid)}` : null;
}

// entries: [{slot, recipe}] for accepted slots. UID is the slot's stable
// UUID; SEQUENCE is the slot's own counter, which every commit and undo that
// changes the slot advances; DTSTAMP is the slot's last change in UTC.
export function renderCalendar(entries, { appOrigin = null, name = "Kitchen Plan" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kitchen Plan//Dinner Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const sorted = [...entries].sort((a, b) => (a.slot.date < b.slot.date ? -1 : a.slot.date > b.slot.date ? 1 : 0));
  for (const { slot, recipe } of sorted) {
    if (slot.status !== "accepted" || !recipe) continue;
    const mpid = mealPlanId(slot.date);
    const url = recipeUrl(appOrigin, recipe.uid);
    const prep = slot.prepMinutes ?? recipe.prepMinutes;
    const description = [
      `Dinner for ${slot.servings}`,
      prep != null ? `Prep ${prep} min` : null,
      recipe.totalMinutes != null ? `Total ${recipe.totalMinutes} min` : null,
      url ? `Recipe: ${url}` : null,
      `MPID:${mpid}`,
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${slot.uid}`,
      `DTSTAMP:${icsStamp(slot.updatedAt)}`,
      `LAST-MODIFIED:${icsStamp(slot.updatedAt)}`,
      `SEQUENCE:${slot.sequence}`,
      `DTSTART;VALUE=DATE:${icsDate(slot.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(slot.date, 1))}`,
      `SUMMARY:${escapeText(recipe.name)}`,
      `DESCRIPTION:${escapeText(description.join("\n"))}`,
      ...(url ? [`URL;VALUE=URI:${url}`] : []),
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      `X-KITCHEN-PLAN-MPID:${mpid}`,
      `X-KITCHEN-PLAN-SERVINGS:${slot.servings}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function sendPlain(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

// Node request handler for the public feed listener. `service` supplies
// calendarEntries(); `log(event, fields)` never receives the request URL.
export function createFeedHandler({ service, token, appOrigin = null, log = () => {} }) {
  const expected = feedTokenDigest(token);
  return function handleFeed(req, res) {
    const finish = (status) => log("feed_request", { method: req.method, status });
    try {
      const url = typeof req.url === "string" && req.url.length <= 512 ? req.url : "";
      const match = expected ? url.split("?")[0].match(FEED_PATH) : null;
      const presented = match ? createHash("sha256").update(match[1]).digest() : null;
      if (!presented || !timingSafeEqual(presented, expected)) {
        sendPlain(res, 404, "Not found\n");
        return finish(404);
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendPlain(res, 405, "Method not allowed\n", { Allow: "GET, HEAD" });
        return finish(405);
      }
      const body = renderCalendar(service.calendarEntries(), { appOrigin });
      const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 32)}"`;
      const headers = {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="kitchen-plan.ics"',
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers);
        res.end();
        return finish(304);
      }
      res.writeHead(200, { ...headers, "Content-Length": Buffer.byteLength(body) });
      res.end(req.method === "HEAD" ? undefined : body);
      return finish(200);
    } catch (error) {
      log("feed_error", { message: error.message });
      if (!res.headersSent) sendPlain(res, 500, "Feed unavailable\n");
      else res.destroy();
      return finish(500);
    }
  };
}
