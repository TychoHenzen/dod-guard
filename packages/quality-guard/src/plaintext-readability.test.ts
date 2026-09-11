import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPlaintextReadability,
  READABILITY_POLICY,
  runTextstat,
} from "./plaintext-readability.js";

const easyText =
  "This short guide explains the change in plain language. " +
  "Each sentence has a clear subject and a direct verb. " +
  "Readers can scan the steps, understand the reason, and choose the next action. " +
  "The wording avoids dense terms and keeps the main idea visible.";

test("passes easy text with the documented measure policy", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 72, fleschKincaidGrade: 8 },
  }));

  assert.equal(result.status, "pass");
  assert.equal(result.score, 100);
  assert.equal(result.threshold, READABILITY_POLICY.threshold);
  assert.deepEqual(result.constraintFailures, []);
});

test("reports measured values, threshold, and context for failing text", () => {
  const result = checkPlaintextReadability(easyText, () => ({
    status: "ok",
    measures: { fleschReadingEase: 20, fleschKincaidGrade: 14 },
  }));

  assert.equal(result.status, "fail");
  assert.equal(result.measures?.fleschReadingEase, 20);
  assert.equal(result.measures?.fleschKincaidGrade, 14);
  assert.equal(result.score, 20);
  assert.match(result.message, /combined score 20; threshold 80/);
  assert.match(result.message, /Context:/);
});

test("skips empty and short input without invoking textstat", () => {
  let called = false;
  const provider = () => {
    called = true;
    return {
      status: "ok" as const,
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    };
  };

  assert.equal(checkPlaintextReadability("", provider).status, "skipped");
  assert.equal(
    checkPlaintextReadability("Only a few words.", provider).status,
    "skipped",
  );
  assert.equal(called, false);
});

test("normalizes Markdown, code, identifiers, citations, and keeps non-ASCII prose", () => {
  let checked = "";
  const result = checkPlaintextReadability(
    [
      "# A guide",
      "This is a readable sentence with café and naïve terms for a reader.",
      "Use [the next step](https://example.invalid/next) after this sentence.",
      "The `internalName` value is not prose and should not affect the score.",
      "```js",
      "const hidden_identifier = true;",
      "```",
      "The citation [1] supports the sentence and the words stay clear.",
    ].join("\n"),
    (text) => {
      checked = text;
      return {
        status: "ok",
        measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
      };
    },
  );

  assert.equal(result.status, "pass");
  assert.match(checked, /café/);
  assert.doesNotMatch(checked, /hidden_identifier|internalName/);
  assert.doesNotMatch(checked, /```|\[1\]|https:\/\//);
});

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

test("fails open for malformed, timed-out, and internally failing providers", () => {
  const malformed = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "process.stdout.write('not json')"],
  });
  assert.equal(malformed.status, "unavailable");

  const invalidMeasures = runTextstat(easyText, {
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write(JSON.stringify({ measures: { fleschReadingEase: null, fleschKincaidGrade: 8 } }))",
    ],
  });
  assert.equal(invalidMeasures.status, "unavailable");

  const timedOut = runTextstat(easyText, {
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
  });
  assert.equal(timedOut.status, "unavailable");

  const internalFailure = checkPlaintextReadability(easyText, () => {
    throw new Error("provider failure");
  });
  assert.equal(internalFailure.status, "unavailable");
});
