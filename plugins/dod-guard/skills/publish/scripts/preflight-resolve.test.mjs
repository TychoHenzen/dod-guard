import assert from "node:assert/strict";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { CLIENTS, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";
import { registryFor } from "./harness/preflight-registry.mjs";

const IDENTITY_KEY = { codex: "pluginId", claude: "id" };
const IDENTITY_VALUE = { codex: "dod-guard@dod-guard-monorepo", claude: "dod-guard@dod-guard" };

test("resolves and pins the exact Codex and Claude installations", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const unpinned = runPreflight(fixture, registry);

    assert.equal(unpinned.status, 0, unpinned.stderr);
    assert.equal(unpinned.response.ok, true);
    assert.equal(unpinned.response.client, client);
    assert.equal(unpinned.response.version, "5.4.56");
    assert.equal(unpinned.response.pluginRoot, await realpath(fixture.pluginRoot));
    assert.equal(unpinned.response.skillPath, await realpath(fixture.skillFile));
    assert.deepEqual(unpinned.response.pluginIdentity, unpinned.response.identity);
    assert.equal(unpinned.response.pluginIdentity[IDENTITY_KEY[client]], IDENTITY_VALUE[client]);

    const pinned = runPreflight(fixture, registry, {
      pins: ["--version", "5.4.56", "--skill-path", fixture.skillFile],
    });
    assert.equal(pinned.status, 0, pinned.stderr);
    assert.equal(pinned.response.requested.version, "5.4.56");
    assert.equal(pinned.response.requested.path, fixture.skillFile);
  }
});

test("accepts one leading BOM for Codex and Claude registry JSON", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const plain = runPreflight(fixture, registry);
    const prefixed = runPreflight(fixture, registry, { rawInput: `\uFEFF${JSON.stringify(registry)}` });

    assert.equal(prefixed.status, 0, prefixed.stderr);
    assert.deepEqual(prefixed.response, plain.response);
  }
});

test("accepts a registry saved as marked UTF-16 for Codex and Claude", async (t) => {
  for (const client of CLIENTS) {
    const fixture = await createInstall(t, client);
    const registry = registryFor(client, fixture.pluginRoot);
    const plain = runPreflight(fixture, registry);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(registry), "utf16le")]);
    const marked = runPreflight(fixture, registry, { rawInput: utf16 });

    assert.equal(marked.status, 0, marked.stderr);
    assert.deepEqual(marked.response, plain.response);
  }
});

test("Codex accepts a marketplace source path separate from the loaded plugin root", async (t) => {
  const fixture = await createInstall(t, "codex");
  const marketplaceRoot = join(fixture.pluginRoot, "..", "marketplace");
  await mkdir(marketplaceRoot);

  const result = runPreflight(fixture, registryFor("codex", marketplaceRoot));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.version, "5.4.56");
  assert.equal(result.response.pluginRoot, await realpath(fixture.pluginRoot));
  assert.equal(result.response.skillPath, await realpath(fixture.skillFile));
});
