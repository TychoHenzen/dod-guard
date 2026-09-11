import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

test("quick-pbi covers the full delivery lifecycle without extra prompts", () => {
  for (const stage of [
    "/add-backlog-idea",
    "/refine-backlog-item",
    "/next-ticket",
    "/submit-draft-pr",
    "/review-pr",
    "/fix-pr-review",
    "/complete-pr",
  ]) {
    assert.match(skill, new RegExp(stage.replaceAll("/", "\\/")));
  }
  for (const signal of [
    /Ask no confirmation between stages/,
    /only allowed user interaction.*refine-backlog-item/s,
    /all currently\s+independent questions in one round/,
    /every unresolved finding/,
    /repeat this\s+review-fix cycle until no actionable findings remain/,
    /stop without rollback or duplicate issues/,
  ]) {
    assert.match(skill, signal);
  }
});
