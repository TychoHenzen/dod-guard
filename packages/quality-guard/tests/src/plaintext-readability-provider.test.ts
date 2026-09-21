import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPlaintextReadability } from "../../src/plaintext-readability.js";
import { runTextstat } from "../../src/plaintext-textstat/index.js";
import { easyText } from "./plaintext-readability-test-support.js";

test("reports an unsupported language and missing textstat as unavailable", () => {
  const unsupportedScript = checkPlaintextReadability("中文", () => {
    throw new Error("provider should not run for an unsupported script");
  });
  assert.equal(unsupportedScript.status, "unavailable");
  const unsupported = checkPlaintextReadability(easyText, () => ({
    status: "unavailable",
    reason: "textstat reported that the input language is unsupported",
  }));
  assert.equal(unsupported.status, "unavailable");
  const missing = runTextstat(easyText, {
    command: "quality-guard-textstat-missing",
  });
  assert.equal(missing.status, "unavailable");
});
