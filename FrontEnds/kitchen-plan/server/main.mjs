// Kitchen Plan service entry point.
//
//   node server/main.mjs
//
// Two listeners: the private app (default 127.0.0.1:3100: the /api JSON API
// plus the dashboard/PWA from ui.mjs) and the public calendar feed (default
// 127.0.0.1:3101), which only starts when a valid feed token is configured. First boot imports the bundled recipe library
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
//   KITCHEN_FEED_PUBLIC_ORIGIN  https origin the public feed is reached at; with a
//                            valid token the owner can reveal the subscription URL
//   KITCHEN_BACKUP_DIR       directory for scheduled backups (unset: no schedule)
//   KITCHEN_BACKUP_INTERVAL_HOURS  hours between backups (default 6)
//   KITCHEN_BACKUP_KEEP      scheduled backups kept, newest first (default 28)

import http from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openStore } from "./store.mjs";
import { createKitchenService } from "./planner.mjs";
import { createAppHandler } from "./http.mjs";
import { createFeedHandler, feedTokenDigest, normalizeAppOrigin } from "./calendar.mjs";
import { acquireLock, createBackup } from "./backup.mjs";
import { createUiHandler } from "./ui.mjs";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function port(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) throw new Error(`${name} must be a port number`);
  return parsed;
}

function positive(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
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
    feedPublicOrigin: env.KITCHEN_FEED_PUBLIC_ORIGIN || null,
    backupDir: env.KITCHEN_BACKUP_DIR || null,
    backupIntervalHours: positive(env.KITCHEN_BACKUP_INTERVAL_HOURS, 6, "KITCHEN_BACKUP_INTERVAL_HOURS"),
    backupKeep: Math.floor(positive(env.KITCHEN_BACKUP_KEEP, 28, "KITCHEN_BACKUP_KEEP")),
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

// Full subscription URL for the owner, or null while the feed is disabled.
// Only ever handed to ui.mjs, which returns it in a no-store response.
export function subscriptionUrl(feedPublicOrigin, feedToken) {
  if (!feedPublicOrigin || !feedTokenDigest(feedToken)) return null;
  let origin;
  try {
    origin = normalizeAppOrigin(feedPublicOrigin);
  } catch {
    throw new Error("KITCHEN_FEED_PUBLIC_ORIGIN must be an https:// origin without path, query or credentials");
  }
  return `${origin}/feed/${feedToken.trim()}.ics`;
}

const BACKUP_NAME = /^kitchen-plan-\d{8}T\d{6}Z\.sqlite$/;

// Writes one consistent snapshot (VACUUM INTO from the live connection;
// transactions are synchronous, so none is open between events) and prunes
// scheduled backups beyond `keep`. Other files in the directory are left alone.
export function runScheduledBackup({ store, dir, keep, now = new Date() }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const report = createBackup({ db: store.db, destPath: join(dir, `kitchen-plan-${stamp}.sqlite`) });
  const scheduled = readdirSync(dir).filter((name) => BACKUP_NAME.test(name)).sort().reverse();
  const pruned = scheduled.slice(keep);
  for (const name of pruned) rmSync(join(dir, name), { force: true });
  return { file: report.path, bytes: report.bytes, revision: report.revision, pruned: pruned.length };
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
// Non-/api requests go to the dashboard (ui.mjs) unless `fallback` is given;
// pass fallback null for an API-only listener.
export async function startKitchenService(overrides = {}) {
  const { env, now, log: logOverride, fallback: fallbackOverride, ...rest } = overrides;
  const config = { ...loadConfig(env ?? process.env), ...rest };
  const log = logOverride ?? createLogger();
  const memory = config.dbPath === ":memory:";
  const releaseLock = memory ? () => {} : acquireLock(config.dbPath);
  let store = null;
  const servers = [];
  let timer = null;
  let backupTimer = null;
  try {
    const fallback = fallbackOverride !== undefined
      ? fallbackOverride
      : createUiHandler({ subscriptionUrl: subscriptionUrl(config.feedPublicOrigin, config.feedToken), log });
    store = openStore({ path: config.dbPath, now });
    const app = createKitchenApp({ store, ...config, fallback, log });
    if (config.archivePath && existsSync(config.archivePath)) {
      const result = app.service.importArchive(readFileSync(config.archivePath));
      log("recipes_imported", { added: result.added, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped.length, conflicts: result.conflicts.length });
      // Revised recipes that accepted dinners use are kept as accepted and
      // reported; startup continues.
      for (const conflict of result.conflicts) {
        log("recipe_import_conflict", { uid: conflict.uid, reason: conflict.reason, dates: conflict.dates.length });
      }
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

    const backupNow = () => {
      try {
        const result = runScheduledBackup({ store, dir: config.backupDir, keep: config.backupKeep });
        log("backup_written", result);
        return result;
      } catch (error) {
        log("backup_failed", { message: error.message });
        return null;
      }
    };
    if (config.backupDir && !memory) {
      backupTimer = setInterval(backupNow, config.backupIntervalHours * 3_600_000);
      backupTimer.unref();
      log("backups_scheduled", { dir: config.backupDir, everyHours: config.backupIntervalHours, keep: config.backupKeep });
    }

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
      // Writes a scheduled-style backup now; null when backups are not configured.
      backupNow: config.backupDir && !memory ? backupNow : () => null,
      async close() {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(backupTimer);
        await Promise.all(servers.map(closeServer));
        store.close();
        releaseLock();
      },
    };
  } catch (error) {
    clearInterval(timer);
    clearInterval(backupTimer);
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
