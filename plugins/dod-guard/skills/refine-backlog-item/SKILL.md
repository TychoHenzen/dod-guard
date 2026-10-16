---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
---

# Refine backlog item

This skill takes one existing backlog issue and leaves it as an implementation-ready parent PBI. It ends at the `Todo` transition and never starts the work.

Start by reading two plugin-root standards: `standards/working-defaults.md` and `standards/github-request-discipline.md`. Where this skill sets a stricter boundary, the stricter boundary wins.

Hard limits, with no exceptions: never create a branch, assign the PBI, change it to In Progress, implement code, or open a pull request.

## Preconditions

Find the plugin root first. To resolve the active dod-guard plugin root, start at the directory that contains this skill. Then read `<plugin-root>/standards/project-workflow.md`. The target checkout may not hold that standard, so do not look for it there.

Check the issue before touching anything:

- The repository is the issue's target repository, and the issue lives in it as a repository issue. A draft issue is never accepted.
- The issue is listed in the linked Project.
- Its Status is `Backlog`.

The one other case is a parent in `Todo` or `In Progress` after `dod-guard:next-ticket` stopped with `step-plan-missing`: run only "Write the step plans" for it, leave its Status as it is, and change nothing else.

Get the repository, the Project, and the `Backlog` and `Todo` options by following "Resolve the repository and Project" in `standards/github-request-discipline.md`. Then confirm the link:

```text
node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>
```

Read its result and stop on outcome `none` or `several` or on exit 2. Whenever a value is missing or ambiguous, stop and report it. Never fill the gap with a guess at a product decision.

Writes follow the shared standard too. After a failed, timed-out, or ambiguous write, follow the shared GitHub standard: read that resource back before retrying or issuing another write.

### Labels must exist first

Load every label in the repository, with descriptions, across all pages. Prefer the GitHub MCP repository-resource labels endpoint. If it is unavailable, fall back to this form with the resolved repository filled in:

```text
gh api --paginate "repos/{owner}/{repo}/labels?per_page=100"
```

Both scales below must be present. Each label needs one exact-name match and a nonempty description. If any is missing or ambiguous, stop before you change anything. You may not create labels, duplicate labels, Project fields, or a different estimation scale.

| Scale | Labels |
|---|---|
| Priority | `Prio 1 - Emergency`, `Prio 2 - Urgent`, `Prio 3 - Standard`, `Prio 4 - Non-Urgent`, `Prio 5 - Planned`, `Prio 6 - Unknown` |
| Effort (Fibonacci) | `Effort 1 - Trivial`, `Effort 2 - Easy`, `Effort 3 - Medium`, `Effort 5 - Large`, `Effort 8 - Huge`, `Effort 13 - Epic` |

