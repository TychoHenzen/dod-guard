// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { scannerReview } from "./scanner-review.test-support.mjs";

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

// Past PR 48 scale: there the dropped block alone was 70713 characters and the
// 98334-character body was refused. Each file's question cites its own S ids.
test("5000 dropped violations across 200 files still build a postable body", () => {
  const files = Array.from({ length: 200 }, (_, index) => `src/Game/Model/Some/Long/Path/Component-${index}.cs`);
  const violations = Array.from({ length: 5000 }, (_, index) => ({
    file: files[index % files.length],
    line: 100 + index,
    rule: RULES[index % RULES.length],
    severity: "medium",
    message: `component${index} is too long for the default limit`,
  }));
  const drop = (ids, index) => ({ ids, status: "DROP", reason: "rule-misfire", answer: `Q${index + 1}` });
  const { payload } = scannerReview({ files, line: 10, violations, rule: drop });
  assert.ok(payload.body.includes("<summary>Dropped scanner findings (5000)</summary>"));
  assert.ok(payload.body.length < 65_536, `body is ${payload.body.length} characters`);
});
