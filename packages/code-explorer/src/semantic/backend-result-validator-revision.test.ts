import assert from "node:assert/strict";
import { it } from "node:test";
import {
  definition,
  options,
} from "../testing/backend-result-validator-test-support.js";
import { validateBackendResult } from "./backend-result-validator.js";

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
