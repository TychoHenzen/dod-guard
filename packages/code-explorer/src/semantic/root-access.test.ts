import assert from "node:assert/strict";
import { it } from "node:test";
import { RootAccessGate } from "./root-access.js";
import type { LanguageAdapter } from "./language-adapter.js";
import type { ProjectRoot } from "./project-root.js";

function root(revalidate: () => "ready" | "inaccessible" | "unavailable"): ProjectRoot {
  return { canonicalPath: "/private/project", revalidate, resolveClientPath: () => "", classifyBackendPath: () => ({ external: true }), openProtected: () => { throw new Error("unused"); }, protectedRead: () => { throw new Error("unused"); } };
}

function adapter(calls: string[]): LanguageAdapter {
  return { status: () => ({ language: "rust", backend_name: "fixture", backend_version: "1", discovery_source: "injected", state: "ready", capabilities: { definition: { state: "ready" }, references: { state: "ready" }, type_definition: { state: "ready" }, implementation: { state: "ready" }, callers: { state: "ready" }, callees: { state: "ready" } }, last_transition_time: 0 }), request: async () => { throw new Error("unused"); }, shutdown: async () => { calls.push("stop"); }, start: async () => { calls.push("start"); } };
}

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Frozen project root disappears
it("makes a changed or missing frozen root status-only and stops backends", async () => {
  const calls: string[] = [];
  const gate = new RootAccessGate(root(() => "unavailable"), [adapter(calls)]);
  assert.deepEqual(await gate.check(), { state: "project_root_unavailable", restart_required: true });
  assert.deepEqual(calls, ["stop"]);
});

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Project root is temporarily inaccessible
it("reports inaccessible root during the bounded recovery window", async () => {
  let now = 0;
  const gate = new RootAccessGate(root(() => "inaccessible"), [], () => now);
  assert.deepEqual(await gate.check(), { state: "project_root_inaccessible", restart_required: false });
  now = 29_999;
  assert.deepEqual(await gate.check(), { state: "project_root_inaccessible", restart_required: false });
});

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Same root identity becomes accessible again
it("restarts selected backends after the same root recovers within thirty seconds", async () => {
  let result: "ready" | "inaccessible" = "inaccessible";
  const calls: string[] = [];
  const gate = new RootAccessGate(root(() => result), [adapter(calls)], () => 5_000);
  await gate.check();
  result = "ready";
  assert.deepEqual(await gate.check(), { state: "ready", restart_required: false });
  assert.deepEqual(calls, ["stop", "start"]);
});

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Root accessibility does not recover
it("requires restart after thirty seconds of inaccessible root", async () => {
  let now = 0;
  const gate = new RootAccessGate(root(() => "inaccessible"), [], () => now);
  await gate.check();
  now = 30_000;
  assert.deepEqual(await gate.check(), { state: "project_root_unavailable", restart_required: true });
});
