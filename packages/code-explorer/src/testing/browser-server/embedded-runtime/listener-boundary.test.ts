import assert from "node:assert/strict";
import test from "node:test";
import {
  pageRequest,
  sessionRequest,
  statusRequest,
} from "./request-fixture.js";
import { runtimeFixture } from "./runtime-fixture.js";

test(
  "serves the package browser and navigation API through " +
    "an existing listener boundary",
  async () => {
    const fixture = await runtimeFixture();
    try {
      const page = await pageRequest(fixture.runtime);
      assert.equal(page.status, 200);
      assert.match(page.body, /src="client\.js"/);
      const created = await sessionRequest(fixture.runtime);
      const browserSession = JSON.parse(created.body).data.browser_session_id;
      const status = await statusRequest(fixture.runtime, browserSession);
      assert.equal(status.status, 200);
      assert.deepEqual(
        fixture.calls.map(([name]) => name),
        ["code_status", "code_status"],
      );
    } finally {
      await fixture.close();
    }
    assert.equal(fixture.closed(), 1);
  },
);
