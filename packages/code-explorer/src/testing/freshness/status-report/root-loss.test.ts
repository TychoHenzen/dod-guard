import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { unavailableProjectRoot } from "./unavailable-project-root.js";

it(
  "rejects search and retained-history navigation after " + "frozen-root loss",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "code-explorer-root-loss-"));
    const { unavailableRoot } = unavailableProjectRoot(directory);
    try {
      const server = createServer({ projectRoot: unavailableRoot });
      const started = await server.call("code_status", {
        action: "start_session",
      });
      if ("code" in started || typeof started.data.session_id !== "string")
        throw new Error("expected session");
      const search = await server.call("code_search", { query: "anything" });
      const history = await server.call("code_history", {
        action: "back",
        session_id: started.data.session_id,
        request_id: "root-lost-history-1",
      });
      assert.equal(
        "code" in search ? search.code : undefined,
        "project_root_unavailable",
      );
      assert.equal(
        "code" in history ? history.code : undefined,
        "project_root_unavailable",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
