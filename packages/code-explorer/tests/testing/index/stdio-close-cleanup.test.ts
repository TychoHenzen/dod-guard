import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";
import { it } from "node:test";
import { createNativeProjectRoot } from "../../../src/semantic/api/public-api.js";
import { createFilteredWorkspace } from "../../../src/semantic/workspace/filtered-workspace.js";
import type { OwnedResources } from "../../../src/semantic/workspace/owned-resources.js";
import { installStdioCloseTriggers } from "../../../src/stdio-lifecycle.js";
import { FakeTimers } from "../freshness/workspace-freshness/fake-timers.js";
import {
  removeTemporaryTree,
  waitForPidExit,
  waitForPidFile,
} from "./index-test-fake-backend.js";
import {
  type FakeBackendFixture,
  fakeBackendFixture,
  isolatedRegistry,
  recordingCloser,
  spawnKeepaliveBackend,
  waitForExit,
} from "./stdio-close-test-support.js";

/** A real filtered workspace and a live fake backend, owned by `resources`. */
async function startOwnedBackend(
  fixture: FakeBackendFixture,
  resources: OwnedResources,
): Promise<{ serviceRoot: string; pid: number }> {
  const filtered = createFilteredWorkspace(
    createNativeProjectRoot(fixture.project),
    resources,
  );
  spawnKeepaliveBackend(fixture, resources);
  const pid = await waitForPidFile(fixture.pidFile);
  return { serviceRoot: dirname(filtered.root.canonicalPath), pid };
}

it("stdin EOF terminates a real dummy backend child and removes the owned root", async () => {
  const fixture = fakeBackendFixture("code-explorer-stdio-close-");
  const resources = isolatedRegistry();
  try {
    const { serviceRoot, pid } = await startOwnedBackend(fixture, resources);
    const { closer, exits, errors } = recordingCloser(resources);
    const stdin = new PassThrough();
    installStdioCloseTriggers({
      signals: new EventEmitter(),
      stdin,
      close: closer.close,
    });
    stdin.end();
    stdin.resume();
    await waitForExit(exits);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(errors, []);
    assert.equal(existsSync(serviceRoot), false);
    assert.equal(await waitForPidExit(pid), true);
  } finally {
    resources.seal();
    await removeTemporaryTree(fixture.temporary);
  }
});

it("a close that overruns 1500 ms force-kills the real backend child, removes the owned root, and exits 1", async () => {
  const fixture = fakeBackendFixture("code-explorer-stdio-overrun-");
  const resources = isolatedRegistry();
  const timers = new FakeTimers();
  try {
    const { serviceRoot, pid } = await startOwnedBackend(fixture, resources);
    const { closer, exits, errors } = recordingCloser(resources, {
      closeCore: () => new Promise<void>(() => undefined),
      setTimer: timers.set,
      clearTimer: timers.clear,
    });
    closer.close("stdin_end");
    assert.deepEqual(exits, []);
    timers.fire(1500);
    assert.deepEqual(exits, [1]);
    assert.equal(errors.length, 1);
    assert.match(
      errors[0] ?? "",
      /exceeded 1500 ms; backends were force-killed/,
    );
    assert.equal(existsSync(serviceRoot), false);
    assert.equal(await waitForPidExit(pid), true);
  } finally {
    resources.seal();
    await removeTemporaryTree(fixture.temporary);
  }
});
