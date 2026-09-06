import assert from "node:assert/strict";
import { it } from "node:test";
import {
  definition,
  options,
} from "../testing/backend-result-validator-test-support.js";
import { validateBackendResult } from "./backend-result-validator.js";

it("rejects a negative or out-of-file range before a result receives", () => {
  const invalid = definition({
    relations: [
      {
        ...definition().relations[0],
        location: {
          path: "src/lib.rs",
          range: {
            start: { line: -1, character: 0 },
            end: { line: 0, character: 2 },
          },
        },
      },
    ],
  });

  assert.deepEqual(validateBackendResult(invalid, options), {
    status: "rejected",
    code: "invalid_backend_result",
  });
});
it("rejects a response larger than one MiB without returning its pay", () => {
  const oversized = {
    ...definition(),
    padding: "x".repeat(1024 * 1024),
  };

  assert.deepEqual(validateBackendResult(oversized, options), {
    status: "rejected",
    code: "backend_response_limit",
  });
});
it("rejects a result for an undeclared adapter language and records", () => {
  const unexpected = definition({
    relations: [
      {
        ...definition().relations[0],
        symbol: {
          ...definition().relations[0].symbol,
          language: "python",
        },
      },
    ],
  });

  assert.deepEqual(validateBackendResult(unexpected, options), {
    status: "rejected",
    code: "invalid_backend_result",
    adapter_gap: "unexpected_language",
  });
});
it("degrades an adapter and withholds a virtual document relation", () => {
  const virtual = definition({
    relations: [
      {
        ...definition().relations[0],
        location: {
          uri: "untitled:generated",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
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
