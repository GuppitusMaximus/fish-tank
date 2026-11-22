// Kitchen Plan private dashboard. Every value shown comes from the kitchen
// server's /api; nothing about the plan is stored on this device. Mutations
// are sent once, when the owner presses a button, and are never queued or
// replayed in the background. After a network failure the owner can retry the
// same request explicitly; it reuses its Idempotency-Key, so a request that
// did reach the server is answered from the stored result instead of applied
// twice.

const POLL_MS = 60_000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_NAMES = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const VIEWS = ["plan", "review", "shopping", "recipes", "household"];

const state = {
  route: { name: "plan", uid: null },
  data: null, // {dashboard, review, shopping, pantry, constraints, changes}
  recipes: null,
  recipeDetails: new Map(),
  loadedAt: null,
  loadError: null,
  online: navigator.onLine,
  stale: false,
  busy: false,
  message: null, // {kind: info|ok|error, text}
  pending: null, // failed request the owner may retry: {label, method, path, body, key}
  draft: new Map(), // date -> {recipeUid, servings, prepMinutes, locked, note, base: {recipeUid, sequence}}
  draftDeps: [], // [{producerDate, consumerDate, servings, ingredientKey}]
  draftRemoveDeps: [], // [{producerDate, consumerDate}]
  editor: null, // slot editor fields while open
  preview: null,
  previewStale: false,
  constraintsForm: null,
  subscription: null, // {url} | {url: null, reason} — memory only
  swaps: new Map(), // date -> GET /api/dinner-swaps body for accepted dinners at the loaded revision
  swapEditor: null, // {date, data, loading, error, mode: source|side, sourceId, side*, replacement*, filter}
  swapPreview: null, // POST /api/dinner-swaps/preview body plus {request}
  swapPreviewStale: false,
  lastSwap: null, // {date, revision} of the swap applied on this screen, for its Undo button
  shareFallback: false, // show the unchecked list as selectable text
  shellUpdated: false,
};

// --- DOM helpers ----------------------------------------------------------

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") el.className = value;
    else if (key === "value" || key === "checked" || key === "selected" || key === "disabled") el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const $ = (id) => document.getElementById(id);

function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

// --- Formatting -----------------------------------------------------------

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function formatDate(date) {
  return dateFormat.format(new Date(`${date}T12:00:00Z`));
}

function shortDay(date) {
  return formatDate(date).split(",")[0];
}

function relativeDay(date) {
  const today = state.data?.dashboard.today;
  if (!today) return null;
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : null;
}

function minutes(value) {
  if (value == null) return null;
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const humanize = (code) => String(code ?? "").replaceAll("_", " ");

// --- API ------------------------------------------------------------------

class NetworkError extends Error {}

class ApiError extends Error {
  constructor(status, error) {
    super(error?.message ?? `Request failed (${status})`);
    this.status = status;
    this.code = error?.code ?? `http_${status}`;
    this.details = error?.details ?? null;
  }
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function api(path, { method = "GET", body, key } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-Kitchen-Plan"] = "1";
    if (key) headers["Idempotency-Key"] = key;
  }
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  } catch {
    throw new NetworkError("The kitchen server could not be reached");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error);
  return { data, replayed: response.headers.get("Idempotency-Replayed") === "true" };
}

const get = async (path) => (await api(path)).data;

async function loadAll({ quiet = false } = {}) {
  if (!quiet) state.loadError = null;
  try {
    const [dashboard, review, shopping, pantry, constraints, changes, recipes] = await Promise.all([
      get("/api/dashboard"),
      get("/api/review?days=3"),
      get("/api/shopping"),
      get("/api/pantry"),
      get("/api/constraints"),
      get("/api/changes?limit=12"),
      state.recipes ? Promise.resolve({ recipes: state.recipes }) : get("/api/recipes"),
    ]);
    const revisions = new Set([dashboard.revision, review.revision, shopping.revision, pantry.revision, constraints.revision]);
    if (revisions.size > 1) return loadAll({ quiet }); // a change landed between reads
    const previous = state.data?.dashboard.revision;
    state.data = { dashboard, review, shopping, pantry, constraints, changes };
    state.recipes = recipes.recipes.slice().sort((a, b) => a.name.localeCompare(b.name));
    state.loadedAt = new Date();
    state.loadError = null;
    state.stale = false;
    state.online = true;
    if (previous !== undefined && previous !== dashboard.revision) {
      if (state.preview) state.previewStale = true;
      if (state.swapPreview) state.swapPreviewStale = true;
      reconcileDraft();
      if (state.swapEditor) loadSwapEditor(state.swapEditor);
    }
    loadSwaps(dashboard);
    if (!state.constraintsForm || previous !== dashboard.revision) state.constraintsForm = constraintsToForm(constraints.constraints);
  } catch (error) {
    state.loadError = error;
    if (error instanceof NetworkError) state.online = false;
  }
  render();
}

// Drops draft entries for dinners that changed elsewhere, so accepting the
// draft never overwrites a change the owner has not seen.
function reconcileDraft() {
  const slots = slotMap();
  const dropped = [];
  for (const [date, entry] of state.draft) {
    const slot = slots.get(date);
    if (!slot || slot.sequence !== entry.base.sequence || slot.recipe?.uid !== entry.base.recipeUid) {
      state.draft.delete(date);
      dropped.push(date);
    }
  }
  if (dropped.length) {
    state.message = { kind: "info", text: `The plan changed on another device. Your unaccepted draft for ${dropped.map(shortDay).join(", ")} was discarded; choose again if you still want it.` };
  }
}

async function checkForChanges() {
  if (document.visibilityState !== "visible" || state.busy || !state.data) return;
  try {
    const health = await get("/api/health");
    const wasOffline = !state.online;
    state.online = true;
    // Re-render only when something changed, so an idle poll never steals
    // focus from a field being edited.
    if (health.revision === state.data.dashboard.revision) return wasOffline ? render() : undefined;
    if (state.draft.size || state.draftDeps.length || state.draftRemoveDeps.length || state.preview || state.editor || state.swapEditor || state.swapPreview) {
      state.stale = true;
      if (state.preview) state.previewStale = true;
      if (state.swapPreview) state.swapPreviewStale = true;
      render();
    } else {
      await loadAll({ quiet: true });
    }
  } catch (error) {
    if (error instanceof NetworkError && state.online) {
      state.online = false;
      render();
    }
  }
}

const canMutate = () => state.online && !state.busy && !state.stale && Boolean(state.data);

// Sends one mutation the owner asked for. Never retried automatically.
async function mutate(label, method, path, body, { key = newKey(), onSuccess } = {}) {
  if (!navigator.onLine || !state.online) {
    state.message = { kind: "error", text: `You're offline, so “${label}” was not sent. Nothing is queued; try again once the kitchen server is reachable.` };
    return render();
  }
  state.busy = true;
  state.message = { kind: "info", text: `${label}…` };
  render();
  try {
    const result = await api(path, { method, body, key });
    state.pending = null;
    state.message = { kind: "ok", text: result.replayed ? `${label}: already saved earlier — showing that result.` : `${label}: saved.` };
    onSuccess?.(result.data);
  } catch (error) {
    if (error instanceof NetworkError) {
      state.online = false;
      state.pending = { label, method, path, body, key, onSuccess };
      state.message = { kind: "error", text: `The kitchen server didn't answer, so it's unknown whether “${label}” was saved. Nothing will be resent automatically.` };
    } else {
      state.pending = null;
      state.message = { kind: "error", text: errorText(error) };
      if (error.code === "stale_revision" || error.code === "stale_preview" || error.code === "preview_expired" || error.code === "option_invalid") {
        if (state.preview) state.previewStale = true;
        if (state.swapPreview) state.swapPreviewStale = true;
      }
    }
  } finally {
    state.busy = false;
  }
  await loadAll({ quiet: true });
}

function retryPending() {
  const pending = state.pending;
  if (!pending) return;
  state.online = navigator.onLine;
  mutate(pending.label, pending.method, pending.path, pending.body, { key: pending.key, onSuccess: pending.onSuccess });
}

function errorText(error) {
  if (error instanceof NetworkError) return "The kitchen server could not be reached.";
  const extra = [];
  if (error.code === "stale_revision") return "The plan changed on another device since this screen loaded. It has been reloaded — check it and try again.";
  if (error.code === "stale_item") return "That item changed on another device. It has been reloaded — try again.";
  if (error.code === "stale_preview" || error.code === "preview_expired") return `${error.message}. Nothing was changed.`;
  if (error.code === "slot_locked" || error.code === "locked") return `${error.message}. Nothing was changed — unlock the dinner with “Change dinner” first if you still want this swap.`;
  if (error.details?.problems) extra.push(error.details.problems.map((problem) => `${problem.date ? `${shortDay(problem.date)}: ` : ""}${humanize(problem.problem ?? problem)}`).join("; "));
  if (error.details?.field) extra.push(`(${error.details.field})`);
  return [error.message, ...extra].join(" ");
}

// --- Routing --------------------------------------------------------------

function readRoute() {
  const recipe = location.pathname.match(/^\/recipes\/([A-Za-z0-9-]{1,64})$/);
  if (recipe) return { name: "recipe", uid: recipe[1] };
  const hash = location.hash.slice(1);
  return { name: VIEWS.includes(hash) ? hash : "plan", uid: null };
}

function navigate(href) {
  history.pushState(null, "", href);
  state.route = readRoute();
  window.scrollTo(0, 0);
  render();
}

function link(href, props, ...children) {
  return h("a", {
    ...props,
    href,
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigate(href);
    },
  }, ...children);
}

// --- Derived data ---------------------------------------------------------

function slotMap() {
  return new Map((state.data?.dashboard.slots ?? []).map((slot) => [slot.date, slot]));
}

