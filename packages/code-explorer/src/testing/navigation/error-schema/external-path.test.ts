import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";
import { outsidePathAdapter } from "./outside-path-adapter.js";

it(
  "rejects an out-of-project backend path without returning " +
    "the resolved external path",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-error-root-"));
    const outside = mkdtempSync(join(tmpdir(), "code-explorer-error-outside-"));
    try {
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [outsidePathAdapter(join(outside, "external.rs"))],
      });
      const result = await server.call("code_search", { query: "helper" });

      assert.deepEqual(result, {
        schema_version: 1,
        code: "path_outside_project",
        message: "path_outside_project",
        retryable: false,
      });
      assert.equal(JSON.stringify(result).includes(outside), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  },
);
