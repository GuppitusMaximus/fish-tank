// Real-browser acceptance for the dinner swap and shopping share UI
// (qa-kitchen-swap-share). Not picked up by `npm test`; run it on a host with
// Google Chrome or Chromium (the dev VM):
//
//   cd FrontEnds/kitchen-plan
//   KITCHEN_TEST_REQUIRE_BROWSER=1 node --disable-warning=ExperimentalWarning --test tests/swap-share-browser.mjs
//
// KITCHEN_TEST_BROWSER=/path/to/chrome picks the binary; otherwise PATH, the
// usual install locations and the Playwright cache are searched. Without a
// browser the case is skipped, unless KITCHEN_TEST_REQUIRE_BROWSER=1.
//
// The served app runs in-process (startKitchenService) on a disposable
// in-memory household seeded from the bundled archive, which has carrots and
// no Brussels sprouts. Chrome runs headless with a throwaway profile, every
// non-loopback host unresolvable and a dead proxy, so nothing leaves the
// machine. navigator.share and navigator.clipboard are capture stubs: the real
// share sheet is never opened and nothing is sent. Driving uses the Chrome
// DevTools Protocol over Node's built-in WebSocket; no new dependency.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startKitchenService } from "../server/main.mjs";
import { generateFeedToken } from "../server/calendar.mjs";
import { parsePaprikaArchive, resolveIngredientKey } from "../server/import.mjs";
import { addDays } from "../server/store.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLED = join(ROOT, "data", "kitchen-recipes.paprikarecipes");
const SPROUTS = "Brussels sprouts";
const ROAST_CARROTS = "Roast carrots";
const STEP_MS = 15_000;

// --- Browser discovery ---------------------------------------------------------

function findBrowser() {
  if (process.env.KITCHEN_TEST_BROWSER) return existsSync(process.env.KITCHEN_TEST_BROWSER) ? process.env.KITCHEN_TEST_BROWSER : null;
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
  }
  const fixed = [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const path of fixed) if (existsSync(path)) return path;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
  try {
    for (const entry of readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse()) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        if (existsSync(join(cache, entry, sub))) return join(cache, entry, sub);
      }
    }
  } catch {
    // no Playwright cache
  }
  return null;
}

const BROWSER = findBrowser();
const REQUIRE_BROWSER = process.env.KITCHEN_TEST_REQUIRE_BROWSER === "1";
const browserOptions = BROWSER || REQUIRE_BROWSER
  ? { timeout: 180_000 }
  : { skip: "no Google Chrome or Chromium found (set KITCHEN_TEST_BROWSER); run on the dev VM with KITCHEN_TEST_REQUIRE_BROWSER=1" };

// --- Chrome and CDP ------------------------------------------------------------

const SHUTDOWN_MS = 5_000;
const PROFILE_REMOVE_MS = 10_000;
const TRANSIENT_REMOVE = new Set(["ENOTEMPTY", "EBUSY", "EPERM"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exited by a code or by a signal (a signalled child has exitCode null).
const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

// Settles once, when the child exits or fails to spawn at all. exitOf,
// stopBrowser and removeProfile are exported only so the teardown can be
// exercised without a browser.
export function exitOf(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) => {
      if (child.pid === undefined) resolve({ error });
    });
  });
}

// True once the child has exited, false if it is still running after ms.
async function waitForExit(child, exited, ms) {
  if (hasExited(child)) return true;
  let timer;
  try {
    return await Promise.race([exited.then(() => true), new Promise((resolve) => (timer = setTimeout(resolve, ms, false)))]);
  } finally {
    clearTimeout(timer);
  }
}

// Asks this browser (by its own DevTools port) to close itself cleanly.
async function closeViaCdp(port, ms = 2_000) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(ms) })).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let timer;
  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, method: "Browser.close" })), { once: true });
        ws.addEventListener("message", resolve, { once: true });
        ws.addEventListener("close", resolve, { once: true });
        ws.addEventListener("error", () => reject(new Error("CDP browser socket error")), { once: true });
      }),
      new Promise((resolve) => (timer = setTimeout(resolve, ms))),
    ]);
  } finally {
    clearTimeout(timer);
    ws.close();
  }
}

