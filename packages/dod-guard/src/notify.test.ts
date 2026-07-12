import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { before, describe, it, mock } from "node:test";

// ⚠ mock.module MUST run BEFORE notify.ts import (ESM caching).
// Dynamic import() in `before` hooks ensures mock registration comes first.

// Deferred import — resolved after mock.module registration.
let _notify: typeof import("./notify.js") | null = null;

async function getNotify(): Promise<typeof import("./notify.js")> {
  if (_notify) return _notify;
  mock.module("node:child_process", {
    namedExports: {
      spawn: (_cmd: string, _args: string[], _opts?: any) => {
        // playJingle fires and forgets — spawn behavior irrelevant for tests
        const cp = new EventEmitter() as EventEmitter & { stdout: EventEmitter; unref: () => void };
        cp.stdout = new EventEmitter();
        cp.unref = () => {};
        return cp;
      },
    },
  });
  _notify = await import("./notify.js");
  return _notify;
}

// ---------------------------------------------------------------------------
// playJingle
// ---------------------------------------------------------------------------

describe("playJingle", () => {
  let playJingle: typeof import("./notify.js").playJingle;

  before(async () => {
    const notify = await getNotify();
    playJingle = notify.playJingle;
  });

  it("is a callable function", () => {
    assert.equal(typeof playJingle, "function", "playJingle should be a function");
  });

  it("does not throw on any platform (fire-and-forget)", () => {
    assert.doesNotThrow(() => playJingle(), "playJingle should never throw");
  });

  it("does not throw when called with unexpected arguments", () => {
    assert.doesNotThrow(
      () => (playJingle as any)(null, undefined, 42, "extra", { key: "val" }),
      "playJingle should ignore unexpected args",
    );
  });

  it("does not throw when called multiple times in rapid sequence", () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < 20; i++) playJingle();
    }, "multiple rapid playJingle calls should not throw");
  });

  it("returns undefined (void function)", () => {
    assert.equal(playJingle(), undefined, "playJingle should return undefined");
    assert.equal(playJingle(), undefined, "playJingle should consistently return undefined");
  });

  it("has the expected function name", () => {
    assert.equal(playJingle.name, "playJingle", "function name should match export");
  });
});
