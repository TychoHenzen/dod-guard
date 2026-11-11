// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The tests look for the merge state file.
import { existsSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The tests address the merge state file.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { startTriage } from "./conflict-triage.mjs";
import { BRANCH, sh, stopOf, textScenario } from "./conflict-triage.test-support.mjs";

test("stops base_stale when the pull request base is behind the fetched default branch tip", () => {
  const scenario = textScenario();
  try {
    const staleBase = sh(scenario.work, ["merge-base", BRANCH, "master"]);
    assert.notEqual(staleBase, scenario.baseSha);
    const pullRequest = { ...scenario.pullRequest, baseSha: staleBase };
    const stop = stopOf(() => startTriage(scenario.git, { ...scenario.input, pullRequest }));
    assert.equal(stop.code, "base_stale");
    assert.equal(stop.details.expected, scenario.baseSha);
    assert.equal(stop.details.observed, staleBase);
    assert.match(stop.details.decisionNeeded, /gh pr edit <number> --base master/u);
    assert.equal(existsSync(join(scenario.work, ".git", "MERGE_HEAD")), false);
    assert.equal(sh(scenario.work, ["status", "--porcelain"]), "");
  } finally {
    scenario.cleanup();
  }
});

test("stops default_tip_unknown when the clone holds no origin tracking ref for the default branch", () => {
  const scenario = textScenario();
  try {
    sh(scenario.work, ["update-ref", "-d", "refs/remotes/origin/master"]);
    const stop = stopOf(() => startTriage(scenario.git, scenario.input));
    assert.equal(stop.code, "default_tip_unknown");
    assert.equal(stop.details.expected, "origin/master");
    assert.equal(existsSync(join(scenario.work, ".git", "MERGE_HEAD")), false);
  } finally {
    scenario.cleanup();
  }
});

test("starts the merge when the pull request base equals the fetched default branch tip", () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    assert.equal(started.recordedBase, scenario.baseSha);
    assert.equal(existsSync(join(scenario.work, ".git", "MERGE_HEAD")), true);
  } finally {
    scenario.cleanup();
  }
});