const recipeByUid = (uid) => state.recipes?.find((recipe) => recipe.uid === uid) ?? null;

function pantryItem(key) {
  return state.data?.pantry.items.find((item) => item.ingredientKey === key) ?? null;
}

async function recipeDetail(uid) {
  if (state.recipeDetails.has(uid)) return state.recipeDetails.get(uid);
  const { recipe } = await get(`/api/recipes/${encodeURIComponent(uid)}`);
  state.recipeDetails.set(uid, recipe);
  return recipe;
}

const draftCount = () => state.draft.size + state.draftDeps.length + state.draftRemoveDeps.length;

// --- Rendering ------------------------------------------------------------

function render() {
  renderStatus();
  renderNav();
  renderBanners();
  const view = $("view");
  if (!state.data) {
    if (state.loadError) {
      replace(view, h("div", { class: "large-empty" },
        h("span", { "aria-hidden": "true" }, "!"),
        h("h3", null, state.loadError instanceof NetworkError ? "Can't reach the kitchen server" : "The plan could not be loaded"),
        h("p", null, state.loadError instanceof NetworkError
          ? "The plan lives on the kitchen server, not on this device, so nothing can be shown offline."
          : errorText(state.loadError)),
        h("button", { type: "button", class: "primary-action", onClick: () => loadAll() }, "Try again")));
    }
    return;
  }
  const route = state.route.name;
  if (route === "recipe") return renderRecipePage(view);
  if (route === "review") return replace(view, reviewView());
  if (route === "shopping") return replace(view, shoppingView());
  if (route === "recipes") return replace(view, recipesView());
  if (route === "household") return replace(view, householdView());
  return replace(view, planView());
}

function renderStatus() {
  const dashboard = state.data?.dashboard;
  const label = !state.online
    ? "Offline · read-only"
    : state.stale
      ? "Plan changed elsewhere"
      : dashboard
        ? `Revision ${dashboard.revision} · ${state.loadedAt ? timeFormat.format(state.loadedAt) : ""}`
        : "Connecting…";
  const undo = dashboard?.undo?.undoable ? dashboard.undo : null;
  replace($("status"),
    undo ? h("button", {
      class: "undo-button",
      type: "button",
      disabled: !canMutate(),
      title: `Undo “${undo.label}” with a new revision that restores the dinners it changed`,
      onClick: () => undoLatest(undo),
    }, `Undo: ${undo.label}`) : null,
    h("div", { class: `sync-state ${!state.online ? "offline" : state.stale ? "stale" : ""}` },
      h("span", { class: "sync-dot", "aria-hidden": "true" }),
      h("span", null, label)));
}

function renderNav() {
  const shopping = state.data?.dashboard.shopping;
  const labels = {
    plan: `14-day plan${draftCount() ? ` · ${draftCount()} draft` : ""}`,
    review: "Next 3 days",
    shopping: `Shopping${shopping?.unchecked ? ` · ${shopping.unchecked}` : ""}`,
    recipes: `Recipes${state.recipes ? ` · ${state.recipes.length}` : ""}`,
    household: "Household",
  };
  const current = state.route.name === "recipe" ? "recipes" : state.route.name;
  replace($("nav"), VIEWS.map((name) => link(`/#${name}`, { "aria-current": current === name ? "page" : null }, labels[name])));
}

function renderBanners() {
  const banners = [];
  if (!state.online) {
    banners.push(h("div", { class: "banner offline", role: "status" },
      h("strong", null, "Offline."),
      state.data ? ` Showing the plan as loaded at ${state.loadedAt ? timeFormat.format(state.loadedAt) : "—"}. Changes are disabled and nothing is queued.` : " Waiting for the kitchen server.",
      h("button", { type: "button", class: "secondary-action", onClick: () => loadAll() }, "Reconnect")));
  }
  if (state.stale) {
    banners.push(h("div", { class: "banner stale", role: "status" },
      h("strong", null, "The plan changed on another device."),
      " Reload before changing anything. Draft dinners for dates that changed will be discarded; open previews must be run again.",
      h("button", { type: "button", class: "primary-action", onClick: () => loadAll() }, "Reload plan")));
  }
  if (state.shellUpdated) {
    banners.push(h("div", { class: "banner info", role: "status" },
      h("strong", null, "Kitchen Plan was updated."),
      " Reload to use the new version. Unaccepted drafts and previews on this screen are not kept.",
      h("button", { type: "button", class: "primary-action", onClick: () => location.reload() }, "Reload app")));
  }
  if (state.pending) {
    banners.push(h("div", { class: "banner error", role: "alert" },
      h("strong", null, `“${state.pending.label}” may not have been saved.`),
      " Retrying sends the same request once; if it already reached the server you'll see the saved result.",
      h("button", { type: "button", class: "primary-action", disabled: state.busy, onClick: retryPending }, "Retry once"),
      h("button", { type: "button", class: "secondary-action", onClick: () => { state.pending = null; state.message = null; loadAll(); } }, "Discard")));
  }
  if (state.message) {
    banners.push(h("div", { class: `banner ${state.message.kind}`, role: state.message.kind === "error" ? "alert" : "status" },
      state.message.text,
      h("button", { type: "button", class: "dismiss", "aria-label": "Dismiss message", onClick: () => { state.message = null; render(); } }, "×")));
  }
  replace($("banners"), banners);
}

function sectionHeading(eyebrow, title, note) {
  return h("div", { class: "section-heading" },
    h("div", null, h("span", { class: "eyebrow" }, eyebrow), h("h2", null, title)),
    note ? h("span", { class: "review-note" }, note) : null);
}

// --- Plan (14 dates) ------------------------------------------------------

function planView() {
  const { dashboard } = state.data;
  const slots = dashboard.slots;
  const accepted = slots.filter((slot) => slot.status === "accepted").length;
  return h("div", null,
    sectionHeading("Accepted dinners", "Next 14 days", `${accepted} of ${slots.length} dates planned · ${plural(dashboard.diners, "diner")}`),
    draftPanel(),
    state.preview ? previewPanel() : null,
    accepted === 0 && !state.draft.size
      ? h("div", { class: "notice" }, "No dinners are accepted yet. Choose a recipe for any date below, review the draft, then accept it. Nothing reaches the calendar until you accept.")
      : null,
    h("ol", { class: "slot-list" }, slots.map(slotCard)));
}

function slotCard(slot) {
  const draft = state.draft.get(slot.date);
  const editing = state.editor?.date === slot.date;
  const recipe = slot.recipe;
  const day = relativeDay(slot.date);
  return h("li", { class: `slot-card ${slot.status}${draft ? " drafted" : ""}${slot.issues.length ? " has-issues" : ""}` },
    h("div", { class: "slot-head" },
      h("div", null,
        h("span", { class: "eyebrow" }, `${formatDate(slot.date)}${day ? ` · ${day}` : ""}`),
        recipe
          ? h("h3", null, link(recipe.path, { class: "recipe-link" }, recipe.name))
          : h("h3", { class: "empty-title" }, "No dinner planned")),
      h("div", { class: "badges" },
        h("span", { class: `badge ${slot.status}` }, slot.status === "accepted" ? "Accepted" : "Empty"),
        slot.locked ? h("span", { class: "badge locked" }, "Locked") : null,
        draft ? h("span", { class: "badge draft" }, "Draft change") : null)),
    recipe ? h("p", { class: "slot-meta" }, [
      `Dinner for ${slot.servings}`,
      slot.prepMinutes != null ? `prep ${minutes(slot.prepMinutes)}${slot.prepOverride ? " (set by you)" : ""}` : null,
      recipe.totalMinutes != null ? `total ${minutes(recipe.totalMinutes)}` : null,
      recipe.servings?.text ? `recipe makes ${recipe.servings.text}` : null,
    ].filter(Boolean).join(" · ")) : h("p", { class: "slot-meta" }, "Empty date — nothing is on the calendar for this evening."),
    slot.note ? h("p", { class: "slot-note" }, slot.note) : null,
    slot.status === "accepted" ? swapLines(slot) : null,
    slot.consumes.map((dep) => h("div", { class: `dependency${dep.problem ? " broken" : ""}` },
      `↳ Uses ${plural(dep.servings, "leftover serving")}${dep.ingredientKey ? ` (${dep.ingredientKey})` : ""} from ${shortDay(dep.producerDate)}`,
      dep.problem ? ` — ${humanize(dep.problem)}` : null)),
    slot.feeds.map((dep) => h("div", { class: `dependency${dep.problem ? " broken" : ""}` },
      `↪ Makes ${plural(dep.servings, "extra serving")}${dep.sourceKey ? ` of ${dep.sourceKey}` : ""} for ${shortDay(dep.consumerDate)}`,
      dep.problem ? ` — ${humanize(dep.problem)}` : null)),
    slot.issues.filter((issue) => issue.kind !== "dependency").length
      ? h("ul", { class: "issues" }, slot.issues.filter((issue) => issue.kind !== "dependency").map((issue) => h("li", null,
        issue.kind === "excluded" ? "Excluded by a household rule: " : "Unavailable: ", issue.verbatim ?? issue.ingredientKey)))
      : null,
    draft ? h("p", { class: "draft-line" }, `Draft: ${describeDraft(slot, draft)}`) : null,
    h("div", { class: "actions" },
      h("button", { type: "button", class: "secondary-action", disabled: !state.data || state.stale, onClick: () => openEditor(slot) },
        recipe || draft ? "Change dinner" : "Choose a dinner"),
      slot.status === "accepted" && !slot.locked
        ? h("button", { type: "button", class: "secondary-action", disabled: !canMutate(), onClick: () => requestPreview(slot.date) }, "Suggest swaps")
        : null,
      slot.status === "accepted"
        ? h("button", { type: "button", class: "secondary-action", disabled: !state.data || state.stale || state.swapEditor?.date === slot.date, onClick: () => openSwapEditor(slot) }, "Replace ingredient or side")
        : null,
      draft ? h("button", { type: "button", class: "link-button", onClick: () => { state.draft.delete(slot.date); render(); } }, "Remove from draft") : null),
    editing ? slotEditor(slot) : null,
    state.swapEditor?.date === slot.date ? swapEditor(slot) : null,
    state.swapPreview?.date === slot.date ? swapPreviewPanel(slot) : null);
}

