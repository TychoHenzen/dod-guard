import assert from "node:assert/strict";
import { it } from "node:test";
import { validateResourceLimits } from "../../../navigation/resource-limits.js";

it("counts query code points and reports the exceeded " + "boundary", () => {
  const query = "😀".repeat(1024);
  assert.equal(validateResourceLimits("code_search", { query }), undefined);
  assert.deepEqual(
    validateResourceLimits("code_search", { query: `${query}😀` }),
    {
      field: "query",
      limit: 1024,
      actual: 1025,
    },
  );
});
