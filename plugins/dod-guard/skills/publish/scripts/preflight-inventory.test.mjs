import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRejected, CLIENTS, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";
import { registrationCases } from "./harness/preflight-registrations.mjs";
import { registryFor } from "./harness/preflight-registry.mjs";

function validRun(fixture, status) {
  const registry = registryFor(fixture.client, fixture.pluginRoot);
  return runPreflight(fixture, registry, { pins: ["--inventory-status", status] });
}

test("tolerates a non-zero inventory status for one valid registration", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const result = validRun(fixture, "1");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.response.ok, true);
    assert.equal(result.response.inventoryStatus, 1);
  }
});

test("inventory status 0 behaves as before", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const result = validRun(fixture, "0");

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.response.ok, true);
    assert.equal(result.response.inventoryStatus, 0);
  }
});

test("non-zero inventory status still rejects bad registrations and names the status", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    for (const item of registrationCases(client, fixture.pluginRoot)) {
      const result = runPreflight(fixture, item.registry, { pins: ["--inventory-status", "3"] });
      assertRejected(result, /Inventory command exited with status 3;/, `${client}: ${item.name}`);
      assert.equal(result.response.observed.inventoryStatus, 3, `${client}: ${item.name}`);
    }
  }
});

test("non-zero inventory status rejects empty and malformed stdout", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = JSON.stringify(registryFor(client, fixture.pluginRoot));
    for (const rawInput of ["", "{", `warning: bad marketplace\n${registry}`]) {
      const result = runPreflight(fixture, null, { pins: ["--inventory-status", "3"], rawInput });
      assertRejected(result, /Inventory command exited with status 3;.*(missing or malformed)/, client);
    }
  }
});

test("rejects a non-integer inventory status", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const result = runPreflight(fixture, registryFor(client, fixture.pluginRoot), {
      pins: ["--inventory-status", "abc"],
    });
    assertRejected(result, /inventory-status/i);
  }
});
