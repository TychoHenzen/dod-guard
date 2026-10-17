---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
---

# Refine a backlog item

Turn one existing Backlog issue into an implementation-ready parent PBI, in the issue's own target repository. Never create a branch, assign the PBI, set In Progress, implement code, or open a PR.

Resolve the plugin root from this skill's directory. Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md`. Where this skill is stricter, it wins. After a failed or ambiguous write, read the resource back before you retry.

## Preconditions

1. Resolve the repository, linked Project, and Backlog and Todo statuses per the discipline standard ("Resolve the repository and Project"). Get the Project from `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`. Stop on outcome `none` or `several`, or on exit 2.
2. Verify the issue is in the repository, is in that Project, and has Status `Backlog`. Drafts are not accepted.
   - Exception: a parent in `Todo` or `In Progress` after `dod-guard:next-ticket` stopped with `step-plan-missing`. Run only "Write the step plans", leave Status unchanged, and change nothing else.
3. Fetch all live labels with descriptions: GitHub MCP, else `gh api --paginate "repos/{owner}/{repo}/labels?per_page=100"`.
4. Check that each label below has exactly one exact-name match and a nonempty description. Otherwise stop before any mutation.
   - Priority: `Prio 1 - Emergency`, `Prio 2 - Urgent`, `Prio 3 - Standard`, `Prio 4 - Non-Urgent`, `Prio 5 - Planned`, `Prio 6 - Unknown`
   - Effort: `Effort 1 - Trivial`, `Effort 2 - Easy`, `Effort 3 - Medium`, `Effort 5 - Large`, `Effort 8 - Huge`, `Effort 13 - Epic`
   - Standard: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`

Never create labels, duplicate labels, Project fields, or another estimation scale. On any missing or ambiguous value, stop and report it. Never infer product decisions.

## Research and discovery triage

Before you classify gaps or settle priority, effort, or direction, read the issue, repo instructions, affected code, callers, and existing tests (for docs or skill work: the affected instructions, entry points, and validation). Record absent coverage. Never assume it exists.

Run research as plan, investigate, judge, each stage given the Stage brief (`standards/model-routing.md`, "Stage brief"). The planner and judge run on `dod-guard:read-standard`, investigators on `dod-guard:read-cheap`. The planner writes questions from the issue, investigators answer each with cited evidence, the main thread verifies, and the judge decides triage, classification, and acceptance criteria. Verified citations become `research-source` entries.

Then write a `discovery-triage` in the implementation notes. Put each unresolved point in one category: `user constraints or priorities`, `external facts or context`, `genuine tradeoff`, or `no gap`. A PBI may need several routes. Settle user constraints and external facts before any debate. On `no gap`, continue without a discovery workflow.

Run triage again after every interview, research, advisor, or debate round. Never turn a new gap into a silent assumption. Never ask dependent questions, or finalize labels or Todo, while a material answer is missing. Never ask the user for facts the repo, the web, or Context7 can establish.

- External facts: inspect code, callers, tests, and architecture first. Use the web or Context7 only for facts outside the repo or needing current evidence. Record each source and finding in `research-source`.
- User constraints, interactive: ask in ordinary conversation after research. Put all currently independent questions in one round, each with several concrete options and a marked recommended default. Hold dependent questions for a later round, and wait for the round's answers before using any answer-dependent option. Record the result as an `interview-contract` note.
- User constraints, active goal or non-interactive: invoke exactly one fresh `dod-guard:codex-advisor` instead of asking (it owns the model: `gpt-5.6-sol` at `max` reasoning effort, Codex fallback only). Brief it with only the batched independent questions, candidates and a recommended default, repo and PBI context, researched evidence, and the affected acceptance boundary and constraints. It gives advice only and cannot replace user authority. Never invoke another advisor to retry, vote, or refine. Record an `advisor-decision` note. If it cannot settle a user-authority question, fails, or returns something unusable, record an `unresolved-decision` (with the exact failure). Never depend on a provider-specific AskUserQuestion tool.
- Genuine tradeoff: debate one concrete decision, only after facts and user constraints are known. Use three to five named real experts whose documented positions match the competing concerns. Run at least two rounds (position, then challenge to the strongest opposing position), then a synthesis. Record the result as `debate-synthesis`, `accepted-option`, and `rejected-option` notes. Record a new tradeoff the debate exposes and continue the same decision. Keep raw scratch files outside the repository. Never turn expert speculation into a requirement.
- Unresolved items: keep the issue in Backlog when a material requirement cannot be stated without inventing it. Document the exact gap, fallback, impact, and next step. An unresolved item does not block Todo if the PBI is independently deliverable, outcome, scope, and criteria are coherent, and no requirement was invented.

## Choose labels

The live label descriptions are the classification contract. Pick exactly one priority and one effort label whose descriptions fit the researched impact, urgency, scope, dependencies, risk, and uncertainty. The scales are independent: never infer urgency from effort, or estimate from the title alone. Use `Prio 6 - Unknown` only when evidence supports no other priority, and say in the notes what information would let you reassess. Pick one or more standard labels, never the whole set. Stop if no label's description supports the classification.

## Refine the PBI body

Give the parent issue `## Outcome` (the observable result), `## Scope` (included behavior and explicit non-goals), `## Implementation notes`, `## Acceptance criteria` (checkboxes with observable outcomes), and `## Verification` (checks that can prove each criterion).

Implementation notes hold the triage and record summaries (one short entry each, fields per `standards/project-workflow.md`), code, caller, and test evidence, the priority and effort rationale tied to label descriptions, and the standard-label rationale.

Ask for direction when a missing choice changes observable behavior, a public interface, data handling, or an acceptance test. Never write a false choice as a requirement.

