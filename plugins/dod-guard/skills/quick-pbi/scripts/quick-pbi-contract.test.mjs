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
    /completed\s+`APPROVE`,\s+`REQUEST_CHANGES`,\s+or\s+`BLOCK` recommendation is a successful\s+review/s,
    /consumes the one-review slot/,
    /launcher or process failure|timeout or interruption/,
    /retry until a completed\s+recommendation\s+exists/,
    /every valid\s+unresolved finding/,
    /Do not invoke another\s+reviewer after those fixes/,
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

test("defines the authoritative recommendation mapping and publication boundary", () => {
  assert.match(
    reviewSkill,
    /final report is the authoritative lifecycle result[\s\S]*`BLOCK`[\s\S]*`REQUEST_CHANGES`[\s\S]*`APPROVE`[\s\S]*GitHub `COMMENT` review is[\s\S]*not the lifecycle recommendation/,
  );
  assert.match(
    skill,
    /authoritative producer[\s\S]*accepted `BLOCKER` findings to `BLOCK`[\s\S]*other accepted findings to[\s\S]*`REQUEST_CHANGES`[\s\S]*no accepted findings to `APPROVE`/,
  );
  assert.match(skill, /Read that report's\s+recommendation and reviewed head back from the remote PR; no local ledger\s+is needed/);
  assert.doesNotMatch(skill, /durable ledger|read back the ledger|reconcile the ledger/);
});

test("keeps nested Codex launches on the supported command contract", () => {
  for (const signal of [
    /direct\s+`codex\.exe`\s+executable\s+on\s+Windows/i,
    /probe\s+`--version`\s+and\s+`exec --help`\s+before\s+consuming\s+review\s+state/i,
    /write-capable\s+execution\s+uses\s+the\s+supported\s+`--approve-for-me`/i,
    /read-only\s+execution\s+sends\s+no\s+approval\s+option/i,
    /Reject\s+obsolete\s+`--ask-for-approval`/i,
    /launcher\s+or\s+process\s+failure\s+without\s+a\s+completed\s+recommendation\s+is\s+incomplete/i,
    /Never\s+retry\s+a\s+completed\s+`APPROVE`,\s+`REQUEST_CHANGES`,\s+or\s+`BLOCK`\s+result/i,
  ]) {
    assert.match(reviewSkill, signal);
  }
});

test("distinguishes incomplete execution from completed review evidence", () => {
  assert.match(
    skill,
    /[Aa] launcher or process\s+failure is incomplete only when it produces no[\s\S]*terminal report with a recommendation[\s\S]*validation, coverage, findings, and[\s\S]*required-check results in an existing report are completed review evidence[\s\S]*not an incomplete execution/,
  );
  assert.doesNotMatch(skill, /validation or coverage failure.*incomplete execution/i);
  assertInOrder(skill, [
    /record the exact\s+failure class and evidence/,
    /read back the remote review state/,
    /repair the cause/,
    /verify the repair/,
    /retry until a completed/,
  ]);
});

test("waits on active command sessions before retrying checks or reviewers", () => {
  assert.match(skill, /active command-session handle is\s+authoritative in-progress state/);
  assert.match(skill, /wait or\s+poll that same handle to a terminal\s+result/);
  assert.match(skill, /preserve the exact command and\s+session evidence/);
  assert.match(skill, /missing intermediate output as failure[\s\S]*launch a duplicate check or\s+reviewer/);
  assert.match(skill, /explicit cancellation or confirmed\s+session\s+failure/);
  assert.match(skill, /invocation-owned process or session[\s\S]*confirm it stopped first/);
  assert.match(reviewSkill, /active session handle[\s\S]*same reviewer invocation[\s\S]*terminal result/);
  assert.match(reviewSkill, /missing intermediate output as failure[\s\S]*launch a duplicate reviewer/);
  assert.match(reviewSkill, /explicit cancellation or[\s\S]*confirmed session failure/);
  assert.match(usage, /active command-session handle is\s+authoritative in-progress state/);
  assert.match(usage, /wait or\s+poll that same handle to a terminal\s+result/);
  assert.match(usage, /missing\s+intermediate output as non-failure/);
  assert.match(usage, /invocation-owned process or\s+session[\s\S]*confirm it stopped/);
});

test("reconciles timed-out reviewers and resolves findings without a second review", () => {
  assertInOrder(skill, [
    /timeout or interruption/,
    /confirm the prior reviewer has stopped/,
    /reconcile the remote PR state/,
    /consume any late report/,
    /retrying/,
  ]);
  assertInOrder(skill, [/rerun affected checks/, /respond to and resolve each\s+finding/]);
  assert.match(skill, /Do not invoke another reviewer after those fixes/);
  assert.match(usage, /uses that completed review's recommendation[\s\S]*does\s+not invoke another reviewer after fixes/);
  assert.doesNotMatch(usage, /repeats review before the guarded merge/);
});
