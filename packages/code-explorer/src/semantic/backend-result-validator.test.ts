import assert from "node:assert/strict";
import { it } from "node:test";
import { validateBackendResult } from "./backend-result-validator.js";
import { createProjectRoot } from "./project-root.js";

const rootPath = "/repo";
const source = "fn helper() {}\n";
const root = createProjectRoot({
  cwd: rootPath,
  platform: "posix",
  filesystem: {
    realpath: (path) => path,
    stat: (path) => ({ dev: 1, ino: path === rootPath ? 1 : 2 }),
    open: (path) => path,
    fstat: () => ({ dev: 1, ino: 2 }),
    read: () => source,
    close: () => {},
  },
});

function definition(overrides: Record<string, unknown> = {}) {
  return {
    operation: "definition",
    revision: { generation: 1, manifest_sha256: "fixture" },
    relations: [
      {
        relation: "definition",
        symbol: {
          id: "rust:helper",
          name: "helper",
          language: "rust",
          kind: "function",
          location: { path: "src/lib.rs", range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } } },
        },
        location: { path: "src/lib.rs", range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } } },
      },
    ],
    ...overrides,
  };
}

const options = { allowedLanguages: ["rust"] as const, root, currentGeneration: 1 };

// covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns an invalid range
it("rejects a negative or out-of-file range before a result receives a handle", () => {
  const invalid = definition({
    relations: [
      {
        ...definition().relations[0],
        location: { path: "src/lib.rs", range: { start: { line: -1, character: 0 }, end: { line: 0, character: 2 } } },
      },
    ],
  });

  assert.deepEqual(validateBackendResult(invalid, options), { status: "rejected", code: "invalid_backend_result" });
});

// covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns an oversized payload
it("rejects a response larger than one MiB without returning its payload", () => {
  const oversized = { ...definition(), padding: "x".repeat(1024 * 1024) };

  assert.deepEqual(validateBackendResult(oversized, options), { status: "rejected", code: "backend_response_limit" });
});

// covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns another language unexpectedly
it("rejects a result for an undeclared adapter language and records a redacted gap", () => {
  const unexpected = definition({
    relations: [
      {
        ...definition().relations[0],
        symbol: { ...definition().relations[0].symbol, language: "python" },
      },
    ],
  });

  assert.deepEqual(validateBackendResult(unexpected, options), {
    status: "rejected",
    code: "invalid_backend_result",
    adapter_gap: "unexpected_language",
  });
});

// covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns a virtual document
it("degrades an adapter and withholds a virtual document relation", () => {
  const virtual = definition({
    relations: [
      {
        ...definition().relations[0],
        location: {
          uri: "untitled:generated",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      },
    ],
  });

  assert.deepEqual(validateBackendResult(virtual, options), {
    status: "unavailable",
    code: "invalid_backend_result",
    adapter_state: "degraded",
  });
});

it("degrades and withholds a stale normalized result revision", () => {
  assert.deepEqual(
    validateBackendResult({ ...definition(), revision: { generation: 2, manifest_sha256: "stale" } }, options),
    {
      status: "unavailable",
      code: "invalid_backend_result",
      adapter_state: "degraded",
    },
  );
});
