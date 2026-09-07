import assert from "node:assert/strict";
import { it } from "node:test";
import { validateResourceLimits } from "../../../navigation/resource-limits.js";

it(
  "accepts the candidate cap and reports an excess for " + "search and follow",
  () => {
    for (const tool of ["code_search", "code_follow"]) {
      assert.equal(validateResourceLimits(tool, { limit: 200 }), undefined);
      assert.deepEqual(validateResourceLimits(tool, { limit: 201 }), {
        field: "limit",
        limit: 200,
        actual: 201,
      });
    }
  },
);

it(
  "accepts the focus byte cap and identifies an excessive " + "request",
  () => {
    assert.equal(
      validateResourceLimits("code_focus", {
        body_limit_bytes: 131_072,
      }),
      undefined,
    );
    assert.deepEqual(
      validateResourceLimits("code_focus", {
        body_limit_bytes: 131_073,
      }),
      { field: "body_limit_bytes", limit: 131_072, actual: 131_073 },
    );
  },
);