function describeDraft(slot, draft) {
  const parts = [];
  const to = draft.recipeUid ? recipeByUid(draft.recipeUid)?.name ?? draft.recipeUid : "no dinner";
  if (draft.recipeUid !== (slot.recipe?.uid ?? null)) parts.push(`${slot.recipe?.name ?? "empty"} → ${to}`);
  else parts.push(to);
  if (draft.servings !== slot.servings) parts.push(`${draft.servings} servings`);
  if (draft.prepMinutes !== (slot.prepOverride ? slot.prepMinutes : null)) parts.push(draft.prepMinutes == null ? "recipe prep time" : `prep ${draft.prepMinutes} min`);
  if (draft.locked !== slot.locked) parts.push(draft.locked ? "lock" : "unlock");
  if (draft.note !== slot.note) parts.push(draft.note ? `note “${draft.note}”` : "clear note");
  return parts.join(", ");
}

function openEditor(slot) {
  const draft = state.draft.get(slot.date);
  state.editor = {
    date: slot.date,
    recipeUid: draft ? draft.recipeUid : slot.recipe?.uid ?? null,
    servings: draft?.servings ?? slot.servings ?? state.data.dashboard.diners,
    prepMinutes: draft ? draft.prepMinutes : slot.prepOverride ? slot.prepMinutes : null,
    locked: draft?.locked ?? slot.locked,
    note: draft?.note ?? slot.note ?? "",
    depProducer: "",
    depServings: state.data.dashboard.diners,
    depIngredient: "",
    ingredients: null,
  };
  loadEditorIngredients();
  render();
}

async function loadEditorIngredients() {
  const editor = state.editor;
  if (!editor?.recipeUid) return;
  try {
    const recipe = await recipeDetail(editor.recipeUid);
    if (state.editor === editor) {
      editor.ingredients = recipe.ingredients;
      render();
    }
  } catch {
    // The leftover picker stays hidden; the rest of the editor still works.
  }
}

function slotEditor(slot) {
  const editor = state.editor;
  const slots = slotMap();
  const producers = [...slots.values()].filter((other) => other.date < slot.date && (state.draft.get(other.date)?.recipeUid ?? (other.status === "accepted" ? other.recipe?.uid : null)));
  const update = (field, parse = (value) => value) => (event) => {
    editor[field] = parse(event.target.type === "checkbox" ? event.target.checked : event.target.value);
  };
  const intOrNull = (value) => (value === "" ? null : Number(value));
  return h("form", {
    class: "slot-editor",
    onSubmit: (event) => {
      event.preventDefault();
      addToDraft(slot);
    },
  },
  h("label", null, "Dinner",
    h("select", {
      onChange: (event) => {
        editor.recipeUid = event.target.value || null;
        editor.ingredients = null;
        editor.depIngredient = "";
        loadEditorIngredients();
        render();
      },
    },
    h("option", { value: "", selected: !editor.recipeUid }, "— No dinner (empty date) —"),
    state.recipes.map((recipe) => h("option", { value: recipe.uid, selected: editor.recipeUid === recipe.uid },
      `${recipe.name}${recipe.totalMinutes != null ? ` · ${minutes(recipe.totalMinutes)}` : ""}`)))),
  h("div", { class: "field-row" },
    h("label", null, "Servings", h("input", { type: "number", min: 1, max: 20, required: true, value: editor.servings, onInput: update("servings", Number) })),
    h("label", null, "Prep minutes", h("input", { type: "number", min: 0, max: 720, placeholder: "recipe default", value: editor.prepMinutes ?? "", onInput: update("prepMinutes", intOrNull) })),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: editor.locked, onChange: update("locked") }), "Lock (suggestions never change it)")),
  h("label", null, "Note", h("input", { type: "text", maxlength: 200, value: editor.note, onInput: update("note") })),
  editor.recipeUid && producers.length && editor.ingredients ? h("fieldset", { class: "leftover-picker" },
    h("legend", null, "Use leftovers from an earlier dinner (optional)"),
    h("div", { class: "field-row" },
      h("label", null, "From",
        h("select", { onChange: update("depProducer") },
          h("option", { value: "", selected: !editor.depProducer }, "— none —"),
          producers.map((other) => h("option", { value: other.date, selected: editor.depProducer === other.date },
            `${shortDay(other.date)} · ${recipeByUid(state.draft.get(other.date)?.recipeUid ?? other.recipe?.uid)?.name ?? ""}`)))),
      h("label", null, "Ingredient it replaces",
        h("select", { onChange: update("depIngredient") },
          h("option", { value: "", selected: !editor.depIngredient }, "— whole dish —"),
          [...new Map(editor.ingredients.map((line) => [line.ingredientKey, line])).values()].map((line) =>
            h("option", { value: line.ingredientKey, selected: editor.depIngredient === line.ingredientKey }, line.verbatim)))),
      h("label", null, "Servings", h("input", { type: "number", min: 1, max: 20, value: editor.depServings, onInput: update("depServings", Number) })))) : null,
  slot.consumes.length ? h("div", { class: "existing-deps" }, slot.consumes.map((dep) => {
    const removing = state.draftRemoveDeps.some((item) => item.producerDate === dep.producerDate && item.consumerDate === dep.consumerDate);
    return h("label", { class: "check" },
      h("input", {
        type: "checkbox",
        checked: removing,
        onChange: (event) => {
          state.draftRemoveDeps = state.draftRemoveDeps.filter((item) => !(item.producerDate === dep.producerDate && item.consumerDate === dep.consumerDate));
          if (event.target.checked) state.draftRemoveDeps.push({ producerDate: dep.producerDate, consumerDate: dep.consumerDate });
        },
      }),
      `Stop using leftovers from ${shortDay(dep.producerDate)}`);
  })) : null,
  h("div", { class: "actions" },
    h("button", { type: "submit", class: "primary-action" }, "Add to draft"),
    h("button", { type: "button", class: "secondary-action", onClick: () => { state.editor = null; render(); } }, "Cancel")));
}

function addToDraft(slot) {
  const editor = state.editor;
  if (!Number.isInteger(editor.servings) || editor.servings < 1 || editor.servings > 20) {
    state.message = { kind: "error", text: "Servings must be a whole number from 1 to 20." };
    return render();
  }
  const changed = editor.recipeUid !== (slot.recipe?.uid ?? null) || editor.servings !== slot.servings
    || editor.prepMinutes !== (slot.prepOverride ? slot.prepMinutes : null) || editor.locked !== slot.locked || editor.note !== slot.note;
  if (changed) {
    state.draft.set(slot.date, {
      recipeUid: editor.recipeUid,
      servings: editor.servings,
      prepMinutes: editor.prepMinutes,
      locked: editor.locked,
      note: editor.note.trim(),
      base: { recipeUid: slot.recipe?.uid ?? null, sequence: slot.sequence },
    });
  } else {
    state.draft.delete(slot.date);
  }
  state.draftDeps = state.draftDeps.filter((dep) => dep.consumerDate !== slot.date);
  if (editor.recipeUid && editor.depProducer) {
    state.draftDeps.push({
      producerDate: editor.depProducer,
      consumerDate: slot.date,
      servings: editor.depServings,
      ingredientKey: editor.depIngredient || null,
      base: { sequence: slot.sequence },
    });
    if (!state.draft.has(slot.date)) {
      state.draft.set(slot.date, { recipeUid: editor.recipeUid, servings: editor.servings, prepMinutes: editor.prepMinutes, locked: editor.locked, note: editor.note.trim(), base: { recipeUid: slot.recipe?.uid ?? null, sequence: slot.sequence } });
    }
  }
  state.editor = null;
  render();
}

function draftPanel() {
  if (!draftCount()) return null;
  const slots = slotMap();
  const dates = [...state.draft.keys()].sort();
  return h("section", { class: "draft-panel", "aria-label": "Unaccepted draft" },
    h("div", { class: "side-heading" }, h("h3", null, "Draft — not accepted yet"), h("span", null, plural(draftCount(), "change"))),
    h("p", null, "These choices exist only on this screen. Nothing changes on the calendar or the shopping list until you accept them."),
    h("ul", { class: "draft-list" },
      dates.map((date) => h("li", null, h("strong", null, formatDate(date)), " ", describeDraft(slots.get(date), state.draft.get(date)))),
      state.draftDeps.map((dep) => h("li", null, h("strong", null, formatDate(dep.consumerDate)), ` uses ${plural(dep.servings, "serving")}${dep.ingredientKey ? ` of ${dep.ingredientKey}` : ""} left over from ${shortDay(dep.producerDate)}`)),
      state.draftRemoveDeps.map((dep) => h("li", null, h("strong", null, formatDate(dep.consumerDate)), ` stops using leftovers from ${shortDay(dep.producerDate)}`))),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "primary-action", disabled: !canMutate(), onClick: acceptDraft }, `Accept ${plural(draftCount(), "change")}`),
      h("button", { type: "button", class: "secondary-action", onClick: () => { state.draft.clear(); state.draftDeps = []; state.draftRemoveDeps = []; render(); } }, "Discard draft")));
}

