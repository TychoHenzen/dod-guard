// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { answered, merge, refused, SMALL, smallFile } from "./review-batches.test-support.mjs";

test("mergeAnswers refuses a missing id", () => {
  refused([["b01", smallFile({ answers: [answered("q1")] })]], "missing answer for");
});

test("mergeAnswers refuses an extra id", () => {
  refused(
    [["b01", smallFile({ answers: [answered("q1"), answered("q2"), answered("q9")] })]],
    "is not a question of this batch",
  );
});

test("mergeAnswers refuses a duplicate id", () => {
  refused([["b01", smallFile({ answers: [answered("q1"), answered("q1"), answered("q2")] })]], "duplicate answer for");
});

test("mergeAnswers refuses a slot mismatch", () => {
  refused([["b01", smallFile({ answers: [answered("q1", "s2"), answered("q2")] })]], "names slot");
});

test("mergeAnswers refuses an answered entry without a line", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), line: 0 }, answered("q2")] })]],
    "without a line above 0",
  );
});

test("mergeAnswers refuses an answered entry without a path", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), path: "" }, answered("q2")] })]],
    "answered without a path",
  );
});

test("mergeAnswers refuses an answered entry without a fact", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), fact: " " }, answered("q2")] })]],
    "answered without a fact",
  );
});

test("mergeAnswers refuses an unanswered entry without searched", () => {
  const unanswered = { id: "q1", slot: "s1", status: "unanswered", searched: "" };
  refused([["b01", smallFile({ answers: [unanswered, answered("q2")] })]], "unanswered without searched");
});

test("mergeAnswers refuses an answered entry whose citation does not resolve", () => {
  const cites = (cited) => (cited === "a.mjs" ? '"a.mjs" is not a file under the checkout' : null);
  refused([["b01", smallFile()]], 'q1: "a.mjs" is not a file under the checkout', cites);
});

test("mergeAnswers asks the citation check only for answered entries", () => {
  const asked = [];
  const cites = (cited, line) => {
    asked.push([cited, line]);
    return null;
  };
  const unanswered = { id: "q1", slot: "s1", status: "unanswered", searched: "x" };
  merge([["b01", smallFile({ answers: [unanswered, answered("q2")] })]], SMALL, cites);
  assert.deepEqual(asked, [["a.mjs", 1]]);
});

test("mergeAnswers skips the citation check when the shape already fails", () => {
  const cites = () => {
    throw new Error("cites must not run");
  };
  const blank = (id) => ({ ...answered(id), path: "" });
  refused([["b01", smallFile({ answers: [blank("q1"), blank("q2")] })]], "answered without a path", cites);
});

test("mergeAnswers refuses an unknown status", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), status: "maybe" }, answered("q2")] })]],
    "unknown status",
  );
});
