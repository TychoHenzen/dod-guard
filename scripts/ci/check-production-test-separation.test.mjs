import assert from "node:assert/strict";
import { test } from "node:test";
import { findViolations, ROOT } from "./check-production-test-separation.mjs";

test("the checked-out packages keep tests outside production roots", () => {
  assert.deepEqual(findViolations(ROOT), []);
});