The standard classification labels are `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, and `wontfix`.

## Research and discovery triage

Ground every later decision in what the repository shows. Read the issue, the repository instructions, the affected code, its callers, and the tests that exist. For docs or skill work, add the affected instructions, the entry points, and the validation. If coverage is absent, write that down instead of assuming it.

Run that research as the plan, investigate, and judge split in `standards/model-routing.md`. Three roles share the work:

- A standard planner writes the research questions, using `dod-guard:read-standard`.
- Cheap investigators read the code, callers, tests, and history, using `dod-guard:read-cheap`.
- A judge on the standard tier, also `dod-guard:read-standard`, decides at the end.

Each role gets the brief that "Stage brief" in the standard defines. The main thread checks every investigator answer. After the main thread verifies them, the standard tier decides the discovery triage, classification, and the direction of the PBI. Citations that survive checking become `research-source` entries. The split changes who does the work, so the `discovery-triage` and `research-source` records keep their meaning.

After that repository and issue research, state a discovery triage in the implementation notes. Give each unresolved point exactly one class:

- `user constraints or priorities`
- `external facts or context`
- `genuine tradeoff`
- `no gap`

`user constraints or priorities` is intended behavior, or a priority or acceptance boundary, that is missing. `external facts or context` is a fact outside what the repository and the user hold. `genuine tradeoff` means the facts and constraints are known, but a concrete decision still has several plausible options with unclear tradeoffs. `no gap` means nothing is left unresolved.

One PBI can need more than one route. Settle user constraints and external facts before any debate. Do not ask the user about something repository inspection, the web, or Context7 can answer. When the result is `no gap`, continue without invoking a discovery workflow.

### Routes

External facts. Look in the repository first, and go to the web or Context7 only when the missing fact is outside the repository or needs current external evidence. Put each source and finding into `research-source`.

Interview. Use this when a user constraint is missing and the session is interactive. Ask after the research is done, in ordinary conversation, and put every currently independent clarification question in one round. Offer multiple concrete options for each question, and mark one as the recommended default. Questions whose wording depends on an earlier answer wait for a later round. Wait for the current round's answers before you rely on them. Do not require a provider-specific `AskUserQuestion` tool. Store the outcome as an `interview-contract` note: questions, options, defaults, answers, and deferred questions.

Advisor. During an active goal or explicitly non-interactive refinement, nobody is there to answer, so ask an advisor instead. Invoke exactly one fresh `dod-guard:codex-advisor`; that means Claude's advisor tool in Claude Code, otherwise Codex with `gpt-5.6-sol` at `max` reasoning effort. The brief carries only the unresolved questions with candidate answers and recommended default, the repository and PBI context, the evidence, the acceptance boundary, and the constraints. Batch every currently independent question into that one advisor brief. Defer a question whose options depend on an advisor answer, then re-run triage to reach it. The advisor is advice-only and cannot replace user authority. Write an `advisor-decision` implementation note naming the advisor, the briefing scope, the advice, and the evidence for accepting or rejecting it. Do not invoke another advisor to retry, vote, or refine its answer.

Advisor dead ends. If the advisor cannot resolve a user-authority question, record `unresolved-decision` with the question, evidence, impact, and next required authority, and keep the issue in `Backlog`. If the advisor invocation fails or its response is unusable, record `unresolved-decision` with the question, researched evidence, the exact advisor failure, impact, and next required authority, and keep the issue in `Backlog`.

Debate. Reserve it for a genuine tradeoff, and run it only after the required facts and user constraints are available. State one concrete decision. Choose three to five named real experts whose documented positions match the competing concerns. Hold at least two rounds: first each expert gives a position, then each challenges the strongest opposing view. Finish with a synthesis. In `debate-synthesis`, record each expert's name, lens, the competing concern, why that lens applies, the challenges, the uncertainty, and the synthesis. Record the options taken and dropped as `accepted-option` and `rejected-option`. Debate scratch files stay outside the repository, and an expert's speculation never becomes a requirement.

### After each round

Re-run triage after every interview, research, or debate round. If a debate reveals a new tradeoff, record it and continue the same decision. When new evidence exposes a missing user constraint or external fact, send it back through its route and do not assume an answer. While a material answer is missing, do not ask dependent questions, finalize labels, or move to `Todo`. If a material requirement cannot be stated without inventing it, keep the issue in `Backlog`.

## Refine the PBI

### Classify

The live label descriptions define what each label means. From them, choose one priority label and one effort label, no more, to match the researched impact, urgency, scope, dependencies, risk, and uncertainty. The two scales do not depend on each other. Do not read urgency from effort or guess effort from the title. `Prio 6 - Unknown` is for cases where the evidence supports no other priority, and the note must say what information would allow a reassessment. Add one or more standard labels, picked by exact name and description and never the whole set. If no label's description supports the classification, stop.

### Write the body

Give the parent these sections: `## Outcome`, `## Scope`, `## Implementation notes`, `## Acceptance criteria`, `## Verification`. The implementation notes carry:

- the triage, and any interview, research, debate, option, and unresolved summaries;
- the boundaries and constraints;
- code, caller, and test evidence;
- priority and effort, each tied by evidence to its label description;
- the reason for each standard label;
- the evidence behind the implementation direction.

When a missing choice would change observable behavior, a public interface, data handling, or an acceptance test, ask for direction. A false choice must never appear as a requirement.

### Split the work

Decompose by successive refinement. Each slice leaves the system working with its tests green. The first slice is the thinnest end-to-end path across the supported surface. Name every slice for its behavior; a slice that can only be named by its position or layer needs another split. When variants repeat, the first slice introduces the shared boundary that owns those steps and moves one existing variant behind it, and each remaining variant becomes a local slice. Validation and error behavior for a concept stay in the slice that owns the concept. A slice that replaces a structure also migrates the callers and deletes what it made obsolete, which leaves no deferred cleanup child. Later slices extend the running thin path rather than build parts that only work once everything lands. Stop once slices can be implemented and verified, and add no abstraction or child for a speculative variant.

