import assert from "node:assert/strict";
import { it } from "node:test";
import { validateBackendResult } from "../semantic/backend-result/backend-result-validator.js";
import { definition, options } from "../testing/backend-result-validator-test-support.js";

it("degrades and withholds a stale normalized result revision", () => {
  assert.deepEqual(
    validateBackendResult(
      {
        ...definition(),
        revision: {
          generation: 2,
          manifest_sha256: "stale",
        },
      },
      options,
    ),
    {
      status: "unavailable",
      code: "invalid_backend_result",
      adapter_state: "degraded",
    },
  );
});
