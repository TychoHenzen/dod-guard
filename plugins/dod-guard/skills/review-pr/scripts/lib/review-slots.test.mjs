// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { pbiIssue, reviewSlots, subIssueList } from "./review-slots.mjs";
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
