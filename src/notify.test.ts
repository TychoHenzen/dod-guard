import { describe, it, mock, before, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// ⚠ mock.module MUST run BEFORE notify.ts import (ESM caching).
// Dynamic import() in `before` hooks ensures mock registration comes first.

// ---------------------------------------------------------------------------
// Mutable spawn fixture
// ---------------------------------------------------------------------------

type SpawnFn = (cmd: string, args: string[], opts?: any) => any;

let spawnBehavior: SpawnFn | null = null;
const spawnCalls: Array<{ cmd: string; args: string[]; opts: any }> = [];

function fakeProcess(config: {
  stdoutChunks?: string[];
  error?: Error;
  closeCode?: number;
}): EventEmitter & { stdout: EventEmitter; unref: () => void } {
  const cp = new EventEmitter() as EventEmitter & { stdout: EventEmitter; unref: () => void };
  cp.stdout = new EventEmitter();
  cp.unref = () => {};

  if (config.error) {
    setTimeout(() => cp.emit("error", config.error), 1);
  } else {
    setTimeout(() => {
      if (config.stdoutChunks) {
        for (const chunk of config.stdoutChunks) {
          cp.stdout.emit("data", Buffer.from(chunk));
        }
      }
      setTimeout(() => cp.emit("close", config.closeCode ?? 0), 1);
    }, 1);
  }

  return cp;
}

function noopDefault() {
  return fakeProcess({});
}

function reset() {
  spawnBehavior = null;
  spawnCalls.length = 0;
}

// Deferred import — resolved after mock.module registration.
let _notify: typeof import("./notify.js") | null = null;

async function getNotify(): Promise<typeof import("./notify.js")> {
  if (_notify) return _notify;
  mock.module("node:child_process", {
    namedExports: {
      spawn: (cmd: string, args: string[], opts?: any) => {
        spawnCalls.push({ cmd, args, opts });
        return (spawnBehavior ?? noopDefault)(cmd, args, opts);
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

// ---------------------------------------------------------------------------
// showVerifyDialog
// ---------------------------------------------------------------------------

describe("showVerifyDialog", () => {
  let showVerifyDialog: typeof import("./notify.js").showVerifyDialog;

  before(async () => {
    const notify = await getNotify();
    showVerifyDialog = notify.showVerifyDialog;
  });

  // ── structural contract ──────────────────────────────────────────────

  describe("structural contract", () => {
    it("is a callable function", () => {
      assert.equal(typeof showVerifyDialog, "function",
        "showVerifyDialog should be a function");
    });

    it("has arity 2 accepting (title, body)", () => {
      assert.equal(showVerifyDialog.length, 2,
        "showVerifyDialog should accept 2 parameters");
    });

    it("has the expected function name", () => {
      assert.equal(showVerifyDialog.name, "showVerifyDialog",
        "function name should match export");
    });

    it("toString reveals the function source (not a stub)", () => {
      const src = showVerifyDialog.toString();
      assert.ok(src.includes("showVerifyDialog"),
        "toString should contain function name 'showVerifyDialog'");
      assert.ok(src.length > 200,
        `function source should be substantial, got ${src.length} chars`);
      assert.ok(src.includes("DODG_MSG"),
        "source should reference DODG_MSG env var");
      assert.ok(src.includes("isWindows"),
        "source should reference isWindows platform check");
      assert.ok(src.includes("spawn"),
        "source should reference child_process spawn");
    });

    it("returns a Promise instance", () => {
      spawnBehavior = () => fakeProcess({ stdoutChunks: ['{"result":"yes"}'] });
      const result = showVerifyDialog("Test", "Body");
      assert.ok(result instanceof Promise,
        "showVerifyDialog should return a Promise");
      assert.equal(typeof result.then, "function",
        "returned Promise should have .then method");
      reset();
    });
  });

  // ── input edge cases ─────────────────────────────────────────────────

  describe("input edge cases", () => {
    it("does not throw with empty title and body", () => {
      assert.doesNotThrow(() => showVerifyDialog("", ""), "empty strings");
      const r = showVerifyDialog("", "");
      assert.ok(r instanceof Promise, "empty inputs should return a Promise");
    });

    it("does not throw with very long title and body", () => {
      const long = "x".repeat(10000);
      assert.doesNotThrow(() => showVerifyDialog(long, long), "long strings");
      const r = showVerifyDialog(long, long);
      assert.ok(r instanceof Promise, "long inputs should return a Promise");
    });

    it("does not throw with unicode and special characters", () => {
      const u = "こんにちは 世界 — emoji: 🚀✅❌ — '\"` \\";
      assert.doesNotThrow(() => showVerifyDialog(u, u), "unicode");
    });

    it("does not throw with single-character inputs", () => {
      assert.doesNotThrow(() => showVerifyDialog("T", "B"), "chars");
    });

    it("does not throw with non-string inputs (coercion-safe)", () => {
      assert.doesNotThrow(() => (showVerifyDialog as any)(undefined, undefined), "undefined");
      assert.doesNotThrow(() => (showVerifyDialog as any)(null, null), "null");
      assert.doesNotThrow(() => (showVerifyDialog as any)(42, true), "non-string");
    });
  });

  // ── Promise intrinsics ───────────────────────────────────────────────

  describe("Promise intrinsics", () => {
    it("returned value is a native Promise", () => {
      const p = showVerifyDialog("T", "B");
      assert.equal(p.constructor, Promise,
        "returned value must be a native Promise, got: " + p.constructor.name);
    });

    it("two separate calls return independent Promise instances", () => {
      const p1 = showVerifyDialog("A", "B");
      const p2 = showVerifyDialog("C", "D");
      assert.notEqual(p1, p2, "each call should return a distinct Promise");
    });
  });

  // ── resolution paths (controlled spawn output) ───────────────────────

  describe("resolution paths", () => {
    beforeEach(() => { reset(); });

    it("resolves to {result:'no'} when spawn throws synchronously", async () => {
      spawnBehavior = () => { throw new Error("ENOENT"); };
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no" }, "sync spawn failure → no");
    });

    it("resolves to {result:'no'} when child process emits error", async () => {
      spawnBehavior = () => fakeProcess({ error: new Error("spawn ENOENT") });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no" }, "error event → no");
    });

    it('resolves to {result:"yes", note:"..."} with yes verdict and note', async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"yes","note":"looks good"}'] });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "yes", note: "looks good" },
        "yes + note carries through");
    });

    it('resolves to {result:"yes"} with yes verdict, empty note', async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"yes","note":""}'] });
      const r = await showVerifyDialog("T", "B");
      assert.equal(r.result, "yes", "verdict should be yes");
      assert.strictEqual(r.note, undefined,
        "empty note string should produce undefined note property");
    });

    it('resolves to {result:"no"} with no verdict', async () => {
      spawnBehavior = () => fakeProcess({ stdoutChunks: ['{"result":"no"}'] });
      const r = await showVerifyDialog("T", "B");
      assert.equal(r.result, "no", "verdict should be no");
      assert.strictEqual(r.note, undefined,
        "missing note field should produce undefined");
    });

    it('resolves to {result:"no", note:"..."} when result absent but note present', async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"note":"missing result"}'] });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no", note: "missing result" },
        "missing result defaults to no, note preserved");
    });

    it("resolves to {result:'no'} when output is not valid JSON", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ["garbage output"] });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no" }, "invalid json → no");
    });

    it("resolves to {result:'no'} when stdout is empty", async () => {
      spawnBehavior = () => fakeProcess({ stdoutChunks: [] });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no" }, "empty stdout → no");
    });

    it("resolves to {result:'no'} when child exits non-zero", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: [], closeCode: 1 });
      const r = await showVerifyDialog("T", "B");
      assert.deepEqual(r, { result: "no" }, "non-zero exit → no");
    });

    it("strips whitespace-only notes", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"no","note":"   "}'] });
      const r = await showVerifyDialog("T", "B");
      assert.equal(r.result, "no", "result should be no");
      assert.strictEqual(r.note, undefined,
        "whitespace-only note → undefined");
    });

    it("passes title and body as env vars in spawn options", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"yes"}'] });
      await showVerifyDialog("Proof #3", "Did this pass?");
      assert.equal(spawnCalls.length, 1,
        "spawn should be called exactly once");
      const call = spawnCalls[0];
      assert.equal(call.opts.env.DODG_TITLE, "Proof #3",
        "DODG_TITLE env var = title param");
      assert.equal(call.opts.env.DODG_MSG, "Did this pass?",
        "DODG_MSG env var = body param");
    });

    it("passes Windows-specific spawn flags", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"yes"}'] });
      await showVerifyDialog("T", "B");
      assert.equal(spawnCalls.length, 1,
        "spawn should be called exactly once");
      const call = spawnCalls[0];
      assert.equal(call.opts.windowsHide, true, "windowsHide=true");
      assert.deepEqual(call.opts.stdio, ["ignore", "pipe", "ignore"],
        "stdio=[ignore, pipe, ignore]");
    });

    it("spawn is called exactly once per showVerifyDialog call", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"yes"}'] });
      await showVerifyDialog("T", "B");
      assert.equal(spawnCalls.length, 1,
        "spawn should be called exactly once");
    });

    it("ignores extra json keys, respects only result and note", async () => {
      spawnBehavior = () =>
        fakeProcess({ stdoutChunks: ['{"result":"no","extra":"unused","note":"test"}'] });
      const r = await showVerifyDialog("Title", "Body");
      assert.deepEqual(r, { result: "no", note: "test" },
        "extra json keys ignored");
    });
  });
});
