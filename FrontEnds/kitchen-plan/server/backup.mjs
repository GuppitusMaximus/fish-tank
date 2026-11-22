// Consistent backups and guarded restore for the Kitchen Plan database.
//
//   node server/backup.mjs backup  <db> <dest>      snapshot a live database (safe while serving)
//   node server/backup.mjs verify  <file>           integrity, foreign keys, schema version
//   node server/backup.mjs restore <backup> <db>    replace <db>; the service must be stopped
//
// Backups use VACUUM INTO, which writes a transactionally consistent copy
// from a read snapshot, so the service can keep running in WAL mode. Restore
// refuses while the service holds the database lock, verifies the backup
// first, keeps a pre-restore safety copy and swaps files atomically. Full
// restore procedure (stop unit, restore, start, check /api/health) is
// documented by the follow-up operations plan.

import { DatabaseSync } from "node:sqlite";
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SCHEMA_VERSION } from "./store.mjs";

export function lockPath(dbPath) {
  return `${dbPath}.lock`;
}

// PID of a live process holding the lock, or null.
export function lockHolder(dbPath) {
  let pid;
  try {
    pid = Number(readFileSync(lockPath(dbPath), "utf8").trim());
  } catch {
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    return error.code === "EPERM" ? pid : null;
  }
}

// Takes the single-writer lock for dbPath. Returns a release function.
export function acquireLock(dbPath) {
  const path = lockPath(dbPath);
  mkdirSync(dirname(resolve(path)), { recursive: true });
  try {
    writeFileSync(path, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const holder = lockHolder(dbPath);
    if (holder && holder !== process.pid) throw new Error(`Database ${dbPath} is in use by process ${holder}`);
    writeFileSync(path, `${process.pid}\n`, { mode: 0o600 });
  }
  return () => {
    try {
      if (readFileSync(path, "utf8").trim() === String(process.pid)) rmSync(path);
    } catch {
      // already gone
    }
  };
}

function fsyncPath(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function verifyBackup(path) {
  if (!existsSync(path)) return { ok: false, path, problems: ["file not found"] };
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const schemaVersion = db.prepare("PRAGMA user_version").get().user_version;
    const problems = [];
    if (integrity.length !== 1 || integrity[0] !== "ok") problems.push(`integrity_check: ${integrity.slice(0, 5).join("; ")}`);
    if (foreignKeys.length) problems.push(`${foreignKeys.length} foreign key violations`);
    if (schemaVersion < 1) problems.push("not a Kitchen Plan database");
    if (schemaVersion > SCHEMA_VERSION) problems.push(`schema version ${schemaVersion} is newer than this service (${SCHEMA_VERSION})`);
    const count = (sql) => (problems.length ? null : db.prepare(sql).get().n);
    return {
      ok: problems.length === 0,
      path,
      bytes: statSync(path).size,
      schemaVersion,
      revision: problems.length ? null : db.prepare("SELECT revision FROM plan_state WHERE id = 1").get()?.revision ?? null,
      recipes: count("SELECT COUNT(*) AS n FROM recipes"),
      acceptedSlots: count("SELECT COUNT(*) AS n FROM slots WHERE status = 'accepted'"),
      changes: count("SELECT COUNT(*) AS n FROM changes"),
      problems,
    };
  } catch (error) {
    return { ok: false, path, problems: [error.message] };
  } finally {
    db?.close();
  }
}

// Writes a verified snapshot to destPath. Pass `db` (an open DatabaseSync,
// e.g. store.db, outside any transaction) or `dbPath`.
export function createBackup({ db = null, dbPath = null, destPath, overwrite = false }) {
  if (!destPath) throw new Error("createBackup requires destPath");
  if (!overwrite && existsSync(destPath)) throw new Error(`${destPath} already exists`);
  const temp = `${destPath}.partial-${process.pid}`;
  rmSync(temp, { force: true });
  const source = db ?? new DatabaseSync(dbPath);
  try {
    if (!db) source.exec("PRAGMA busy_timeout = 5000");
    source.prepare("VACUUM INTO ?").run(temp);
  } finally {
    if (!db) source.close();
  }
  const report = verifyBackup(temp);
  if (!report.ok) {
    rmSync(temp, { force: true });
    throw new Error(`Backup failed verification: ${report.problems.join("; ")}`);
  }
  chmodSync(temp, 0o600);
  fsyncPath(temp);
  renameSync(temp, destPath);
  fsyncPath(dirname(resolve(destPath)));
  return { ...report, path: destPath };
}

export function restoreBackup({ backupPath, dbPath }) {
  const holder = lockHolder(dbPath);
  if (holder) throw new Error(`Stop the Kitchen Plan service (pid ${holder}) before restoring`);
  const report = verifyBackup(backupPath);
  if (!report.ok) throw new Error(`Refusing to restore: ${report.problems.join("; ")}`);
  const release = acquireLock(dbPath);
  try {
    let safetyBackup = null;
    if (existsSync(dbPath)) {
      safetyBackup = `${dbPath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      createBackup({ dbPath, destPath: safetyBackup });
    }
    const temp = `${dbPath}.restore-${process.pid}`;
    copyFileSync(backupPath, temp);
    chmodSync(temp, 0o600);
    fsyncPath(temp);
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    renameSync(temp, dbPath);
    fsyncPath(dirname(resolve(dbPath)));
    return { restored: dbPath, from: backupPath, safetyBackup, schemaVersion: report.schemaVersion, revision: report.revision };
  } finally {
    release();
  }
}

function runCli(argv) {
  const [command, first, second] = argv;
  let result;
  if (command === "backup" && first && second) result = createBackup({ dbPath: first, destPath: second });
  else if (command === "verify" && first) result = verifyBackup(first);
  else if (command === "restore" && first && second) result = restoreBackup({ backupPath: first, dbPath: second });
  else {
    process.stderr.write("usage: backup.mjs backup <db> <dest> | verify <file> | restore <backup> <db>\n");
    return 2;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok === false ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