An ordinary parent gets linked sub-issues only for criteria that can be completed, committed, and closed independently. Each one needs an outcome, notes, acceptance criteria, and verification. Dependent steps stay in the parent, and administrative subtasks are not created.

For a structured parent PBI, use functional decomposition. Begin with user actions and cut them into a small set of coherent slices. Cut a slice again only until it can be independently implemented, tested, and verified. A linked child is worth creating only when the unit merits its own tracking, and a cohesive feature may remain a single checklist on the parent, so no child is required merely to fill a fixed category list. If a child already owns a unit, reuse it; never duplicate a unit. A new child gets minimal parent context, its scope, acceptance criteria, and verification. Every structured PBI must also assess four lenses: implementation, wiring and end-to-end usability (with proof that the feature can be reached from its intended UI or supported user-facing surface), refactoring and code quality, and failure/recovery reliability beyond the happy path; these are review lenses, not mandatory child categories. Each lens belongs to the child or parent-level task that owns it, with observable acceptance and verification. Children are checklist items on the parent's single branch and single pull request, and they never authorize child branches or pull requests.

Apply the same research, sections, and label rules to a sub-issue that you refine as a PBI, and reuse linked issues that already fit.

### Epics and replacements

`Effort 13 - Epic` blocks `Todo`. Leave the item in `Backlog`, then split it into independently deliverable linked issues or into explicitly linked replacement issues, and research and estimate each of those separately before it can move to `Todo`. Adding dependent subtasks does nothing on its own to lift the block. The original may reach `Todo` only if what remains is independently deliverable and the evidence supports a lower effort label.

Every replacement delivery root records the issues it replaces in one `supersedes` record under `## Implementation notes`, in the form `standards/project-workflow.md` gives. An original that still owns delivery scope stays open, and `complete-pr` closes it later. An original that is a pure hierarchy record has no linked pull request, no unchecked criterion outside its sub-issues, and sub-issues that are all settled or named by some replacement's `supersedes` record. For that case, close it now through the closure helper as `not_planned` with its evidence comment, using three steps in order:

```text
node <plugin-root>/skills/complete-pr/scripts/closure.mjs snapshot --repository=<owner/name> --output=<file>
node <plugin-root>/skills/complete-pr/scripts/closure.mjs plan --snapshot=<file> --hierarchy=<issue>
node <plugin-root>/skills/complete-pr/scripts/closure.mjs apply --snapshot=<file> --hierarchy=<issue>
```

The file comes from the closure snapshot that `standards/project-workflow.md` defines, taken after the replacements hold their records. If snapshot exits non-zero, stop and report its error; never plan or apply on an older file. When the helper reports a hold, pass the reasons on instead of closing the issue yourself.

## Record discovery and re-refinement state

The implementation notes keep the evidence short. They hold the `discovery-triage` result and whichever of these summaries apply:

- `interview-contract`: questions, options, defaults, answers, deferred questions.
- `advisor-decision`: advisor, scope, advice, accept or reject evidence.
- `research-source`: source, finding, remaining uncertainty.
- `debate-synthesis`: the outcome of the expert rounds.
- `accepted-option`: the choice and the evidence for it.
- `rejected-option`: each dropped option and the reason.
- `unresolved-decision`: what is open, why, the impact, the next evidence.

An unresolved item or an unavailable workflow gets the exact gap, the fallback, the impact, and the next step in writing. By itself it does not block `Todo`, provided the PBI is independently deliverable, its outcome, scope, and criteria stay coherent, and nothing material was invented. If any of those fails, keep the issue in `Backlog`.

Feature work and material ambiguity need more structure; small clear fixes take the ordinary path and need no records. For the larger case, resolve the plugin root from this skill's directory and read the workflow standard. Keep these named records in the implementation notes as distinct subsections, where the existing discovery markers are the evidence inside them: `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, `acceptance-evidence`, and `planned-acceptance-matrix`.

- `acceptance-evidence` gives each acceptance-criterion checkbox id its evidence id.
- `planned-acceptance-matrix` plans every matrix row before any proof runs.
- `task-list` marks dependencies, keeps a stable task order, and marks a task `independent` only when it is separately committable and closable. To map every task to its functional slice, name the slice on the task. A task that serves no single slice is marked as a parent-level convergence task with `parentLevel: "convergence"`.
- `lens-ownership` says where each of the four lenses is covered, or why it does not apply.

