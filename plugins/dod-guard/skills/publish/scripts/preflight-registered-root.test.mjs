import assert from "node:assert/strict";
import { realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { assertRejected, MANIFEST_DIRECTORY } from "./harness/preflight-fixture.mjs";
import {
  createReleaseFixture,
  LOADED_VERSION,
  RELEASED_VERSION,
  registeredRegistry,
  runRegistered,
} from "./harness/registered-root-fixture.mjs";

test("post-release mode verifies the registered root, not the loaded one", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const result = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.response.ok, true);
    assert.equal(result.response.version, RELEASED_VERSION);
    assert.equal(result.response.pluginRoot, await realpath(fixture.registeredRoot));
    assert.equal(result.response.skillPath, await realpath(join(fixture.registeredRoot, "skills/publish/SKILL.md")));
    assert.equal(result.response.requested.registeredRoot, true);
  }
});

test("without the option the loaded root is still judged against the registration", async (t) => {
  const claude = await createReleaseFixture(t, "claude");
  const mismatch = runRegistered(claude, registeredRegistry("claude", claude.registeredRoot), []);
  assertRejected(mismatch, /loaded publish skill is not from the registered dod-guard installation/, "claude");

  const codex = await createReleaseFixture(t, "codex");
  const stale = runRegistered(codex, registeredRegistry("codex", codex.registeredRoot), []);
  assertRejected(stale, /manifest name or version disagrees with the registration/, "codex");
});

test("post-release mode fails closed on a missing or contradictory registered root", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const manifest = join(fixture.registeredRoot, MANIFEST_DIRECTORY[client], "plugin.json");
    const skill = join(fixture.registeredRoot, "skills/publish/SKILL.md");

    const missing = registeredRegistry(client, join(fixture.parent, "absent"));
    assertRejected(runRegistered(fixture, missing), /registered plugin path is unavailable/, `${client} missing root`);

    await writeFile(manifest, JSON.stringify({ name: "dod-guard", version: LOADED_VERSION }));
    const stale = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));
    assertRejected(stale, /manifest name or version disagrees/, `${client} stale manifest`);

    await writeFile(manifest, JSON.stringify({ name: "other", version: RELEASED_VERSION }));
    const renamed = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));
    assertRejected(renamed, /manifest name or version disagrees/, `${client} wrong name`);

    await writeFile(manifest, JSON.stringify({ name: "dod-guard", version: RELEASED_VERSION }));
    await rm(skill);
    const noSkill = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));
    assertRejected(noSkill, /missing its publish skill/, `${client} missing skill`);
  }
});
