import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPlaintextReadability } from "../../src/plaintext-readability.js";

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

test("keeps soft line breaks inside one sentence and reports its context", () => {
  const longSentence = [
    "laterMarker",
    ...Array.from({ length: 25 }, () => "plain"),
  ].join(" ");
  const result = checkPlaintextReadability(
    `Intro sentence.\n${longSentence}`,
    () => ({
      status: "ok",
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    }),
  );
  assert.equal(result.status, "fail");
  assert.match(result.constraintFailures[0], /26 words/);
  assert.match(result.context ?? "", /laterMarker/);
});
