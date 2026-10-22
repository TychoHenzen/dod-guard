import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import process from "node:process";
import { test } from "node:test";
import { createRealHelperFixture } from "./harness/real-helper-fixture.mjs";
import { runReleaseVerification } from "./harness/release-harness.mjs";

test("a non-zero codex inventory is judged by the real preflight helper", {
  skip: process.platform !== "win32",
}, async (t) => {
  const fixture = await createRealHelperFixture(t);

  const tolerated = runReleaseVerification("codex-inventory-nonzero", fixture);
  assert.equal(tolerated.Success, true, tolerated.Error);
  assert.equal(tolerated.Stage, "complete");
  assert.equal(tolerated.Commands["codex-inventory"].ExitCode, 1);
  assert.equal(tolerated.Commands["codex-inventory"].StderrPresent, true);
  assert.equal(tolerated.Clients.codex.InventoryStatus, 1);
  assert.equal(tolerated.Clients.codex.PluginIdentity.pluginId, "dod-guard@dod-guard-monorepo");

  for (const failureStage of ["codex-inventory-nonzero-missing", "codex-inventory-nonzero-malformed"]) {
    const rejected = runReleaseVerification(failureStage, fixture);
    assert.equal(rejected.Success, false, failureStage);
    assert.equal(rejected.Stage, "codex-preflight", failureStage);
    assert.match(rejected.Error, /codex-preflight failed with exit code 1/, failureStage);
    assert.equal(rejected.Commands["codex-inventory"].ExitCode, 1, failureStage);
  }
});

test("release verification checks the registered root even when the loaded root is older", {
  skip: process.platform !== "win32",
}, async (t) => {
  const fixture = await createRealHelperFixture(t);

  const outcome = runReleaseVerification("", fixture);
  assert.equal(outcome.Success, true, outcome.Error);
  // The helper resolves roots with fs.promises.realpath, which expands 8.3 short names such as
  // RUNNER~1 like the native resolver does; the JS realpathSync does not, so compare native forms.
  for (const client of ["codex", "claude"]) {
    assert.equal(outcome.Clients[client].Version, "5.4.56", client);
    assert.equal(
      outcome.Clients[client].PluginRoot.toLowerCase(),
      realpathSync.native(fixture.root).toLowerCase(),
      client,
    );
    assert.match(outcome.Clients[client].SkillPath, /registered[\\/]skills[\\/]publish[\\/]SKILL\.md$/i, client);
  }
});
