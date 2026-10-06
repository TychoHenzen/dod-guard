import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ACCEPTANCE_MATRIX_PATHS } from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const read = (file) => readFile(path.join(root, file), "utf8");
const standard = await read("plugins/dod-guard/standards/project-workflow.md");
const githubDiscipline = await read("plugins/dod-guard/standards/github-request-discipline.md");
const readme = await read("plugins/dod-guard/README.md");
const usage = await read("plugins/dod-guard/USAGE.md");
const addBacklog = await read("plugins/dod-guard/skills/add-backlog-idea/SKILL.md");
const refine = await read("plugins/dod-guard/skills/refine-backlog-item/SKILL.md");
const nextTicket = await read("plugins/dod-guard/skills/next-ticket/SKILL.md");
const completePr = await read("plugins/dod-guard/skills/complete-pr/SKILL.md");
const submit = await read("plugins/dod-guard/skills/submit-draft-pr/SKILL.md");
const setup = await read("plugins/dod-guard/skills/setup-repository/SKILL.md");
const fixReview = await read("plugins/dod-guard/skills/fix-pr-review/SKILL.md");
const githubSkills = [
  addBacklog,
  refine,
  nextTicket,
  submit,
  setup,
  await read("plugins/dod-guard/skills/review-pr/SKILL.md"),
  fixReview,
  completePr,
  await read("plugins/dod-guard/skills/publish/SKILL.md"),
  await read("plugins/dod-guard/skills/quick-pbi/SKILL.md"),
];
const directGithubRequestPattern =
  /\bgh(?:\.exe)?\s+\S+|https?:\/\/api\.github\.com\b|\bmcp__github__[a-z][\w-]*|\bGitHub\s+(?:MCP|REST|API)\b/i;
const proof = await import("./structured-workflow-proof.mjs");
const proofScript = path.join(
  root,
  "plugins/dod-guard/skills/next-ticket/scripts/structured-workflow-proof.mjs",
);

function acceptanceMatrix(headSha, contract = "AC-1") {
  return ACCEPTANCE_MATRIX_PATHS.map((pathName, index) => ({
    id: `${contract}-${index + 1}`,
    contract,
    path: pathName,
    proof: `proof-${index + 1}`,
    expected: `expected-${index + 1}`,
    observed: `observed-${index + 1}`,
    status: "pass",
    evidence: `evidence-${index + 1}`,
    headSha,
  }));
}

test("README and usage expose every structured stage contract", () => {
  const stages = [
    ["Principles", "`/setup-repository`", "Repository instructions", "Existing rules guide capture and refinement."],
    ["Problem", "`/add-backlog-idea`", "Issue in `Backlog` with concise outcome and scope", "Refine one coherent issue."],
    ["Requirements", "`/refine-backlog-item`", "Issue `Outcome`, `Scope`, and checked `Acceptance criteria`", "Clarify gaps, then plan."],
    ["Clarification", "`/refine-backlog-item`", "`Implementation notes` with decisions and discovery evidence", "Only resolved requirements enter the plan."],
    ["Plan", "`/refine-backlog-item`", "`implementation-plan` record in the issue", "Break the plan into actionable tasks."],
    ["Tasks", "`/refine-backlog-item`", "`task-list` record and functional-slice child PBIs when independent delivery warrants them", "`Todo` PBI hands every slice and parent task evidence to implementation on one branch and PR."],
    ["Implementation handoff", "`/next-ticket`", "Issue task list, issue branch, commits, and verification evidence", "A pushed branch can enter draft-PR convergence."],
    ["Convergence", "`/submit-draft-pr`", "Draft PR `## Convergence` section and any actionable issue remainder", "Review and acceptance remain separate."],
  ];
  for (const [stage, owner, artifact, handoff] of stages) {
    for (const document of [readme, usage]) {
      assert.match(document, new RegExp(`\\| ${stage} \\| ${owner} \\| ${artifact} \\| ${handoff} \\|`));
    }
  }
  assert.match(readme, /standards\/project-workflow\.md/);
  assert.match(usage, /standards\/project-workflow\.md/);
  assert.match(readme, /ordinary path for a small, clear fix/);
  assert.match(usage, /ordinary path for a small, clear fix/);
});

