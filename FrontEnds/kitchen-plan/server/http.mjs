// Private Kitchen Plan HTTP API (JSON under /api). This listener never serves
// the calendar feed; that has its own listener (calendar.mjs, main.mjs).
//
// Client contract
// ---------------
// Reads (GET):
//   /api/health                      {ok, revision, schemaVersion}
//   /api/dashboard                   {revision, today, timeZone, diners, slots[], review[], shopping, undo}
//   /api/slots?from=&to=             {revision, today, slots[]}            (max 92 days)
//   /api/review?days=3               {revision, today, days[]}             (1-7 days)
//   /api/recipes                     {recipes[]}                           (selectable list)
//   /api/recipes/:uid                {recipe}                              (full detail)
//   /api/pantry                      {revision, items[], ingredients[]}
//   /api/constraints                 {revision, constraints}
//   /api/shopping                    {revision, dates[], items[], blocked[]}
//   /api/previews/:id                preview body (see POST /api/previews)
//   /api/changes?limit=20            {revision, changes[]}
// Mutations (require Content-Type: application/json, X-Kitchen-Plan: 1 and
// a same-origin Origin when the browser sends one):
//   PUT  /api/pantry/:ingredient     {status: have|need|unavailable|clear, quantity?, unit?, useSoon?, rev}
//   PUT  /api/constraints            {baseRevision, constraints: {diners?, dietaryExclusions?, excludedCategories?, workload?, shoppingDays?}}
//   PUT  /api/shopping/:id           {checked, rev}
//   POST /api/plan/accept            {accept: true, baseRevision, slots: [{date, recipeUid|null, servings?, prepMinutes?, locked?, note?}],
//                                     dependencies?: [{producerDate, consumerDate, servings, ingredientKey?, sourceKey?}],
//                                     removeDependencies?: [{producerDate, consumerDate}], constraints?, label?}
//   POST /api/previews               {baseRevision, date}                  -> 201 {previewId, options[<=3], rejected, ...}
//   POST /api/commit                 {baseRevision, previewId, optionId}
//   POST /api/undo                   {baseRevision, revision}             (revision = dashboard.undo.revision)
// Idempotency-Key ([A-Za-z0-9_-]{8,128}) is required on accept, commit and
// undo and honoured on every mutation; a retry returns the stored response
// with Idempotency-Replayed: true. Errors are {error: {code, message, details?}}.

import { createHash } from "node:crypto";
import { SCHEMA_VERSION, ServiceError, canonicalJson } from "./store.mjs";

export const MAX_BODY_BYTES = 64 * 1024;
const MAX_URL_LENGTH = 2048;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  Vary: "Origin",
};

function intParam(query, name) {
  const value = query.get(name);
  if (value == null) return undefined;
  if (!/^\d{1,4}$/.test(value)) throw new ServiceError(422, "invalid_request", `${name} must be a whole number`, { field: name });
  return Number(value);
}

function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ServiceError(400, "bad_request", "Malformed path parameter");
  }
}

function buildRoutes(service) {
  const get = (path, handler) => ({ method: "GET", path, handler });
  const mutate = (method, path, idempotency, handler) => ({ method, path, handler, mutation: true, idempotency });
  return [
    get("/api/health", () => ({ ok: true, revision: service.store.revision(), schemaVersion: SCHEMA_VERSION })),
    get("/api/dashboard", () => service.dashboard()),
    get("/api/slots", ({ query }) => service.slots(query.get("from") ?? undefined, query.get("to") ?? undefined)),
    get("/api/review", ({ query }) => service.review(intParam(query, "days"))),
    get("/api/recipes", () => service.recipes()),
    get(/^\/api\/recipes\/([^/]+)$/, ({ params }) => service.recipe(params[0])),
    get("/api/pantry", () => service.pantry()),
    mutate("PUT", /^\/api\/pantry\/([^/]+)$/, "optional", ({ params, body }) => service.setPantryItem(params[0], body)),
    get("/api/constraints", () => service.constraints()),
    mutate("PUT", "/api/constraints", "optional", ({ body }) => service.setConstraints(body)),
    get("/api/shopping", () => service.shopping()),
    mutate("PUT", /^\/api\/shopping\/([^/]+)$/, "optional", ({ params, body }) => service.setShoppingChecked(params[0], body)),
    mutate("POST", "/api/plan/accept", "required", ({ body }) => service.acceptPlan(body)),
    mutate("POST", "/api/previews", "optional", ({ body }) => service.preview(body)),
    get(/^\/api\/previews\/([^/]+)$/, ({ params }) => service.getPreview(params[0])),
    mutate("POST", "/api/commit", "required", ({ body }) => service.commit(body)),
    get("/api/changes", ({ query }) => service.changes(intParam(query, "limit"))),
    mutate("POST", "/api/undo", "required", ({ body }) => service.undo(body)),
  ];
}

function findRoute(routes, method, pathname) {
  const allowed = [];
  for (const route of routes) {
    let params = null;
    if (typeof route.path === "string") params = route.path === pathname ? [] : null;
    else {
      const match = pathname.match(route.path);
      params = match ? match.slice(1).map(decodeParam) : null;
    }
    if (!params) continue;
    if (route.method === method) return { route, params };
    allowed.push(route.method);
  }
  if (allowed.length) throw new ServiceError(405, "method_not_allowed", "Method not allowed", { allow: allowed });
  throw new ServiceError(404, "not_found", "No such endpoint");
}

