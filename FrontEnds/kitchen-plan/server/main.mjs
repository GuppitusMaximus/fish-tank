// Kitchen Plan service entry point.
//
//   node server/main.mjs
//
// Two listeners: the private app API (default 127.0.0.1:3100) and the public
// calendar feed (default 127.0.0.1:3101), which only starts when a valid
// feed token is configured. First boot imports the bundled recipe library
// and creates 14 empty dinner dates from Eastern today for two adults;
// nothing is accepted until the owner accepts it through the API.
//
// Environment:
//   KITCHEN_DB_PATH          SQLite file (default <project>/var/kitchen-plan.sqlite)
//   KITCHEN_RECIPE_ARCHIVE   Paprika archive to import (default data/kitchen-recipes.paprikarecipes)
//   KITCHEN_HOST / KITCHEN_PORT            private app listener
//   KITCHEN_FEED_HOST / KITCHEN_FEED_PORT  public feed listener
//   KITCHEN_FEED_TOKEN_FILE  file holding the feed token (preferred), or
//   KITCHEN_FEED_TOKEN       the token itself; >= 256 bits, e.g. generateFeedToken()
//   KITCHEN_APP_ORIGIN       https origin of the private app (recipe URLs, Host/Origin allowlist)
//   KITCHEN_ALLOWED_ORIGINS  comma-separated extra origins allowed to mutate
//   KITCHEN_ALLOWED_HOSTS    comma-separated extra Host names accepted

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openStore } from "./store.mjs";
import { createKitchenService } from "./planner.mjs";
import { createAppHandler } from "./http.mjs";
import { createFeedHandler, feedTokenDigest, normalizeAppOrigin } from "./calendar.mjs";
import { acquireLock } from "./backup.mjs";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function port(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) throw new Error(`${name} must be a port number`);
  return parsed;
}

const list = (value) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  let feedToken = env.KITCHEN_FEED_TOKEN ?? null;
  if (env.KITCHEN_FEED_TOKEN_FILE) feedToken = readFileSync(env.KITCHEN_FEED_TOKEN_FILE, "utf8").trim();
  return {
    dbPath: env.KITCHEN_DB_PATH ?? join(PROJECT_ROOT, "var", "kitchen-plan.sqlite"),
    archivePath: env.KITCHEN_RECIPE_ARCHIVE ?? join(PROJECT_ROOT, "data", "kitchen-recipes.paprikarecipes"),
    host: env.KITCHEN_HOST ?? "127.0.0.1",
    port: port(env.KITCHEN_PORT, 3100, "KITCHEN_PORT"),
    feedHost: env.KITCHEN_FEED_HOST ?? "127.0.0.1",
    feedPort: port(env.KITCHEN_FEED_PORT, 3101, "KITCHEN_FEED_PORT"),
    feedToken,
    appOrigin: env.KITCHEN_APP_ORIGIN ?? null,
    allowedOrigins: list(env.KITCHEN_ALLOWED_ORIGINS),
    allowedHosts: list(env.KITCHEN_ALLOWED_HOSTS),
  };
}

export function createLogger(stream = process.stderr) {
  return (event, fields = {}) => {
    stream.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
  };
}

// Handlers without listeners, for mounting inside another Node server (the
// frontend) or for tests. `fallback` receives non-/api requests.
export function createKitchenApp({ store, appOrigin = null, allowedOrigins = [], allowedHosts = [], feedToken = null, fallback = null, log = () => {} }) {
  const origin = normalizeAppOrigin(appOrigin);
  for (const value of allowedOrigins) {
    if (new URL(value).origin !== value) throw new Error(`Allowed origin ${value} must be a bare origin`);
  }
  const service = createKitchenService(store);
  return {
    service,
    appHandler: createAppHandler({ service, appOrigin: origin, allowedOrigins, allowedHosts, fallback, log }),
    feedHandler: createFeedHandler({ service, token: feedToken, appOrigin: origin, log }),
  };
}

function listen(server, portNumber, host) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(portNumber, host, () => {
      server.off("error", reject);
      resolvePromise(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolvePromise) => {
    if (!server?.listening) return resolvePromise();
    server.close(() => resolvePromise());
    server.closeIdleConnections?.();
  });
}

const urlFor = (address) => `http://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`;

// Starts the service. Every loadConfig() field can be overridden, plus
// `now` (clock), `log`, `fallback`, and `env`. Use dbPath ':memory:' and
// port/feedPort 0 for isolated test instances; archivePath null skips import.
export async function startKitchenService(overrides = {}) {
  const { env, now, log: logOverride, fallback, ...rest } = overrides;
  const config = { ...loadConfig(env ?? process.env), ...rest };
  const log = logOverride ?? createLogger();
  const memory = config.dbPath === ":memory:";
  const releaseLock = memory ? () => {} : acquireLock(config.dbPath);
  let store = null;
  const servers = [];
  let timer = null;
  try {
    store = openStore({ path: config.dbPath, now });
    const app = createKitchenApp({ store, ...config, fallback, log });
    if (config.archivePath && existsSync(config.archivePath)) {
      const result = app.service.importArchive(readFileSync(config.archivePath));
      log("recipes_imported", { added: result.added, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped.length });
    } else if (config.archivePath) {
      log("recipe_archive_missing", { path: config.archivePath });
    }
    app.service.refresh();

    const serverOptions = { requestTimeout: 30_000, headersTimeout: 15_000, maxHeaderSize: 16_384 };
    const appServer = http.createServer(serverOptions, app.appHandler);
    servers.push(appServer);
    const appAddress = await listen(appServer, config.port, config.host);

    let feedServer = null;
    let feedAddress = null;
    if (feedTokenDigest(config.feedToken)) {
      feedServer = http.createServer(serverOptions, app.feedHandler);
      servers.push(feedServer);
      feedAddress = await listen(feedServer, config.feedPort, config.feedHost);
    } else {
      log("feed_disabled", { reason: config.feedToken ? "token_too_weak" : "token_missing" });
    }

    timer = setInterval(() => {
      try {
        app.service.refresh();
      } catch (error) {
        log("refresh_error", { message: error.message });
      }
    }, REFRESH_INTERVAL_MS);
    timer.unref();

    let closed = false;
    return {
      store,
      service: app.service,
      appHandler: app.appHandler,
      feedHandler: app.feedHandler,
      appServer,
      feedServer,
      appUrl: urlFor(appAddress),
      // Origin only; the token path is never returned or logged.
      feedOrigin: feedAddress ? urlFor(feedAddress) : null,
      async close() {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        await Promise.all(servers.map(closeServer));
        store.close();
        releaseLock();
      },
    };
  } catch (error) {
    clearInterval(timer);
    await Promise.all(servers.map(closeServer));
    store?.close();
    releaseLock();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const log = createLogger();
  startKitchenService({ log })
    .then((running) => {
      log("listening", { app: running.appUrl, feed: running.feedOrigin });
      const stop = (signal) => {
        log("stopping", { signal });
        running.close().then(() => process.exit(0));
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((error) => {
      log("startup_failed", { message: error.message });
      process.exit(1);
    });
}