test("owners preserve the structured handoffs without a parallel planner", () => {
  assert.match(addBacklog, /outcome and scope are the problem\s+handoff/);
  assert.match(setup, /project-\s*principles source/);
  for (const marker of [
    "requirements",
    "clarifications",
    "implementation-plan",
    "task-list",
  ]) {
    assert.match(refine, new RegExp(`\`${marker}\``));
  }
  assert.match(nextTicket, /records as the implementation handoff/);
  assert.match(nextTicket, /one `## Acceptance matrix` in the handoff/);
  assert.match(submit, /containing the single `## Acceptance matrix`/);
  assert.match(submit, /same matrix and exact head/);
  assert.match(nextTicket, /Do not create a tracked\s+planning file/);
  assert.match(submit, /Converge structured work/);
  assert.match(submit, /Map every task and linked sub-issue to applicable evidence/);
  assert.match(submit, /administrative sub-issue, map verified remote-state evidence/);
  assert.match(nextTicket, /resolve the active dod-guard plugin root/i);
  assert.match(refine, /resolve the active dod-guard plugin root/i);
  assert.match(submit, /resolve the active dod-guard plugin root/i);
});

test("next-ticket keeps quality diagnostics report-only", () => {
  assert.match(nextTicket, /Generate tracked build outputs on the feature branch/);
  assert.match(nextTicket, /Quality diagnostics are report-only evidence/);
  assert.match(nextTicket, /do not generate or\s+persist metric state/);
  assert.doesNotMatch(nextTicket, /ratchet baselines?/i);
});

