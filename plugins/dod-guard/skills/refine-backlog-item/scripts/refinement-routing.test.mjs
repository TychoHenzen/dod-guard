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

test("revalidates mutation state before issue writes and Todo", () => {
  assert.match(
    skill,
    /Before each issue write, including a body, label, or\s+linked-sub-issue mutation, re-read those values and compare them with the\s+latest mutation snapshot/,
  );
  assert.match(skill, /If any value changed, stop without writing and\s+report the mismatch/);
  assert.match(skill, /Immediately before moving to `Todo`, repeat the same comparison/);
});

test("paginates the complete live label inventory", () => {
  assert.match(skill, /gh api --paginate "repos\/\{owner\}\/\{repo\}\/labels\?per_page=100"/);
  assert.match(fixtures, /Put the only matching scale label on the second API page/);
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

test("routes non-interactive clarification through one bounded advisor", () => {
  assert.match(skill, /During an active goal or explicitly non-interactive refinement/);
  assert.match(skill, /exactly\s+one fresh `\$dod-guard:codex-advisor`/);
  assert.match(skill, /`gpt-5\.6-luna` with `max` reasoning effort/);
  assert.match(skill, /candidate answers and recommended default/);
  assert.match(skill, /The advisor is advice-only and cannot replace user authority/);
  assert.match(skill, /`advisor-decision` implementation note/);
  assert.match(skill, /Do not invoke another\s+advisor to retry, vote, or refine its answer/);
  assert.match(skill, /If the advisor cannot\s+resolve a user-authority question/);
  assert.match(skill, /keep the issue in\s+`Backlog`/);
});

test("requires durable discovery records and selective re-refinement", () => {
  for (const marker of [
    "discovery-triage",
    "interview-contract",
    "advisor-decision",
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

test("requires one reusable mandatory child for every structured parent category", () => {
  assert.match(skill, /require exactly one linked child for each category/);
  assert.match(skill, /implementation; wiring and end-to-end\s+usability; refactoring and quality; fixing and reliability/);
  assert.match(skill, /Reuse an existing\s+child/);
  assert.match(skill, /never duplicate a category/);
  assert.match(skill, /structured-parent exception to the ordinary\s+independence rule/);
  assert.match(skill, /checklist work[\s\S]*not authorize child branches or pull requests/);
  assert.match(skill, /four mandatory child categories are linked exactly once/);
  assert.match(skill, /every child is\s+actionable and `Todo` before moving the parent to `Todo`/);
});

test("manual fixtures include each route and its record markers", () => {
  for (const [fixture, markers] of [
    ["No gap", ["discovery-triage: no gap", "Do not invoke interview, external research, or debate."]],
    ["Batched clarification", ["Use ordinary conversation through `/interview`", "record `interview-contract`"]],
    ["Non-interactive clarification", ["Invoke exactly one fresh `$dod-guard:codex-advisor` with `gpt-5.6-luna` and `max`", "Record `advisor-decision`", "re-run triage"]],
    ["Advisor cannot resolve user authority", ["Record `unresolved-decision` with the question, evidence, impact, and next required authority", "Keep the issue in `Backlog`"]],
    ["Unanswered clarification", ["record `unresolved-decision`", "Do not ask the dependent question or move to `Todo`"]],
    ["Repository context", ["Inspect the code, callers, tests, and current architecture.", "Record `research-source` findings"]],
    ["External context", ["Use targeted web or Context7 research.", "Record the source, relevant finding, and uncertainty in `research-source`."]],
    ["Debate after constraints", ["Use the existing multi-round `$debate` protocol", "Record each expert's lens", "`debate-synthesis`", "`accepted-option`", "`rejected-option`"]],
    ["Newly discovered gap", ["Return to the matching interview or research route.", "Do not turn the gap into an assumption."]],
    ["Unavailable workflow", ["Record what is unclear, the unavailable workflow or fallback, the impact, and the next decision or evidence.", "Move to `Todo` only when the PBI remains coherent"]],
    ["Re-refinement", ["Reuse current summaries, repeat only the stale or new phase, update notes in place, and create no duplicate sub-issues or scale labels."]],
    ["Structured parent", ["Create exactly one actionable Todo child for implementation, wiring/usability, quality, and reliability before moving the parent to Todo."]],
    ["Partial structured parent", ["Reuse those two children, add only wiring/usability and reliability, and do not create child branches or PRs."]],
  ]) {
    const row = fixtures.split("\n").find((line) => line.startsWith(`| ${fixture} |`));
    assert.ok(row, `missing fixture row: ${fixture}`);
    for (const marker of markers) {
      assert.ok(row.includes(marker), `fixture ${fixture} is missing: ${marker}`);
    }
  }
});
