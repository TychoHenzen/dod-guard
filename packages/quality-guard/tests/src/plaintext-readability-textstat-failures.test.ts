import assert from "node:assert/strict";
import { test } from "node:test";
import { runTextstat } from "../../src/plaintext-textstat.js";
import { easyText } from "./plaintext-readability-test-support.js";

test("fails open for malformed, timed-out, and invalid providers", () => {
  const malformed = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write('not json')"],
  });
  assert.equal(malformed.status, "unavailable");
  const scalar = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write('null')"],
  });
  assert.equal(scalar.status, "unavailable");
  const unsupported = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify({ languageSupported: false }))"],
  });
  assert.equal(unsupported.status, "unavailable");
  const invalidMeasures = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify({ measures: { fleschReadingEase: null, fleschKincaidGrade: 8 } }))"],
  });
  assert.equal(invalidMeasures.status, "unavailable");
  const missingMeasures = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify({ measures: null }))"],
  });
  assert.equal(missingMeasures.status, "unavailable");
  const timedOut = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
  });
  assert.equal(timedOut.status, "unavailable");
});