test("convergence blocks incomplete work and leaves the small-fix bypass", () => {
  assert.match(
    standard,
    /An incomplete or contradicted result is not reported as complete/,
  );
  assert.match(
    submit,
    /implementation is incomplete or contradicted.*stop.*without creating or updating the draft PR/si,
  );
  assert.match(submit, /Small, clear fixes use the ordinary path/);
  assert.match(submit, /## Convergence/);
  assert.doesNotMatch(standard, /snapshot the issue body/);
  assert.doesNotMatch(submit, /snapshot the\s+issue body/);
  assert.match(standard, /After a failed or ambiguous write, read back\s+that resource before retrying/);
});

test("structured parents require evidenced functional slices without a fixed child count", () => {
  assert.match(nextTicket, /no linked sub-issues is\s+valid when it is one coherent implementation slice/);
  assert.match(nextTicket, /functional decomposition/);
  assert.match(nextTicket, /every linked child,?\s+if any, is actionable and `Todo`/);
  assert.match(nextTicket, /Do not require a fixed child count\s+or category set/);
  assert.match(nextTicket, /pushed\s+implementation evidence before a\s+commit or PR handoff, not before execution/);
  assert.match(nextTicket, /map\s+every linked child to its owning task, changed files or verified remote\s+state, commit, and fresh verification/);
  assert.match(submit, /task list's functional decomposition/);
  assert.match(submit, /There is no fixed child\s+count or category set/);
  assert.match(submit, /- Handoff: <link to the ## Implementation handoff comment> \(head <sha>\)/);
  assert.doesNotMatch(submit, /Mandatory child categories: each mapped/);
});

test("structured handoffs carry one exact-head preflight checkpoint", () => {
  for (const document of [standard, nextTicket, submit, completePr]) {
    assert.match(document, /Preflight checkpoint/);
    assert.match(document, /required\s+provider context/);
    assert.match(document, /base ref(?:\s+and(?:\s+base)?|\s*\/)\s*SHA/i);
    assert.match(document, /mergeability/);
    assert.match(document, /present`,\s*`pending`,\s*`failed`,\s*`skipped`,\s*(?:or|and)/);
    assert.match(document, /same repository.*(?:ref|head)|same-repository.*(?:ref|head)/si);
  }
  assert.match(standard, /one `## Preflight checkpoint` record/);
  assert.match(nextTicket, /same\s+handoff|same `## Preflight checkpoint`/i);
  assert.match(submit, /before built-in Review Summary\s+or guarded completion/);
  assert.match(completePr, /Before any ready transition, branch update, merge, or/);
  assert.match(submit, /checkpoint remains\s+in the same handoff and Convergence record/);
});

test("draft submission runs the repository preflight before PR writes", () => {
  const preflight = submit.indexOf("npm run preflight:static-analysis");
  const createOrUpdate = submit.indexOf("## Create or update the draft");

  assert.notEqual(preflight, -1);
  assert.ok(preflight < createOrUpdate);
  assert.match(submit, /even when other required checks have fresh\s+evidence/);
  assert.match(submit, /A failure or unavailable command blocks PR writes/);
  assert.match(submit, /Inspect every\s+reported path/);
});

test("structured work retains safety stops and historical OpenSpec boundaries", () => {
  for (const marker of [
    /credentials/,
    /destructive or authority-bound/,
    /unrelated work/,
    /provider or head\s+mismatch/,
    /missing high-risk\s+evidence/,
  ]) {
    assert.match(standard, marker);
    assert.match(nextTicket, marker);
  }
  assert.match(standard, /OpenSpec material is historical reference only/);
  assert.match(standard, /PBI #59 owns forgiving defaults/);
  assert.match(usage, /OpenSpec is historical reference material only/);
  assert.match(usage, /not an active runtime or/);
});

test("structured handoffs are durable and convergence is evidence-based", () => {
  assert.match(standard, /one durable `## Implementation handoff` issue comment/);
  assert.match(nextTicket, /create or update one\s+parent-issue\s+comment headed `## Implementation handoff`/);
  assert.match(submit, /durable parent-issue `## Implementation\s+handoff` comment/);
  assert.match(submit, /read the current remote head/);
  assert.match(submit, /exact remote-head match/);
  assert.match(submit, /remote branch SHA/);
  assert.match(submit, /checked-out\s+`HEAD`/);
  assert.match(submit, /handoff commit must be identical/);
  assert.match(submit, /branch names must match/);
  assert.match(submit, /treat the\s+handoff as stale/);
  assert.match(standard, /Every acceptance criterion and matrix\s+row has fresh\s+evidence/);
});

test("structured proof produces passing and actionable outcomes", () => {
  const complete = proof.evaluateConvergence({
    headSha: "abc1234",
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{
      id: "task-1",
      child: "search-flow",
      evidence: [
        "commit abc123; test passed",
        ...proof.REQUIRED_REVIEW_LENSES.filter((id) => id !== "implementation").map((id) => `lens-${id}`),
      ],
    }],
    children: [{ id: "search-flow", evidence: ["mapped", "lens-implementation"] }],
    reviewLenses: proof.REQUIRED_REVIEW_LENSES.map((id, index) => ({
      id,
      owner: index === 0 ? "search-flow" : "task-1",
      evidence: `lens-${id}`,
    })),
    acceptance: [{ id: "AC-1", evidence: "structured proof passed" }],
    acceptanceMatrix: acceptanceMatrix("abc1234"),
    contradictions: [],
  });
  assert.equal(complete.outcome, "verified");
  assert.deepEqual(complete.remainder, []);
  assert.deepEqual(complete.sections, {
    "Requirements and clarifications": [],
    "Plan and tasks": [],
    "Functional decomposition": [],
    "Acceptance and verification": [],
  });

  const incomplete = proof.evaluateConvergence({
    records: { requirements: true, clarifications: true, "implementation-plan": true },
    tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
    children: [{ id: "implementation", evidence: "mapped" }],
    reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "mapped" }],
    acceptance: [{ id: "AC-2", evidence: "" }],
    contradictions: ["user path not exercised"],
  });
  assert.equal(incomplete.outcome, "actionable remainder");
  assert.ok(incomplete.remainder.length > 0);
  assert.ok(incomplete.remainder.some((entry) => entry.includes("implementation slice needs an owning task")));
  const rendered = proof.renderConvergence(incomplete);
  assert.match(rendered, /Plan and tasks: actionable/);
  assert.match(rendered, /Functional decomposition: actionable/);
  assert.match(rendered, /Acceptance and verification: actionable/);
  assert.match(rendered, /Next task: task-2; owner: wiring/);
  assert.match(rendered, /Remainder: /);
  assert.doesNotMatch(
    rendered,
    /^- (?:Requirements and clarifications|Plan and tasks|Functional decomposition|Acceptance and verification): (?:mapped to evidence|exercised)$/m,
  );
  assert.doesNotMatch(rendered, /Outcome: verified/);
});

test("functional convergence rejects duplicate slices, owners, and missing lenses", () => {
  const result = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [
      { id: "task-1", child: "search-flow", evidence: "commit one" },
      { id: "task-2", child: "search-flow", evidence: "commit two" },
      { id: "task-3", child: "missing-flow", evidence: "commit three" },
    ],
    children: [
      { id: "search-flow", evidence: "mapped" },
      { id: "search-flow", evidence: "mapped again" },
      { id: "empty-flow", evidence: "" },
    ],
    reviewLenses: [
      { id: "implementation", owner: "task-1", evidence: "mapped" },
      { id: "implementation", owner: "task-1", evidence: "mapped again" },
      { id: "unknown", owner: "task-1", evidence: "mapped third" },
    ],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("search-flow functional slice is linked more than once")));
  assert.ok(result.remainder.some((entry) => entry.includes("search-flow slice has more than one owning task")));
  assert.ok(result.remainder.some((entry) => entry.includes("missing-flow")));
  assert.ok(result.remainder.some((entry) => entry.includes("empty-flow slice needs evidence")));
  assert.ok(result.remainder.some((entry) => entry.includes("implementation review lens is declared more than once")));
  assert.ok(result.remainder.some((entry) => entry.includes("unknown lens")));
  assert.ok(result.remainder.some((entry) => entry.includes("wiring/usability review lens needs an owning task")));
});

test("functional convergence rejects evidence reused across owners", () => {
  const result = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{ id: "task-1", child: "search-flow", evidence: "same-proof" }],
    children: [{ id: "search-flow", evidence: "same-proof" }],
    reviewLenses: [{ id: "implementation", owner: "task-1", evidence: "same-proof" }],
    acceptance: [{ id: "AC-1", evidence: "same-proof" }],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.filter((entry) => entry.includes("evidence same-proof is mapped more than once")).length >= 2);
});

