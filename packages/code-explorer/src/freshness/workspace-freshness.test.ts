import assert from "node:assert/strict";
import { it } from "node:test";
import { chokidarWatchOptions, type ReconcileResult, WorkspaceFreshness } from "./workspace-freshness.js";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
}

function manifest(entries: Record<string, string>): ReconcileResult {
  return { manifest: new Map(Object.entries(entries)) };
}

class FakeWatcher {
  all: (() => void) | undefined;
  error: (() => void) | undefined;
  on(event: "all" | "error", listener: (...args: unknown[]) => void): this {
    if (event === "all") this.all = listener as () => void;
    else this.error = listener as () => void;
    return this;
  }
  async close(): Promise<void> {}
}

class FakeTimers {
  entries: Array<{ delay: number; callback: () => void }> = [];
  set = (callback: () => void, delay: number): number => {
    this.entries.push({ delay, callback });
    return this.entries.length;
  };
  clear = (): void => {};
  fire(delay: number): void {
    const entry = this.entries.find((item) => item.delay === delay);
    if (!entry) throw new Error(`timer:${delay}`);
    this.entries = this.entries.filter((item) => item !== entry);
    entry.callback();
  }
}

function fixture(results: Array<ReconcileResult | Promise<ReconcileResult>>, watcher = new FakeWatcher()) {
  const timers = new FakeTimers();
  const freshness = new WorkspaceFreshness({
    reconcile: async () => {
      const result = results.shift();
      if (!result) throw new Error("missing_fixture_reconciliation");
      return await result;
    },
    createWatcher: () => watcher,
    setTimeout: timers.set,
    clearTimeout: timers.clear,
  });
  return { freshness, watcher, timers };
}

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Existing symbol is renamed on disk
it("publishes a changed final manifest for a saved rename", async () => {
  const { freshness, watcher, timers } = fixture([
    manifest({ "src/old.ts": "one" }),
    manifest({ "src/new.ts": "two" }),
  ]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(freshness.status(), {
    current_generation: 2,
    pending_generation: null,
    state: "ready",
    mode: "watching",
  });
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Source file is deleted
it("publishes deletion only from the final manifest", async () => {
  const { freshness, watcher, timers } = fixture([manifest({ "src/removed.ts": "one" }), manifest({})]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(freshness.status().current_generation, 2);
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Backend is still processing a change
it("reports the prior revision and a pending revision while reconciliation runs", async () => {
  const next = deferred<ReconcileResult>();
  const { freshness, watcher, timers } = fixture([manifest({ "src/a.ts": "one" }), next.promise]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  assert.deepEqual(freshness.status(), {
    current_generation: 1,
    pending_generation: 2,
    state: "refreshing",
    mode: "watching",
  });
  next.resolve(manifest({ "src/a.ts": "two" }));
  await Promise.resolve();
  await Promise.resolve();
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Editor saves by atomic replacement
it("treats an atomic replacement as a changed final path", async () => {
  const { freshness, watcher, timers } = fixture([manifest({ "src/a.ts": "old" }), manifest({ "src/a.ts": "new" })]);
  await freshness.start();
  watcher.all?.();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(freshness.status().current_generation, 2);
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Watcher reports overflow
it("marks the refresh state until an overflow reconciliation completes", async () => {
  const next = deferred<ReconcileResult>();
  const { freshness, watcher, timers } = fixture([manifest({ "src/a.ts": "one" }), next.promise]);
  await freshness.start();
  watcher.error?.();
  timers.fire(100);
  await Promise.resolve();
  assert.equal(freshness.status().state, "refreshing");
  next.resolve(manifest({ "src/a.ts": "two" }));
  await Promise.resolve();
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Filesystem watching is unavailable
it("falls back to five-second polling after watcher startup fails", async () => {
  const timers = new FakeTimers();
  const freshness = new WorkspaceFreshness({
    reconcile: async () => manifest({ "src/a.ts": "one" }),
    createWatcher: () => {
      throw new Error("unavailable");
    },
    setTimeout: timers.set,
    clearTimeout: timers.clear,
  });
  await freshness.start(1);
  assert.equal(freshness.status().mode, "polling");
  assert.ok(timers.entries.some(({ delay }) => delay === 5_000));
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Reconciliation loses read permission
it("keeps the prior generation when reconciliation cannot read a supported path", async () => {
  const { freshness, watcher, timers } = fixture([manifest({ "src/a.ts": "one" }), { cause: "freshness_unavailable" }]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(freshness.status(), {
    current_generation: 1,
    pending_generation: null,
    state: "degraded",
    mode: "watching",
    degraded_cause: "freshness_unavailable",
  });
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Watcher silently misses a change
it("reconciles an active session manifest every thirty seconds", async () => {
  const { freshness, timers } = fixture([manifest({ "src/a.ts": "one" }), manifest({ "src/a.ts": "two" })]);
  await freshness.start(1);
  timers.fire(30_000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(freshness.status().current_generation, 2);
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Events are duplicated or reordered
it("coalesces duplicate and reordered events into one reconciliation", async () => {
  let reconciliations = 0;
  const watcher = new FakeWatcher();
  const timers = new FakeTimers();
  const freshness = new WorkspaceFreshness({
    reconcile: async () => {
      reconciliations += 1;
      return manifest({ "src/a.ts": String(reconciliations) });
    },
    createWatcher: () => watcher,
    setTimeout: timers.set,
    clearTimeout: timers.clear,
  });
  await freshness.start();
  watcher.all?.();
  watcher.all?.();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reconciliations, 2);
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: File remains incomplete
it("degrades without publishing when stable sampling reports an incomplete write", async () => {
  const { freshness } = fixture([{ cause: "incomplete_write" }]);
  await freshness.start();
  assert.deepEqual(freshness.status(), {
    current_generation: 0,
    pending_generation: null,
    state: "degraded",
    mode: "watching",
    degraded_cause: "incomplete_write",
  });
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Full scan exceeds a bound
it("keeps the prior generation when a scan reaches a file, size, or time bound", async () => {
  const { freshness, watcher, timers } = fixture([manifest({ "src/a.ts": "one" }), { cause: "scan_limit" }]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(freshness.status().current_generation, 1);
  assert.equal(freshness.status().degraded_cause, "scan_limit");
});

// covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Initial reconciliation cannot publish
it("retains unavailable generation zero after the first bounded reconciliation failure", async () => {
  const { freshness } = fixture([{ cause: "freshness_unavailable" }]);
  await freshness.start();
  assert.equal(freshness.status().current_generation, 0);
  assert.equal(freshness.status().state, "degraded");
});

it("uses the pinned Chokidar stability and safety options", () => {
  assert.deepEqual(chokidarWatchOptions, {
    atomic: 100,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    alwaysStat: true,
    followSymlinks: false,
    ignorePermissionErrors: false,
  });
});