function acceptDraft() {
  const { dashboard } = state.data;
  const body = {
    accept: true,
    baseRevision: dashboard.revision,
    label: `Accepted ${[...state.draft.keys()].sort().map(shortDay).join(", ") || "leftover links"}`.slice(0, 120),
    slots: [...state.draft.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, entry]) => ({
      date,
      recipeUid: entry.recipeUid,
      servings: entry.servings,
      prepMinutes: entry.prepMinutes,
      locked: entry.locked,
      note: entry.note,
    })),
    dependencies: state.draftDeps.map(({ producerDate, consumerDate, servings, ingredientKey }) => ({ producerDate, consumerDate, servings, ...(ingredientKey ? { ingredientKey } : {}) })),
    removeDependencies: state.draftRemoveDeps,
  };
  mutate("Accept dinners", "POST", "/api/plan/accept", body, {
    onSuccess: (result) => {
      state.draft.clear();
      state.draftDeps = [];
      state.draftRemoveDeps = [];
      state.preview = null;
      if (result.warnings?.length) {
        state.message = { kind: "info", text: `Accepted. Check: ${result.warnings.map((warning) => `${shortDay(warning.date)} ${humanize(warning.problem)}`).join("; ")}.` };
      }
    },
  });
}

// --- Swap previews --------------------------------------------------------

async function requestPreview(date) {
  state.preview = null;
  state.previewStale = false;
  await mutate(`Suggest swaps for ${shortDay(date)}`, "POST", "/api/previews", { baseRevision: state.data.dashboard.revision, date }, {
    onSuccess: (preview) => {
      state.preview = preview;
      state.message = null;
    },
  });
}

function previewPanel() {
  const preview = state.preview;
  const expired = Date.parse(preview.expiresAt) <= Date.now();
  const stale = state.previewStale || expired || preview.baseRevision !== state.data.dashboard.revision;
  return h("section", { class: "attention-card preview-panel", "aria-label": "Swap suggestions" },
    h("div", { class: "side-heading" },
      h("h3", null, `Swap suggestions for ${formatDate(preview.targetDate)}`),
      h("button", { type: "button", class: "link-button", onClick: () => { state.preview = null; render(); } }, "Close")),
    h("p", null, `Currently ${preview.current.recipe?.name ?? "empty"}. A preview changes nothing; only “Commit this swap” does.`,
      ` Valid until ${timeFormat.format(new Date(preview.expiresAt))}.`),
    stale ? h("div", { class: "banner stale" }, expired ? "This preview expired." : "The plan changed since this preview.", " Commit is disabled — preview again.",
      h("button", { type: "button", class: "secondary-action", disabled: !state.online || state.busy, onClick: async () => { if (state.stale) await loadAll(); requestPreview(preview.targetDate); } }, "Preview again")) : null,
    preview.options.length ? h("ol", { class: "options" }, preview.options.map((option) => optionCard(preview, option, stale))) : h("p", { class: "notice" },
      "No replacement satisfies the household rules for this date.",
      Object.keys(preview.rejected ?? {}).length ? ` Rejected: ${Object.entries(preview.rejected).map(([reason, count]) => `${humanize(reason)} (${count})`).join(", ")}.` : null));
}

function optionCard(preview, option, stale) {
  const diff = option.shoppingDiff;
  const diffRows = [
    ...diff.added.map((item) => ["Add", item.ingredientKey, item.amountAfter]),
    ...diff.increased.map((item) => ["More", item.ingredientKey, `${item.amountBefore} → ${item.amountAfter}`]),
    ...diff.decreased.map((item) => ["Less", item.ingredientKey, `${item.amountBefore} → ${item.amountAfter}`]),
    ...diff.removed.map((item) => ["Remove", item.ingredientKey, item.amountBefore]),
  ];
  return h("li", { class: "option-card" },
    h("div", { class: "side-heading" }, h("strong", null, `Option ${option.rank}`), h("span", null, plural(option.changes.length, "dinner"))),
    h("ul", { class: "changes" }, option.changes.map((change, index) => h("li", null,
      h("span", { class: "eyebrow" }, `${formatDate(change.date)}${index ? " · dependent dinner" : ""}`),
      h("span", null, change.fromRecipeName ?? "Empty"), h("small", null, " → "), link(`/recipes/${encodeURIComponent(change.toRecipeUid)}`, null, change.toRecipeName)))),
    h("ul", { class: "reasons" }, option.reasons.map((reason) => h("li", null, reason))),
    option.droppedDependencies.length ? h("p", { class: "dependency broken" }, `Drops leftovers: ${option.droppedDependencies.map((dep) => `${shortDay(dep.producerDate)} → ${shortDay(dep.consumerDate)}`).join(", ")}`) : null,
    h("details", { class: "shopping-diff", open: true },
      h("summary", null, diffRows.length ? `Shopping list changes (${diffRows.length})` : "No shopping list changes"),
      diffRows.length ? h("table", null,
        h("tbody", null, diffRows.map(([kind, name, amount]) => h("tr", null, h("td", { class: `diff-kind ${kind.toLowerCase()}` }, kind), h("td", null, name), h("td", null, amount))))) : null),
    option.impactedDates.length > 1 ? h("p", { class: "slot-meta" }, `Affects ${option.impactedDates.map(shortDay).join(", ")}`) : null,
    h("button", {
      type: "button",
      class: "primary-action",
      disabled: stale || !canMutate(),
      onClick: () => mutate(`Swap ${option.changes.map((change) => `${shortDay(change.date)} to ${change.toRecipeName}`).join(", ")}`, "POST", "/api/commit",
        { baseRevision: preview.baseRevision, previewId: preview.previewId, optionId: option.optionId },
        { onSuccess: () => { state.preview = null; } }),
    }, "Commit this swap"));
}

function undoLatest(undo) {
  if (!window.confirm(`Undo “${undo.label}”? A new revision restores the dinners it changed; the calendar updates on its next refresh.`)) return;
  mutate(`Undo ${undo.label}`, "POST", "/api/undo", { baseRevision: state.data.dashboard.revision, revision: undo.revision }, {
    onSuccess: () => { state.preview = null; state.swapPreview = null; },
  });
}

// --- Dinner swaps (replace one ingredient or side) -------------------------

// Units the kitchen server understands, with the words shown to the owner.
const SWAP_UNITS = [
  ["each", "each"], ["lb", "lb"], ["oz", "oz"], ["g", "g"], ["kg", "kg"],
  ["cup", "cup"], ["tbsp", "tbsp"], ["tsp", "tsp"], ["floz", "fl oz"], ["ml", "ml"], ["l", "l"], ["pint", "pint"], ["quart", "quart"],
  ["bunch", "bunch"], ["head", "head"], ["bag", "bag"], ["package", "package"], ["box", "box"], ["can", "can"], ["jar", "jar"],
  ["clove", "clove"], ["stalk", "stalk"], ["slice", "slice"],
];
const UNIT_LABELS = Object.fromEntries(SWAP_UNITS);

function quantityText(quantity, unit) {
  if (quantity == null || quantity === "") return "as needed";
  const value = Number(quantity);
  const number = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (!unit || unit === "each") return number;
  return `${number} ${UNIT_LABELS[unit] ?? unit}`;
}

// Swaps accepted on a dinner: from the dashboard slot when the server puts
// them there, otherwise from GET /api/dinner-swaps for that date.
function slotSwaps(slot) {
  if (Array.isArray(slot.swaps)) return slot.swaps;
  return state.swaps.get(slot.date)?.swaps ?? [];
}

async function loadSwaps(dashboard) {
  const dates = dashboard.slots.filter((slot) => slot.status === "accepted" && !Array.isArray(slot.swaps)).map((slot) => slot.date);
  const results = await Promise.all(dates.map((date) => get(`/api/dinner-swaps?date=${encodeURIComponent(date)}`).catch(() => null)));
  if (state.data?.dashboard !== dashboard) return;
  const next = new Map();
  dates.forEach((date, index) => {
    if (results[index]?.revision === dashboard.revision) next.set(date, results[index]);
  });
  const shown = (map) => JSON.stringify([...map].map(([date, body]) => [date, body.swaps ?? []]).filter(([, swaps]) => swaps.length));
  const changed = shown(next) !== shown(state.swaps);
  state.swaps = next;
  // Only re-render when an accepted swap appeared or went away, so a field
  // being edited keeps its focus.
  if (changed) render();
}

function swapLines(slot) {
  const swaps = slotSwaps(slot);
  const undo = state.data.dashboard.undo;
  const undoable = state.lastSwap?.date === slot.date && undo?.undoable && undo.revision === state.lastSwap.revision;
  if (!swaps.length && !undoable) return null;
  return h("div", { class: "swap-lines" },
    swaps.map((swap) => h("p", { class: "swap-line" },
      h("span", { class: "eyebrow" }, "Swapped for this dinner"),
      h("span", null, h("s", null, swap.fromLabel), " → ", h("strong", null, swap.toLabel), swap.quantity != null ? ` · ${quantityText(swap.quantity, swap.unit)}` : null))),
    swaps.length ? h("p", { class: "slot-meta" }, "The recipe in the library is unchanged; the swap applies to this date only.") : null,
    undoable ? h("button", { type: "button", class: "secondary-action", disabled: !canMutate(), onClick: () => undoLatest(undo) }, "Undo this swap") : null);
}

function openSwapEditor(slot) {
  state.editor = null;
  state.swapPreview = null;
  state.swapPreviewStale = false;
  state.swapEditor = {
    date: slot.date,
    data: null,
    loading: true,
    error: null,
    mode: "source", // source = a line of the recipe, side = a separate side the owner types
    sourceId: "",
    sideLabel: "",
    sideQuantity: "",
    sideUnit: "lb",
    replacementKey: "",
    replacementLabel: "",
    labelEdited: false,
    quantity: "",
    unit: "lb",
    filter: "",
  };
  loadSwapEditor(state.swapEditor);
  render();
}

