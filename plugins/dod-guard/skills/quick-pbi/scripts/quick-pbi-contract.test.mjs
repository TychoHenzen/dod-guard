import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const usage = await readFile(new URL("../../../USAGE.md", import.meta.url), "utf8");
const reviewSkill = await readFile(new URL("../../review-pr/SKILL.md", import.meta.url), "utf8");

function assertInOrder(text, patterns) {
  let previous = -1;
  for (const pattern of patterns) {
    const position = text.search(pattern);
    assert.ok(position > previous, `${pattern} must follow the preceding contract step`);
    previous = position;
  }
}

test("quick-pbi covers the full delivery lifecycle without extra prompts", () => {
  const stages = [
    "/add-backlog-idea",
    "/refine-backlog-item",
    "/next-ticket",
    "/submit-draft-pr",
    "/review-pr",
    "/fix-pr-review",
    "/complete-pr",
  ];
  for (const stage of stages) {
    assert.match(skill, new RegExp(stage.replaceAll("/", "\\/")));
  }
  const lifecycleStart = skill.indexOf("## Run the lifecycle");
  const positions = stages.map((stage) => skill.indexOf(stage, lifecycleStart));
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  for (const signal of [
    /Ask no confirmation between stages/,
    /only allowed user interaction.*refine-backlog-item/s,
    /all currently\s+independent questions in one round/,
    /cannot be assigned.*stop.*do not\s+ask/s,
    /completed\s+`APPROVE`,\s+`REQUEST_CHANGES`,\s+or\s+`BLOCK` recommendation is the one review/s,
    /every valid unresolved\s+finding/,
    /Do not invoke another review after those fixes/,
    /stop without rollback or duplicate issues/,
    /concrete feature request authorizes the routine lifecycle/,
    /one associated parent PBI/,
    /one branch, its\s+commit series, and one draft PR/,
    /Do not pause for ceremonial confirmation/,
  ]) {
    assert.match(skill, signal);
  }
  assert.doesNotMatch(skill, /Re-review the pushed head/);
  assert.doesNotMatch(skill, /repeat this\s+review-fix cycle/);
});

test("consumes review-pr's Codex recommendation without a local ledger", () => {
  assert.match(reviewSkill, /`BLOCK` when any finding is\s+`P0`[\s\S]*`REQUEST_CHANGES`[\s\S]*`APPROVE` when there are none/);
  assert.match(reviewSkill, /Never post `@codex review`\s+yourself, and never post it twice/);
  assert.match(reviewSkill, /never writes its own review, approves, marks ready, merges, or\s+closes anything/);
  assert.match(skill, /Read the\s+recommendation and reviewed commit back from the remote PR; no local ledger\s+is needed/);
  assert.match(skill, /stops on a `hold`[\s\S]*durable blocker and stop/);
  assert.doesNotMatch(skill, /durable ledger|read back the ledger|reconcile the ledger/);
  assert.doesNotMatch(usage, /reconciles the ledger/);
});

test("resolves findings without a second review", () => {
  assertInOrder(skill, [/rerun affected checks/, /respond to and resolve each finding/, /Do not invoke another review after those fixes/]);
  assert.match(skill, /every finding is fixed and\s+resolved, or recorded as not actionable with evidence/);
  assert.match(usage, /uses that completed review's recommendation[\s\S]*does\s+not invoke another review after fixes/);
  assert.doesNotMatch(usage, /repeats review before the guarded merge/);
});
