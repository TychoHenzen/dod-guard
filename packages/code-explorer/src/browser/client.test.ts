import assert from "node:assert/strict";
import { test } from "node:test";
import { installClientFixture } from "./client-test-fixture.js";

test("reports the browser server state in the application root", async (context) => {
  const fixture = installClientFixture();
  context.after(fixture.restore);

  const modulePath = `./client.js?test=${Date.now()}`;
  await import(modulePath);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.match(fixture.root.innerHTML, /Focused source/);
  assert.equal(fixture.attributes.get("data-state"), "ready");
  assert.deepEqual(
    fixture.requests.map(({ path }) => path),
    ["/api/session", "/api/status", "/api/search"],
  );
  assert.deepEqual(fixture.requests[1]?.options.headers, {
    "content-type": "application/json",
    "x-code-explorer-session": "browser-session",
    "x-code-explorer-tab": "tab-id",
  });
});
