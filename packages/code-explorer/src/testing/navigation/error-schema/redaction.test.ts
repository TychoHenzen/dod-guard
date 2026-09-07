import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";
import { failingAdapter } from "./failing-adapter.js";

it(
  "redacts backend payloads, absolute paths, and " +
    "environment values from tool errors",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-error-schema-"));
    const secret = "CODE_EXPLORER_TEST_SECRET=not-for-client";
    const rawPayload = '{"jsonrpc":"2.0","error":{"data":"backend-detail"}}';
    try {
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [failingAdapter(`${root} ${secret} ${rawPayload}`)],
      });
      const result = await server.call("code_search", { query: "helper" });

      assert.deepEqual(result, {
        schema_version: 1,
        code: "internal_error",
        message: "internal_error",
        retryable: false,
      });
      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(root), false);
      assert.equal(serialized.includes(secret), false);
      assert.equal(serialized.includes(rawPayload), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
