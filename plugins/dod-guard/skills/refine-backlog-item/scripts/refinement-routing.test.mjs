import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const fixtures = await readFile(new URL("../fixtures.md", import.meta.url), "utf8");
const githubDiscipline = await readFile(
  new URL("../../../standards/github-request-discipline.md", import.meta.url),
  "utf8",
);

test("requires explicit Project item types and safe recovery", () => {
  assert.match(
    githubDiscipline,
    prose(
      "For every `add_project_item` operation, set `item_type` explicitly: `issue` for issue items " +
        "and `pull_request` for pull requests.",
    ),
  );
  assert.match(
    githubDiscipline,
    prose(
      "If the operation returns `missing required parameter: item_type`, read back the Project " +
        "before retrying once with the matching type. Do not retry if the item already exists.",
    ),
  );
  assert.match(githubDiscipline, /If the desired state is already\s+present, record the no-op and issue no mutation/);
  assert.match(githubDiscipline, /For create-like writes, read the exact resource or Project membership first/);
  assert.match(githubDiscipline, /A desired readback confirms success/);
});

test("routes discovery after repository and issue research", () => {
  assert.match(skill, /After that repository and issue research, state a discovery triage/);
  assert.match(skill, /user constraints or priorities/);
  assert.match(skill, /external facts or context/);
  assert.match(skill, /genuine tradeoff/);
  assert.match(skill, /When the result is `no gap`, continue\s+without invoking a discovery workflow/);
  assert.match(skill, /new\s+evidence exposes a missing user constraint or external fact/);
});

test("reads back only after a failed write, and once before Todo", () => {
  assert.doesNotMatch(skill, /mutation snapshot/);
  assert.match(skill, /After a failed, timed-out, or ambiguous write, follow the shared GitHub\s+standard/);
  assert.match(skill, /Read back the issue body, labels, linked sub-issues, and Project status from\s+GitHub/);
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
  assert.match(skill, /exactly\s+one fresh `dod-guard:codex-advisor`/);
  assert.match(
    skill,
    /Claude's advisor tool in Claude Code, otherwise Codex with `gpt-5\.6-luna` at\s+`max` reasoning effort/,
  );
  assert.match(skill, /candidate answers and recommended default/);
  assert.match(skill, /Batch every currently independent question into that one advisor brief/);
  assert.match(skill, /Defer a\s+question whose options depend on an advisor answer/);
  assert.match(skill, /The advisor is advice-only and cannot replace user authority/);
  assert.match(skill, /`advisor-decision` implementation note/);
  assert.match(skill, /Do not invoke another\s+advisor to retry, vote, or refine its answer/);
  assert.match(skill, /If the advisor cannot\s+resolve a user-authority question/);
  assert.match(skill, /If the advisor invocation fails or its response is unusable/);
  assert.match(skill, /exact advisor\s+failure, impact, and next required authority/);
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

test("uses functional decomposition with cross-cutting review lenses", () => {
  const sectionStart = skill.indexOf("For a structured parent PBI");
  const sectionEnd = skill.indexOf("Apply the same research", sectionStart);
  assert.ok(sectionStart >= 0);
  assert.ok(sectionEnd > sectionStart);
  const structuredParentSection = skill.slice(sectionStart, sectionEnd);

  assert.match(skill, /use functional decomposition/);
  assert.match(skill, /independently\s+implemented, tested, and verified/);
  assert.match(skill, /no\s+child is required merely to fill a fixed\s+category list/);
  assert.match(structuredParentSection, /implementation, wiring and/);
  assert.match(structuredParentSection, /end-to-end usability/);
  assert.match(structuredParentSection, /refactoring and code quality/);
  assert.match(structuredParentSection, /failure\/recovery reliability/);
  assert.match(structuredParentSection, /these are review lenses, not mandatory child categories/);
  assert.match(skill, /map every task to its functional slice/);
  assert.match(skill, /every\s+linked child matches one independently deliverable functional slice/);
  assert.match(skill, /Decompose by successive refinement/);
  assert.match(skill, /leaves the system working with its tests\s+green/);
  assert.match(skill, /can only be named by\s+its position or layer/);
  assert.match(skill, /introduces the shared boundary that owns those\s+steps/);
  assert.match(skill, /deletes what it made obsolete/);
  assert.doesNotMatch(skill, /require exactly one linked child for each category/);
  assert.doesNotMatch(skill, /four mandatory child categories are linked exactly once/);
});

test("manual fixtures include each route and its record markers", () => {
  for (const [fixture, markers] of [
    ["No gap", ["discovery-triage: no gap", "Do not invoke interview, external research, or debate."]],
    ["Batched clarification", ["Use ordinary conversation. Ask both", "record `interview-contract`"]],
    [
      "Non-interactive clarification",
      ["Invoke exactly one fresh `dod-guard:codex-advisor`", "Record `advisor-decision`", "re-run triage"],
    ],
    [
      "Batched non-interactive clarification",
      [
        "Batch every currently independent question into the one advisor brief",
        "Defer questions that depend on an advisor answer",
      ],
    ],
    [
      "Advisor cannot resolve user authority",
      [
        "Record `unresolved-decision` with the question, evidence, impact, and next required authority",
        "Keep the issue in `Backlog`",
      ],
    ],
    [
      "Advisor invocation failure",
      [
        "Record `unresolved-decision` with the question, researched evidence, exact advisor failure, " +
          "impact, and next required authority",
        "Keep the issue in `Backlog`",
      ],
    ],
    [
      "Unanswered clarification",
      ["record `unresolved-decision`", "Do not ask the dependent question or move to `Todo`"],
    ],
    [
      "Repository context",
      ["Inspect the code, callers, tests, and current architecture.", "Record `research-source` findings"],
    ],
    [
      "External context",
      [
        "Use targeted web or Context7 research.",
        "Record the source, relevant finding, and uncertainty in `research-source`.",
      ],
    ],
    [
      "Debate after constraints",
      [
        "Run at least two debate rounds",
        "Record each expert's lens",
        "`debate-synthesis`",
        "`accepted-option`",
        "`rejected-option`",
      ],
    ],
    [
      "Newly discovered gap",
      ["Return to the matching interview or research route.", "Do not turn the gap into an assumption."],
    ],
    [
      "Unavailable workflow",
      [
        "Record what is unclear, the unavailable workflow or fallback, the impact, and the next decision or evidence.",
        "Move to `Todo` only when the PBI remains coherent",
      ],
    ],
    [
      "Re-refinement",
      [
        "Reuse current summaries, repeat only the stale or new phase, update notes in place, " +
          "and create no duplicate sub-issues or scale labels.",
      ],
    ],
    [
      "Structured parent",
      [
        "Create one actionable Todo child per functional slice, keep dependent steps in the parent " +
          "checklist, and assess implementation, wiring/usability, quality, and reliability across " +
          "the owning slices with observable evidence.",
      ],
    ],
    [
      "Partial structured parent",
      [
        "Reuse that child, add only independently deliverable missing slices, and do not create " +
          "category placeholders, child branches, or PRs.",
      ],
    ],
    [
      "Repeated variant shape",
      [
        "Make the first slice introduce the shared format boundary and move one existing format behind it",
        "Each slice keeps the system working and deletes the structure it replaces.",
      ],
    ],
  ]) {
    const row = fixtures.split("\n").find((line) => line.startsWith(`| ${fixture} |`));
    assert.ok(row, `missing fixture row: ${fixture}`);
    for (const marker of markers) {
      assert.ok(row.includes(marker), `fixture ${fixture} is missing: ${marker}`);
    }
  }
});
