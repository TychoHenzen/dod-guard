import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { makeRoot, spawnFor } from "./fixtures/fake-spawn.mjs";
import { runAdvisor } from "./run-advisor.mjs";

// Characterization tests for failures before the reviewer starts. A throw from launcher
// resolution or argument building happens before mkdtemp, so there is no work directory
// to clean up and these tests assert the throw's origin and that nothing was spawned.

test("temp directory that cannot be created fails at launcher-contract", async (t) => {
  const root = await makeRoot(t);
  await writeFile(join(root, "not-a-directory"), "");
  const { calls, spawnImpl } = spawnFor();
  const result = await runAdvisor({
    executable: "fake-codex",
    prompt: "Problem",
    tempRoot: join(root, "not-a-directory"),
    spawnImpl,
  });
  assert.deepEqual(await readdir(root), ["not-a-directory"]);
  assert.equal(result.ok, false);
  assert.match(result.error, /^Codex advisor could not start: /);
  assert.equal(result.execution.stage, "launcher-contract");
  assert.equal(result.execution.status, "incomplete");
  assert.equal(calls.length, 0);
});

test("a throw inside resolveCodexExecutable escapes as a rejection", async (t) => {
  const root = await makeRoot(t);
  const { calls, spawnImpl } = spawnFor();
  // Both PATH spellings are undefined, so resolveCodexExecutable falls through to
  // splitting undefined on any host.
  const env = { PATH: undefined, Path: undefined };
  await assert.rejects(
    runAdvisor({ env, platform: "win32", prompt: "Problem", tempRoot: root, spawnImpl }),
    (error) => error instanceof TypeError && /split/.test(error.message) && /codex-launch-contract/.test(error.stack),
  );
  assert.equal(calls.length, 0);
});

test("a throw inside attemptedExecArgs escapes as a rejection", async (t) => {
  const root = await makeRoot(t);
  const { calls, spawnImpl } = spawnFor();
  const prefixArgs = new Proxy([], {
    get(target, key, receiver) {
      if (key === Symbol.iterator) throw new Error("prefix boom");
      return Reflect.get(target, key, receiver);
    },
  });
  await assert.rejects(
    runAdvisor({ executable: "fake-codex", prefixArgs, prompt: "Problem", tempRoot: root, spawnImpl }),
    (error) => /prefix boom/.test(error.message) && /attemptedExecArgs/.test(error.stack),
  );
  assert.equal(calls.length, 0);
});
