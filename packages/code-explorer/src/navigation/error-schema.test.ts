import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";

it("redacts backend payloads, absolute paths, and environment values from tool errors", async () => {
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
});
it("rejects an out-of-project backend path without returning the resolved external path", async () => {
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
});

function failingAdapter(message: string): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture",
      backend_version: "1.0.0",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" },
        references: { state: "ready" },
        type_definition: { state: "ready" },
        implementation: { state: "ready" },
        callers: { state: "ready" },
        callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    request: async () => {
      throw new Error(message);
    },
  };
}

function outsidePathAdapter(path: string): LanguageAdapter {
  return {
    ...failingAdapter("unused"),
    request: async () => ({
      operation: "search",
      revision: { generation: 1, manifest_sha256: "fixture" },
      symbols: [
        {
          id: "outside",
          name: "helper",
          language: "rust",
          kind: "function",
          location: { path, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } },
        },
      ],
    }),
  };
}
