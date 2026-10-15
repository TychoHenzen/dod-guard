// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { findingsFixture } from "./review-pr.test-support.mjs";

const { FIX, UNICODE, PLAN, scan, review, refuses } = findingsFixture;

// The fixture scan gives three in-scope violations, numbered by file then line:
// S1 file-length (medium) in the docs file, S2 complexity (medium) and S3
// line-length (high) in FIX.
const ANSWERS = {
  D1: { status: "verified", scanner: ["S1", "S3"] },
  F1: { status: "verified", scanner: ["S2"] },
  R1: { status: "unanswered", scanner: ["S1"] },
};
function changeQuestions(plan, change) {
  const changed = (entry) => ({ ...entry, questions: entry.questions.map(change) });
  return plan.map((entry) => (entry.questions ? changed(entry) : entry));
}
const answered = (question) => ({ ...question, ...ANSWERS[question.id] });
const SCANNER_PLAN = changeQuestions(PLAN, answered);
const KEEP = { ids: ["S2"], status: "KEEP" };
const DROP = { ids: ["S1", "S3"], status: "DROP", reason: "rule-misfire", answer: "D1" };

function build(scanner, plan = SCANNER_PLAN) {
  return review([], { scan, plan, merge: { groups: [], scanner } });
}

test("a file with every violation dropped posts nothing and leaves the counts", () => {
  const { payload, counts } = build([KEEP, DROP]);
  assert.equal(payload.comments.length, 0);
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 0, MINOR: 1 });
  assert.ok(!payload.body.includes(`\`${UNICODE}:1\``), payload.body);
});

test("a file whose only high is dropped and a medium kept posts MINOR", () => {
  const { payload, recommendation } = build([KEEP, DROP]);
  assert.equal(recommendation, "APPROVE");
  const minor = `\`${FIX}:58\`\n**MINOR** quality-guard structural findings (1)\n\n`;
  assert.ok(payload.body.includes(minor), payload.body);
  assert.ok(!payload.body.includes("line 72: line is 132 chars"), payload.body);
});

test("dropped violations are listed by file and rule inside a details block", () => {
  const { body } = build([KEEP, DROP]).payload;
  const block = [
    "<details>",
    "<summary>Dropped scanner findings (2)</summary>",
    "",
    `**${UNICODE}**`,
    "",
    "- `file-length`: S1 line 1 (rule-misfire, D1)",
    "",
    `**${FIX}**`,
    "",
    "- `line-length`: S3 line 72 (rule-misfire, D1)",
    "</details>",
  ].join("\n");
  assert.ok(body.includes(`</details>\n\n${block}`), body);
});

test("nothing dropped means no dropped block", () => {
  const { body } = build([{ ids: ["S1", "S2", "S3"], status: "KEEP" }]).payload;
  assert.ok(!body.includes("Dropped scanner findings"), body);
});

test("an unknown, duplicate, or missing S id is refused by id", () => {
  const unknown = [KEEP, DROP, { ids: ["S9"], status: "KEEP" }];
  assert.throws(() => build(unknown), refuses('ruling 3: unknown S id "S9"'));
  assert.throws(() => build([KEEP, DROP, KEEP]), refuses("ruling 3: duplicate S id S2"));
  const twice = [{ ids: ["S2", "S2"], status: "KEEP" }, DROP];
  assert.throws(() => build(twice), refuses("ruling 1: duplicate S id S2"));
  assert.throws(() => build([DROP]), refuses("missing S id S2: it is in no ruling"));
});

test("a ruling with empty or non-array ids, or an unknown status, is refused", () => {
  const empty = [KEEP, DROP, { ids: [], status: "KEEP" }];
  assert.throws(() => build(empty), refuses("ruling 3: it has no ids"));
  const single = [{ ids: "S2", status: "KEEP" }, DROP];
  assert.throws(() => build(single), refuses("ruling 1: it has no ids"));
  const maybe = [{ ids: ["S2"], status: "MAYBE" }, DROP];
  assert.throws(() => build(maybe), refuses('ruling 1: S2 has status "MAYBE", not KEEP or DROP'));
});

test("a DROP reason outside the closed list is refused, pre-existing included", () => {
  const allowed = "not-at-head, excluded-path, rule-misfire";
  for (const reason of ["pre-existing", "unchanged-at-base", undefined]) {
    const named = `ruling 2: S1, S3 DROP reason ${JSON.stringify(reason ?? null)}`;
    const refusal = refuses(`${named} is not one of ${allowed}`);
    assert.throws(() => build([KEEP, { ...DROP, reason }]), refusal);
  }
});

test("a DROP citing an unchecked, unlisted, or unknown answer is refused", () => {
  const cite = (ids, answer) => ({ ...DROP, ids, answer });
  const unchecked = [KEEP, cite(["S1"], "R1"), { ...KEEP, ids: ["S3"] }];
  const notVerified = 'S1 DROP cites "R1", not a verified or repaired plan question listing S1';
  assert.throws(() => build(unchecked), refuses(notVerified));
  const unlisted = [KEEP, cite(["S1"], "D1"), cite(["S3"], "F1")];
  assert.throws(() => build(unlisted), refuses('ruling 3: S3 DROP cites "F1"'));
  const unknown = [KEEP, cite(["S1", "S3"], "Z9")];
  assert.throws(() => build(unknown), refuses('S1 DROP cites "Z9"'));
  assert.throws(() => build(unknown), refuses('S3 DROP cites "Z9"'));
});

test("a DROP citing a repaired answer builds", () => {
  const status = (question) => (question.id === "D1" ? "repaired" : question.status);
  const plan = changeQuestions(SCANNER_PLAN, (item) => ({ ...item, status: status(item) }));
  assert.equal(build([KEEP, DROP], plan).counts.MINOR, 1);
});

test("a KEEP carrying a reason, an answer, or a severity is refused", () => {
  const reason = [{ ...KEEP, reason: "rule-misfire", answer: "F1" }, DROP];
  assert.throws(() => build(reason), refuses("ruling 1: S2 KEEP carries reason, answer"));
  const severity = [{ ...KEEP, severity: "high" }, DROP];
  assert.throws(() => build(severity), refuses("output.scanner[0].severity sets a severity"));
});

test("a refused scanner ruling followed by a corrected one for the same inputs builds", () => {
  assert.throws(() => build([KEEP, { ...DROP, reason: "pre-existing" }]), refuses("S1, S3"));
  assert.equal(build([KEEP, DROP]).counts.MINOR, 1);
});