**Children.** Children are checklist work on the parent's one branch and one PR, never child branches or PRs. Reuse an existing child that owns a unit. Never duplicate one. Each new child gets minimal parent context, scope, criteria, and verification.

- Ordinary parent: create linked sub-issues only for criteria that can be completed, committed, and closed independently. Dependent steps stay in the parent. Add no administrative subtasks.
- Structured parent: decompose by user action into a small set of coherent slices, only down to what can be implemented, tested, and verified alone. A cohesive feature may stay one checklist. Never add a child to fill a category list.
- Each slice leaves the system working with tests green. The first is the thinnest end-to-end path through the supported surface. Name a slice by the behavior it adds. One nameable only by position or layer is mis-cut.
- For repeated variants, the first slice introduces the shared boundary and converts one variant. The rest are local slices behind it.
- Keep a concept's validation and error behavior in its slice. A slice that replaces old structure also migrates callers and deletes obsolete parts. Add nothing for speculative variants.

Every structured PBI assesses four lenses: implementation; wiring and end-to-end usability (proof it is reachable from its intended UI or user-facing surface); refactoring and code quality; and failure and recovery reliability. Attach each lens to the child or parent-level task that owns it, with observable acceptance and verification. Lenses are not child categories. A sub-issue being refined into a PBI gets the same research, sections, and label rules.

**Feature records.** For feature work or material ambiguity, read `standards/project-workflow.md` from the plugin root. Never assume the target checkout has it. Keep these as distinct subsections of Implementation notes, with discovery markers as evidence inside them: `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, `acceptance-evidence`, `planned-acceptance-matrix`. Small, clear fixes need none of them.

- `acceptance-evidence` gives each acceptance checkbox id its evidence id. `planned-acceptance-matrix` plans every row before any proof runs.
- The task list names dependencies, marks a task `independent` only if it can be committed and closed separately, keeps order stable, and maps each task to a functional slice or to a parent-level task with `parentLevel: "convergence"`.
- `lens-ownership` says where each lens is covered, or why not.

**Re-refinement.** Compare existing discovery notes to current code, tests, sources, and decisions. Reuse current evidence, repeat only stale or newly triggered phases, and update summaries in place, and replace the prior priority and effort rationale rather than appending. Create no duplicate sub-issues or scale labels.

## Effort 13 and splitting

`Effort 13 - Epic` blocks the move to Todo. Keep the issue in Backlog and split it into independently deliverable linked issues (or explicitly linked replacements), each researched and estimated separately. Dependent subtasks do not clear the block. The original may reach Todo only if its remaining scope is independently deliverable and evidence supports a lower effort label.

Each replacement delivery root records the issues it replaces in one `supersedes` record under its Implementation notes (format in `standards/project-workflow.md`).

- An original that still owns delivery scope stays open. `dod-guard:complete-pr` closes it after verified delivery.
- An original that is a pure hierarchy record (no linked PR, no unchecked criterion outside its sub-issues, every sub-issue settled or named by a replacement root's `supersedes`) closes now as `not_planned`, with an evidence comment. Run these in order, building the snapshot after the replacement roots carry their records:
  1. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs snapshot --repository=<owner/name> --output=<file>`
  2. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs plan --snapshot=<file> --hierarchy=<issue>`
  3. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs apply --snapshot=<file> --hierarchy=<issue>`

If the snapshot exits non-zero, stop and report. Never plan or apply from an older file. Report any hold with reasons. Never close by hand.

## Write the step plans

Write one comment per task on the parent, headed `## Step plan: <task-id>`, with the id from the `task-list` record (`task-1` when there is no task list). Write them on this thread at the standard tier, because `dod-guard:next-ticket` runs cheap and plans nothing.

Per step, give the file, the edit (symbol and intent), the test to add or change (name and assertion), the validation command, and the expected result. Use fenced code blocks only, never indented ones, and keep each batch small. The plan carries every design decision, so a cheap model chooses nothing.

Post as the authenticated user. Write a plan for every task lacking a comment that the step-plan rule in `standards/project-workflow.md` accepts. On re-refinement, replace a changed task's comment only. Read every comment back with its author before the Status changes, or before you report when Status stays.

## Apply labels and verify

1. Read the current labels. Add the chosen ones through the GitHub MCP issue update, else `gh issue edit {issue-number} --repo {owner}/{repo}` with repeated `--add-label` and `--remove-label`.
2. In the same edit, remove every other priority or effort label, including stale `Prio <number>` and `Effort <number>` variants. Keep unrelated labels. Remove an obsolete standard label only when research shows it no longer applies.
3. Read back the body, labels, linked sub-issues, step-plan comments, and Project status. Confirm the sections, evidence, a step-plan comment per task, linked sub-issues, Status still Backlog, exactly one label per scale plus a standard label, and effort below 13. An unknown priority must explain the missing evidence.
4. For a structured PBI also confirm that the seven records are coherent, each linked child matches one independently deliverable slice and is actionable and Todo, and each lens has an owner.
5. Save the readback body as a UTF-8 file and run `node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]`, passing `outcome: "verified"`. With children, `--children` is a JSON array of slice id and evidence per child. Exit 0 is ok, 1 is an actionable remainder, 2 is a missing or invalid record or argument (including a UTF-16 file, as PowerShell 5.1 `>` writes). On exit 1 or 2, correct the records and rerun. Stop on any actionable remainder.
6. Move to Todo only on exit 0 with outcome `verified`, using the shared REST Project status writer. Read back the final Project status.

If an edit fails or a readback disagrees, stop before the status change, report the actual partial state, and never claim readiness.

Final report: PBI, priority, effort, standard labels, linked or replacement issues, and unresolved decisions. Then stop before implementation. Regression checks use [the refinement fixtures](fixtures.md).