// Browser.close, then SIGTERM, then SIGKILL, each with a bounded wait. Only
// the spawned child is signalled; Node never signals a child it has reaped.
export async function stopBrowser(child, exited, port, ms = SHUTDOWN_MS) {
  if (hasExited(child)) return "exited";
  if (child.pid === undefined) return "never-started";
  if (port) {
    await closeViaCdp(port).catch(() => {});
    if (await waitForExit(child, exited, ms)) return "closed";
  }
  child.kill("SIGTERM");
  if (await waitForExit(child, exited, ms)) return "SIGTERM";
  child.kill("SIGKILL");
  if (await waitForExit(child, exited, ms)) return "SIGKILL";
  throw new Error(`Chrome (pid ${child.pid}) still running ${ms} ms after SIGKILL`);
}

// rmSync, retried while the directory is transiently busy or refilling.
export async function removeProfile(dir, ms = PROFILE_REMOVE_MS) {
  const deadline = Date.now() + ms;
  for (let attempt = 1; ; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return attempt;
    } catch (error) {
      if (!TRANSIENT_REMOVE.has(error.code) || Date.now() >= deadline) throw error;
      await sleep(100);
    }
  }
}

async function launchChrome(t) {
  const profile = mkdtempSync(join(tmpdir(), "kitchen-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-client-side-phishing-detection",
    "--metrics-recording-only",
    "--no-pings",
    "--disable-gpu",
    // Nothing but loopback resolves or routes: every name is unresolvable,
    // and anything else goes to a dead proxy (loopback bypasses proxies).
    "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
    "--proxy-server=http://127.0.0.1:9",
    "--window-size=834,1194",
    "about:blank",
  ];
  if (process.getuid?.() === 0) args.unshift("--no-sandbox");
  const child = spawn(BROWSER, args, { stdio: ["ignore", "ignore", "pipe"] });
  const exited = exitOf(child);
  let stderr = "";
  let port = null;
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  // Chrome's helpers can still be writing the profile when the browser
  // process is gone, so the profile is removed with bounded retries after a
  // bounded shutdown of this child (and nothing else).
  t.after(async () => {
    try {
      await stopBrowser(child, exited, port);
    } finally {
      await removeProfile(profile);
    }
  });
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  while (!existsSync(portFile) || !readFileSync(portFile, "utf8").includes("\n")) {
    if (hasExited(child)) throw new Error(`Chrome exited with ${child.exitCode ?? child.signalCode}: ${stderr.slice(-2000)}`);
    if (Date.now() > deadline) throw new Error(`Chrome did not open DevTools: ${stderr.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Chrome has a page target");
  return { port, wsUrl: page.webSocketDebuggerUrl, stderr: () => stderr };
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  open() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (message) => {
      const data = JSON.parse(typeof message.data === "string" ? message.data : Buffer.from(message.data).toString("utf8"));
      if (data.id != null) {
        const pending = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) pending?.reject(new Error(`${pending.method}: ${data.error.message}`));
        else pending?.resolve(data.result);
      } else {
        for (const handler of this.handlers.get(data.method) ?? []) handler(data.params);
      }
    });
    return new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
    });
  }

  send(method, params = {}) {
    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  close() {
    this.ws?.close();
  }
}

// Installed before the app's script on every document: capture stubs for
// the Web Share API and the clipboard, and DOM finders for the driver.
const PAGE_HARNESS = String.raw`(() => {
  const qa = { shareMode: "resolve", clipboardMode: "ok", shares: [], clipboard: [], csp: [] };
  Object.defineProperty(window, "__qa", { value: qa });
  const activation = () => (navigator.userActivation ? navigator.userActivation.isActive : null);
  const share = function share(data) {
    qa.shares.push({ data: JSON.parse(JSON.stringify(data ?? null)), active: activation(), mode: qa.shareMode });
    if (qa.shareMode === "abort") return Promise.reject(new DOMException("Share canceled", "AbortError"));
    if (qa.shareMode === "error") return Promise.reject(new DOMException("Share failed", "NotAllowedError"));
    return Promise.resolve();
  };
  const canShare = (data) => Boolean(data) && typeof data.text === "string";
  Object.defineProperty(Navigator.prototype, "share", { configurable: true, get: () => (qa.shareMode === "absent" ? undefined : share) });
  Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, get: () => (qa.shareMode === "absent" ? undefined : canShare) });
  const clipboard = {
    writeText(text) {
      qa.clipboard.push({ text, active: activation(), mode: qa.clipboardMode });
      return qa.clipboardMode === "deny" ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) : Promise.resolve();
    },
  };
  Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => clipboard });
  document.addEventListener("securitypolicyviolation", (event) => qa.csp.push(event.violatedDirective + " " + event.blockedURI));

  const dateLabel = (date) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(date + "T12:00:00Z"));
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  qa.text = text;
  qa.card = (date) => [...document.querySelectorAll("li.slot-card")].find((li) => text(li.querySelector(".slot-head .eyebrow")).startsWith(dateLabel(date))) ?? null;
  qa.button = (root, label) => (root ? [...root.querySelectorAll("button")].find((button) => text(button) === label || text(button).startsWith(label)) ?? null : null);
  qa.labelled = (root, label) => {
    if (!root) return null;
    const match = [...root.querySelectorAll("label")].find((el) => el.firstChild && el.firstChild.nodeType === 3 && el.firstChild.textContent.trim() === label);
    return match ? match.querySelector("input, select, textarea") : null;
  };
  qa.shoppingRow = (name) => [...document.querySelectorAll(".shopping-group li")].find((li) => text(li.querySelector("strong")) === name) ?? null;
  qa.banner = () => text(document.getElementById("banners"));
})();`;

function pageApi(cdp) {
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`page: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}\n${expression}`);
    return result.result.value;
  };
  const snapshot = async () => evaluate(`({ banner: window.__qa?.banner(), view: document.getElementById("view")?.innerText.slice(0, 1500) })`).catch((error) => ({ error: error.message }));
  const waitFor = async (description, expression, timeout = STEP_MS) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await evaluate(expression).catch(() => null);
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}: ${JSON.stringify(await snapshot())}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  // A trusted click (it carries user activation) at the element's centre.
  const click = async (description, locator) => {
    const point = await waitFor(`${description} to be clickable`, `(() => {
      const el = ${locator};
      if (!el || el.disabled) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
  };
  // Replaces a field's text as typed input (one trusted input event).
  const type = async (description, locator, value) => {
    await waitFor(`${description} to accept text`, `(() => { const el = ${locator}; if (!el || el.disabled) return false; el.value = ""; el.focus(); return document.activeElement === el; })()`);
    await cdp.send("Input.insertText", { text: value });
    const now = await evaluate(`(${locator}).value`);
    assert.equal(now, value, `${description} holds what was typed`);
  };
  // Picks an option the select currently shows, as the picker does.
  const choose = async (description, locator, value) => {
    const picked = await waitFor(`${description} to offer ${value}`, `(() => {
      const el = ${locator};
      if (!el || ![...el.options].some((option) => option.value === ${JSON.stringify(value)})) return null;
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value;
    })()`);
    assert.equal(picked, value);
  };
  return { evaluate, waitFor, click, type, choose, snapshot };
}

