import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

// goal-sdlc only sequences the lifecycle skills, so these tests pin the loop
// and the owner links. The owning skills' own tests pin their rules.
const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");

const OWNERS = [
  "refine-backlog-item",
  "next-ticket",
  "submit-draft-pr",
  "review-pr",
  "fix-pr-review",
  "complete-pr",
  "add-backlog-idea",
  "quick-pbi",
  "step-by-step",
];

test("goal-sdlc links every lifecycle owner by relative path", () => {
  for (const name of OWNERS) {
    assert.ok(skill.includes(`[dod-guard:${name}](../${name}/SKILL.md)`), `missing owner link: ${name}`);
  }
  assert.match(skill, prose("when this file and an owning skill differ, the owning skill wins"));
  assert.match(
    skill,
    prose(
      "It never writes issue, Project, branch, or pull request",
      "state itself: closures run through the closure helper's `apply`.",
    ),
  );
});

test("goal-sdlc cleans up through the closure helper and has no write path of its own", () => {
  assert.match(skill, prose("**Clean up, then select one parent.**"));
  assert.match(
    skill,
    prose("run `node closure.mjs plan", "--snapshot=<file>`, report each close, hold, and `unverified-closed` entry"),
  );
  assert.match(
    skill,
    prose(
      "delegate planned closes and status repairs to",
      "Close delivered issues for goal-sdlc",
      "as one write-capable stage",
    ),
  );
  assert.match(
    skill,
    prose(
      "Run `closure.mjs annotate` on the snapshot, which takes",
      "`activeCheckpoint` and `trustedHeadSha` from the completion records",
    ),
  );
  assert.ok(
    skill.indexOf("closure.mjs plan") < skill.indexOf("scripts/select-next.mjs"),
    "cleanup runs before selection",
  );
  const built = skill.search(prose("build the closure snapshot that `standards/project-workflow.md` defines with"));
  const planned = skill.search(prose("run `node closure.mjs plan"));
  assert.ok(built >= 0 && planned >= 0, "step 2 builds the closure snapshot and then runs closure.mjs plan");
  assert.ok(built < planned, "the closure snapshot is built before closure.mjs plan runs");
  const stops = skill.search(prose("If snapshot exits non-zero, stop"));
  assert.ok(built < stops && stops < planned, "a failed snapshot build stops step 2 before closure.mjs plan runs");
  assert.match(skill, prose("`node closure.mjs snapshot --repository=<owner/name> --output=<file>`"));
  for (const write of [
    /gh (issue|pr|project) (close|edit|item-edit)/,
    /--method (POST|PATCH)/,
    /project-status\.mjs/,
    /state=closed/,
  ]) {
    assert.doesNotMatch(skill, write);
  }
});

