import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ACCEPTANCE_MATRIX_PATHS } from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";

const proof = await import("../../next-ticket/scripts/structured-workflow-proof.mjs");

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const fixtures = await readFile(new URL("../fixtures.md", import.meta.url), "utf8");
const githubDiscipline = await readFile(
  new URL("../../../standards/github-request-discipline.md", import.meta.url),
  "utf8",
);
const completeRecords = (lensOwnership = []) =>
  proof.REQUIRED_RECORDS.reduce(
    (records, name) => ({ ...records, [name]: name === "lens-ownership" ? lensOwnership : true }),
    {},
  );
const validConvergenceInput = () => {
  const reviewLenses = proof.REQUIRED_REVIEW_LENSES.map((id, index) => ({
    id,
    owner: "task-1",
    evidence: `lens-${id}`,
    headSha: "proof-head",
    acceptanceEvidence: index === 1 ? ["matrix-evidence-2", "matrix-evidence-5"] : `matrix-evidence-${index + 1}`,
    verificationEvidence: index === 1 ? ["matrix-proof-2", "matrix-proof-5"] : `matrix-proof-${index + 1}`,
  }));
  return {
    records: completeRecords(reviewLenses),
    tasks: [{
      id: "task-1",
      child: "search-flow",
      evidence: [
        "commit-proof",
        ...proof.REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`),
      ],
      acceptanceEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-evidence-${index + 1}`),
      verificationEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-proof-${index + 1}`),
    }, {
      id: "task-2",
      child: "settings-flow",
      evidence: "settings-proof",
    }],
    children: [
      { id: "search-flow", evidence: "slice-proof" },
      { id: "settings-flow", evidence: "settings-slice-proof" },
    ],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
    acceptanceMatrix: ACCEPTANCE_MATRIX_PATHS.map((path, index) => ({
      id: `AC-1-${index + 1}`,
      contract: "AC-1",
      path,
      proof: `matrix-proof-${index + 1}`,
      expected: "pass",
      observed: "pass",
      status: "pass",
      evidence: `matrix-evidence-${index + 1}`,
      headSha: "proof-head",
    })),
    headSha: "proof-head",
  };
};

test("requires explicit Project item types and safe recovery", () => {
  assert.match(
    githubDiscipline,
    /For every `add_project_item` operation, set `item_type` explicitly:\s+`issue` for issue items and `pull_request` for pull requests\./,
  );
  assert.match(
    githubDiscipline,
    /If the\s+operation returns `missing required parameter: item_type`, read back\s+the\s+Project before retrying once with the matching type\. Do not retry if the item\s+already exists\./,
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
  assert.match(skill, /exactly\s+one fresh `\$dod-guard:codex-advisor`/);
  assert.match(skill, /`gpt-5\.6-luna` with `max` reasoning effort/);
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
  assert.doesNotMatch(skill, /require exactly one linked child for each category/);
  assert.doesNotMatch(skill, /four mandatory child categories are linked exactly once/);
});

test("routes a valid functional decomposition through executable convergence proof", () => {
  assert.equal(proof.scenarioResult("passing").outcome, "verified");
  const passing = proof.evaluateConvergence(validConvergenceInput());
  assert.equal(passing.outcome, "verified");
  assert.ok(!passing.remainder.some((entry) => entry.includes("review lens")));
});

test("allows an explicitly parent-level convergence task", () => {
  const parentLevel = validConvergenceInput();
  parentLevel.tasks = [{
    id: "task-1",
    parentLevel: "convergence",
    evidence: ["commit-proof", ...proof.REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
    acceptanceEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-evidence-${index + 1}`),
    verificationEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-proof-${index + 1}`),
  }];
  parentLevel.children = [];
  const parentLevelResult = proof.evaluateConvergence(parentLevel);
  assert.equal(parentLevelResult.outcome, "verified");
  assert.ok(!parentLevelResult.remainder.some((entry) => entry.includes("acceptance")));
});

test("rejects missing and duplicate review lenses", () => {
  const missingLens = validConvergenceInput();
  missingLens.reviewLenses = missingLens.reviewLenses.slice(0, -1);
  const missingLensResult = proof.evaluateConvergence(missingLens);
  assert.ok(missingLensResult.remainder.some((entry) => entry.includes("reliability review lens needs an owning task")));

  const duplicateLens = validConvergenceInput();
  duplicateLens.reviewLenses.push({ ...duplicateLens.reviewLenses[0] });
  const duplicateLensResult = proof.evaluateConvergence(duplicateLens);
  assert.ok(duplicateLensResult.remainder.some((entry) => entry.includes("implementation review lens is declared more than once")));
});

test("rejects a task that references a missing functional slice", () => {
  const input = validConvergenceInput();
  input.tasks[0].child = "missing-flow";
  const result = proof.evaluateConvergence(input);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("missing functional slice")));
});

test("rejects a functional slice without an owning task", () => {
  const input = validConvergenceInput();
  input.children[0].id = "implemented-flow";
  const result = proof.evaluateConvergence(input);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("implemented-flow slice needs an owning task")));
});

test("rejects duplicate functional slices and evidence", () => {
  const duplicate = proof.evaluateConvergence({
    records: completeRecords(),
    tasks: [
      { id: "task-1", child: "same-flow", evidence: "same-proof" },
      { id: "task-2", child: "same-flow", evidence: "other-proof" },
    ],
    children: [
      { id: "same-flow", evidence: "same-proof" },
      { id: "same-flow", evidence: "other-evidence" },
    ],
  });

  assert.ok(
    duplicate.remainder.some((entry) => entry.includes("same-flow functional slice is linked more than once")),
  );
  assert.ok(
    duplicate.remainder.some((entry) => entry.includes("evidence same-proof is mapped more than once")),
  );
});

test("rejects review-lens evidence that is not mapped", () => {
  const unmappedInput = validConvergenceInput();
  unmappedInput.tasks[0].evidence = unmappedInput.tasks[0].evidence.filter(
    (evidence) => evidence !== "lens-implementation",
  );
  unmappedInput.children[0].evidence = "lens-implementation";
  const unmappedEvidence = proof.evaluateConvergence(unmappedInput);
  assert.ok(unmappedEvidence.remainder.some((entry) => entry.includes("references evidence owned by search-flow")));
  assert.ok(!unmappedEvidence.remainder.some((entry) => entry.includes("needs an owning task")));
});

test("manual fixtures include each route and its record markers", () => {
  for (const [fixture, markers] of [
    ["No gap", ["discovery-triage: no gap", "Do not invoke interview, external research, or debate."]],
    ["Batched clarification", ["Use ordinary conversation through `/interview`", "record `interview-contract`"]],
    ["Non-interactive clarification", ["Invoke exactly one fresh `$dod-guard:codex-advisor` with `gpt-5.6-luna` and `max`", "Record `advisor-decision`", "re-run triage"]],
    ["Batched non-interactive clarification", ["Batch every currently independent question into the one advisor brief", "Defer questions that depend on an advisor answer"]],
    ["Advisor cannot resolve user authority", ["Record `unresolved-decision` with the question, evidence, impact, and next required authority", "Keep the issue in `Backlog`"]],
    ["Advisor invocation failure", ["Record `unresolved-decision` with the question, researched evidence, exact advisor failure, impact, and next required authority", "Keep the issue in `Backlog`"]],
    ["Unanswered clarification", ["record `unresolved-decision`", "Do not ask the dependent question or move to `Todo`"]],
    ["Repository context", ["Inspect the code, callers, tests, and current architecture.", "Record `research-source` findings"]],
    ["External context", ["Use targeted web or Context7 research.", "Record the source, relevant finding, and uncertainty in `research-source`."]],
    ["Debate after constraints", ["Use the existing multi-round `$debate` protocol", "Record each expert's lens", "`debate-synthesis`", "`accepted-option`", "`rejected-option`"]],
    ["Newly discovered gap", ["Return to the matching interview or research route.", "Do not turn the gap into an assumption."]],
    ["Unavailable workflow", ["Record what is unclear, the unavailable workflow or fallback, the impact, and the next decision or evidence.", "Move to `Todo` only when the PBI remains coherent"]],
    ["Re-refinement", ["Reuse current summaries, repeat only the stale or new phase, update notes in place, and create no duplicate sub-issues or scale labels."]],
    ["Structured parent", ["Create one actionable Todo child per functional slice, keep dependent steps in the parent checklist, and assess implementation, wiring/usability, quality, and reliability across the owning slices with observable evidence."]],
    ["Partial structured parent", ["Reuse that child, add only independently deliverable missing slices, and do not create category placeholders, child branches, or PRs."]],
  ]) {
    const row = fixtures.split("\n").find((line) => line.startsWith(`| ${fixture} |`));
    assert.ok(row, `missing fixture row: ${fixture}`);
    for (const marker of markers) {
      assert.ok(row.includes(marker), `fixture ${fixture} is missing: ${marker}`);
    }
  }
});