function hostnameOf(hostHeader) {
  if (typeof hostHeader !== "string" || !hostHeader || hostHeader.length > 255) return null;
  const bracketed = hostHeader.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1].toLowerCase();
  const plain = hostHeader.match(/^([^:]+)(?::\d+)?$/);
  return plain ? plain[1].toLowerCase() : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      req.resume();
      reject(new ServiceError(413, "payload_too_large", `Request bodies are limited to ${MAX_BODY_BYTES} bytes`));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        reject(new ServiceError(413, "payload_too_large", `Request bodies are limited to ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      reject(new ServiceError(400, "bad_request", "The request body could not be read"));
    });
  });
}

async function readJson(req) {
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new ServiceError(415, "unsupported_media_type", "Send the body as application/json");
  const raw = await readBody(req);
  if (!raw.length) throw new ServiceError(400, "body_required", "A JSON body is required");
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ServiceError(400, "invalid_json", "The request body is not valid JSON");
  }
}

function sendJson(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

// Private app request handler. Options:
//   service         planner.mjs KitchenService
//   appOrigin       https origin of the installed app (allowed Host/Origin)
//   allowedOrigins  extra origins allowed to send mutations
//   allowedHosts    extra hostnames accepted in the Host header (DNS-rebinding guard)
//   fallback        (req, res) for non-/api paths, e.g. the frontend; default 404
//   log             (event, fields) structured logger
export function createAppHandler({ service, appOrigin = null, allowedOrigins = [], allowedHosts = [], fallback = null, log = () => {} }) {
  const routes = buildRoutes(service);
  const hosts = new Set([...LOCAL_HOSTS, ...allowedHosts.map((host) => host.toLowerCase())]);
  if (appOrigin) hosts.add(new URL(appOrigin).hostname.toLowerCase());
  const origins = new Set([...allowedOrigins, ...(appOrigin ? [appOrigin] : [])]);

  const checkSameOrigin = (req, hostname) => {
    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin" && site !== "none") {
      throw new ServiceError(403, "cross_origin", "Cross-site requests cannot change the plan");
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let parsed = null;
      try {
        parsed = new URL(origin);
      } catch {
        parsed = null;
      }
      const sameHost = parsed && parsed.host.toLowerCase() === String(req.headers.host).toLowerCase() && parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase() === hostname;
      if (!origins.has(origin) && !sameHost) throw new ServiceError(403, "cross_origin", "Cross-site requests cannot change the plan");
    }
    if (req.headers["x-kitchen-plan"] !== "1") {
      throw new ServiceError(403, "missing_request_header", "Mutations must send the X-Kitchen-Plan: 1 header");
    }
  };

  return async function handleApp(req, res) {
    const started = Date.now();
    // Only matched /api paths are logged, so a feed URL sent to the wrong
    // listener never reaches the log.
    let logPath = "(unmatched)";
    let status = 500;
    try {
      if (typeof req.url !== "string" || req.url.length > MAX_URL_LENGTH) {
        throw new ServiceError(414, "uri_too_long", "Request URL too long");
      }
      const hostname = hostnameOf(req.headers.host);
      if (!hostname || !hosts.has(hostname)) throw new ServiceError(403, "host_not_allowed", "Unknown host");
      const url = new URL(req.url, "http://kitchen-plan.invalid");
      const pathname = url.pathname;
      if (!pathname.startsWith("/api/")) {
        if (fallback) {
          status = 0;
          return await fallback(req, res);
        }
        throw new ServiceError(404, "not_found", "No such endpoint");
      }
      const { route, params } = findRoute(routes, req.method, pathname);
      logPath = pathname;
      let body;
      if (route.mutation) {
        checkSameOrigin(req, hostname);
        body = await readJson(req);
      }
      service.refresh();
      if (!route.mutation) {
        const result = route.handler({ params, query: url.searchParams });
        status = 200;
        return sendJson(res, status, result);
      }
      const key = req.headers["idempotency-key"];
      if (key !== undefined && !IDEMPOTENCY_KEY.test(key)) {
        throw new ServiceError(400, "invalid_idempotency_key", "Idempotency-Key must be 8-128 letters, digits, - or _");
      }
      if (route.idempotency === "required" && key === undefined) {
        throw new ServiceError(428, "idempotency_key_required", "This request needs an Idempotency-Key header");
      }
      const fingerprint = createHash("sha256").update(canonicalJson({ method: req.method, path: pathname, body })).digest("hex");
      const result = service.runIdempotent(key ?? null, fingerprint, () => route.handler({ params, body, query: url.searchParams }));
      status = result.status;
      return sendJson(res, status, result.body, result.replayed ? { "Idempotency-Replayed": "true" } : {});
    } catch (error) {
      status = sendError(res, error, log);
      return undefined;
    } finally {
      if (status) log("request", { method: req.method, path: logPath, status, ms: Date.now() - started });
    }
  };
}

function sendError(res, error, log) {
  let status = 500;
  let payload = { code: "internal_error", message: "Something went wrong" };
  const headers = {};
  if (error instanceof ServiceError) {
    status = error.status;
    payload = { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
    if (status === 405 && error.details?.allow) headers.Allow = error.details.allow.join(", ");
    if (status === 413) headers.Connection = "close";
  } else if (/SQLITE_BUSY|database is locked/i.test(String(error?.message))) {
    status = 503;
    payload = { code: "busy", message: "The kitchen database is busy; retry shortly" };
    headers["Retry-After"] = "1";
  } else {
    log("error", { message: error?.message, stack: error?.stack });
  }
  if (res.headersSent) {
    res.destroy();
    return status;
  }
  sendJson(res, status, { error: payload }, headers);
  return status;
}
