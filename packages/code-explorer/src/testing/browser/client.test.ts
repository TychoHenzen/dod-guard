import assert from "node:assert/strict";
import { test } from "node:test";
import { installClientFixture } from "./client-fixture.test.js";

test("reports the browser server state in the application root", async (context) => {
  const fixture = installClientFixture();
  context.after(fixture.restore);

  const modulePath = `../../browser/client.js?test=${Date.now()}`;
  await import(modulePath);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.match(fixture.root.innerHTML, /Focused source/);
  assert.equal(fixture.attributes.get("data-state"), "ready");
  assert.deepEqual(
    fixture.requests.map(({ path }) => path),
    ["api/session", "api/status", "api/search"],
  );
  assert.deepEqual(fixture.requests[1]?.options.headers, {
    "content-type": "application/json",
    "x-code-explorer-session": "browser-session",
    "x-code-explorer-tab": "tab-id",
  });
});

test("keeps an inaccessible project root in an unavailable local state", async (context) => {
  const fixture = installClientFixture({ rootAccess: "project_root_inaccessible" });
  context.after(fixture.restore);

  await import(`../../browser/client.js?root-access=${Date.now()}`);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.match(fixture.root.innerHTML, /project_root_inaccessible/);
  assert.equal(fixture.attributes.get("data-state"), "unavailable");
});