test("goal-sdlc keeps its sections short and its own", () => {
  const headings = skill.match(/^##+ .+$/gm);
  assert.deepEqual(headings, [
    "## Owners",
    "## Loop",
    "## Delegation",
    "## Blockers",
    "## Friction log",
    "## Reporting",
    "## Stop condition",
  ]);
  // The cap keeps goal-sdlc a thin orchestrator: a rule that one stage owner
  // enforces belongs in that owner's skill, not in the loop that sequences them.
  const lineCount = skill.split("\n").length;
  assert.ok(lineCount <= 180, "goal-sdlc grew past an orchestrator");
  // Rules that belong to an owner must not come back here.
  for (const owned of [
    "## Acceptance matrix",
    "Review lenses",
    "pre-review checkpoint",
    "validation cadence",
    "Record a compact checkpoint",
    "The standard tier is the default",
    "The strong tier is for",
    "The cheap tier is for",
  ]) {
    assert.ok(!skill.includes(owned), `restates an owned rule: ${owned}`);
  }
});

test("goal-sdlc selects through the read-only queue selector", async () => {
  const usageText = await readFile(new URL("../../../USAGE.md", import.meta.url), "utf8");
  assert.match(skill, prose("node scripts/select-next.mjs --snapshot=<file>"));
  assert.match(skill, prose("In Progress parents first"));
  assert.match(skill, prose("then Todo, then Backlog, each in Project order"));
  assert.match(skill, prose("Process exactly one parent at a time, in the current checkout"));
  assert.match(skill, prose("Never create or use a Git worktree."));
  assert.match(skill, prose("Keyed by `owner/name#number`"));
  assert.match(skill, prose("cross-repository evidence"));
  assert.match(skill, prose("selects nothing when the snapshot cannot be classified"));
  assert.match(skill, prose("leaves every relation as read"));
  assert.match(usageText, prose("classifies the annotated closure snapshot by `owner/name#number`"));
  assert.match(usageText, prose("leaves every relation as read"));
});

test("goal-sdlc delegates to subagents, not user-visible threads", () => {
  assert.match(skill, prose("bounded subagents do the context-heavy work"));
  for (const marker of [
    "create_thread",
    "fork_thread",
    "send_message_to_thread",
    "codex://threads/...",
    "100,000 tokens",
  ]) {
    assert.ok(skill.includes(marker), `missing delegation marker: ${marker}`);
  }
  assert.match(skill, prose("do not create a lock file or local ledger"));
});

// A stage that admitted unfinished work used to be treated as done or replaced,
// which advanced the run past owned work that was still running.
test("goal-sdlc resumes a stage whose report admits unfinished work", () => {
  const delegation = skill.slice(skill.indexOf("## Delegation"), skill.indexOf("## Blockers"));
  assert.match(
    delegation,
    prose(
      "A stage report that names a live child, a pending named proof, " +
        "or a still-applied temporary probe is incomplete:",
      "resume the same stage at its current checkpoint,",
      "and do not advance or launch a replacement stage.",
    ),
  );
});

test("goal-sdlc keeps one daily friction log and a strict stop", () => {
  assert.match(skill, prose("titled exactly `Friction log YYYY-MM-DD`"));
  assert.match(skill, prose("The queue holds today's log while it collects entries"));
  assert.match(skill, prose("starts", "with `Blocked:`"));
  assert.match(skill, prose("An empty Todo column with a non-empty Backlog is not", "an empty queue"));
  assert.match(skill, prose("three", "evidence-backed attempts"));
  assert.match(skill, /^- Re-read the issue before appending, and read it back after writing\.$/m);
  assert.match(skill, /checkpoint\.\n\nBefore claiming a parent/);
});

const ROUTES = [
  ["Queue snapshot read", "cheap"],
  ["Refinement: owner thread (dispatch, verify, labels, Todo)", "standard"],
  ["Refinement: plan research questions", "standard"],
  ["Refinement: investigate code, callers, and tests", "cheap"],
  ["Refinement: decide classification and criteria", "standard"],
  ["`/next-ticket`: owner thread (start ticket, matrix, preflight, handoff)", "standard"],
  ["`/next-ticket`: write the step plan for one task", "standard"],
  ["`/next-ticket`: implement one task from its plan", "cheap"],
  ["`/next-ticket`: run validations and regenerate artifacts", "cheap"],
  ["`/submit-draft-pr`", "cheap"],
  ["`/review-pr`: owner thread (scripts, dispatch, citation checks, build, post)", "cheap"],
  ["`/review-pr`: plan", "standard"],
  ["`/review-pr`: investigate", "cheap"],
  ["`/review-pr`: judge and merge pass", "standard"],
  ["`/fix-pr-review`: owner thread (revalidate, classify, plan fixes, verify, reply)", "standard"],
  ["`/fix-pr-review`: apply a written per-finding fix", "cheap"],
  ["`/complete-pr`: guarded merge and Project finalization", "cheap"],
  ["Merge conflict triage: owner thread, plan, and judge", "standard"],
  ["Merge conflict triage: investigate and apply", "cheap"],
  ["`/add-backlog-idea`, including the friction log", "cheap"],
];
// Effort is not repeated here: each tier agent's frontmatter owns it.
function routingRows(text) {
  const start = text.indexOf("| Stage | Tier |");
  const end = text.indexOf("\n\n", start);
  return text
    .slice(start, end)
    .split("\n")
    .slice(2)
    .map((row) =>
      row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

test("goal-sdlc routes every stage to one tier", () => {
  const rows = routingRows(skill);
  assert.deepEqual(rows, ROUTES);
  assert.match(skill, prose("Each stage runs in one fresh subagent as one step of"));
  assert.match(skill, prose("A stage's split rows are dispatched by its owner"));
  assert.match(skill, prose("Dispatch each row as `standards/model-routing.md` says"));
  assert.match(skill, prose("pass its model and effort to the Agent call in Claude Code"));
  assert.match(skill, prose("or use the registered tier agent in Codex"));
  assert.match(skill, prose("name the stage, tier, model, and effort in the progress message"));
  assert.match(skill, prose("user's model or effort override is applied and recorded as that standard says."));
  assert.match(skill, prose("Verify each stage's output as that standard"));
  assert.match(
    skill,
    prose("read back the commit of any stage that changed tracked files before the next stage starts"),
  );
});

// The strong tier is a recovery path: no row names it, and a failed stage
// climbs one tier under the routing standard's Escalation section.
test("goal-sdlc starts no stage on the strong tier", () => {
  const tiers = routingRows(skill).map(([, tier]) => tier);
  assert.ok(!tiers.includes("strong"), "no row routes to the strong tier");
  assert.match(
    skill,
    prose(
      "No row starts on the strong tier:",
      "a stage that fails its check",
      'climbs one tier under "Escalation" in that standard.',
    ),
  );
});

const usage = await readFile(new URL("../../../USAGE.md", import.meta.url), "utf8");

// Claude Code /goal grades only its frozen condition, so a later "stop" message
// cannot end a run unless the condition already allows it.
const goalStop = await readFile(new URL("../../../standards/goal-stop.md", import.meta.url), "utf8");
const GOAL_TEMPLATE = [
  "/goal Run /dod-guard:goal-sdlc on this repository.",
  "(a) the final report says no eligible parent remains",
  "and quotes git status showing a clean default branch; or",
  "(b) the user, in their own prompt, has told you to stop,",
  "and the in-flight parent is merged, or its branch is pushed",
  "with its next step written on the issue.",
  "Everything after this sentence is a preference, not part of the check:",
];

test("goal-sdlc gives a /goal run a user-stop exit", () => {
  assert.match(skill, prose("Under `/goal`, also read and apply `standards/goal-stop.md`."));
  assert.doesNotMatch(skill, /For a Codex `\/goal` run/);

  // The section runs to "## Structured work" with no other heading inside it.
  assert.match(usage, /^### Stop a `\/goal` run\n(?:[^#\n][^\n]*\n|\n)*## Structured work$/m);
  assert.match(usage, prose("a small model grades only the condition text"));
  assert.match(usage, prose("only the user can run `/goal clear`"));
  const template = usage.split("\n").find((line) => line.startsWith("/goal Run "));
  assert.ok(template, "USAGE.md has a one-line /goal template");
  assert.match(template, prose(...GOAL_TEMPLATE));
  assert.match(usage, prose("goal-sdlc applies `standards/goal-stop.md`"));
});

test("the goal-stop standard owns the in-run stop behavior", () => {
  for (const rule of [
    "When it has no exit for a user stop, show the `USAGE.md` template once",
    "quotes the `git status --short --branch` output",
    "A stop counts only when the user's own prompt asks for it",
    "says where the in-flight parent stands",
    "Say once that only `/goal clear` ends the goal.",
    "plays a sound every five minutes for up to two hours",
    "end the turn without starting work",
    "an idle check-in still starts a turn after 30 minutes",
    "When the command finishes before the user returns, do not restart it.",
    "stop that sound command and confirm it stopped",
  ]) {
    assert.match(goalStop, prose(rule), `missing goal-stop rule: ${rule}`);
  }
  for (const command of ["Start-Sleep -Seconds 300", "afplay", "paplay"]) {
    assert.ok(goalStop.includes(command), `missing sound command: ${command}`);
  }
  assert.match(goalStop, /1\.\.24 \| ForEach-Object/);
  assert.match(goalStop, /for i in \$\(seq 24\)/);
});
