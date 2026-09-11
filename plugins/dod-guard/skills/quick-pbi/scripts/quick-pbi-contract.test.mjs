import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

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
    /reviewer-validation failure/,
    /all four reviewers\s+are validated/,
    /every unresolved finding/,
    /repeat this\s+review-fix cycle until no actionable findings remain/,
    /stop without rollback or duplicate issues/,
  ]) {
    assert.match(skill, signal);
  }
});
