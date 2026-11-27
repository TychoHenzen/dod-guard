// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { TRIAGE_LIMITS } from "../../../../lib/handoff-limits.mjs";
import { buildTriageRecord } from "./triage-record.mjs";

const SHA_LENGTH = 40;
// A refused line is named by its first 40 characters.
const LINE_NAME_LENGTH = 40;
const BASE = "b".repeat(SHA_LENGTH);
const HEAD = "c".repeat(SHA_LENGTH);
const MERGE = "d".repeat(SHA_LENGTH);

test("states each basis once and lists each conflicted path on one line", () => {
  const { text } = buildTriageRecord({
    answers: [{ citation: "src/value.txt:1", fact: "master renamed the value", id: "Q1" }],
    bases: [{ id: "B1", text: "AC-1 keeps both values" }],
    conflicts: [
      { class: "source", code: "UU", path: "src/value.txt" },
      { class: "source", code: "UU", path: "src/other.txt" },
    ],
    decisions: [
      { basis: "B1", decision: "combine", path: "src/value.txt", questionIds: ["Q1"] },
      { basis: "B1", decision: "combine", path: "src/other.txt", questionIds: [] },
    ],
    mergeSha: MERGE,
    recordedBase: BASE,
    trustedHead: HEAD,
    verification: [{ name: "npm test", result: "pass" }],
  });
  assert.equal(
    text,
    [
      "## Conflict triage",
      "",
      `- Base: \`${BASE}\``,
      `- Trusted head: \`${HEAD}\``,
      `- Merge: \`${MERGE}\``,
      "- Stop: none",
      "",
      "Bases:",
      "- B1: AC-1 keeps both values",
      "",
      "Conflicts:",
      "- `src/value.txt` (source): combine, basis B1, questions Q1",
      "- `src/other.txt` (source): combine, basis B1, questions none",
      "",
      "Investigator answers used:",
      "- Q1: master renamed the value (src/value.txt:1)",
      "",
      "Verification:",
      "- npm test: pass",
      "",
    ].join("\n"),
  );
  assert.equal(text.split("AC-1 keeps both values").length, 2, "the shared basis is written once");
});

test("records a stop with its decision and no judgement", () => {
  const { text } = buildTriageRecord({
    conflicts: [{ class: "binary", code: "UU", path: "a|b.bin" }],
    recordedBase: BASE,
    stop: { decisionNeeded: "Decide by hand.", reason: "Binary\npath.", stop: "unresolvable_paths" },
    trustedHead: HEAD,
  });
  for (const expected of [
    "- Merge: none",
    "- Stop: unresolvable_paths: Binary path.",
    "- Decision needed: Decide by hand.",
    "Bases:\n- none",
    "- `a|b.bin` (binary): none, basis none, questions none",
    "Investigator answers used:\n- none",
    "Verification:\n- none",
  ]) {
    assert.ok(text.includes(expected), expected);
  }
});

test("refuses a record with a line or a count over its limit, and cuts nothing", () => {
  const long = "x".repeat(TRIAGE_LIMITS.line);
  const prefix = "- B1: ";
  const record = buildTriageRecord({
    answers: Array.from({ length: TRIAGE_LIMITS.answers + 1 }, (_, at) => ({
      citation: "a:1",
      fact: "f",
      id: `Q${at}`,
    })),
    bases: [{ id: "B1", text: long }],
    recordedBase: BASE,
    trustedHead: HEAD,
  });
  assert.equal(record.ok, false);
  assert.equal(record.text, undefined);
  assert.deepEqual(record.problems, [
    `the record has ${TRIAGE_LIMITS.answers + 1} investigator answers, over the ${TRIAGE_LIMITS.answers} it holds; keep only what the decisions rest on`,
    `the record line "${`${prefix}${long}`.slice(0, LINE_NAME_LENGTH)}" is ${prefix.length + long.length} characters, over the ${TRIAGE_LIMITS.line}-character limit; write it shorter, do not cut it off`,
  ]);
});
