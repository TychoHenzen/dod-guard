import assert from "node:assert/strict";
import { test } from "node:test";
import { meetsFossilThreshold } from "./fossil-scoring-core.js";
test("includes a score exactly at the advisory threshold", () => {
    assert.equal(meetsFossilThreshold(0.4, 0.4), true);
});
//# sourceMappingURL=fossil-scoring-core.test.js.map