Re-refinement starts from the notes already on the issue. Compare them with the current requirements, code, callers, tests, sources, and decisions. Reuse evidence that is still current, and repeat only the phases that are stale or newly triggered. Update summaries where they stand; do not append assumptions that conflict with them. Do not create duplicate linked sub-issues or scale labels. Replace earlier estimates and rationale instead of piling up new ones. The `Backlog` precondition still applies, and `step-plan-missing` is the only exception.

## Write the step plans

Write one comment per task on the parent issue, headed `## Step plan: <task-id>`, using the id from the `task-list` record. A PBI with no task list uses `task-1`. The standard tier writes these on this thread, since `next-ticket` runs on the cheap tier and plans nothing.

A comment lists every step with these parts:

- the file;
- the edit, as symbol and intent;
- the test to add or change, as name and assertion;
- the validation command;
- the expected result.

Show code only in fenced blocks, never indented ones, and keep each batch of steps small. The plan holds every design decision so that a cheap model has nothing left to choose. Open decisions get settled during triage and never pass to the plan's reader.

On re-refinement, replace the comment for a task that changed and leave the others. Post as the authenticated user, and write a plan for every task that has no comment the step plan rule in `standards/project-workflow.md` accepts, since a heading comment from a rejected author does not count. Read every comment back, with its author, before the Status changes, or before you report when the Status stays as it is.

## Apply labels and verify before Todo

### Labels

Read the issue's current labels, then apply the chosen priority, effort, and standard labels in one edit. Use the GitHub MCP issue-update operation, or `gh issue edit {issue-number} --repo {owner}/{repo}` as the CLI fallback, with repeated `--add-label` and `--remove-label` flags. Strip every other priority or effort label, stale `Prio <number>` and `Effort <number>` variants included. Unrelated labels stay. Drop an old standard classification only if the research shows it no longer applies.

### Read back

Read back the issue body, labels, linked sub-issues, step plan comments, and Project status from GitHub. Check each of these:

- All required sections and their evidence are present.
- Confirm that every task has its `## Step plan: <task-id>` comment.
- The sub-issues are linked, and the PBI is still in `Backlog`.
- Exactly one label from each scale is set, plus at least one standard label.
- An unknown priority explains what evidence is missing.
- Effort is below 13.

A structured PBI needs more. All seven named records must be present and coherent. Confirm that every linked child matches one independently deliverable functional slice in the task list, is actionable, and is `Todo`. Each of the four lenses needs an owning child or parent-level task with mapped observable acceptance or verification. There is no fixed child count and there are no category placeholders. If no child covers cross-cutting parent work, add an explicit parent-level task with `parentLevel: "convergence"`.

### Convergence proof

Prove convergence with code instead of judgment before moving the parent to `Todo`. Save the issue body you just read back as a local UTF-8 file, then run:

```text
node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
```

If linked children exist, give `--children` a JSON array of them, each entry with its slice id and evidence. The proof rejects duplicate or missing slice links, unowned slices, duplicate evidence, missing or duplicate lenses, invalid acceptance IDs, lenses that do not own required path rows, and incomplete or stale acceptance-matrix rows. This is the same executable convergence proof used by `next-ticket`; `submit-draft-pr` and `complete-pr` later revalidate the handoff once implementation and the pull request exist.

- Exit 1 means an actionable remainder, for example a lens that does not own its required path rows.
- Exit 2 means a missing or invalid record or argument. That includes a body file that is not UTF-8, such as the UTF-16 that a Windows PowerShell 5.1 `>` redirect writes.

Correct the records and rerun. Stop on any actionable remainder.

### Move and report

Move the parent to `Todo` only when the proof exits 0 with `outcome: "verified"` and every check above has passed. Use the shared REST Project status writer. If an edit fails or a readback disagrees, stop before the status change, report the partial state as it really is, and never say the PBI is ready.

After the move, read the Project status back one last time. Then report the PBI, its priority, effort, and standard labels, any linked or replacement issues, and any unresolved decisions. Stop before implementation.

For regression verification, exercise [the refinement fixtures](fixtures.md).
