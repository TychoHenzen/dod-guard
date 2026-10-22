import assert from "node:assert/strict";
import { test } from "node:test";
import { registrationCases } from "./harness/preflight-registrations.mjs";
import { CLIENTS, assertRejected, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";

test("rejects absent, ambiguous, disabled, wrong-marketplace, and wrong-path registrations", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    for (const item of registrationCases(client, fixture.pluginRoot)) {
      const result = runPreflight(fixture, item.registry);
      assertRejected(result, item.reason, `${client}: ${item.name}`);
      if (item.expectedPluginId) {
        assert.equal(result.response.observed.expectedIdentity.pluginId, item.expectedPluginId);
      }
    }
  }
});
