import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("step-by-step keeps ordered orchestration in the main thread", () => {
  assert.match(skill, /explicit numbered plan[\s\S]*user names explicitly/);
  assert.match(skill, /Do not search for plan files/);
  assert.match(skill, /main thread owns the plan, current\s+step, evidence, repair decision, and completion state/);
  assert.match(skill, /one fresh subagent/);
  assert.match(skill, /For each step, in order/);
  assert.match(skill, /Run the step's named\s+proof before marking it complete/);
  assert.match(skill, /Record the result, evidence, and next step/);
  assert.match(skill, /Do not reuse a worker for an unrelated later step/);
  assert.match(skill, /Do not dispatch a second\s+step while the active step lacks a terminal result/);
  assert.match(skill, /active session handle[\s\S]*in-progress/);
  assert.match(skill, /wait or poll that same handle to a terminal result/);
  assert.match(
    skill,
    /active session handle[\s\S]*?wait or poll that same handle to a terminal result[\s\S]*?do not treat missing\s+intermediate output as failure or dispatch another copy[\s\S]*?retry only after explicit cancellation or confirmed\s+session failure/,
  );
  assert.match(skill, /missing\s+intermediate output as failure/);
  assert.match(skill, /preserve the exact command and session evidence/);
  assert.match(skill, /explicit cancellation or confirmed\s+session failure/);
  assert.match(skill, /invocation-owned process or session/);
  assert.match(skill, /Do\s+not skip forward or restart completed steps/);
  assert.match(skill, /one fresh bounded repair task/);
  assert.match(skill, /If repair\s+cannot establish the step's\s+acceptance condition, stop with the checkpoint/);
  assert.match(skill, /prohibition on branches,\s+pull requests, worktrees, or unrelated edits/);
});
