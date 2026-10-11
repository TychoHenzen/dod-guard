// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { pbiIssue, requirePlan, reviewSlots, slotsBlock, subIssueList } from "./review-slots.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

const REPO_URL = "https://api.github.com/repos/TychoHenzen/dod-guard";
const DIFF = [
  "diff --git a/src/added.mjs b/src/added.mjs",
  "--- a/src/added.mjs",
  "+++ b/src/added.mjs",
  "@@ -1,0 +2,2 @@",
  "+one",
  "+two",
  "diff --git a/src/trimmed.mjs b/src/trimmed.mjs",
  "--- a/src/trimmed.mjs",
  "+++ b/src/trimmed.mjs",
  "@@ -3 +2,0 @@",
  "-gone",
  "diff --git a/gone.md b/gone.md",
  "deleted file mode 100644",
  "--- a/gone.md",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-bye",
  "diff --git a/old.md b/new.md",
  "similarity index 100%",
  "rename from old.md",
  "rename to new.md",
  "diff --git a/img.png b/img.png",
  "Binary files a/img.png and b/img.png differ",
  'diff --git "a/docs/\\303\\274.md" "b/docs/\\303\\274.md"',
  '--- "a/docs/\\303\\274.md"',
  '+++ "b/docs/\\303\\274.md"',
  "@@ -1 +1 @@",
  "-old",
  "+new",
  "",
].join("\n");
const PBI_JSON = {
  number: 837,
  repository_url: REPO_URL,
  body: "## Outcome\n\n- [ ] not a criterion\n\n## Acceptance criteria\n\n- [ ] AC-01 first\n- [x] AC-02 second\n\n## Verification\n\n- [ ] not a criterion\n",
};
const CHILD_ONE = { number: 838, title: "Child one", repository_url: REPO_URL };
const SUB_JSON = [
  [CHILD_ONE],
  [{ number: 12, title: "Child two", repository_url: "https://api.github.com/repos/TychoHenzen/other" }],
];

function slotsFor(diff = DIFF, pbi = PBI_JSON, subs = SUB_JSON) {
  return reviewSlots({
    changedLines: parseChangedLines(diff),
    pbi: pbiIssue(pbi, "pbi.json"),
    subIssues: subIssueList(subs, "sub-issues.json"),
  });
}

test("one slot per changed file with added lines, criterion, and sub-issue, in order", () => {
  assert.deepEqual(slotsFor(), [
    { slot: "file:src/added.mjs", kind: "file", text: "src/added.mjs" },
    { slot: "file:docs/\u00fc.md", kind: "file", text: "docs/\u00fc.md" },
    { slot: "criterion:1", kind: "criterion", text: "AC-01 first" },
    { slot: "criterion:2", kind: "criterion", text: "AC-02 second" },
    { slot: "sub-issue:TychoHenzen/dod-guard#838", kind: "sub-issue", text: "Child one" },
    { slot: "sub-issue:TychoHenzen/other#12", kind: "sub-issue", text: "Child two" },
  ]);
});

test("the same inputs always produce the same slots", () => {
  assert.deepEqual(slotsFor(), slotsFor());
});

test("zero sub-issues is valid", () => {
  for (const subs of [[], [[]]]) {
    const slots = slotsFor(DIFF, PBI_JSON, subs);
    assert.equal(slots.length, 4);
    assert.equal(slots.some((slot) => slot.slot.startsWith("sub-issue:")), false);
  }
});

test("a PBI without acceptance-criteria checkbox items fails closed and names the PBI", () => {
  const message = /PBI TychoHenzen\/dod-guard#837 has no checkbox item under ## Acceptance criteria/;
  for (const body of ["## Acceptance criteria\n\n- plain bullet\n", "## Outcome\n\n- [ ] x\n", null]) {
    assert.throws(() => slotsFor(DIFF, { ...PBI_JSON, body }), message);
  }
});

test("a malformed PBI names its file", () => {
  const malformed = [
    [],
    null,
    { ...PBI_JSON, number: 0 },
    { ...PBI_JSON, repository_url: "x" },
    { ...PBI_JSON, body: 5 },
  ];
  // assert.throws tests a bare RegExp against String(error), which begins with
  // "Error: ", so the anchored pattern has to be matched against message.
  for (const value of malformed) {
    assert.throws(() => pbiIssue(value, "pbi.json"), { message: /^pbi\.json: the PBI issue JSON needs/ });
  }
});

test("a malformed sub-issue listing names its file", () => {
  assert.throws(
    () => subIssueList({}, "sub-issues.json"),
    /sub-issues\.json: the sub-issue listing must be a JSON array/,
  );
  assert.throws(
    () => subIssueList([[{ number: 1, title: "t" }]], "sub-issues.json"),
    /sub-issues\.json: sub-issue 1 needs a repository_url/,
  );
  assert.throws(
    () => subIssueList([[{ ...CHILD_ONE, number: 0 }]], "sub-issues.json"),
    /sub-issues\.json: sub-issue 1 needs a repository_url/,
  );
  assert.throws(
    () => subIssueList([[{ ...CHILD_ONE, title: " " }]], "sub-issues.json"),
    /sub-issues\.json: sub-issue 1 needs a repository_url/,
  );
  assert.throws(
    () => subIssueList([[CHILD_ONE], [CHILD_ONE]], "sub-issues.json"),
    /sub-issue TychoHenzen\/dod-guard#838 appears more than once/,
  );
});

test("an empty diff stops slot generation", () => {
  assert.throws(() => slotsFor(""), /The diff names no changed files/);
});