async function loadSwapEditor(editor) {
  editor.loading = true;
  try {
    const data = await get(`/api/dinner-swaps?date=${encodeURIComponent(editor.date)}`);
    if (state.swapEditor !== editor) return;
    editor.data = data;
    editor.error = null;
    if (editor.sourceId && !data.sources.some((source) => String(source.id) === editor.sourceId)) editor.sourceId = "";
    if (state.data && data.revision !== state.data.dashboard.revision) state.stale = true;
  } catch (error) {
    if (state.swapEditor !== editor) return;
    editor.error = error;
    if (error instanceof NetworkError) state.online = false;
  }
  editor.loading = false;
  render();
}

function closeSwapEditor() {
  state.swapEditor = null;
  state.swapPreview = null;
  state.swapPreviewStale = false;
  state.message = { kind: "info", text: "Swap cancelled. Nothing was changed." };
  render();
}

function swapEditor(slot) {
  const editor = state.swapEditor;
  const wrap = (...children) => h("form", {
    class: "swap-editor",
    "aria-label": `Replace an ingredient or side on ${formatDate(slot.date)}`,
    onSubmit: (event) => {
      event.preventDefault();
      previewSwap(slot);
    },
  }, h("div", { class: "side-heading" }, h("h3", null, `Replace an ingredient or side · ${formatDate(slot.date)}`)), ...children);
  if (!editor.data) {
    return wrap(
      editor.loading ? h("p", { class: "loading" }, "Loading this dinner's ingredients…") : null,
      editor.error ? h("p", { class: "notice" }, errorText(editor.error)) : null,
      h("div", { class: "actions" },
        editor.error ? h("button", { type: "button", class: "secondary-action", disabled: editor.loading, onClick: () => loadSwapEditor(editor) }, "Try again") : null,
        h("button", { type: "button", class: "secondary-action", onClick: closeSwapEditor }, "Cancel")));
  }
  const { sources, ingredients } = editor.data;
  const update = (field) => (event) => { editor[field] = event.target.value; };
  const unitSelect = (field, label) => {
    const current = editor[field];
    const units = UNIT_LABELS[current] || !current ? SWAP_UNITS : [[current, current], ...SWAP_UNITS];
    return h("label", null, label,
      h("select", { onChange: update(field) }, units.map(([value, text]) => h("option", { value, selected: current === value }, text))));
  };
  const chooseSource = (source) => {
    editor.mode = "source";
    editor.sourceId = String(source.id);
    if (editor.quantity === "" && source.quantity != null) {
      editor.quantity = String(source.quantity);
      if (source.unit) editor.unit = source.unit;
    }
    render();
  };
  const sorted = ingredients.slice().sort((a, b) => a.label.localeCompare(b.label));
  // Read editor.filter on every call: the search box narrows the list in place without a render.
  const matching = () => {
    const filter = editor.filter.trim().toLowerCase();
    return sorted.filter((item) => item.key === editor.replacementKey || !filter
      || item.label.toLowerCase().includes(filter) || item.key.toLowerCase().includes(filter));
  };
  const targetOptions = () => {
    const items = matching();
    return [
      h("option", { value: "", selected: !editor.replacementKey }, items.length ? "— choose an ingredient —" : "— no ingredient matches —"),
      items.map((item) => h("option", { value: item.key, selected: editor.replacementKey === item.key }, item.label)),
    ];
  };
  const targetSelect = h("select", {
    id: `swap-target-${slot.date}`,
    required: true,
    onChange: (event) => {
      const previousKey = editor.replacementKey;
      editor.replacementKey = event.target.value;
      const item = ingredients.find((entry) => entry.key === editor.replacementKey);
      // A custom name written for a different ingredient no longer describes this one.
      if (previousKey && previousKey !== editor.replacementKey) editor.labelEdited = false;
      if (!editor.labelEdited) editor.replacementLabel = item?.label ?? "";
      render();
    },
  }, targetOptions());
  const source = sources.find((entry) => String(entry.id) === editor.sourceId) ?? null;
  return wrap(
    h("p", { class: "slot-meta" }, "Choose what comes off this dinner and what goes on instead. Nothing changes until you preview the swap and press Apply."),
    h("fieldset", { class: "swap-from" },
      h("legend", null, "1. What to replace"),
      sources.length
        ? h("div", { class: "choice-list", role: "radiogroup", "aria-label": "Ingredient or side to replace" }, sources.map((entry) => h("label", { class: "choice" },
          h("input", { type: "radio", name: `swap-source-${slot.date}`, value: String(entry.id), checked: editor.mode === "source" && editor.sourceId === String(entry.id), onChange: () => chooseSource(entry) }),
          h("span", null, h("strong", null, entry.label), h("small", null, quantityText(entry.quantity, entry.unit))))))
        : h("p", { class: "slot-meta" }, "This dinner has no recipe lines that can be swapped."),
      h("label", { class: "choice" },
        h("input", { type: "radio", name: `swap-source-${slot.date}`, value: "side", checked: editor.mode === "side", onChange: () => { editor.mode = "side"; editor.sourceId = ""; render(); } }),
        h("span", null, h("strong", null, "A separate side not in the recipe"), h("small", null, "e.g. Brussels sprouts served alongside"))),
      editor.mode === "side" ? h("div", { class: "field-row" },
        h("label", null, "Side served now", h("input", { type: "text", maxlength: 80, required: true, placeholder: "Brussels sprouts", value: editor.sideLabel, onInput: update("sideLabel") })),
        h("label", null, "Amount", h("input", { type: "number", inputmode: "decimal", min: 0, step: "any", required: true, value: editor.sideQuantity, onInput: update("sideQuantity") })),
        unitSelect("sideUnit", "Unit")) : null,
      source ? h("p", { class: "slot-meta" }, `Original: ${source.label}, ${quantityText(source.quantity, source.unit)} — kept for restock, not thrown away.`) : null),
    h("fieldset", { class: "swap-to" },
      h("legend", null, "2. Replace with"),
      h("div", { class: "field-row" },
        h("label", null, "Find an ingredient",
          h("input", {
            type: "search",
            placeholder: "carrot",
            value: editor.filter,
            autocomplete: "off",
            onInput: (event) => {
              // Narrow the list in place so the search box keeps its focus.
              editor.filter = event.target.value;
              replace(targetSelect, targetOptions());
            },
          })),
        h("label", { for: `swap-target-${slot.date}` }, "Ingredient", targetSelect)),
      h("label", null, "Name on the dinner",
        h("input", {
          type: "text",
          maxlength: 80,
          required: true,
          placeholder: "Roast carrots",
          value: editor.replacementLabel,
          onInput: (event) => { editor.replacementLabel = event.target.value; editor.labelEdited = true; },
        })),
      h("div", { class: "field-row" },
        h("label", null, "Amount to cook", h("input", { type: "number", inputmode: "decimal", min: 0, step: "any", required: true, value: editor.quantity, onInput: update("quantity") })),
        unitSelect("unit", "Unit"))),
    h("div", { class: "actions" },
      h("button", { type: "submit", class: "primary-action", disabled: !canMutate() }, "Preview swap"),
      h("button", { type: "button", class: "secondary-action", onClick: closeSwapEditor }, "Cancel")));
}

function swapRequest(editor) {
  const quantity = Number(editor.quantity);
  const label = editor.replacementLabel.trim();
  if (!editor.replacementKey) return { error: "Choose the ingredient that replaces it." };
  if (!label) return { error: "Give the replacement a name, such as “Roast carrots”." };
  if (editor.quantity === "" || !Number.isFinite(quantity) || quantity <= 0) return { error: "Enter how much of the replacement to cook." };
  const body = {
    baseRevision: state.data.dashboard.revision,
    date: editor.date,
    replacementKey: editor.replacementKey,
    replacementLabel: label,
    quantity,
    unit: editor.unit,
  };
  if (editor.mode === "side") {
    const sideQuantity = Number(editor.sideQuantity);
    if (!editor.sideLabel.trim()) return { error: "Enter the side being replaced, such as “Brussels sprouts”." };
    if (editor.sideQuantity === "" || !Number.isFinite(sideQuantity) || sideQuantity <= 0) return { error: "Enter how much of that side you have." };
    return { body: { ...body, sourceId: null, side: { label: editor.sideLabel.trim(), quantity: sideQuantity, unit: editor.sideUnit } } };
  }
  if (!editor.sourceId) return { error: "Choose the ingredient or side to replace." };
  const source = editor.data.sources.find((entry) => String(entry.id) === editor.sourceId);
  return { body: { ...body, sourceId: source?.id ?? editor.sourceId } };
}

async function previewSwap(slot, request = null) {
  let body = request;
  if (!body) {
    const built = swapRequest(state.swapEditor);
    if (built.error) {
      state.message = { kind: "error", text: built.error };
      return render();
    }
    body = built.body;
  }
  body = { ...body, baseRevision: state.data.dashboard.revision };
  state.swapPreview = null;
  state.swapPreviewStale = false;
  await mutate(`Preview swap for ${shortDay(slot.date)}`, "POST", "/api/dinner-swaps/preview", body, {
    onSuccess: (preview) => {
      state.swapPreview = { ...preview, date: preview.date ?? slot.date, request: body };
      state.message = null;
    },
  });
}

