// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { judgedFindings, REVIEWERS as REVIEWERS_FROM_PRODUCTION } from "./reviewer-results.mjs";

const FILE = "src/review.js";
const ASSIGNED = new Map([
  ["review-pr-feature", new Set(["file:src/review.js", "criterion:1"])],
  ["review-pr-design", new Set(["file:src/review.js"])],
  ["review-pr-reliability", new Set(["file:src/review.js"])],
  ["review-pr-hygiene", new Set(["sub-issue:o/r#5"])],
]);
const rulings = (reviewer) =>
  [...ASSIGNED.get(reviewer)].map((slot) => ({
    slot,
    status: "VERIFIED",
    evidence: "ok",
  }));

test("four clean reviewers produce no findings", () => {
  assert.deepEqual(judgedFindings(complete([], ASSIGNED), ASSIGNED), []);
});

test("the test reviewer list equals the production list", () => {
  assert.deepEqual([...REVIEWERS_FROM_PRODUCTION], findingsFixture.REVIEWERS);
});

test("a missing reviewer or envelope fails instead of reading as clean", () => {
  assert.throws(
    () => judgedFindings([], ASSIGNED),
    /Incomplete reviewer results[\s\S]*review-pr-feature: expected one result/,
  );
  const noRulings = complete([], ASSIGNED).map((result) =>
    result.reviewer === "review-pr-design" ? { ...result, rulings: undefined } : result,
  );
  assert.throws(
    () => judgedFindings(noRulings, ASSIGNED),
    /review-pr-design: needs a findings array and a rulings array/,
  );
  const twice = [
    ...complete([], ASSIGNED),
    {
      reviewer: "review-pr-hygiene",
      rulings: rulings("review-pr-hygiene"),
      findings: [],
    },
  ];
  assert.throws(() => judgedFindings(twice, ASSIGNED), /got 2/);
  assert.throws(() => judgedFindings({}, ASSIGNED), /must be a JSON array/);
});

test("a missing ruling names the reviewer and slot", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [{ slot: "file:src/review.js", status: "VERIFIED", evidence: "ok" }],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-feature: missing ruling for slot criterion:1/,
  );
});

test("a ruling for a slot not assigned to the lens is refused", () => {
  const results = [
    {
      reviewer: "review-pr-design",
      rulings: [...rulings("review-pr-design"), { slot: "criterion:1", status: "VERIFIED", evidence: "ok" }],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-design: ruling for slot "criterion:1" is not assigned to this lens/,
  );
});

test("a duplicate ruling is refused", () => {
  const results = [
    {
      reviewer: "review-pr-reliability",
      rulings: [...rulings("review-pr-reliability"), ...rulings("review-pr-reliability")],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-reliability: duplicate ruling for slot file:src\/review\.js/,
  );
});

test("an unknown ruling status is refused", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [
        { slot: "file:src/review.js", status: "PASS", evidence: "ok" },
        { slot: "criterion:1", status: "VERIFIED", evidence: "ok" },
      ],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-feature: unknown status "PASS" for slot file:src\/review\.js/,
  );
});

test("a ruling without evidence is refused", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [
        { slot: "file:src/review.js", status: "VERIFIED", evidence: " " },
        { slot: "criterion:1", status: "VERIFIED", evidence: "ok" },
      ],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-feature: ruling for slot file:src\/review\.js needs evidence/,
  );
});

test("an excluded slot is assigned to the lens its exclusion names", () => {
  assert.doesNotThrow(() => judgedFindings(complete([], ASSIGNED), ASSIGNED));
  const results = [{ reviewer: "review-pr-hygiene", rulings: [] }];
  assert.throws(
    () => judgedFindings(complete(results, ASSIGNED), ASSIGNED),
    /review-pr-hygiene: missing ruling for slot sub-issue:o\/r#5/,
  );
});

test("a finding without a required field or an integer line fails", () => {
  const blank = [
    {
      reviewer: "review-pr-hygiene",
      findings: [judgment(FILE, { correction: " ", slot: "sub-issue:o/r#5" })],
    },
  ];
  assert.throws(
    () => judgedFindings(complete(blank, ASSIGNED), ASSIGNED),
    /review-pr-hygiene returned a finding without correction/,
  );
  const { line: _line, ...lineless } = judgment(FILE);
  const noLine = [{ reviewer: "review-pr-feature", findings: [lineless] }];
  assert.throws(
    () => judgedFindings(complete(noLine, ASSIGNED), ASSIGNED),
    /review-pr-feature returned a finding without line/,
  );
});

test("every finding returns with its reviewer, even two with one root cause in one file", () => {
  const results = [
    {
      reviewer: "review-pr-reliability",
      findings: [judgment(FILE.replaceAll("/", "\\"), { severity: "BLOCKER" })],
    },
    {
      reviewer: "review-pr-feature",
      findings: [judgment(FILE, { severity: "MINOR" })],
    },
  ];
  const findings = judgedFindings(complete(results, ASSIGNED), ASSIGNED);
  const row = ({ reviewer, file, severity, rootCause }) => [reviewer, file, severity, rootCause];
  assert.deepEqual(findings.map(row), [
    ["review-pr-feature", FILE, "MINOR", "Outdated treated as stale"],
    ["review-pr-reliability", FILE, "BLOCKER", "Outdated treated as stale"],
  ]);
});

