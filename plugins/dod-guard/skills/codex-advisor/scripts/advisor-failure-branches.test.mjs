import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import { makeRoot, spawnFor, WORKDIR_PREFIX, watchWorkdir } from "./fixtures/fake-spawn.mjs";
import { runAdvisor } from "./run-advisor.mjs";

// Characterization tests for runAdvisor's failure branches. Each one that reaches the
// reviewer asserts the work directory existed during the run and is gone afterwards.

async function advise(root, extra = {}) {
  return runAdvisor({ executable: "fake-codex", prompt: "Problem", tempRoot: root, ...extra });
}

function assertWorkdirRemoved(watcher) {
  assert.equal(watcher.seen.length, 1);
  assert.ok(watcher.seen[0].startsWith(WORKDIR_PREFIX));
}

test("preflight output limit stops before any reviewer spawn", async (t) => {
  const root = await makeRoot(t);
  const { calls, spawnImpl } = spawnFor({
    version: (child) => {
      child.stdout.emit("data", "x".repeat(8 * 1024 * 1024 + 1));
      child.emit("close", 0, null);
    },
  });
  const result = await advise(root, { spawnImpl });
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Codex advisor version capability probe exceeded 8388608 bytes");
  assert.equal(result.execution.status, "incomplete");
  assert.equal(result.execution.stage, "version");
  assert.equal(calls.length, 1);
});

test("reviewer start error is reported at reviewer-launch", async (t) => {
  const root = await makeRoot(t);
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor(
    {
      exec: (child) => {
        child.emit("error", new Error("boom"));
        child.emit("close", null, null);
      },
    },
    watcher.hook,
  );
  const result = await advise(root, { spawnImpl });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Codex advisor executable is missing or cannot start (boom)");
  assert.equal(result.execution.stage, "reviewer-launch");
  assert.equal(result.execution.startError, "boom");
  assert.equal(result.execution.status, "incomplete");
});

test("reviewer stdin error is reported at reviewer-launch", async (t) => {
  const root = await makeRoot(t);
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor(
    {
      exec: (child) => {
        child.stdin.emit("error", Object.assign(new Error("pipe broke"), { code: "EIO" }));
        child.emit("close", 0, null);
      },
    },
    watcher.hook,
  );
  const result = await advise(root, { spawnImpl });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Codex advisor prompt could not be written (pipe broke)");
  assert.equal(result.execution.stage, "reviewer-launch");
  assert.equal(result.execution.stdinError, "pipe broke");
});

test("reviewer cancelled by the operator is reported at reviewer-process", async (t) => {
  const root = await makeRoot(t);
  const controller = new AbortController();
  const watcher = watchWorkdir(root);
  const { spawnImpl } = spawnFor({ exec: (child) => child.emit("close", null, "SIGTERM") }, (kind) => {
    watcher.hook(kind);
    if (kind === "exec") controller.abort();
  });
  const result = await advise(root, { signal: controller.signal, spawnImpl });
  assertWorkdirRemoved(watcher);
  assert.deepEqual(await readdir(root), []);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Codex advisor cancelled by operator");
  assert.equal(result.execution.stage, "reviewer-process");
  assert.equal(result.execution.signal, "SIGTERM");
  assert.equal(result.execution.status, "incomplete");
});
