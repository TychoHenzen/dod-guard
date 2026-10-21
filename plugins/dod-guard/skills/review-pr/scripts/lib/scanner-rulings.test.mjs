// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { findingsFixture } from "./review-pr.test-support.mjs";

const { FIX, UNICODE, PLAN, scan, review, refuses } = findingsFixture;

// The fixture scan gives three in-scope violations, numbered by file then line:
// S1 file-length (medium) in the docs file, S2 complexity (medium) and S3
// line-length (high) in FIX. Each DROP rests on a question asked about its own
// file: D1 (FIX slot) for S3, R1 (docs slot) for S1.
const ANSWERS = {
  D1: { status: "verified", scanner: ["S3"] },
  F1: { status: "verified", scanner: ["S2"] },
  R1: { status: "verified", scanner: ["S1"] },
};
function changeQuestions(plan, change) {
  const changed = (entry) => ({ ...entry, questions: entry.questions.map(change) });
  return plan.map((entry) => (entry.questions ? changed(entry) : entry));
}
const answered = (question) => ({ ...question, ...ANSWERS[question.id] });
const SCANNER_PLAN = changeQuestions(PLAN, answered);
const KEEP = { ids: ["S2"], status: "KEEP" };
const DROPS = [
  { ids: ["S3"], status: "DROP", reason: "rule-misfire", answer: "D1" },
  { ids: ["S1"], status: "DROP", reason: "rule-misfire", answer: "R1" },
];

function build(scanner, plan = SCANNER_PLAN) {
  return review([], { scan, plan, merge: { groups: [], scanner } });
}

test("a file with every violation dropped posts nothing and leaves the counts", () => {
  const { payload, counts } = build([KEEP, ...DROPS]);
  assert.equal(payload.comments.length, 0);
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 0, MINOR: 1 });
  assert.ok(!payload.body.includes(`\`${UNICODE}:1\``), payload.body);
});

test("a file whose only high is dropped and a medium kept posts MINOR", () => {
  const { payload, recommendation } = build([KEEP, ...DROPS]);
  assert.equal(recommendation, "APPROVE");
  const minor = `\`${FIX}:58\`\n**MINOR** quality-guard structural findings (1)\n\n`;
  assert.ok(payload.body.includes(minor), payload.body);
  assert.ok(!payload.body.includes("line 72: line is 132 chars"), payload.body);
});

test("dropped violations are listed by file and rule inside a details block", () => {
  const { body } = build([KEEP, ...DROPS]).payload;
  const block = [
    "<details>",
    "<summary>Dropped scanner findings (2)</summary>",
    "",
    `**${UNICODE}**`,
    "",
    "- `file-length`: S1 line 1 (rule-misfire, R1): file is 600 lines",
    "",
    `**${FIX}**`,
    "",
    "- `line-length`: S3 line 72 (rule-misfire, D1): line is 132 chars",
    "",
    "**Cited questions**",
    "",
    "- R1: Does review-pr-reliability hold at the reviewed head?",
    "- D1: Does review-pr-design hold at the reviewed head?",
    "</details>",
  ].join("\n");
  assert.ok(body.includes(`</details>\n\n${block}`), body);
});

// Builds with a scan and plan of the caller's own, and the given rulings.
const buildWith = (scanOverride, plan, rulings) =>
  review([], { scan: scanOverride, plan, merge: { groups: [], scanner: rulings } }).payload.body;

test("a dropped message is escaped so it cannot close the details block", () => {
  const violations = scan.violations.map((violation) =>
    violation.line === 72 ? { ...violation, message: "<b>x</b> 132 chars" } : violation,
  );
  const body = buildWith({ violations }, SCANNER_PLAN, [KEEP, ...DROPS]);
  assert.ok(body.includes("(rule-misfire, D1): &lt;b&gt;x&lt;/b&gt; 132 chars"), body);
  assert.ok(!body.includes("<b>x</b>"), body);
});

test("two findings citing one question list that question once", () => {
  const plan = changeQuestions(SCANNER_PLAN, (question) =>
    question.id === "D1" ? { ...question, scanner: ["S2", "S3"] } : question,
  );
  const rulings = [
    { ids: ["S1"], status: "KEEP" },
    { ids: ["S2", "S3"], status: "DROP", reason: "rule-misfire", answer: "D1" },
  ];
  const body = buildWith(scan, plan, rulings);
  assert.ok(body.includes("<summary>Dropped scanner findings (2)</summary>"), body);
  assert.equal(body.split("- D1: ").length - 1, 1, body);
});

