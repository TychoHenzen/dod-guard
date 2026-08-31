import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import type { ProjectRoot } from "../semantic/project-root.js";

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Working tree contains source changes
it("reports modified tracked and untracked supported paths without exposing an absolute root", async () => {
  const server = createServer({ workspace_status: () => ({ changed_paths: [{ path: "src/edited.ts", state: "modified" }], untracked_paths: [{ path: "src/new.ts", state: "untracked" }] }) });
  const response = await server.call("code_status", { action: "status" });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected status");
  assert.equal(response.data.project_root, ".");
  assert.deepEqual(response.data.changed_paths, [{ path: "src/edited.ts", state: "modified" }]);
  assert.deepEqual(response.data.untracked_paths, [{ path: "src/new.ts", state: "untracked" }]);
  assert.equal(JSON.stringify(response).includes(":\\"), false);
});

// covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Generated path is excluded
it("reports active generated exclusions while leaving the exclusion path out of normal navigation", async () => {
  const server = createServer({ workspace_status: () => ({ active_exclusions: ["dist/**"], excluded_path_count: 1 }) });
  const response = await server.call("code_status", { action: "status" });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected status");
  assert.deepEqual(response.data.active_exclusions, ["dist/**"]);
  assert.equal(response.data.excluded_path_count, 1);
});

it("rejects search and retained-history navigation after frozen-root loss", async () => {
  const directory = mkdtempSync(join(tmpdir(), "code-explorer-root-loss-"));
  const unavailableRoot: ProjectRoot = {
    canonicalPath: directory, revalidate: () => "unavailable", resolveClientPath: () => "", classifyBackendPath: () => ({ external: true }),
    openProtected: () => { throw new Error("unused"); }, protectedRead: () => { throw new Error("unused"); },
  };
  try {
    const server = createServer({ projectRoot: unavailableRoot });
    const started = await server.call("code_status", { action: "start_session" });
    if ("code" in started || typeof started.data.session_id !== "string") throw new Error("expected session");
    const search = await server.call("code_search", { query: "anything" });
    const history = await server.call("code_history", { action: "back", session_id: started.data.session_id, request_id: "root-lost-history-1" });
    assert.equal("code" in search ? search.code : undefined, "project_root_unavailable");
    assert.equal("code" in history ? history.code : undefined, "project_root_unavailable");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
