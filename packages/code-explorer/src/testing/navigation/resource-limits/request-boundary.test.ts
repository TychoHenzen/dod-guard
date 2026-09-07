import assert from "node:assert/strict";
import { it } from "node:test";
import { validateResourceLimits } from "../../../navigation/resource-limits.js";

it("measures the entire serialized request at the 64 KiB " + "boundary", () => {
  const arguments_ = { padding: "x".repeat(65_522) };
  assert.equal(validateResourceLimits("code_status", arguments_), undefined);
  assert.deepEqual(
    validateResourceLimits("code_status", {
      padding: `${arguments_.padding}x`,
    }),
    { field: "request", limit: 65_536, actual: 65_537 },
  );
});