test("nothing dropped means no dropped block", () => {
  const { body } = build([{ ids: ["S1", "S2", "S3"], status: "KEEP" }]).payload;
  assert.ok(!body.includes("Dropped scanner findings"), body);
});

test("an unknown, duplicate, or missing S id is refused by id", () => {
  const unknown = [KEEP, ...DROPS, { ids: ["S9"], status: "KEEP" }];
  assert.throws(() => build(unknown), refuses('ruling 4: unknown S id "S9"'));
  assert.throws(() => build([KEEP, ...DROPS, KEEP]), refuses("ruling 4: duplicate S id S2"));
  const twice = [{ ids: ["S2", "S2"], status: "KEEP" }, ...DROPS];
  assert.throws(() => build(twice), refuses("ruling 1: duplicate S id S2"));
  assert.throws(() => build(DROPS), refuses("missing S id S2: it is in no ruling"));
});

test("a ruling with empty or non-array ids, or an unknown status, is refused", () => {
  const empty = [KEEP, ...DROPS, { ids: [], status: "KEEP" }];
  assert.throws(() => build(empty), refuses("ruling 4: it has no ids"));
  const single = [{ ids: "S2", status: "KEEP" }, ...DROPS];
  assert.throws(() => build(single), refuses("ruling 1: it has no ids"));
  const maybe = [{ ids: ["S2"], status: "MAYBE" }, ...DROPS];
  assert.throws(() => build(maybe), refuses('ruling 1: S2 has status "MAYBE", not KEEP or DROP'));
});

test("a DROP reason outside the closed list is refused, pre-existing included", () => {
  const allowed = "not-at-head, excluded-path, rule-misfire";
  for (const reason of ["pre-existing", "unchanged-at-base", undefined]) {
    const named = `ruling 2: S3 DROP reason ${JSON.stringify(reason ?? null)}`;
    const refusal = refuses(`${named} is not one of ${allowed}`);
    assert.throws(() => build([KEEP, { ...DROPS[0], reason }, DROPS[1]]), refusal);
  }
});

test("a DROP citing an unchecked, unlisted, or unknown answer is refused", () => {
  const cite = (ids, answer) => ({ ...DROPS[0], ids, answer });
  const unanswered = changeQuestions(SCANNER_PLAN, (question) =>
    question.id === "R1" ? { ...question, status: "unanswered" } : question,
  );
  const unchecked = [KEEP, ...DROPS];
  const notVerified = 'S1 DROP cites "R1", not a verified or repaired plan question listing S1';
  assert.throws(() => build(unchecked, unanswered), refuses(notVerified));
  const unlisted = [KEEP, cite(["S1"], "D1"), cite(["S3"], "F1")];
  assert.throws(() => build(unlisted), refuses('ruling 3: S3 DROP cites "F1"'));
  const unknown = [KEEP, cite(["S1", "S3"], "Z9")];
  assert.throws(() => build(unknown), refuses('S1 DROP cites "Z9"'));
  assert.throws(() => build(unknown), refuses('S3 DROP cites "Z9"'));
});

test("a DROP citing a repaired answer builds", () => {
  const status = (question) => (question.id === "D1" ? "repaired" : question.status);
  const plan = changeQuestions(SCANNER_PLAN, (item) => ({ ...item, status: status(item) }));
  assert.equal(build([KEEP, ...DROPS], plan).counts.MINOR, 1);
});

test("a KEEP carrying a reason, an answer, or a severity is refused", () => {
  const reason = [{ ...KEEP, reason: "rule-misfire", answer: "F1" }, ...DROPS];
  assert.throws(() => build(reason), refuses("ruling 1: S2 KEEP carries reason, answer"));
  const severity = [{ ...KEEP, severity: "high" }, ...DROPS];
  assert.throws(() => build(severity), refuses("output.scanner[0].severity sets a severity"));
});

test("a refused scanner ruling followed by a corrected one for the same inputs builds", () => {
  const refused = [KEEP, { ...DROPS[0], reason: "pre-existing" }, DROPS[1]];
  assert.throws(() => build(refused), refuses('S3 DROP reason "pre-existing"'));
  assert.equal(build([KEEP, ...DROPS]).counts.MINOR, 1);
});

test("a scanner list naming another file's S id is refused when the plan is built", () => {
  const plan = changeQuestions(SCANNER_PLAN, (question) =>
    question.id === "D1" ? { ...question, scanner: ["S1"] } : question,
  );
  assert.throws(
    () => build([KEEP, ...DROPS], plan),
    (error) => error.message.includes("question D1 lists S1"),
  );
});
