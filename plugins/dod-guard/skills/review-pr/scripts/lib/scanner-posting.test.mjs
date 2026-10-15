// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { scannerCandidates } from "./finding-ids.mjs";
import { buildReview } from "./review-findings.mjs";
import { complete, findingsFixture } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

const { HEAD, PBI, question, hunk } = findingsFixture;
const LENSES = ["feature", "design", "reliability", "hygiene"].map((lens) => `review-pr-${lens}`);

// One added line per file, one scanner check question per file slot listing
// that file's S ids, and every lens asked about the criterion so no judge idles.
function scannerReview({ files, line, violations, rule }) {
  const diff = files.flatMap((file) => hunk(file, line)).join("\n");
  const candidates = scannerCandidates({ violations }, parseChangedLines(diff));
  const idsOf = (file) => candidates.filter((item) => item.file === file).map(({ id }) => id);
  const slot = (file, index) => {
    const asked = { ...question(`Q${index + 1}`, "review-pr-hygiene"), files: [file] };
    return { slot: `file:${file}`, questions: [{ ...asked, scanner: idsOf(file) }] };
  };
  const criterion = LENSES.map((lens, index) => question(`C${index + 1}`, lens));
  const plan = [...files.map(slot), { slot: "criterion:1", questions: criterion }];
  const results = complete([], slotsByLens(plan));
  const scanner = files.map((file, index) => rule(idsOf(file), index));
  const inputs = { headSha: HEAD, scan: { violations }, diff, plan, pbi: PBI, subIssues: [] };
  return buildReview({ ...inputs, results, merge: { groups: [], scanner } });
}

// PR #933: a line the PR added at the reviewed head was 121 characters long.
test("the #933 line-length violation ruled KEEP posts MAJOR under the unchanged rule", () => {
  const file = "plugins/dod-guard/skills/goal-sdlc/scripts/goal-sdlc-contract.test.mjs";
  const message = "line is 121 chars";
  const violations = [{ file, line: 140, rule: "line-length", severity: "high", message }];
  const keep = (ids) => ({ ids, status: "KEEP" });
  const { payload, counts } = scannerReview({ files: [file], line: 140, violations, rule: keep });
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 1, MINOR: 0 });
  const item = `- \`line-length\` line 140: ${message}`;
  const body = `**MAJOR** quality-guard structural findings (1)\n\n${item}`;
  assert.deepEqual(payload.comments, [{ path: file, line: 140, side: "RIGHT", body }]);
});

const REASONS = ["not-at-head", "excluded-path", "rule-misfire"];
const RULES = ["function-length", "complexity", "duplicate-block", "dead-export", "file-length"];
const SKILLS = ["setup-repository", "next-ticket", "fix-pr-review", "goal-sdlc", "complete-pr"];

// PR #935 scale: 370 whole-file violations across 14 legacy files.
function legacyFiles() {
  return Array.from({ length: 14 }, (_, index) => {
    const skill = SKILLS[index % SKILLS.length];
    return `plugins/dod-guard/skills/${skill}/scripts/lib/inspect-repository-state-${index}.mjs`;
  });
}

function legacyViolations(files) {
  return Array.from({ length: 370 }, (_, index) => ({
    file: files[index % files.length],
    line: 100 + index,
    rule: RULES[index % RULES.length],
    severity: index % 3 === 0 ? "high" : "medium",
    message: `inspectRepositoryState${index}() cyclomatic complexity 12 exceeds 5`,
  }));
}

test("370 dropped violations across 14 files build a body under 65536 characters", () => {
  const files = legacyFiles();
  const drop = (ids, index) => {
    const reason = REASONS[index % REASONS.length];
    return { ids, status: "DROP", reason, answer: `Q${index + 1}` };
  };
  const violations = legacyViolations(files);
  const { payload, counts } = scannerReview({ files, line: 10, violations, rule: drop });
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 0, MINOR: 0 });
  assert.equal(payload.comments.length, 0);
  assert.ok(payload.body.includes("<summary>Dropped scanner findings (370)</summary>"));
  assert.ok(payload.body.length < 65_536, `body is ${payload.body.length} characters`);
});