function shoppingDiffDetails(diff) {
  const name = (item) => item.name ?? item.label ?? item.ingredientKey;
  const rows = [
    ...(diff?.added ?? []).map((item) => ["Add", name(item), item.amountAfter]),
    ...(diff?.increased ?? []).map((item) => ["More", name(item), `${item.amountBefore} → ${item.amountAfter}`]),
    ...(diff?.decreased ?? []).map((item) => ["Less", name(item), `${item.amountBefore} → ${item.amountAfter}`]),
    ...(diff?.removed ?? []).map((item) => ["Remove", name(item), item.amountBefore]),
  ];
  return h("details", { class: "shopping-diff", open: true },
    h("summary", null, rows.length ? `Shopping list changes (${rows.length})` : "No shopping list changes"),
    rows.length ? h("table", null,
      h("tbody", null, rows.map(([kind, item, amount]) => h("tr", null, h("td", { class: `diff-kind ${kind.toLowerCase()}` }, kind), h("td", null, item), h("td", null, amount))))) : null);
}

function swapPreviewPanel(slot) {
  const preview = state.swapPreview;
  const expired = preview.expiresAt ? Date.parse(preview.expiresAt) <= Date.now() : false;
  const stale = state.swapPreviewStale || expired || preview.baseRevision !== state.data.dashboard.revision;
  const restock = preview.restock;
  const label = `Swap ${preview.fromLabel} for ${preview.toLabel} on ${shortDay(preview.date)}`;
  return h("section", { class: "attention-card swap-preview", "aria-label": "Swap preview" },
    h("div", { class: "side-heading" },
      h("h3", null, "Preview — not applied yet"),
      h("button", { type: "button", class: "link-button", onClick: () => { state.swapPreview = null; state.swapPreviewStale = false; render(); } }, "Discard preview")),
    h("dl", { class: "swap-summary" },
      h("div", null, h("dt", null, "Dinner"), h("dd", null, `${formatDate(preview.date)}${slot.recipe ? ` · ${slot.recipe.name}` : ""}`)),
      h("div", null, h("dt", null, "Comes off"), h("dd", null, h("s", null, preview.fromLabel))),
      h("div", null, h("dt", null, "Goes on"), h("dd", null, h("strong", null, preview.toLabel),
        preview.request?.quantity != null ? ` · ${quantityText(preview.request.quantity, preview.request.unit)}` : null)),
      restock ? h("div", null, h("dt", null, "Kept for restock"), h("dd", null, `${restock.label} · ${restock.amount ?? quantityText(restock.quantity, restock.unit)}`)) : null),
    shoppingDiffDetails(preview.shoppingDiff),
    h("p", { class: "slot-meta" }, "This preview changed nothing. Apply accepts the swap once; the recipe in the library stays as it is, and Undo restores the dinner."),
    stale ? h("div", { class: "banner stale" }, expired ? "This preview expired." : "The plan changed since this preview.", " Apply is disabled — preview again.",
      h("button", {
        type: "button",
        class: "secondary-action",
        disabled: !state.online || state.busy,
        onClick: async () => { if (state.stale) await loadAll(); previewSwap(slot, preview.request); },
      }, "Preview again")) : null,
    h("div", { class: "actions" },
      h("button", {
        type: "button",
        class: "primary-action",
        disabled: stale || !canMutate(),
        onClick: () => mutate(label, "POST", "/api/dinner-swaps/apply", { baseRevision: preview.baseRevision, previewId: preview.previewId }, {
          onSuccess: (result) => {
            state.swapPreview = null;
            state.swapEditor = null;
            state.lastSwap = { date: preview.date, revision: result?.revision ?? null };
            state.message = { kind: "ok", text: `${label}: applied. The shopping list follows; use “Undo this swap” to put it back.` };
          },
        }),
      }, "Apply swap"),
      h("button", { type: "button", class: "secondary-action", onClick: closeSwapEditor }, "Cancel")));
}

// --- Three-day ingredient review -----------------------------------------

const STATUS_LABELS = { have: "Have", need: "Need", unavailable: "Unavailable", excluded: "Excluded", leftover: "Leftover" };

function reviewView() {
  const { review } = state.data;
  return h("div", null,
    sectionHeading("Ingredient check", "Next 3 days", "Mark what you have; the shopping list follows"),
    h("div", { class: "review-days" }, review.days.map(reviewDay)));
}

function reviewDay(day) {
  const recipe = day.slot?.recipe;
  if (day.status !== "accepted") {
    return h("section", { class: "meal-card empty" },
      h("span", { class: "eyebrow" }, `${formatDate(day.date)}${relativeDay(day.date) ? ` · ${relativeDay(day.date)}` : ""}`),
      h("h2", null, "No dinner accepted"),
      h("p", null, "There is nothing to check for this date. ", link("/#plan", null, "Choose a dinner on the plan.")));
  }
  const counts = day.counts;
  const ready = counts.need + counts.unavailable + counts.excluded === 0;
  return h("section", { class: "meal-card" },
    h("div", { class: "meal-heading" },
      h("div", null,
        h("span", { class: "eyebrow" }, `${formatDate(day.date)}${relativeDay(day.date) ? ` · ${relativeDay(day.date)}` : ""}`),
        h("h2", null, link(recipe.path, { class: "recipe-link" }, recipe.name)),
        h("p", null, `Dinner for ${day.slot.servings}${day.slot.locked ? " · locked" : ""}`),
        swapLines(day.slot)),
      h("span", { class: `readiness ${counts.unavailable || counts.excluded ? "risk" : ready ? "ready" : "need"}` },
        counts.unavailable || counts.excluded ? "At risk" : ready ? "Ready" : `${counts.need} to buy`)),
    h("p", { class: "slot-meta" }, [
      `${counts.have} have`, `${counts.need} need`, counts.unavailable ? `${counts.unavailable} unavailable` : null,
      counts.excluded ? `${counts.excluded} excluded` : null, counts.leftover ? `${counts.leftover} from leftovers` : null,
      counts.useSoon ? `${counts.useSoon} use soon` : null,
    ].filter(Boolean).join(" · ")),
    h("div", { class: "ingredient-list" }, day.lines.map((line) => ingredientRow(day, line))),
    (counts.unavailable || counts.excluded) && !day.slot.locked ? h("div", { class: "actions" },
      h("button", { type: "button", class: "primary-action", disabled: !canMutate(), onClick: async () => { await requestPreview(day.date); if (state.preview) navigate("/#plan"); } }, "Suggest replacements")) : null);
}

function ingredientRow(day, line) {
  const item = line.ingredientKey ? pantryItem(line.ingredientKey) : null;
  const detail = [line.amount, line.optional ? "optional" : null, line.partial ? "pantry amount falls short" : null, line.ambiguous ? "check the recipe wording" : null]
    .filter(Boolean).join(" · ");
  const controls = line.status === "leftover"
    ? h("span", { class: "state-button leftover" }, `Leftover from ${shortDay(line.leftoverFrom)}`)
    : line.status === "excluded"
      ? h("span", { class: "state-button excluded" }, "Excluded by household rule")
      : h("div", { class: "state-controls", role: "group", "aria-label": `${line.name} status` },
        ["have", "need", "unavailable"].map((status) => h("button", {
          type: "button",
          class: `state-button ${status}`,
          "aria-pressed": String(item?.status === status),
          disabled: !canMutate(),
          onClick: () => setPantry(line.ingredientKey, status, item),
        }, STATUS_LABELS[status])),
        h("button", {
          type: "button",
          class: `state-button soon${item?.useSoon ? " on" : ""}`,
          "aria-pressed": String(Boolean(item?.useSoon)),
          disabled: !canMutate() || !item || item.status !== "have",
          title: "Prefer recipes that use this soon",
          onClick: () => setPantry(line.ingredientKey, item.status, item, !item.useSoon),
        }, "Use soon"));
  return h("div", { class: `ingredient-row status-${line.status}` },
    h("div", null,
      h("strong", null, line.verbatim),
      h("span", null, `${STATUS_LABELS[line.status] ?? line.status}${item ? "" : line.status === "have" ? " (staple)" : ""} · ${detail}`)),
    controls);
}

function setPantry(key, status, item, useSoon = item?.useSoon ?? false) {
  const body = { status, rev: item?.rev ?? 0, useSoon: status === "have" ? useSoon : false };
  if (item?.quantity != null) {
    body.quantity = item.quantity;
    if (item.unit) body.unit = item.unit;
  }
  mutate(`${key}: ${STATUS_LABELS[status] ?? status}${useSoon && status === "have" ? " (use soon)" : ""}`, "PUT", `/api/pantry/${encodeURIComponent(key)}`, body);
}

// --- Shopping -------------------------------------------------------------

function shoppingView() {
  const { shopping } = state.data;
  const groups = new Map();
  for (const item of shopping.items) {
    const first = item.dates[0] ?? "";
    if (!groups.has(first)) groups.set(first, []);
    groups.get(first).push(item);
  }
  return h("div", null,
    sectionHeading("Generated from accepted dinners", "Shopping list", `For ${shopping.dates.map(shortDay).join(", ")}`),
    shareCard(),
    shopping.blocked.length ? h("section", { class: "attention-card" },
      h("h3", null, "Can't be bought"),
      h("ul", null, shopping.blocked.map((item) => h("li", null, `${shortDay(item.date)}: ${item.verbatim ?? item.ingredientKey} (${item.kind})`))),
      h("p", null, "Use “Suggest swaps” on the plan to replace these dinners.")) : null,
    shopping.items.length ? h("div", { class: "shopping-groups" }, [...groups.entries()].sort().map(([date, items]) => h("section", { class: "shopping-group" },
      h("h3", null, `First needed ${formatDate(date)}`),
      h("ul", null, items.map((item) => h("li", { class: item.checked ? "checked" : null },
        h("label", { class: "shopping-item-control" },
          h("input", {
            type: "checkbox",
            checked: item.checked,
            disabled: !canMutate(),
            onChange: (event) => mutate(`${item.name}: ${event.target.checked ? "bought" : "not bought"}`, "PUT", `/api/shopping/${encodeURIComponent(item.id)}`, { checked: event.target.checked, rev: item.rev }),
          }),
          h("span", null, h("strong", null, item.name), h("small", null, `${item.amount} · ${item.recipes.map((recipe) => recipe.name).join(", ")}`),
            restockText(item) ? h("small", { class: "restock-note" }, restockText(item)) : null)),
        h("span", { class: "needed-day" }, item.dates.map(shortDay).join(", "))))))))
      : extraRestocks().length ? null : h("div", { class: "large-empty" }, h("span", { "aria-hidden": "true" }, "✓"), h("h3", null, "Nothing to buy"),
        h("p", null, state.data.dashboard.slots.some((slot) => slot.status === "accepted") ? "The pantry covers the accepted dinners in this window." : "Accept dinners on the plan and their ingredients appear here.")),
    extraRestocks().length ? h("section", { class: "shopping-group restock-group" },
      h("h3", null, "Restock (kept from swapped dinners)"),
      h("ul", null, extraRestocks().map((restock) => h("li", null,
        h("span", { class: "shopping-item-control" }, h("span", null, h("strong", null, restock.label), h("small", null, restockAmount(restock)))))))) : null);
}

