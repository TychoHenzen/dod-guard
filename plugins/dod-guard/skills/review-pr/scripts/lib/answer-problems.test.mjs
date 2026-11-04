// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { answered, refused, smallFile } from "./review-batches.test-support.mjs";

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

test("mergeAnswers refuses an unknown status", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), status: "maybe" }, answered("q2")] })]],
    "unknown status",
  );
});
