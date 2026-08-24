import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeExtensions } from "./git-history-core.js";
test("normalizes extension dots and case in first-occurrence order", () => {
    assert.deepEqual(normalizeExtensions(["TS", ".js", "ts"]), [".ts", ".js"]);
});
//# sourceMappingURL=git-history-core.test.js.map