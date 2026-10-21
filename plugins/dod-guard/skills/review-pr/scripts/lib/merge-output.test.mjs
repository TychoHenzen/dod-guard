// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { buildReview } from "./review-findings.mjs";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";

const { HEAD, PBI, question, hunk, refuses } = findingsFixture;

// PR #909: the feature and hygiene lenses both cited line 90 of this test, in
// different words and at different severities.
const PROOF = "plugins/dod-guard/skills/next-ticket/scripts/handoff-proof.test.mjs";
const SOURCE = "plugins/dod-guard/skills/next-ticket/scripts/handoff-proof.mjs";
const DIFF = [...hunk(PROOF, 90), ...hunk(SOURCE, 12)].join("\n");
const PLAN = [
  {
    slot: `file:${PROOF}`,
    questions: [
      question("F1", "review-pr-feature"),
      question("R1", "review-pr-reliability"),
      question("H1", "review-pr-hygiene"),
    ],
  },
  { slot: `file:${SOURCE}`, questions: [question("D1", "review-pr-design")] },
  { slot: "criterion:1", questions: [question("F2", "review-pr-feature")] },
];
const ASSIGNED = new Map([
  ["review-pr-feature", new Set([`file:${PROOF}`, "criterion:1"])],
  ["review-pr-design", new Set([`file:${SOURCE}`])],
  ["review-pr-reliability", new Set([`file:${PROOF}`])],
  ["review-pr-hygiene", new Set([`file:${PROOF}`])],
]);
const FEATURE = judgment(PROOF, {
  line: 90,
  severity: "MINOR",
  problem: "The proof test checks only the exit code",
  rootCause: "Assertion does not read the handoff text",
});
const HYGIENE = judgment(PROOF, {
  line: 90,
  severity: "MAJOR",
  problem: "The test name promises a check it never makes",
  rootCause: "Misleading test title",
});
// J1 is the feature finding, J2 the design one, and J3 the hygiene one.
const RESULTS = complete(
  [
    { reviewer: "review-pr-feature", findings: [FEATURE] },
    { reviewer: "review-pr-design", findings: [judgment(SOURCE, { line: 12 })] },
    { reviewer: "review-pr-hygiene", findings: [HYGIENE] },
  ],
  ASSIGNED,
);
const MERGED = {
  groups: [
    { members: ["J3", "J1"], representative: "J1" },
    { members: ["J2"], representative: "J2" },
  ],
  scanner: [],
};

function build(merge, scan = { violations: [] }) {
  const inputs = { headSha: HEAD, scan, diff: DIFF, plan: PLAN, pbi: PBI, subIssues: [] };
  return buildReview({ ...inputs, results: RESULTS, merge });
}

const output = (groups) => ({ groups, scanner: [] });
const one = (id) => ({ members: [id], representative: id });

test("one defect two lenses worded differently posts once, at the highest severity", () => {
  const { payload, counts } = build(MERGED);
  const atLine = payload.comments.filter((comment) => comment.path === PROOF);
  assert.deepEqual(
    atLine.map((comment) => comment.line),
    [90],
  );
  const { body } = atLine[0];
  assert.match(body, /^\*\*MAJOR\*\* The proof test checks only the exit code\n/);
  assert.match(body, /\(review-pr-feature, review-pr-hygiene\)$/);
  assert.doesNotMatch(body, /promises a check/);
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 2, MINOR: 0 });
});

test("a merge output that is not an object, or lacks either array, is refused", () => {
  assert.throws(() => build(null), refuses("the output is not a JSON object"));
  assert.throws(() => build([]), refuses("the output is not a JSON object"));
  assert.throws(() => build({ groups: {}, scanner: [] }), refuses("groups is not an array"));
  assert.throws(() => build({ groups: MERGED.groups }), refuses("scanner is not an array"));
});

test("a non-array groups and a non-array scanner are both named, with the other array's problems", () => {
  const scan = { violations: [{ file: PROOF, line: 90, rule: "line-length", severity: "medium", message: "long" }] };
  assert.throws(() => build({ groups: "x", scanner: [] }, scan), refuses("groups is not an array"));
  assert.throws(() => build({ groups: "x", scanner: [] }, scan), refuses("missing S id S1"));
  assert.throws(() => build({ groups: [], scanner: "y" }), refuses("scanner is not an array"));
  assert.throws(() => build({ groups: [], scanner: "y" }), refuses("missing J id J1"));
  const both = { groups: "x", scanner: "y" };
  assert.throws(() => build(both), refuses("groups is not an array; scanner is not an array"));
});

test("a severity key anywhere in the merge output is refused by its path", () => {
  const groups = [{ ...MERGED.groups[0], severity: "MINOR" }, MERGED.groups[1]];
  const named = "output.groups[0].severity sets a severity";
  assert.throws(() => build(output(groups)), refuses(named));
  const scanner = [{ ids: [], status: "KEEP", note: { severity: "low" } }];
  const nested = { groups: MERGED.groups, scanner };
  assert.throws(() => build(nested), refuses("output.scanner[0].note.severity"));
});

test("an unknown, duplicate, or missing J id is refused by id", () => {
  const unknown = output([...MERGED.groups, one("J9")]);
  assert.throws(() => build(unknown), refuses('group 3: unknown J id "J9"'));
  const again = output([...MERGED.groups, one("J2")]);
  assert.throws(() => build(again), refuses("group 3: duplicate J id J2"));
  const twice = output([MERGED.groups[0], { members: ["J2", "J2"], representative: "J2" }]);
  assert.throws(() => build(twice), refuses("group 2: duplicate J id J2"));
  const missing = output([MERGED.groups[0]]);
  assert.throws(() => build(missing), refuses("missing J id J2: it is in no group"));
});

test("an empty group, a representative outside its group, or a cross-file group is refused", () => {
  const empty = output([...MERGED.groups, { members: [], representative: "J2" }]);
  assert.throws(() => build(empty), refuses("group 3: it has no members"));
  const outside = output([{ members: ["J1", "J3"], representative: "J2" }, one("J2")]);
  assert.throws(() => build(outside), refuses('group 1: representative "J2" is not a member'));
  const across = output([{ members: ["J1", "J2"], representative: "J1" }, one("J3")]);
  const files = `group 1: members J1, J2 are in different files (${PROOF}, ${SOURCE})`;
  assert.throws(() => build(across), refuses(files));
});

test("a refused output followed by a corrected one for the same inputs builds", () => {
  assert.throws(() => build(output([MERGED.groups[0]])), refuses("missing J id J2"));
  assert.equal(build(MERGED).payload.comments.length, 2);
});
