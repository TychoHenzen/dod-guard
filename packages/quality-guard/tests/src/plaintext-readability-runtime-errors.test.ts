import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPlaintextReadability, readabilityExitCode } from "../../src/plaintext-readability.js";
import { runTextstat } from "../../src/plaintext-textstat.js";
import { easyText } from "./plaintext-readability-test-support.js";

test("reports textstat start failures and maps readability exit codes", () => {
  const errorResult = runTextstat(easyText, {
    spawn: () => {
      throw new Error("python missing");
    },
  });
  assert.equal(errorResult.status, "unavailable");
  if (errorResult.status === "unavailable") assert.match(errorResult.reason, /python missing/);
  const valueResult = runTextstat(easyText, {
    spawn: () => {
      throw "python missing";
    },
  });
  assert.equal(valueResult.status, "unavailable");
  if (valueResult.status === "unavailable") assert.match(valueResult.reason, /python missing/);
  assert.equal(readabilityExitCode("fail"), 2);
  assert.equal(readabilityExitCode("pass"), 0);
});

test("fails open when a readability provider throws", () => {
  const internalFailure = checkPlaintextReadability(easyText, () => {
    throw new Error("provider failure");
  });
  assert.equal(internalFailure.status, "unavailable");
  const valueFailure = checkPlaintextReadability(easyText, () => {
    throw "provider failure";
  });
  assert.equal(valueFailure.status, "unavailable");
});
