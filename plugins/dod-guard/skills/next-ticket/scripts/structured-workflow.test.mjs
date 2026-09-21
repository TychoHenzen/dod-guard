import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  await read("plugins/dod-guard/skills/complete-pr/SKILL.md"),
  await read("plugins/dod-guard/skills/publish/SKILL.md"),
  await read("plugins/dod-guard/skills/quick-pbi/SKILL.md"),
];
const proof = await import("./structured-workflow-proof.mjs");
const proofScript = path.join(
  root,
  "plugins/dod-guard/skills/next-ticket/scripts/structured-workflow-proof.mjs",
);

test("README and usage expose every structured stage contract", () => {
  const stages = [
    ["Principles", "`/setup-repository`", "Repository instructions", "Existing rules guide capture and refinement."],
    ["Problem", "`/add-backlog-idea`", "Issue in `Backlog` with concise outcome and scope", "Refine one coherent issue."],
    ["Requirements", "`/refine-backlog-item`", "Issue `Outcome`, `Scope`, and checked `Acceptance criteria`", "Clarify gaps, then plan."],
    ["Clarification", "`/refine-backlog-item`", "`Implementation notes` with decisions and discovery evidence", "Only resolved requirements enter the plan."],
    ["Plan", "`/refine-backlog-item`", "`implementation-plan` record in the issue", "Break the plan into actionable tasks."],
    ["Tasks", "`/refine-backlog-item`", "`task-list` record and four mandatory linked child PBIs for structured work", "`Todo` PBI hands every child evidence to implementation on one branch and PR."],
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
  assert.match(nextTicket, /Do not create a tracked\s+planning file/);
  assert.match(submit, /Converge structured work/);
  assert.match(submit, /Map every task and linked sub-issue to applicable evidence/);
  assert.match(submit, /administrative sub-issue, map verified remote-state evidence/);
  assert.match(nextTicket, /resolve the active dod-guard plugin root/i);
  assert.match(refine, /resolve the active dod-guard plugin root/i);
  assert.match(submit, /resolve the active dod-guard plugin root/i);
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
  assert.match(standard, /Before any\s+remainder write,\s+snapshot the issue body/);
  assert.match(submit, /snapshot the\s+issue body, task list, labels, links, Project item, and Status/);
  assert.match(submit, /After each successful mutation, read back\s+the changed state/);
});

test("structured parents require one evidenced child in every delivery category", () => {
  assert.match(nextTicket, /no linked sub-issues is\s+valid only when it is a small, clear implementation slice/);
  assert.match(nextTicket, /exactly one\s+linked child for implementation; wiring and end-to-end\s+usability; refactoring\s+and quality; and fixing and reliability/);
  assert.match(nextTicket, /Each mandatory\s+child must be actionable and `Todo` before execution starts/);
  assert.match(nextTicket, /pushed\s+implementation evidence before a commit or PR handoff, not before execution/);
  assert.match(nextTicket, /map\s+every mandatory child to its owning task, changed files or verified remote\s+state, commit, and fresh verification/);
  assert.match(submit, /exactly one actionable child for implementation; wiring and\s+end-to-end usability; refactoring and quality; and fixing and reliability/);
  assert.match(submit, /Mandatory child categories: each mapped to the same parent branch/);
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
  assert.match(standard, /every acceptance\s+criterion has fresh evidence/);
});

test("structured proof produces passing and actionable outcomes", () => {
  const complete = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{ id: "task-1", child: "implementation", evidence: "commit abc123; test passed" }],
    children: proof.REQUIRED_CHILD_CATEGORIES.map((category) => ({ category, evidence: "mapped" })),
    acceptance: [{ id: "AC-1", evidence: "structured proof passed" }],
    contradictions: [],
  });
  assert.equal(complete.outcome, "verified");
  assert.deepEqual(complete.remainder, []);
  assert.deepEqual(complete.sections, {
    "Requirements and clarifications": [],
    "Plan and tasks": [],
    "Mandatory child categories": [],
    "Acceptance and verification": [],
  });

  const incomplete = proof.evaluateConvergence({
    records: { requirements: true, clarifications: true, "implementation-plan": true },
    tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
    children: [{ category: "implementation", evidence: "mapped" }],
    acceptance: [{ id: "AC-2", evidence: "" }],
    contradictions: ["user path not exercised"],
  });
  assert.equal(incomplete.outcome, "actionable remainder");
  assert.ok(incomplete.remainder.length > 0);
  const rendered = proof.renderConvergence(incomplete);
  assert.match(rendered, /Plan and tasks: actionable/);
  assert.match(rendered, /Mandatory child categories: actionable/);
  assert.match(rendered, /Acceptance and verification: actionable/);
  assert.match(rendered, /Next task: task-2; owner: wiring/);
  assert.match(rendered, /Remainder: /);
  assert.doesNotMatch(
    rendered,
    /^- (?:Requirements and clarifications|Plan and tasks|Mandatory child categories|Acceptance and verification): (?:mapped to evidence|exercised)$/m,
  );
  assert.doesNotMatch(rendered, /Outcome: verified/);
});

test("ordinary fixes bypass structured records", () => {
  assert.deepEqual(proof.evaluateConvergence({ path: "ordinary" }), {
    outcome: "ordinary",
    remainder: [],
  });
});

test("structured proof CLI separates known paths and rejects unknown scenarios", () => {
  const run = (scenario) =>
    spawnSync(process.execPath, [proofScript, scenario], { encoding: "utf8" });
  const passing = run("passing");
  assert.equal(passing.status, 0);
  assert.match(passing.stdout, /Outcome: verified/);
  assert.match(passing.stdout, /Requirements and clarifications: verified/);

  const incomplete = run("incomplete");
  assert.equal(incomplete.status, 0);
  assert.match(incomplete.stdout, /Outcome: actionable remainder/);
  assert.match(incomplete.stdout, /Next task: task-2; owner: wiring/);
  assert.doesNotMatch(
    incomplete.stdout,
    /^- (?:Requirements and clarifications|Plan and tasks|Mandatory child categories|Acceptance and verification): (?:mapped to evidence|exercised)$/m,
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

test("delivery recovery resumes only from observed checkpoints", () => {
  assert.match(githubDiscipline, /read back that resource before\s+retrying or issuing another mutation/);
  assert.match(githubDiscipline, /retry one identical transient provider failure at most once/);
  assert.match(nextTicket, /read back\s+the local and remote branch, issue assignee, and Project status/);
  assert.match(nextTicket, /never create a second branch, repeat an assignment, or\s+repeat a status mutation before its readback/);
  assert.match(submit, /read back\s+the branch's open pull request and its head before retrying/);
  assert.match(submit, /Do not create a second PR or alter a PR whose\s+head no longer matches the verified branch/);
});