const SLOTS = [
  { slot: "file:src/a.mjs", kind: "file", text: "src/a.mjs" },
  { slot: "criterion:1", kind: "criterion", text: "AC-01 <b>bold</b>\nwrapped" },
  { slot: "sub-issue:o/r#5", kind: "sub-issue", text: "Child" },
];
const q = (id, lens, extra) => ({
  id,
  lens,
  question: "What holds?",
  files: ["src/a.mjs"],
  status: "verified",
  ...extra,
});
const PLAN = () => [
  { slot: "file:src/a.mjs", questions: [q("F1", "review-pr-feature"), q("D1", "review-pr-design")] },
  { slot: "criterion:1", questions: [q("R1", "review-pr-reliability")] },
  { slot: "sub-issue:o/r#5", excluded: { lens: "review-pr-hygiene", reason: "Same work as criterion:1" } },
];

test("a complete plan passes, and repaired and unanswered statuses are accepted too", () => {
  assert.doesNotThrow(() => requirePlan(PLAN(), SLOTS));
  const plan = PLAN();
  plan[0].questions[0].status = "repaired";
  plan[1].questions[0].status = "unanswered";
  assert.doesNotThrow(() => requirePlan(plan, SLOTS));
});

test("a plan that is not an array is refused", () => {
  assert.throws(() => requirePlan({}, SLOTS), /The review plan must be a JSON array/);
});

test("a generated slot missing from the plan is named", () => {
  const plan = PLAN().filter((entry) => entry.slot !== "criterion:1");
  assert.throws(() => requirePlan(plan, SLOTS), /Slots missing from the plan: criterion:1/);
});

test("a plan slot that was not generated is refused", () => {
  const plan = [...PLAN(), { slot: "file:extra.mjs", questions: [q("F9", "review-pr-feature")] }];
  assert.throws(
    () => requirePlan(plan, SLOTS),
    /Plan slot "file:extra\.mjs" was not generated from the diff and the PBI/,
  );
});

test("a slot planned twice is refused", () => {
  const plan = [...PLAN(), { slot: "file:src/a.mjs", questions: [q("F9", "review-pr-feature")] }];
  assert.throws(() => requirePlan(plan, SLOTS), /Plan slot file:src\/a\.mjs appears more than once/);
});

test("a slot with neither questions nor an exclusion is refused", () => {
  const plan = PLAN();
  plan[1] = { slot: "criterion:1" };
  assert.throws(() => requirePlan(plan, SLOTS), /Slot criterion:1 has neither questions nor an exclusion/);
});

test("a slot with an empty questions array is refused", () => {
  const plan = PLAN();
  plan[1] = { slot: "criterion:1", questions: [] };
  assert.throws(() => requirePlan(plan, SLOTS), /Slot criterion:1 needs a non-empty questions array/);
});

test("a slot with both questions and an exclusion is refused", () => {
  const plan = PLAN();
  plan[1] = { ...plan[1], excluded: { lens: "review-pr-hygiene", reason: "x" } };
  assert.throws(() => requirePlan(plan, SLOTS), /Slot criterion:1 has both questions and an exclusion/);
});

test("an incomplete question is refused and names its slot", () => {
  const incomplete = [
    { id: " " },
    { lens: "review-pr-style" },
    { question: "" },
    { files: [] },
    { files: [" "] },
    { files: undefined },
    { status: "failed" },
    { status: "excluded" },
  ];
  for (const change of incomplete) {
    const plan = PLAN();
    plan[0].questions[0] = q("F1", "review-pr-feature", change);
    assert.throws(
      () => requirePlan(plan, SLOTS),
      /in slot file:src\/a\.mjs needs an id, a reviewer lens, a question, a files list, and a status of verified, repaired, unanswered/,
    );
  }
  const plan = PLAN();
  plan[0].questions[0] = q(undefined, "review-pr-feature");
  assert.throws(() => requirePlan(plan, SLOTS), { message: /^Question null in slot file:src\/a\.mjs/ });
});

test("an incomplete exclusion is refused and names its slot", () => {
  const incomplete = [
    { reason: "x" },
    { lens: "review-pr-style", reason: "x" },
    { lens: "review-pr-hygiene" },
    { lens: "review-pr-hygiene", reason: " " },
  ];
  for (const excluded of incomplete) {
    const plan = PLAN();
    plan[2] = { slot: "sub-issue:o/r#5", excluded };
    assert.throws(
      () => requirePlan(plan, SLOTS),
      /The exclusion for slot sub-issue:o\/r#5 needs a reviewer lens and a reason/,
    );
  }
});

test("a question id repeated across slots is refused", () => {
  const plan = PLAN();
  plan[1].questions[0].id = "F1";
  assert.throws(() => requirePlan(plan, SLOTS), /Question F1 appears more than once/);
});

test("a lens with no question or exclusion is refused", () => {
  const plan = PLAN();
  plan[2].excluded.lens = "review-pr-design";
  assert.throws(() => requirePlan(plan, SLOTS), /No question or exclusion for review-pr-hygiene/);
});

test("slotsBlock lists every slot with its questions or exclusion, escaped", () => {
  const plan = PLAN();
  plan[1].questions[0].status = "unanswered";
  plan[1].questions[0].question = "Is <details> text\nescaped?";
  assert.deepEqual(slotsBlock(plan, SLOTS).split("\n"), [
    "<details>",
    "<summary>Review plan slots (3)</summary>",
    "",
    "**file:src/a.mjs**",
    "",
    "- F1 review-pr-feature (verified): What holds?",
    "- D1 review-pr-design (verified): What holds?",
    "",
    "**criterion:1**: AC-01 &lt;b&gt;bold&lt;/b&gt; wrapped",
    "",
    "- R1 review-pr-reliability (unanswered): Is &lt;details&gt; text escaped?",
    "",
    "**sub-issue:o/r#5**: Child",
    "",
    "- excluded for review-pr-hygiene: Same work as criterion:1",
    "",
    "</details>",
  ]);
});