test("functional convergence reports malformed collection entries", () => {
  const result = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [null, { evidence: "orphan" }],
    children: ["not a child", { id: 42, evidence: "numeric" }],
    reviewLenses: [null],
    acceptance: [42],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("task entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("task entry 1 needs a non-empty id")));
  assert.ok(result.remainder.some((entry) => entry.includes("child entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("linked child needs a functional slice id")));
  assert.ok(result.remainder.some((entry) => entry.includes("review lens entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("acceptance criterion entry 1 must be an object")));

  const missingAcceptanceId = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{ id: "task-1", evidence: "commit" }],
    acceptance: [{ evidence: "proof" }],
  });
  assert.ok(missingAcceptanceId.remainder.some((entry) => entry.includes("acceptance criterion 1 needs a non-empty id")));
});

test("ordinary fixes bypass structured records", () => {
  assert.deepEqual(proof.evaluateConvergence({ path: "ordinary" }), {
    outcome: "ordinary",
    remainder: [],
  });
});

test("structured convergence rejects a matrix tied to a different head", () => {
  const result = proof.evaluateConvergence({
    headSha: "new-head",
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{ id: "task-1", child: "implementation", evidence: "commit new-head" }],
    children: [{ id: "search-flow", evidence: "mapped" }],
    acceptance: [{ id: "AC-1", evidence: "structured proof passed" }],
    acceptanceMatrix: acceptanceMatrix("old-head"),
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("expected new-head")));
});

test("structured proof CLI separates known paths and rejects unknown scenarios", () => {
  const run = (scenario) =>
    spawnSync(process.execPath, [proofScript, scenario], { encoding: "utf8" });
  const passing = run("passing");
  assert.equal(passing.status, 0);
  assert.match(passing.stdout, /^## Convergence\n- Handoff: \S+#issuecomment-1 \(head abc1234\)\n- Remainder: none\n$/);

  const incomplete = run("incomplete");
  assert.equal(incomplete.status, 0);
  assert.match(incomplete.stdout, /Outcome: actionable remainder/);
  assert.match(incomplete.stdout, /Next task: task-2; owner: wiring/);
  assert.doesNotMatch(
    incomplete.stdout,
    /^- (?:Requirements and clarifications|Plan and tasks|Functional decomposition|Acceptance and verification): (?:mapped to evidence|exercised)$/m,
  );

  const ordinary = run("ordinary");
  assert.equal(ordinary.status, 0);
  assert.match(ordinary.stdout, /Outcome: ordinary/);
  assert.doesNotMatch(ordinary.stdout, /Requirements and clarifications/);

  const unknown = run("typo");
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown proof scenario/);
  assert.doesNotMatch(unknown.stdout, /Outcome: verified/);
});

test("every GitHub-facing skill shares the request discipline", () => {
  assert.match(githubDiscipline, /GitHub MCP connector/);
  assert.match(githubDiscipline, /reuses a run snapshot/);
  assert.match(githubDiscipline, /Project v2/);
  for (const skill of githubSkills) {
    assert.match(skill, /standards\/github-request-discipline\.md/);
  }
  assert.match(fixReview, /gh api "repos\/\{owner\}\/\{repo\}\/pulls\/\{number\}"/);
});

test("every skill with direct GitHub request instructions names the shared policy", async () => {
  const skillRoot = path.join(root, "plugins/dod-guard/skills");
  const entries = await readdir(skillRoot, { withFileTypes: true });
  const documents = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        text: await readFile(path.join(skillRoot, entry.name, "SKILL.md"), "utf8"),
      })),
  );
  const directGithubSkills = documents.filter(({ text }) => directGithubRequestPattern.test(text));

  assert.deepEqual(
    directGithubSkills.map(({ name }) => name).sort(),
    [
      "add-backlog-idea",
      "complete-pr",
      "fix-pr-review",
      "next-ticket",
      "publish",
      "refine-backlog-item",
      "review-pr",
      "setup-repository",
    ],
  );
  for (const { text } of directGithubSkills) {
    assert.match(text, /standards\/github-request-discipline\.md/);
  }
});

