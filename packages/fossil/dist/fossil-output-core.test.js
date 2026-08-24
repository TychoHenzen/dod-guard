import assert from "node:assert/strict";
import { test } from "node:test";
import { terminalSafeText } from "./fossil-output-core.js";
test("renders terminal controls as visible text", () => {
    assert.equal(terminalSafeText("path\u001b[31m\u0085"), "path\\u001b[31m\\u0085");
});
//# sourceMappingURL=fossil-output-core.test.js.map