// --- Service and HTTP ------------------------------------------------------------

function raw(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, text, body: /json/.test(res.headers["content-type"] ?? "") && text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function parseEvents(ics) {
  return ics
    .replace(/\r\n[ \t]/g, "")
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((block) => {
      const props = {};
      for (const line of block.split("\r\n")) {
        if (line === "END:VEVENT") break;
        const colon = line.indexOf(":");
        props[line.slice(0, colon)] = line.slice(colon + 1);
      }
      return props;
    });
}
const unescapeText = (value) => value.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
const eventOn = (ics, date) => parseEvents(ics).find((event) => event["DTSTART;VALUE=DATE"] === date.replaceAll("-", ""));

// --- The path ----------------------------------------------------------------------

test("in Chrome: pick a dinner, swap a Brussels sprouts side for roast carrots, preview, cancel, apply, share and copy the unchecked list, Undo", browserOptions, async (t) => {
  if (!BROWSER) throw new Error("KITCHEN_TEST_REQUIRE_BROWSER=1 but no Google Chrome or Chromium was found; set KITCHEN_TEST_BROWSER");

  // A disposable household on the real clock (the page checks preview expiry
  // against the browser's clock).
  const dir = mkdtempSync(join(tmpdir(), "kitchen-browser-"));
  const archivePath = join(dir, "bundled.paprikarecipes");
  writeFileSync(archivePath, readFileSync(BUNDLED));
  const token = generateFeedToken();
  const logs = [];
  const running = await startKitchenService({
    env: {},
    dbPath: ":memory:",
    archivePath,
    host: "127.0.0.1",
    port: 0,
    feedHost: "127.0.0.1",
    feedPort: 0,
    feedToken: token,
    appOrigin: "https://kitchen.example.test",
    log: (event, fields) => logs.push({ event, ...fields }),
  });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const app = running.appUrl;
  const json = async (path, options = {}) => {
    const headers = options.body === undefined ? {} : { "content-type": "application/json", "x-kitchen-plan": "1", "idempotency-key": `qa-browser-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    const response = await raw(`${app}${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    assert.ok(response.status < 300, `${path}: ${response.status} ${response.text}`);
    return response.body;
  };
  const feed = async () => (await raw(`${running.feedOrigin}/feed/${token}.ics`)).text;
  const store = running.store;
  const carrotKey = resolveIngredientKey(store, "carrots");
  const sproutKey = resolveIngredientKey(store, SPROUTS);

  // Two dates with the same bundled dinner, which has no carrots.
  const bundled = parsePaprikaArchive(readFileSync(BUNDLED)).recipes;
  const dinner = bundled.find((recipe) => !recipe.lines.some((line) => line.ingredientKey === carrotKey || line.alternatives?.includes(carrotKey)) && !recipe.categories.includes("Side"));
  assert.ok(dinner, "a bundled dinner without carrots");
  const { today, revision: start } = await json("/api/dashboard");
  const D1 = addDays(today, 1);
  const D2 = addDays(today, 2);
  await json("/api/plan/accept", { method: "POST", body: { accept: true, baseRevision: start, slots: [{ date: D1, recipeUid: dinner.uid }, { date: D2, recipeUid: dinner.uid }] } });
  const seeded = await json("/api/dashboard");
  const feedSeeded = await feed();

  // Chrome on the served app.
  const chrome = await launchChrome(t);
  const cdp = new Cdp(chrome.wsUrl);
  await cdp.open();
  t.after(() => cdp.close());
  const problems = [];
  const requests = [];
  const dialogs = [];
  cdp.on("Runtime.exceptionThrown", (event) => problems.push(`exception: ${event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text}`));
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") problems.push(`console.error: ${event.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
  });
  cdp.on("Network.requestWillBeSent", (event) => requests.push(event.request.url));
  cdp.on("Page.javascriptDialogOpening", (event) => {
    dialogs.push({ type: event.type, message: event.message });
    cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch((error) => problems.push(`dialog: ${error.message}`));
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_HARNESS });
  const page = pageApi(cdp);
  const { evaluate, waitFor, click, type, choose } = page;
  await cdp.send("Page.navigate", { url: `${app}/` });

  const card = (date) => `window.__qa.card(${JSON.stringify(date)})`;
  const inCard = (date, selector) => `${card(date)}?.querySelector(${JSON.stringify(selector)})`;
  const banner = () => evaluate("window.__qa.banner()");
  await waitFor("the plan with both dinners", `document.querySelectorAll("li.slot-card").length === 14 && window.__qa.text(${inCard(D1, "h3")}) === ${JSON.stringify(dinner.name)} && window.__qa.text(${inCard(D2, "h3")}) === ${JSON.stringify(dinner.name)}`);
  assert.equal(await evaluate("window.isSecureContext && typeof navigator.share === 'function'"), true, "loopback is a secure context and the share stub is in place");

  // Select the first dinner and fill the swap with the visible controls.
  const editor = (date) => inCard(date, "form.swap-editor");
  const fillSwap = async (date) => {
    await click("Replace ingredient or side", `window.__qa.button(${card(date)}, "Replace ingredient or side")`);
    await waitFor("the dinner's ingredients", `${editor(date)}?.querySelector('input[type=radio][value=side]')`);
    const lines = await evaluate(`[...${editor(date)}.querySelectorAll('.swap-from .choice strong')].map((el) => el.textContent)`);
    assert.ok(lines.length > 1, "the recipe's lines are listed");
    assert.ok(!lines.some((line) => /brussels/i.test(line)), "the recipe has no Brussels sprouts line");
    await click("A separate side", `${editor(date)}.querySelector('input[type=radio][value=side]').closest('label')`);
    await type("Side served now", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-from'), "Side served now")`, SPROUTS);
    await type("side amount", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-from'), "Amount")`, "1");
    assert.equal(await evaluate(`window.__qa.labelled(${editor(date)}.querySelector('.swap-from'), "Unit").value`), "lb");

    // The search box narrows the picker to carrots.
    const target = `${editor(date)}?.querySelector('.swap-to select[id^=swap-target-]')`;
    const offered = await evaluate(`${target}.options.length`);
    await type("Find an ingredient", `${editor(date)}?.querySelector('.swap-to input[type=search]')`, "carrot");
    const narrowed = await waitFor("the picker narrowed to carrot", `(() => { const options = [...${target}.options].filter((o) => o.value); return options.length && options.length < ${offered} && options.every((o) => /carrot/i.test(o.value + " " + o.textContent)) ? options.map((o) => o.value) : null; })()`);
    assert.ok(narrowed.includes(carrotKey), `carrot is offered: ${narrowed}`);
    await choose("Ingredient", target, carrotKey);
    await waitFor("the carrot's name on the dinner", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-to'), "Name on the dinner")?.value === "carrot"`);
    assert.equal(await evaluate(`window.__qa.labelled(${editor(date)}.querySelector('.swap-from'), "Side served now").value`), SPROUTS, "the side survives the re-render");

    // Roast prep, shown as the name on the dinner.
    await type("Name on the dinner", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-to'), "Name on the dinner")`, ROAST_CARROTS);
    await type("Amount to cook", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-to'), "Amount to cook")`, "4");
    await choose("cooking unit", `window.__qa.labelled(${editor(date)}?.querySelector('.swap-to'), "Unit")`, "each");
    await click("Preview swap", `window.__qa.button(${editor(date)}, "Preview swap")`);
    await waitFor("the swap preview", `${inCard(date, "section.swap-preview")}`);
  };

  // Preview shows what would change, and changes nothing.
  await fillSwap(D1);
  const summary = await evaluate(`Object.fromEntries([...${inCard(D1, "section.swap-preview dl")}.querySelectorAll('div')].map((row) => [window.__qa.text(row.querySelector('dt')), window.__qa.text(row.querySelector('dd'))]))`);
  assert.equal(summary["Comes off"], SPROUTS);
  assert.equal(summary["Goes on"], `${ROAST_CARROTS} · 4`);
  assert.equal(summary["Kept for restock"], `${SPROUTS} · 1 lb`);
  const diffRows = await evaluate(`[...${inCard(D1, "section.swap-preview")}.querySelectorAll('.shopping-diff tr')].map((tr) => [...tr.cells].map((cell) => cell.textContent))`);
  assert.deepEqual(diffRows.filter(([kind]) => kind === "Add").map((row) => row.slice(1)).sort(), [["carrot", "4"], [`${SPROUTS} (restock)`, "1 lb"]].sort());
  assert.equal((await json("/api/health")).revision, seeded.revision, "a preview records no revision");
  assert.deepEqual((await json(`/api/dinner-swaps?date=${D1}`)).swaps, []);
  assert.equal(await feed(), feedSeeded, "the feed never shows a preview");
  assert.equal(await evaluate(`Boolean(${inCard(D2, "form.swap-editor")})`), false, "only the chosen dinner is being edited");

  // Cancel leaves everything as it was.
  await click("Cancel", `window.__qa.button(${inCard(D1, "section.swap-preview")}, "Cancel")`);
  await waitFor("the editor to close", `!${inCard(D1, "section.swap-preview")} && !${editor(D1)}`);
  assert.match(await banner(), /Swap cancelled\. Nothing was changed\./);
  assert.equal((await json("/api/health")).revision, seeded.revision);

  // Again, and apply.
  await fillSwap(D1);
  await click("Apply swap", `window.__qa.button(${inCard(D1, "section.swap-preview")}, "Apply swap")`);
  await waitFor("the applied swap on the dinner", `window.__qa.text(${inCard(D1, ".swap-line")}).includes(${JSON.stringify(`${SPROUTS} → ${ROAST_CARROTS} · 4`)}) && window.__qa.button(${card(D1)}, "Undo this swap")`);
  assert.match(await banner(), /applied/);
  assert.equal(await evaluate(`Boolean(${inCard(D2, ".swap-line")})`), false, "the other date with the same recipe is unchanged");
  const applied = await json("/api/dashboard");
  assert.equal(applied.revision, seeded.revision + 1);
  assert.deepEqual((await json(`/api/dinner-swaps?date=${D1}`)).swaps.map((swap) => [swap.kind, swap.fromLabel, swap.toLabel, swap.quantity, swap.unit]), [["side", SPROUTS, ROAST_CARROTS, 4, "each"]]);
  assert.deepEqual((await json(`/api/dinner-swaps?date=${D2}`)).swaps, []);
  const feedApplied = await feed();
  assert.ok(unescapeText(eventOn(feedApplied, D1).DESCRIPTION).includes(`Swap: ${ROAST_CARROTS} instead of ${SPROUTS}`));
  assert.deepEqual(eventOn(feedApplied, D2), eventOn(feedSeeded, D2));

  // The shopping list shows the carrots and the restocked sprouts.
  await click("Shopping", `[...document.querySelectorAll('#nav a')].find((a) => a.textContent.startsWith('Shopping'))`);
  await waitFor("the shopping list", `document.querySelector('.share-card') && window.__qa.shoppingRow(${JSON.stringify(SPROUTS)})`);
  const sproutRow = await evaluate(`window.__qa.text(window.__qa.shoppingRow(${JSON.stringify(SPROUTS)}))`);
  assert.match(sproutRow, /1 lb/);
  assert.equal(await evaluate(`window.__qa.text(window.__qa.shoppingRow(${JSON.stringify(SPROUTS)}).querySelector('.restock-note'))`), "Restock: 1 lb");
  assert.match(await evaluate(`window.__qa.text(window.__qa.shoppingRow("carrot").querySelector('small'))`), /^4\b/);

  // Check one row off; it drops out of the shared text.
  const listed = (await json("/api/shopping")).items;
  const bought = listed.find((item) => item.kind === "plan" && item.ingredientKey !== carrotKey && !item.checked);
  assert.ok(bought, "a dinner row to check off");
  await click(`check off ${bought.name}`, `window.__qa.shoppingRow(${JSON.stringify(bought.name)}).querySelector('label')`);
  await waitFor(`${bought.name} checked`, `window.__qa.shoppingRow(${JSON.stringify(bought.name)})?.classList.contains('checked')`);
  const shopping = (await json("/api/shopping")).items;
  assert.equal(shopping.find((item) => item.id === bought.id).checked, true);
  const unchecked = shopping.filter((item) => !item.checked);
  const checkMarks = () => shopping.map((item) => [item.id, item.checked]);

  const expectListText = (text) => {
    assert.match(text, /^Shopping list for /);
    const lines = text.trim().split("\n").slice(1);
    assert.equal(lines.length, unchecked.length, `one line per unchecked row:\n${text}`);
    for (const item of unchecked) assert.ok(lines.some((line) => line.startsWith(`- ${item.name}: ${item.amount}`)), `${item.name} ${item.amount} is listed`);
    assert.ok(!lines.some((line) => line.startsWith(`- ${bought.name}:`) && !unchecked.some((item) => item.name === bought.name)), "the checked row is left out");
    assert.ok(lines.includes(`- ${SPROUTS}: 1 lb (restock: 1 lb)`), text);
    assert.ok(lines.includes("- carrot: 4"), text);
    assert.ok(!/https?:|\/feed\//.test(text) && !text.includes(token), "no links or secrets");
  };

  // Native share: called inside the tap, with the text only.
  await click("Share unchecked list", `window.__qa.button(document.querySelector('.share-card'), "Share unchecked list")`);
  const shared = await waitFor("navigator.share", "window.__qa.shares.length === 1 && window.__qa.shares[0]");
  assert.equal(shared.active, true, "share runs within the tap's user activation");
  assert.deepEqual(Object.keys(shared.data), ["text"]);
  expectListText(shared.data.text);
  await waitFor("the share confirmation", `/handed to the app you picked/.test(window.__qa.banner())`);

  // Share sheet dismissed: nothing sent, no fallback.
  await evaluate(`window.__qa.shareMode = "abort"`);
  await click("Share unchecked list", `window.__qa.button(document.querySelector('.share-card'), "Share unchecked list")`);
  await waitFor("the cancelled share", `window.__qa.shares.length === 2 && /Sharing cancelled\. Nothing was sent\./.test(window.__qa.banner())`);
  assert.equal(await evaluate("Boolean(document.querySelector('textarea.share-text'))"), false);

  // Share failing: the list is offered as text.
  await evaluate(`window.__qa.shareMode = "error"`);
  await click("Share unchecked list", `window.__qa.button(document.querySelector('.share-card'), "Share unchecked list")`);
  const fallbackText = await waitFor("the text fallback", `window.__qa.shares.length === 3 && document.querySelector('textarea.share-text')?.value`);
  assert.equal(fallbackText, shared.data.text);
  await click("Hide text", `window.__qa.button(document.querySelector('.share-card'), "Hide text")`);
  await waitFor("the text hidden", `!document.querySelector('textarea.share-text')`);

  // Copy: the same text to the clipboard, inside the tap.
  await evaluate(`window.__qa.shareMode = "resolve"`);
  await click("Copy list", `window.__qa.button(document.querySelector('.share-card'), "Copy list")`);
  const copied = await waitFor("clipboard.writeText", "window.__qa.clipboard.length === 1 && window.__qa.clipboard[0]");
  assert.equal(copied.active, true, "writeText runs within the tap's user activation");
  assert.equal(copied.text, shared.data.text);
  await waitFor("the copy confirmation", `/Copied ${unchecked.length} items?\\./.test(window.__qa.banner())`);

  // Clipboard refused: the list is offered as text.
  await evaluate(`window.__qa.clipboardMode = "deny"`);
  await click("Copy list", `window.__qa.button(document.querySelector('.share-card'), "Copy list")`);
  const deniedText = await waitFor("the clipboard fallback", `window.__qa.clipboard.length === 2 && /Copying isn't allowed here/.test(window.__qa.banner()) && document.querySelector('textarea.share-text')?.value`);
  assert.equal(deniedText, shared.data.text);
  await click("Hide text", `window.__qa.button(document.querySelector('.share-card'), "Hide text")`);
  await waitFor("the text hidden", `!document.querySelector('textarea.share-text')`);

  // No Web Share API: Share copies instead.
  await evaluate(`window.__qa.clipboardMode = "ok"; window.__qa.shareMode = "absent"`);
  await click("Share unchecked list", `window.__qa.button(document.querySelector('.share-card'), "Share unchecked list")`);
  const viaCopy = await waitFor("Share falling back to copy", "window.__qa.clipboard.length === 3 && window.__qa.clipboard[2]");
  assert.equal(viaCopy.text, shared.data.text);
  assert.equal(await evaluate("window.__qa.shares.length"), 3, "no share call without the API");

  // Sharing and copying changed nothing on the server.
  assert.deepEqual((await json("/api/shopping")).items.map((item) => [item.id, item.checked]), checkMarks());
  assert.equal((await json("/api/health")).revision, applied.revision);

  // Undo from the dinner card, after the confirm dialog.
  await click("14-day plan", `[...document.querySelectorAll('#nav a')].find((a) => a.textContent.startsWith('14-day plan'))`);
  await click("Undo this swap", `window.__qa.button(${card(D1)}, "Undo this swap")`);
  await waitFor("the swap undone", `${card(D1)} && !${inCard(D1, ".swap-line")} && /Undo/.test(window.__qa.banner()) && !/…/.test(window.__qa.banner())`);
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].type, "confirm");
  assert.match(dialogs[0].message, /Undo/);
  const undone = await json("/api/dashboard");
  assert.equal(undone.revision, applied.revision + 1);
  const d1 = undone.slots.find((slot) => slot.date === D1);
  const seededD1 = seeded.slots.find((slot) => slot.date === D1);
  assert.deepEqual([d1.uid, d1.recipe.uid, d1.swaps], [seededD1.uid, dinner.uid, []]);
  assert.ok(d1.sequence > applied.slots.find((slot) => slot.date === D1).sequence);
  assert.deepEqual(undone.slots.find((slot) => slot.date === D2), seeded.slots.find((slot) => slot.date === D2));
  const afterUndo = (await json("/api/shopping")).items;
  assert.ok(!afterUndo.some((item) => item.kind === "restock" || item.ingredientKey === sproutKey), "the unbought restock is withdrawn");
  assert.ok(!afterUndo.some((item) => item.ingredientKey === carrotKey), "the carrots are gone");
  const feedUndone = await feed();
  assert.equal(eventOn(feedUndone, D1).UID, eventOn(feedSeeded, D1).UID);
  assert.ok(Number(eventOn(feedUndone, D1).SEQUENCE) > Number(eventOn(feedApplied, D1).SEQUENCE));
  assert.ok(!unescapeText(eventOn(feedUndone, D1).DESCRIPTION).includes("Swap:"));

  // The page stayed on loopback, clean, and nothing secret was logged.
  const origin = new URL(app).origin;
  const outside = requests.filter((url) => !url.startsWith(`${origin}/`) && !/^(data|blob|about|chrome-extension):/.test(url));
  assert.deepEqual(outside, [], "the page requested nothing but the kitchen server");
  assert.deepEqual(await evaluate("window.__qa.csp"), [], "no CSP violations");
  assert.deepEqual(problems, [], "no page errors");
  const logText = JSON.stringify(logs);
  assert.ok(!logText.includes(token) && !logText.includes("/feed/"), "no token or feed path in the log");
});
