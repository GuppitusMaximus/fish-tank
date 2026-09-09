import assert from "node:assert/strict";
import test from "node:test";

async function request(pathname = "/", accept = "text/html") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Kitchen Plan experience", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Kitchen Plan<\/title>/i);
  assert.match(html, /Next 3 days/);
  assert.match(html, /Beef Tacos &amp; Black Beans/);
  assert.match(html, /Shopping list/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("publishes a valid calendar feed scaffold", async () => {
  const response = await request("/calendar/kitchen-plan.ics", "text/calendar");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/calendar\b/i);

  const body = await response.text();
  assert.match(body, /^BEGIN:VCALENDAR\r?$/m);
  assert.equal((body.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(body, /UID:kitchen-plan-0@homelab/);
  assert.match(body, /END:VCALENDAR/);
});
