import assert from "node:assert/strict";
import { it } from "node:test";
import { validateResourceLimits } from "../../../navigation/resource-limits.js";

it(
  "counts filters across all three arrays before reporting " + "capacity",
  () => {
    const filters = {
      path_globs: Array(16).fill("src/**"),
      languages: Array(16).fill("rust"),
    };
    assert.equal(validateResourceLimits("code_search", filters), undefined);
    assert.deepEqual(
      validateResourceLimits("code_search", {
        ...filters,
        kinds: ["function"],
      }),
      { field: "filters", limit: 32, actual: 33 },
    );
  },
);

it("measures individual filter values in UTF-8 bytes", () => {
  const value = "é".repeat(128);
  assert.equal(
    validateResourceLimits("code_search", {
      path_globs: [value],
    }),
    undefined,
  );
  assert.deepEqual(
    validateResourceLimits("code_search", {
      path_globs: [`${value}é`],
    }),
    { field: "filter_value", limit: 256, actual: 258 },
  );
});