test("a FINDING ruling with no finding in its result is refused", () => {
  const results = [
    {
      reviewer: "review-pr-design",
      rulings: [{ slot: "file:src/review.js", status: "FINDING", evidence: "ok" }],
    },
  ];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), INCOMPLETE_MESSAGE);
});

test("a FINDING ruling backed by a finding in its result is kept", () => {
  const results = [
    {
      reviewer: "review-pr-design",
      rulings: [{ slot: "file:src/review.js", status: "FINDING", evidence: "ok" }],
      findings: [judgment(FILE)],
    },
  ];
  const findings = judgedFindings(complete(results, ASSIGNED), ASSIGNED);
  assert.deepEqual(
    findings.map((finding) => [finding.file, finding.severity]),
    [[FILE, "MAJOR"]],
  );
});

const fileRuling = (status) => [{ slot: "file:src/review.js", status, evidence: "ok" }];

const NO_SLOT_MESSAGE = /review-pr-design: finding 1 names no slot/;
const NOT_ASSIGNED_MESSAGE = /review-pr-design: finding 1 names slot criterion:1, which is not assigned to this lens/;
const NOT_FINDING_MESSAGE = /review-pr-design: finding 1 names slot file:src\/review\.js, which was not ruled FINDING/;
const EXCLUDED_NOT_FINDING_MESSAGE =
  /review-pr-hygiene: finding 1 names slot sub-issue:o\/r#5, which was not ruled FINDING/;
const UNBACKED_MESSAGE = /review-pr-feature: FINDING ruling for slot criterion:1 has no finding naming that slot/;
const INCOMPLETE_MESSAGE = new RegExp(
  "Incomplete reviewer results; do not post[\\s\\S]*" +
    "review-pr-design: FINDING ruling for slot file:src/review\\.js has no finding naming that slot",
);

test("a finding with no slot is refused", () => {
  const { slot: _slot, ...slotless } = judgment(FILE);
  const results = [{ reviewer: "review-pr-design", rulings: fileRuling("FINDING"), findings: [slotless] }];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), NO_SLOT_MESSAGE);
});

test("a finding on a slot not assigned to its lens is refused", () => {
  const results = [{ reviewer: "review-pr-design", findings: [judgment(FILE, { slot: "criterion:1" })] }];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), NOT_ASSIGNED_MESSAGE);
});

test("a finding on a slot ruled VERIFIED is refused", () => {
  const results = [{ reviewer: "review-pr-design", rulings: fileRuling("VERIFIED"), findings: [judgment(FILE)] }];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), NOT_FINDING_MESSAGE);
});

test("a finding on an excluded slot whose exclusion held is refused", () => {
  const results = [
    {
      reviewer: "review-pr-hygiene",
      rulings: [{ slot: "sub-issue:o/r#5", status: "VERIFIED", evidence: "exclusion holds" }],
      findings: [judgment(FILE, { slot: "sub-issue:o/r#5" })],
    },
  ];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), EXCLUDED_NOT_FINDING_MESSAGE);
});

test("a finding on an excluded slot whose reason fails is kept", () => {
  const results = [
    {
      reviewer: "review-pr-hygiene",
      rulings: [{ slot: "sub-issue:o/r#5", status: "FINDING", evidence: "the reason does not hold" }],
      findings: [judgment(FILE, { slot: "sub-issue:o/r#5" })],
    },
  ];
  const [finding] = judgedFindings(complete(results, ASSIGNED), ASSIGNED);
  assert.equal(finding.slot, "sub-issue:o/r#5");
});

test("a FINDING ruling is refused when the only finding names another slot", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [
        { slot: "file:src/review.js", status: "FINDING", evidence: "ok" },
        { slot: "criterion:1", status: "FINDING", evidence: "ok" },
      ],
      findings: [judgment(FILE)],
    },
  ];
  assert.throws(() => judgedFindings(complete(results, ASSIGNED), ASSIGNED), UNBACKED_MESSAGE);
});

test("a result from a reviewer outside the four is refused", () => {
  const extra = {
    reviewer: "review-pr-extra",
    rulings: [],
    findings: [judgment(FILE)],
  };
  assert.throws(
    () => judgedFindings([...complete([], ASSIGNED), extra], ASSIGNED),
    /Incomplete reviewer results; do not post[\s\S]*result 5: unknown reviewer "review-pr-extra"/,
  );
});

test("a null result is refused as an unknown reviewer, not a TypeError", () => {
  assert.throws(
    () => judgedFindings([...complete([], ASSIGNED), null], ASSIGNED),
    /Incomplete reviewer results; do not post[\s\S]*result 5: unknown reviewer null/,
  );
});
