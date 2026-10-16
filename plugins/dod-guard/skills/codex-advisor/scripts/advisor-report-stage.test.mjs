import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import { fakeReviewerExec, makeRoot, spawnFor, WORKDIR_PREFIX, watchWorkdir } from "./fixtures/fake-spawn.mjs";
import { runAdvisor } from "./run-advisor.mjs";

// Characterization tests for runAdvisor after the reviewer exits cleanly: response parsing and success.

async function advise(root, extra = {}) {
  return runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, ...extra });
}

function assertWorkdirRemoved(watcher) {
  assert.equal(watcher.seen.length, 1);
  assert.ok(watcher.seen[0].startsWith(WORKDIR_PREFIX));
}

test("response parser throw is reported at reviewer-report", async (t) => {
  const root = await makeRoot(t);
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor({ exec: fakeReviewerExec }, watcher.hook);
  const parseResponse = () => {
    throw new Error("bad parser");
  };
  const result = await advise(root, { spawnImpl, parseResponse });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Codex advisor output could not be parsed (bad parser)");
  assert.equal(result.execution.stage, "reviewer-report");
});

test("response parser that returns nothing is reported by the outer catch at launcher-contract", async (t) => {
  const root = await makeRoot(t);
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor({ exec: fakeReviewerExec }, watcher.hook);
  const result = await advise(root, { spawnImpl, parseResponse: () => undefined });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.match(result.error, /^Codex advisor could not start: .*error/);
  assert.equal(result.execution.stage, "launcher-contract");
});

test("fake reviewer success", async (t) => {
  const root = await makeRoot(t);
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor({ exec: fakeReviewerExec }, watcher.hook);
  const result = await advise(root, { spawnImpl });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, true);
  assert.equal(result.advice, "x");
  assert.equal(result.execution.status, "completed");
  assert.deepEqual(Object.keys(result.capability.probes).sort(), ["help", "version"]);
});
