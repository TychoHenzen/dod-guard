import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { assertRejected, CLIENTS, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";
import { registryFor } from "./harness/preflight-registry.mjs";

test("reports stale pins and malformed inventories without changing the installation", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const manifestBefore = await readFile(fixture.manifestPath, "utf8");
    const skillBefore = await readFile(fixture.skillFile, "utf8");

    const staleVersion = runPreflight(fixture, registry, { pins: ["--version", "5.4.55"] });
    assertRejected(staleVersion, /requested version does not exactly match/);
    assert.equal(staleVersion.response.requested.version, "5.4.55");
    assert.equal(staleVersion.response.observed.registry, "parsed");

    const stalePath = runPreflight(fixture, registry, {
      pins: ["--skill-path", resolve(fixture.pluginRoot, "old", "skills", "publish", "SKILL.md")],
    });
    assertRejected(stalePath, /requested path must exactly match/);
    assert.match(stalePath.response.observed.skillPath, /skills[\\/]publish[\\/]SKILL\.md$/i);

    const malformed = runPreflight(fixture, null, { rawInput: "{" });
    assertRejected(malformed, /Registry input is missing or malformed/);
    assert.equal(malformed.response.observed.registry, "unavailable");
    assert.equal(malformed.response.observed.pluginIdentity, "unavailable");
    assertRejected(runPreflight(fixture, null, { rawInput: "\uFEFF{" }), /Registry input is missing or malformed/);
    assertRejected(runPreflight(fixture, null, { rawInput: "{}" }), /expected .* plugin list/);
    assert.equal(await readFile(fixture.manifestPath, "utf8"), manifestBefore);
    assert.equal(await readFile(fixture.skillFile, "utf8"), skillBefore);
  }
});