test("direct GitHub request detection covers new request forms", () => {
  for (const request of [
    "gh auth status",
    "gh run list",
    "GET https://api.github.com/repos/TychoHenzen/dod-guard/issues",
    "mcp__github__repository_read",
  ]) {
    assert.match(request, directGithubRequestPattern);
  }
});

test("delivery recovery resumes only from observed checkpoints", () => {
  assert.match(githubDiscipline, /read back that resource before\s+retrying or issuing another mutation/);
  assert.match(githubDiscipline, /retry one identical transient provider failure at most once/);
  assert.match(nextTicket, /read back\s+the local and remote branch, issue assignee, and Project status/);
  assert.match(nextTicket, /never create a second branch, repeat an assignment, or\s+repeat a status mutation before its readback/);
  assert.match(submit, /read back\s+the branch's open pull request and its head before retrying/);
  assert.match(submit, /Do not create a second PR or alter a PR whose\s+head no longer matches the verified branch/);
});

test("ticket-start and completion status writes share the global ProjectV2 runner", () => {
  assert.match(nextTicket, /project-status\.mjs <owner> <project-number> <status-field-node-id> <in-progress-option-id> "In Progress" <item-node-id>/);
  assert.match(nextTicket, /uses the numeric project number as the REST path identifier/);
  assert.match(nextTicket, /reads the\s+item back before the ticket-start sequence can continue/);
  assert.match(completePr, /project-status\.mjs <owner> <project-number> <status-field-node-id> <done-option-id> Done/);
  assert.match(completePr, /child item IDs first and the parent item ID last/);
});
