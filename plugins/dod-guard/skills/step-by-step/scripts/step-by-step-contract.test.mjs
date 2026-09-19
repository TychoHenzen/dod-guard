import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("step-by-step keeps ordered orchestration in the main thread", () => {
  assert.match(skill, /explicit numbered plan[\s\S]*user names explicitly/);
  assert.match(skill, /Do not search for plan files/);
  assert.match(skill, /main thread owns the plan, current\s+step, evidence, repair decision, and completion state/);
  assert.match(skill, /one fresh subagent/);
  assert.match(skill, /Do not reuse a worker for an unrelated later step/);
  assert.match(skill, /Do not dispatch a second\s+step while the active step lacks a terminal result/);
  assert.match(skill, /Do\s+not skip forward or restart completed steps/);
  assert.match(skill, /prohibition on branches,\s+pull requests, or unrelated edits/);
});
