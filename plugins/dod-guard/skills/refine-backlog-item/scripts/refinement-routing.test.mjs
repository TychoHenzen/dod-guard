import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const fixtures = await readFile(new URL("../fixtures.md", import.meta.url), "utf8");

test("routes discovery after repository and issue research", () => {
  assert.match(skill, /After that repository and issue research, state a discovery triage/);
  assert.match(skill, /user constraints or priorities/);
  assert.match(skill, /external facts or context/);
  assert.match(skill, /genuine tradeoff/);
  assert.match(skill, /When the result is `no gap`, continue\s+without invoking a discovery workflow/);
  assert.match(skill, /new\s+evidence exposes a missing user constraint or external fact/);
});

test("defines provider-neutral interview and debate contracts", () => {
  assert.match(skill, /ordinary conversation/);
  assert.match(skill, /every\s+currently independent clarification question in one round/);
  assert.match(skill, /multiple concrete options/);
  assert.match(skill, /Wait for the current round's answers/);
  assert.match(skill, /Do not require a provider-specific `AskUserQuestion` tool/);
  assert.match(skill, /only after the required facts and user constraints\s+are available/);
  assert.match(skill, /three to five named real experts/);
  assert.match(skill, /why\s+that lens applies/);
});

test("requires durable discovery records and selective re-refinement", () => {
  for (const marker of [
    "discovery-triage",
    "interview-contract",
    "research-source",
    "debate-synthesis",
    "accepted-option",
    "rejected-option",
    "unresolved-decision",
  ]) {
    assert.match(skill, new RegExp("`" + marker + "`"));
  }
  assert.match(skill, /Reuse\s+evidence that is still current/);
  assert.match(skill, /Do not create duplicate linked sub-issues or scale labels/);
});

test("manual fixtures cover every discovery route and fallback", () => {
  for (const fixture of [
    "No gap",
    "Batched clarification",
    "Unanswered clarification",
    "Repository context",
    "External context",
    "Debate after constraints",
    "Newly discovered gap",
    "Unavailable workflow",
    "Re-refinement",
  ]) {
    assert.match(fixtures, new RegExp("\\| " + fixture + " \\|"));
  }
});