// --- Sharing the unchecked list --------------------------------------------
// Builds plain text from the loaded rows only; sharing never changes a check
// mark and never sends anything until the owner picks a destination.

function restockAmount(restock) {
  return restock.amount ?? quantityText(restock.quantity, restock.unit);
}

// A restock attached to a shopping row (item.restock), or a row that is
// itself a restock.
function restockText(item) {
  if (item.restock && typeof item.restock === "object") {
    const label = item.restock.label && item.restock.label !== item.name ? `${item.restock.label} ` : "";
    return `Restock: ${label}${restockAmount(item.restock)}`.trim();
  }
  return item.kind === "restock" || item.restock === true ? "Restock" : null;
}

// Restocks listed beside the items (shopping.restocks) that no unchecked or
// checked row already covers, so nothing is listed twice.
function extraRestocks() {
  const { shopping } = state.data;
  const covered = new Set();
  for (const item of shopping.items) {
    covered.add(String(item.ingredientKey ?? "").toLowerCase());
    covered.add(String(item.name ?? "").toLowerCase());
    if (item.restock?.label) covered.add(item.restock.label.toLowerCase());
  }
  const seen = new Set();
  return (Array.isArray(shopping.restocks) ? shopping.restocks : []).filter((restock) => {
    const key = String(restock.key ?? restock.ingredientKey ?? restock.label ?? "").toLowerCase();
    const label = String(restock.label ?? "").toLowerCase();
    if (!label || restock.checked || covered.has(key) || covered.has(label) || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

function shoppingShareText() {
  const { shopping } = state.data;
  const lines = [];
  // Rows are distinct by id: a dinner's need and a restock of the same
  // ingredient and amount are two things to buy, so both are listed.
  const seen = new Set();
  for (const item of shopping.items) {
    if (item.checked || seen.has(item.id)) continue;
    seen.add(item.id);
    const restock = restockText(item);
    lines.push(`- ${item.name}: ${item.amount}${restock ? ` (${restock.toLowerCase()})` : ""}`);
  }
  for (const restock of extraRestocks()) lines.push(`- ${restock.label}: ${restockAmount(restock)} (restock)`);
  if (!lines.length) return "";
  const dates = shopping.dates.length ? ` for ${shopping.dates.map(shortDay).join(", ")}` : "";
  return `Shopping list${dates}\n${lines.join("\n")}\n`;
}

const shareLocked = () => !state.online || state.stale;
const canShare = () => typeof navigator.share === "function" && window.isSecureContext;

// navigator.share must be called inside the tap itself, so nothing is awaited
// or rendered before it.
function shareShopping() {
  if (shareLocked()) return;
  const text = shoppingShareText();
  if (!text) {
    state.message = { kind: "info", text: "Nothing unchecked to share." };
    return render();
  }
  if (!canShare() || (navigator.canShare && !navigator.canShare({ text }))) return copyShopping();
  navigator.share({ text }).then(() => {
    state.message = { kind: "ok", text: "Shopping list handed to the app you picked. Check marks were not changed." };
    render();
  }, (error) => {
    if (error?.name === "AbortError") {
      state.message = { kind: "info", text: "Sharing cancelled. Nothing was sent." };
    } else {
      state.shareFallback = true;
      state.message = { kind: "info", text: "Sharing isn't available here — the list is shown below as text to select and copy." };
    }
    render();
  });
}

async function copyShopping() {
  if (shareLocked()) return;
  const text = shoppingShareText();
  if (!text) {
    state.message = { kind: "info", text: "Nothing unchecked to copy." };
    return render();
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    state.message = { kind: "ok", text: `Copied ${plural(text.trim().split("\n").length - 1, "item")}. Paste it into Notes or Messages.` };
  } catch {
    state.shareFallback = true;
    state.message = { kind: "info", text: "Copying isn't allowed here — select the list below and copy it manually." };
  }
  render();
}

function shareCard() {
  const text = shoppingShareText();
  const count = text ? text.trim().split("\n").length - 1 : 0;
  const locked = shareLocked();
  return h("section", { class: "share-card", "aria-label": "Share the unchecked shopping list" },
    h("div", { class: "share-actions" },
      h("button", { type: "button", class: "primary-action share-button", disabled: locked || !count, onClick: shareShopping },
        "Share unchecked list"),
      h("button", { type: "button", class: "secondary-action share-button", disabled: locked || !count, onClick: copyShopping }, "Copy list"),
      h("button", { type: "button", class: "link-button", "aria-expanded": String(state.shareFallback), disabled: !count, onClick: () => { state.shareFallback = !state.shareFallback; render(); } },
        state.shareFallback ? "Hide text" : "Show as text")),
    h("p", { class: "slot-meta" }, !count
      ? "Nothing unchecked to share — every item is bought or the list is empty."
      : locked
        ? "Reconnect or reload the plan first, so the list you send is the current one."
        : `${plural(count, "unchecked item")}, with amounts. You choose where it goes (Notes, Messages…); nothing is sent automatically and check marks don't change.${canShare() ? "" : " This browser can't open the share sheet, so Share copies the list instead."}`),
    state.shareFallback && count && !locked ? h("textarea", {
      class: "share-text",
      readonly: true,
      rows: Math.min(count + 2, 14),
      "aria-label": "Unchecked shopping list as text",
      onFocus: (event) => event.target.select(),
    }, text) : null);
}

// --- Recipes --------------------------------------------------------------

function recipesView() {
  return h("div", null,
    sectionHeading("Household library", "Recipes", `${state.recipes.length} recipes`),
    h("div", { class: "recipe-grid" }, state.recipes.map((recipe) => link(recipe.path, { class: "recipe-card" },
      h("h3", null, recipe.name),
      h("p", null, [minutes(recipe.totalMinutes), recipe.servings?.text, plural(recipe.ingredientCount, "ingredient")].filter(Boolean).join(" · ")),
      h("small", null, recipe.categories.filter((category) => category !== "Meal Plan").join(", "))))));
}

async function renderRecipePage(view) {
  const uid = state.route.uid;
  let recipe = state.recipeDetails.get(uid);
  if (!recipe) {
    replace(view, h("p", { class: "loading" }, "Loading recipe…"));
    try {
      recipe = await recipeDetail(uid);
    } catch (error) {
      if (state.route.uid !== uid) return;
      return replace(view, h("div", { class: "large-empty" }, h("h3", null, error.code === "recipe_not_found" ? "Recipe not found" : "The recipe could not be loaded"),
        h("p", null, error instanceof NetworkError ? "Recipes are read from the kitchen server and aren't stored on this device." : errorText(error)),
        link("/#recipes", { class: "secondary-action" }, "All recipes")));
    }
    if (state.route.uid !== uid) return;
  }
  document.title = `${recipe.name} · Kitchen Plan`;
  const planned = state.data.dashboard.slots.filter((slot) => slot.recipe?.uid === recipe.uid);
  const sections = new Map();
  for (const line of recipe.ingredients) {
    const key = line.section ?? "";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(line);
  }
  const sourceUrl = /^https?:\/\//i.test(recipe.sourceUrl ?? "") ? recipe.sourceUrl : null;
  replace(view, h("article", { class: "recipe-page" },
    h("div", { class: "section-heading" },
      h("div", null, h("span", { class: "eyebrow" }, recipe.categories.filter((category) => category !== "Meal Plan").join(" · ") || "Recipe"), h("h2", null, recipe.name)),
      link("/#recipes", { class: "secondary-action" }, "All recipes")),
    recipe.description ? h("p", { class: "recipe-description" }, recipe.description) : null,
    h("dl", { class: "recipe-facts" },
      fact("Makes", recipe.servings?.text),
      fact("Prep", recipe.prepText || minutes(recipe.prepMinutes)),
      fact("Cook", recipe.cookText || minutes(recipe.cookMinutes)),
      fact("Total", recipe.totalText || minutes(recipe.totalMinutes))),
    planned.length ? h("p", { class: "dependency" }, `Planned for ${planned.map((slot) => `${formatDate(slot.date)} (${slot.servings} servings)`).join(", ")}`) : null,
    h("div", { class: "recipe-body" },
      h("section", { class: "recipe-ingredients" },
        h("h3", null, "Ingredients"),
        [...sections.entries()].map(([section, lines]) => h("div", null,
          section ? h("h4", null, section) : null,
          h("table", null, h("tbody", null, lines.map((line) => h("tr", { class: line.optional ? "optional" : null },
            h("td", { class: "amount" }, line.amount),
            h("td", null, line.verbatim, line.optional ? h("small", null, " (optional)") : null)))))))),
      h("section", { class: "recipe-directions" },
        h("h3", null, "Instructions"),
        textBlocks(recipe.directions, true),
        recipe.notes ? h("div", { class: "recipe-notes" }, h("h3", null, "Notes"), textBlocks(recipe.notes, false)) : null)),
    recipe.source || sourceUrl ? h("p", { class: "slot-meta" }, "Source: ", sourceUrl ? h("a", { href: sourceUrl, rel: "noopener noreferrer", target: "_blank" }, recipe.source || sourceUrl) : recipe.source) : null));
}

function fact(label, value) {
  return value ? h("div", null, h("dt", null, label), h("dd", null, value)) : null;
}

function textBlocks(text, numbered) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return h("p", { class: "slot-meta" }, "No instructions recorded.");
  if (numbered && lines.every((line) => /^\d+[.)]\s/.test(line))) {
    return h("ol", { class: "directions" }, lines.map((line) => h("li", null, line.replace(/^\d+[.)]\s+/, ""))));
  }
  return lines.map((line) => {
    const heading = line.match(/^__(.+)__$/);
    if (heading) return h("h4", null, heading[1]);
    if (/^[-*]\s/.test(line)) return h("p", { class: "bullet" }, `• ${line.replace(/^[-*]\s+/, "")}`);
    return h("p", null, line);
  });
}

// --- Household ------------------------------------------------------------

function constraintsToForm(constraints) {
  return {
    diners: constraints.diners,
    dietaryExclusions: constraints.dietaryExclusions.join(", "),
    excludedCategories: constraints.excludedCategories.join(", "),
    maxPrep: constraints.workload.default.maxPrepMinutes ?? "",
    maxTotal: constraints.workload.default.maxTotalMinutes ?? "",
    byWeekday: Object.fromEntries(WEEKDAYS.map((day) => [day, {
      maxPrep: constraints.workload.byWeekday[day]?.maxPrepMinutes ?? "",
      maxTotal: constraints.workload.byWeekday[day]?.maxTotalMinutes ?? "",
    }])),
    shoppingDays: constraints.shoppingDays,
  };
}

function formToConstraints(form) {
  const list = (value) => String(value).split(",").map((item) => item.trim()).filter(Boolean);
  const int = (value) => (value === "" || value == null ? null : Number(value));
  const byWeekday = {};
  for (const day of WEEKDAYS) {
    const row = form.byWeekday[day];
    if (row.maxPrep !== "" || row.maxTotal !== "") byWeekday[day] = { maxPrepMinutes: int(row.maxPrep), maxTotalMinutes: int(row.maxTotal) };
  }
  return {
    diners: Number(form.diners),
    dietaryExclusions: list(form.dietaryExclusions),
    excludedCategories: list(form.excludedCategories),
    workload: { default: { maxPrepMinutes: int(form.maxPrep), maxTotalMinutes: int(form.maxTotal) }, byWeekday },
    shoppingDays: Number(form.shoppingDays),
  };
}

function householdView() {
  const form = state.constraintsForm;
  const bind = (target, field) => (event) => { target[field] = event.target.value; };
  const categories = [...new Set(state.recipes.flatMap((recipe) => recipe.categories))].sort();
  return h("div", { class: "household" },
    sectionHeading("Shared by every device", "Household", null),
    h("form", {
      class: "side-card constraints-form",
      onSubmit: (event) => {
        event.preventDefault();
        mutate("Household rules", "PUT", "/api/constraints", { baseRevision: state.data.dashboard.revision, constraints: formToConstraints(form) });
      },
    },
    h("h3", null, "Planning rules"),
    h("p", { class: "slot-meta" }, "Used when suggesting swaps. Accepted dinners are never changed by editing these."),
    h("div", { class: "field-row" },
      h("label", null, "Adults eating", h("input", { type: "number", min: 1, max: 12, required: true, value: form.diners, onInput: bind(form, "diners") })),
      h("label", null, "Shopping window (days)", h("input", { type: "number", min: 1, max: 14, required: true, value: form.shoppingDays, onInput: bind(form, "shoppingDays") }))),
    h("label", null, "Never use these ingredients (comma-separated)", h("input", { type: "text", value: form.dietaryExclusions, onInput: bind(form, "dietaryExclusions") })),
    h("label", null, "Skip recipes in these categories", h("input", { type: "text", list: "category-options", value: form.excludedCategories, onInput: bind(form, "excludedCategories") })),
    h("datalist", { id: "category-options" }, categories.map((category) => h("option", { value: category }))),
    h("fieldset", null,
      h("legend", null, "Weeknight workload limits (minutes, blank = no limit)"),
      h("table", { class: "workload" },
        h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Max prep"), h("th", null, "Max total"))),
        h("tbody", null,
          h("tr", null, h("th", null, "Every day"),
            h("td", null, h("input", { type: "number", min: 0, max: 720, value: form.maxPrep, onInput: bind(form, "maxPrep"), "aria-label": "Default max prep minutes" })),
            h("td", null, h("input", { type: "number", min: 0, max: 1440, value: form.maxTotal, onInput: bind(form, "maxTotal"), "aria-label": "Default max total minutes" }))),
          WEEKDAYS.map((day) => h("tr", null, h("th", null, WEEKDAY_NAMES[day]),
            h("td", null, h("input", { type: "number", min: 0, max: 720, value: form.byWeekday[day].maxPrep, onInput: bind(form.byWeekday[day], "maxPrep"), "aria-label": `${WEEKDAY_NAMES[day]} max prep minutes` })),
            h("td", null, h("input", { type: "number", min: 0, max: 1440, value: form.byWeekday[day].maxTotal, onInput: bind(form.byWeekday[day], "maxTotal"), "aria-label": `${WEEKDAY_NAMES[day]} max total minutes` }))))))),
    h("div", { class: "actions" },
      h("button", { type: "submit", class: "primary-action", disabled: !canMutate() }, "Save rules"),
      h("button", { type: "button", class: "secondary-action", onClick: () => { state.constraintsForm = constraintsToForm(state.data.constraints.constraints); render(); } }, "Reset"))),
    pantryCard(),
    subscriptionCard(),
    changesCard());
}

function pantryCard() {
  const items = state.data.pantry.items.slice().sort((a, b) => a.name.localeCompare(b.name));
  return h("section", { class: "side-card" },
    h("div", { class: "side-heading" }, h("h3", null, "Pantry notes"), h("span", null, plural(items.length, "item"))),
    items.length ? h("ul", { class: "shopping-list" }, items.map((item) => h("li", null,
      h("span", null, h("strong", null, item.name), h("small", null, [STATUS_LABELS[item.status], item.quantity != null ? `${item.quantity} ${item.unit ?? ""}`.trim() : null, item.useSoon ? "use soon" : null].filter(Boolean).join(" · "))),
      h("button", { type: "button", class: "link-button", disabled: !canMutate(), onClick: () => mutate(`${item.name}: cleared`, "PUT", `/api/pantry/${encodeURIComponent(item.ingredientKey)}`, { status: "clear", rev: item.rev }) }, "Clear"))))
      : h("p", { class: "slot-meta" }, "Nothing recorded. Mark ingredients in “Next 3 days”."));
}

function subscriptionCard() {
  const sub = state.subscription;
  return h("section", { class: "side-card subscription" },
    h("h3", null, "Calendar subscription"),
    h("p", { class: "slot-meta" }, "The private address Proton Calendar subscribes to. Anyone holding it can read the accepted dinner names, so it is shown only when you ask, kept only on this screen, and never stored on this device."),
    sub?.url ? h("div", { class: "subscription-url" },
      h("input", { type: "text", readonly: true, value: sub.url, "aria-label": "Calendar subscription URL", onFocus: (event) => event.target.select() }),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "primary-action", onClick: copySubscription }, "Copy"),
        h("button", { type: "button", class: "secondary-action", onClick: () => { state.subscription = null; render(); } }, "Hide")))
      : sub ? h("p", { class: "notice" }, sub.reason)
        : h("button", { type: "button", class: "secondary-action", disabled: !state.online || state.busy, onClick: revealSubscription }, "Show subscription URL"));
}

