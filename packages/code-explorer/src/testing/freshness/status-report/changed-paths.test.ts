import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";

it(
  "reports modified tracked and untracked supported paths " +
    "without exposing an absolute root",
  async () => {
    const server = createServer({
      workspace_status: () => ({
        changed_paths: [{ path: "src/edited.ts", state: "modified" }],
        untracked_paths: [{ path: "src/new.ts", state: "untracked" }],
      }),
    });
    const response = await server.call("code_status", { action: "status" });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected status");
    assert.equal(response.data.project_root, ".");
    assert.deepEqual(response.data.changed_paths, [
      { path: "src/edited.ts", state: "modified" },
    ]);
    assert.deepEqual(response.data.untracked_paths, [
      { path: "src/new.ts", state: "untracked" },
    ]);
    assert.equal(JSON.stringify(response).includes(":\\"), false);
  },
);
