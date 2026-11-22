// Private dashboard and PWA shell, mounted as the app listener's fallback
// for every non-/api request (see main.mjs).
//
//   GET  /, /recipes/<uid>          the app shell (no plan data; the client reads /api)
//   GET  /app.js, /app.css           client script and stylesheet
//   GET  /sw.js                      service worker (shell assets only)
//   GET  /manifest.webmanifest, /favicon.svg
//   POST /owner/subscription         reveals the calendar subscription URL on an
//                                    explicit owner request; never cached
//
// Everything else is a 404. Request paths are never logged here, so a feed URL
// sent to the private listener by mistake does not reach the log.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECIPE_PATH = /^\/recipes\/[A-Za-z0-9-]{1,64}$/;

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

const SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Kitchen Plan</title>
<meta name="description" content="The household's private 14-day dinner plan.">
<meta name="theme-color" content="#f5f1e7">
<meta name="referrer" content="no-referrer">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kitchen Plan">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<main class="app-shell">
<header class="topbar">
<div><div class="eyebrow">Household dinner plan</div><h1><a href="/" class="home-link">Kitchen Plan</a></h1></div>
<div class="header-actions" id="status" aria-live="polite"></div>
</header>
<nav class="app-nav" id="nav" aria-label="Kitchen Plan sections"></nav>
<div id="banners"></div>
<section class="workspace" id="view" aria-live="polite"><p class="loading">Loading the plan…</p></section>
<noscript><p class="notice">Kitchen Plan needs JavaScript to read the plan from the kitchen server.</p></noscript>
</main>
<script type="module" src="/app.js"></script>
</body>
</html>
`;

export const MANIFEST = {
  name: "Kitchen Plan",
  short_name: "Kitchen Plan",
  description: "The household's private 14-day dinner plan, ingredient review and shopping list.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f5f1e7",
  theme_color: "#29452f",
  orientation: "any",
  icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
};

function asset(path, type) {
  return { body: readFileSync(join(ROOT, path)), type };
}

function send(req, res, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { ...BASE_HEADERS, "Content-Length": buffer.length, ...headers });
  res.end(req.method === "HEAD" ? undefined : buffer);
}

// Same checks the API applies to mutations: a browser must call from this
// origin and send the custom header, which a cross-site form cannot.
function sameOriginRequest(req) {
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host = null;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    if (host !== String(req.headers.host ?? "").toLowerCase()) return false;
  }
  return req.headers["x-kitchen-plan"] === "1";
}

// subscriptionUrl: full public feed URL including the token, or null when
// the feed is disabled. It is only ever written into a no-store response.
export function createUiHandler({ subscriptionUrl = null, log = () => {} } = {}) {
  const assets = {
    "/app.js": asset("public/app.js", "text/javascript; charset=utf-8"),
    // The Next.js stylesheet doubles as the plain UI's stylesheet.
    "/app.css": asset("app/globals.css", "text/css; charset=utf-8"),
    "/sw.js": asset("public/sw.js", "text/javascript; charset=utf-8"),
    "/favicon.svg": asset("public/favicon.svg", "image/svg+xml"),
    "/manifest.webmanifest": { body: Buffer.from(JSON.stringify(MANIFEST)), type: "application/manifest+json" },
  };
  const shell = Buffer.from(SHELL);

  return function handleUi(req, res) {
    const pathname = new URL(req.url, "http://kitchen-plan.invalid").pathname;
    if (pathname === "/owner/subscription") {
      if (req.method !== "POST") return send(req, res, 405, "Method not allowed\n", { Allow: "POST", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      req.resume();
      if (!sameOriginRequest(req)) {
        return send(req, res, 403, JSON.stringify({ error: { code: "cross_origin", message: "Open the subscription URL from the Kitchen Plan app" } }), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      }
      log("subscription_url_shown", { enabled: Boolean(subscriptionUrl) });
      const body = subscriptionUrl
        ? { url: subscriptionUrl }
        : { url: null, reason: "The calendar feed is off. Set the feed token and KITCHEN_FEED_PUBLIC_ORIGIN, then restart the service." };
      return send(req, res, 200, JSON.stringify(body), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", Pragma: "no-cache" });
    }

    const isShell = pathname === "/" || RECIPE_PATH.test(pathname);
    const file = assets[pathname];
    if (!isShell && !file) {
      return send(req, res, 404, "Not found\n", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(req, res, 405, "Method not allowed\n", { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    }
    if (isShell) return send(req, res, 200, shell, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    return send(req, res, 200, file.body, { "Content-Type": file.type, "Cache-Control": "no-cache" });
  };
}