async function revealSubscription() {
  try {
    const { data } = await api("/owner/subscription", { method: "POST", body: {} });
    state.subscription = data;
  } catch (error) {
    state.message = { kind: "error", text: errorText(error) };
  }
  render();
}

async function copySubscription() {
  const url = state.subscription?.url;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    state.message = { kind: "ok", text: "Subscription URL copied. Paste it into Proton Calendar → Add calendar → From URL." };
  } catch {
    state.message = { kind: "info", text: "Copying isn't allowed here — select the address and copy it manually." };
  }
  render();
}

function changesCard() {
  const changes = state.data.changes.changes;
  return h("section", { class: "side-card" },
    h("h3", null, "Recent changes"),
    changes.length ? h("ul", { class: "shopping-list" }, changes.map((change) => h("li", null,
      h("span", null, h("strong", null, change.label), h("small", null, `Revision ${change.revision} · ${change.kind}${change.undoneBy ? " · undone" : ""} · ${new Date(change.createdAt).toLocaleString()}`)))))
      : h("p", { class: "slot-meta" }, "No changes yet."));
}

// --- Start ----------------------------------------------------------------

window.addEventListener("popstate", () => { state.route = readRoute(); render(); });
window.addEventListener("hashchange", () => { state.route = readRoute(); render(); });
window.addEventListener("online", () => { state.online = true; loadAll({ quiet: true }); });
window.addEventListener("offline", () => { state.online = false; render(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForChanges(); });
setInterval(checkForChanges, POLL_MS);

if ("serviceWorker" in navigator) {
  // A new deploy installs a new worker that takes over at once; offer a
  // reload instead of forcing one, so an open draft or preview is not lost.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    state.shellUpdated = true;
    render();
  });
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") registration.update().catch(() => undefined); }))
    .catch(() => undefined);
}

state.route = readRoute();
loadAll();
