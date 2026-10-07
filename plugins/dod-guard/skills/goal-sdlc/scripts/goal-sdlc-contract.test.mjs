import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "SKILL.md",
);

async function readSkill() {
  return readFile(skillPath, "utf8");
}

test("goal-sdlc retains every delivery stage and queue boundary", async () => {
  const skill = await readSkill();
  for (const marker of [
    "## Acceptance matrix contract",
    "### Checkout and execution policy",
    "### Continuous queue loop",
    "### State snapshot and read discipline",
    "### 1. Reconcile live state",
    "### 2. Choose one current delivery unit",
    "### 3. Refinement contract",
    "### 4. Implementation and branch rules",
    "### 5. Goal-directed validation cadence",
    "### 6. PR completion",
    "### 7. Blocker triage and proactive recovery",
    "### 8. Quality Guard and cache changes",
    "### 9. Common-sense completion and continuation",
    "After every successful merge:",
  ]) {
    assert.ok(skill.includes(marker), `missing workflow marker: ${marker}`);
  }
  assert.match(skill, /Reconcile the current repository's Project items before selecting a parent/);
  assert.match(skill, /paginate every Project page, filter to the target repository/);
  assert.match(skill, /treat every reconciliation input as an explicit live observation/);
  assert.match(
    skill,
    /omitted, unknown, stale, filtered, or provider-unavailable value is not/,
  );
  assert.match(skill, /classify the missing evidence as `hold`/);
  assert.match(skill, /Process exactly one parent PBI\/delivery unit at a time/);
  assert.match(skill, /one compact acceptance matrix in its GitHub/);
  assert.match(skill, /identity\/authorization, interactive controls/);
  assert.match(skill, /not a local ledger or a numeric quality gate/);
  assert.match(skill, /Do not mark the goal complete after one PBI/);
  assert.match(
    skill,
    /target project: the single open GitHub Project explicitly linked to the current repository/,
  );
  assert.doesNotMatch(
    skill,
    /target project: https?:\/\//,
  );
});

test("goal-sdlc keeps Quality Guard output advisory", async () => {
  const skill = await readSkill();
  const start = skill.indexOf("### 8. Quality Guard and cache changes");
  const end = skill.indexOf("### 9. Common-sense completion and continuation", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const section = skill.slice(start, end);

  assert.match(section, /Quality Guard output is advisory diagnostic evidence/);
  assert.match(section, /report, test-quality, and readability evidence/);
  assert.match(section, /correctness gates/);
  assert.match(section, /never writes persisted quality state/);
  assert.doesNotMatch(section, /\b(?:baseline|ratchet|re-?baseline)\b/i);
});

test("goal-sdlc defines one exact-head pre-review checkpoint", async () => {
  const skill = await readSkill();
  for (const marker of [
    "## Exact-head pre-review checkpoint",
    "required provider context",
    "present`, `pending`, `failed`, `skipped`, or",
    "draft lifecycle skipped a required workflow",
    "at most once for the same repository",
    "dispatch readback",
    "base ref or SHA advances",
    "acceptance matrix stale",
    "Unexpected branch movement, unresolved conflicts",
    "does not force-push, write generated refs",
  ]) {
    assert.ok(skill.includes(marker), `missing pre-review checkpoint marker: ${marker}`);
  }
  assert.match(skill, /Before `\/review-pr` or guarded completion/);
  assert.match(skill, /submit-draft-pr` owns draft creation and read-only convergence/);
  assert.match(skill, /`complete-pr`\s+retains the existing provider dispatch/);
  assert.match(skill, /never becomes a second ledger/);
});

test("goal-sdlc runs one review per PR and publishes one Project count snapshot", async () => {
  const skill = await readSkill();
  for (const marker of [
    "## Single review",
    "posts one review per pull request",
    "completed\nreview suppresses every later review",
    "raw items, parent items, child items",
    "parent items with `Done`",
    "child items with `Done`",
    "never run a second scan or infer a count",
    "active process or session handle",
    "yield limit is not an operation deadline",
    "CreateProcess ... rejected by policy",
    "operator explicitly cancels",
  ]) {
    assert.ok(skill.includes(marker), `missing friction safeguard marker: ${marker}`);
  }
});

test("goal-sdlc states the reconciliation rules that queue-readback implements", async () => {
  const skill = await readSkill();
  for (const marker of [
    "classify a merged delivery as `complete` only when the existing",
    "active checkpoint explicitly observed as `false`",
    "normalize each issue group into one delivery record",
    "an orphaned child has",
    "status drift records the parent/child",
    "never select a child record",
    "classify a merged delivery with any missing check, open issue or child",
    "exclude it from queue candidates and hand any cleanup to",
    "queue candidates, report the exact missing evidence",
    "Keep this reconciliation read-only",
    "make zero mutation calls",
    "do not select a held or complete child as an independent parent",
  ]) {
    assert.ok(skill.includes(marker), `missing reconciliation marker: ${marker}`);
  }
});
