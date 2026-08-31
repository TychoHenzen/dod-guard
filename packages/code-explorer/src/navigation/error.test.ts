import assert from "node:assert/strict";
import { it } from "node:test";
import { codeExplorerError, normalizeError } from "./error.js";

it("redacts invalid details and keeps only normalized project-relative paths", () => {
  assert.deepEqual(codeExplorerError("resource_limit", { field: "query", limit: 10, path: "src/lib.rs" }), {
    schema_version: 1,
    code: "resource_limit",
    message: "resource_limit",
    retryable: false,
    details: { field: "query", limit: 10, path: "src/lib.rs" },
  });
  assert.deepEqual(codeExplorerError("resource_limit", { path: "C:\\private\\project" }).details, {});
});

it("normalizes unknown failures without returning their text", () => {
  assert.equal(normalizeError(new Error("backend_timeout")).code, "backend_timeout");
  assert.deepEqual(normalizeError(new Error("private failure")), {
    schema_version: 1,
    code: "internal_error",
    message: "internal_error",
    retryable: false,
  });
});
