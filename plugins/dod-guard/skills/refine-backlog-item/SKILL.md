---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
---

# Refine a backlog item

Turn one existing Backlog or Todo issue into an implementation-ready parent PBI, in the issue's own target repository. Never create a branch, assign the PBI, set In Progress, implement code, or open a PR.

Never run `closure.mjs apply` without a `closure.mjs plan` output from the same snapshot that shows no holds. Never delete or rename repository labels. Never edit a PBI body outside the five sections and the records in Implementation notes.

Resolve the plugin root from this skill's directory. Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md`. Where this skill is stricter, it wins. After a failed or ambiguous write, read the resource back before you retry.

## Preconditions

1. Resolve the repository, linked Project, and Backlog and Todo statuses per the discipline standard ("Resolve the repository and Project"). Get the Project from `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`. Stop on outcome `none` or `several`, or on exit 2.
2. Verify the issue is in the repository, is in that Project, and has Status `Backlog` or `Todo`. Drafts are not accepted.
   - A `Todo` parent is refined in place, for example after `select-next` reported it as `needs-refinement`. Run the whole skill, leave its Status `Todo`, and skip step 6 of "Apply labels and verify".
   - Exception: a parent in `Todo` or `In Progress` after `dod-guard:next-ticket` stopped with `step-plan-missing`. Run only "Write the step plans", leave Status unchanged, and change nothing else.
3. Fetch all live labels with descriptions: GitHub MCP, else `gh api --paginate "repos/{owner}/{repo}/labels?per_page=100"`.
4. Check that each label below has exactly one exact-name match and a nonempty description. Otherwise stop before any mutation.
   - Priority: `Prio 1 - Emergency`, `Prio 2 - Urgent`, `Prio 3 - Standard`, `Prio 4 - Non-Urgent`, `Prio 5 - Planned`, `Prio 6 - Unknown`
   - Effort: `Effort 1 - Trivial`, `Effort 2 - Easy`, `Effort 3 - Medium`, `Effort 5 - Large`, `Effort 8 - Huge`, `Effort 13 - Epic`
   - Standard: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`

Never create labels, duplicate labels, Project fields, or another estimation scale. On any missing or ambiguous value, stop and report it. Never infer product decisions.

## Research and discovery triage

Before you classify gaps or settle priority, effort, or direction, read the issue, repo instructions, affected code, callers, and existing tests (for docs or skill work: the affected instructions, entry points, and validation). Record absent coverage. Never assume it exists.

Run research as plan, investigate, judge, each stage given the Stage brief (`standards/model-routing.md`, "Stage brief"). The planner and judge run on `dod-guard:read-standard`, investigators on `dod-guard:read-cheap`. The planner writes questions from the issue, investigators answer each with cited evidence, the main thread verifies, and the judge decides triage, classification, and acceptance criteria. Verified citations become `research-source` entries. Batch the investigators and dispatch them as "Plan, investigate, judge" in `standards/model-routing.md` says: at most eight questions and 20 KB per report, and every independent batch in one message.

Then write a `discovery-triage` in the implementation notes. Put each unresolved point in one category: `user constraints or priorities`, `external facts or context`, `genuine tradeoff`, or `no gap`. A PBI may need several routes. Settle user constraints and external facts before any debate. On `no gap`, continue without a discovery workflow.

Run triage again after every interview, research, advisor, or debate round. Never turn a new gap into a silent assumption. Never ask dependent questions, or finalize labels or Todo, while a material answer is missing. Never ask the user for facts the repo, the web, or Context7 can establish.

- External facts: inspect code, callers, tests, and architecture first. Use the web or Context7 only for facts outside the repo or needing current evidence. Record each source and finding in `research-source`.
- User constraints, interactive: ask in ordinary conversation after research. Put all currently independent questions in one round, each with several concrete options and a marked recommended default. Hold dependent questions for a later round, and wait for the round's answers before using any answer-dependent option. Record the result as an `interview-contract` note.
- User constraints, active goal or non-interactive: invoke exactly one fresh `dod-guard:codex-advisor` instead of asking (it owns the model: `gpt-5.6-sol` at `max` reasoning effort, Codex fallback only). Brief it with only the batched independent questions, candidates and a recommended default, repo and PBI context, researched evidence, and the affected acceptance boundary and constraints. It gives advice only and cannot replace user authority. Never invoke another advisor to retry, vote, or refine. Record an `advisor-decision` note. If it cannot settle a user-authority question, fails, or returns something unusable, record an `unresolved-decision` (with the exact failure). Never depend on a provider-specific AskUserQuestion tool.
- Genuine tradeoff: debate one concrete decision, only after facts and user constraints are known. Use three to five named real experts whose documented positions match the competing concerns. Run at least two rounds (position, then challenge to the strongest opposing position), then a synthesis. Record the result as `debate-synthesis`, `accepted-option`, and `rejected-option` notes. Record a new tradeoff the debate exposes and continue the same decision. Keep raw scratch files outside the repository. Never turn expert speculation into a requirement.
- Unresolved items: keep the issue in Backlog when a material requirement cannot be stated without inventing it. Document the exact gap, fallback, impact, and next step. An unresolved item does not block Todo if the PBI is independently deliverable, outcome, scope, and criteria are coherent, and no requirement was invented.

## Repository gate preflight

When the issue lists owner files, or the work edits files that the repository's PR gate scans, find the gate the repository itself runs. Read the repository instructions (`AGENTS.md`, `CLAUDE.md`) and the CI workflow that holds its required checks. Run the scanner that gate uses over the owner files, with the exact flags CI uses. A gate that diffs a base against HEAD sees only committed changes, so scan the files themselves rather than waiting for a diff. Never write another repository's command, patch or root into a plan.

Record in Implementation notes the exact command, the flags, the result, and any cleanup the gate's quota requires. Carry the command into the step plan of each task that edits an owner file. A finding the required gate would block on is planned cleanup before the item reaches Todo. When the repository documents no PR gate, record that and plan none. When the gate cannot run here, record the reason and the command that would run it.

For extraction or helper-splitting work, state the layer of each planned helper (domain, application, I/O boundary, or the repository's own layering) in Implementation notes.

## Choose labels

The live label descriptions are the classification contract. Pick exactly one priority and one effort label whose descriptions fit the researched impact, urgency, scope, dependencies, risk, and uncertainty. The scales are independent: never infer urgency from effort, or estimate from the title alone. Use `Prio 6 - Unknown` only when evidence supports no other priority, and say in the notes what information would let you reassess. Pick one or more standard labels, never the whole set. Stop if no label's description supports the classification. Priority and effort are labels in a repository whose Project has no Priority or Effort fields; never create those fields, and read them back as labels.

## Refine the PBI body

Give the parent issue `## Outcome` (the observable result), `## Scope` (included behavior and explicit non-goals), `## Implementation notes`, `## Acceptance criteria` (checkboxes with observable outcomes), and `## Verification` (checks that can prove each criterion).

Implementation notes hold the triage and record summaries (one short entry each, fields per `standards/project-workflow.md`), code, caller, and test evidence, the priority and effort rationale tied to label descriptions, and the standard-label rationale. When a version bump is in scope, list its carriers by grepping the exact `"version"` key of the plugin manifests (`plugin.json`, `package.json`), never a bare version string, which also matches dependency ranges and lockfiles.

Ask only if the missing choice alters the wording of an acceptance checkbox. Otherwise record the assumption in `discovery-triage` and continue. A user-authority point still follows the routes in "Research and discovery triage". Never write a false choice as a requirement.

**Children.** Children are checklist work on the parent's one branch and one PR, never child branches or PRs. Reuse an existing child that owns a unit. Never duplicate one. Each new child gets minimal parent context, scope, criteria, and verification.

- Ordinary parent: create linked sub-issues only for criteria that can be completed, committed, and closed independently. Dependent steps stay in the parent. Add no administrative subtasks.
- Structured parent: decompose by user action into at most 5 coherent slices, only down to what can be implemented, tested, and verified alone. A count above 5 means the scope is not one PR, so split it as "One parent, one closing PR" says. A cohesive feature may stay one checklist. Never add a child to fill a category list.
- Each slice leaves the system working with tests green. The first is the thinnest end-to-end path through the supported surface. Name a slice by the behavior it adds. One nameable only by position or layer is mis-cut.
- For repeated variants, the first slice introduces the shared boundary and converts one variant. The rest are local slices behind it.
- Keep a concept's validation and error behavior in its slice. A slice that replaces old structure also migrates callers and deletes obsolete parts. Add nothing for speculative variants.

**One parent, one closing PR.** A parent's scope must be what a single PR can fully deliver, because `dod-guard:complete-pr` finishes only a PR that closes its parent. Never refine a parent whose scope is meant for several PRs, and never plan a partial delivery. Split the scope into separately deliverable issues first.

Every structured PBI assesses four lenses: implementation; wiring and end-to-end usability (proof it is reachable from its intended UI or user-facing surface); refactoring and code quality; and failure and recovery reliability. Attach each lens to the child or parent-level task that owns it, with observable acceptance and verification. Lenses are not child categories. A sub-issue being refined into a PBI gets the same research, sections, and label rules.

**Feature records.** For feature work or material ambiguity, read `standards/project-workflow.md` from the plugin root. Never assume the target checkout has it. Keep these as distinct subsections of Implementation notes, with discovery markers as evidence inside them: `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, `acceptance-evidence`, `planned-acceptance-matrix`. Small, clear fixes need none of them. Open every `requirements` bullet with an id token (`R-1`, `R-2`, and so on) and cite, in each acceptance checkbox after its `AC-n` id, the ids it proves, as in `- [ ] AC-1 (R-1, R-2) text`. `handoff-proof.mjs refinement` reports a requirement that no criterion cites and a cited id that is not a requirement.

- `acceptance-evidence` gives each acceptance checkbox id its evidence id. `planned-acceptance-matrix` plans every row before any proof runs.
- The task list names dependencies, marks a task `independent` only if it can be committed and closed separately, keeps order stable, and maps each task to a functional slice or to a parent-level task with `parentLevel: "convergence"`. A task with no sub-issue is never `independent`; the refinement proof reports it.
- `lens-ownership` says where each lens is covered, or why not. An entry stores no head: write no `headSha` or `head`, not even a placeholder, because the post-push proof binds each lens to the pushed head and `handoff-proof.mjs refinement` reports a stored one.
- Evidence ids are unique across every task, lens and row. A new convergence task that covers an existing lens takes over that `lens-ownership` entry; never list a lens twice.

**Re-refinement.** Compare existing discovery notes to current code, tests, sources, and decisions. Reuse current evidence, repeat only stale or newly triggered phases, and update summaries in place, and replace the prior priority and effort rationale rather than appending. Create no duplicate sub-issues or scale labels.

## Effort 13 and splitting

`Effort 13 - Epic` blocks the move to Todo. Keep the issue in Backlog and split it into independently deliverable linked issues (or explicitly linked replacements), each researched and estimated separately. Dependent subtasks do not clear the block. The original may reach Todo only if its remaining scope is independently deliverable and evidence supports a lower effort label.

Each replacement delivery root records the issues it replaces in one `supersedes` record under its Implementation notes (format in `standards/project-workflow.md`).

- An original that still owns delivery scope stays open. `dod-guard:complete-pr` closes it after verified delivery.
- An original that is a pure hierarchy record (no linked PR, no unchecked criterion outside its sub-issues, every sub-issue settled or named by a replacement root's `supersedes`) closes now as `not_planned`, with an evidence comment. Run these in order, building the snapshot after the replacement roots carry their records:
  1. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs snapshot --repository=<owner/name> --output=<file>`
  2. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs plan --snapshot=<file> --hierarchy=<issue>`
  3. `node <plugin-root>/skills/complete-pr/scripts/closure.mjs apply --snapshot=<file> --hierarchy=<issue>`

If the snapshot exits non-zero, stop and report. Never plan or apply from an older file. If the plan shows any hold, report each hold with its reasons and do not run apply. Apply also closes every other issue the same plan admits, not only the hierarchy issue. Never close by hand.

## Write the step plans

Write one comment per task on the parent, headed `## Step plan: <task-id>`, with the id from the `task-list` record (`task-1` when there is no task list). Write them on this thread at the standard tier, because `dod-guard:next-ticket` runs cheap and plans nothing.

Per step, give the file, the edit (symbol and intent), the test to add or change (name and assertion), the validation command, and the expected result. Also give the plan `File: <path>` lines, one per file the plan creates or changes, including every test, fixture, and caller of a changed contract, and one `Proxy check: <regex> in <path>` line per search for code the edits can affect, such as the callers of a changed symbol. The regex is a JavaScript regular expression matched per file with the multiline flag, and the path is a file or directory relative to the checkout. The refinement proof reports any hit of a proxy check that no `File:` line of the same plan names, so add the hit's file to the plan or narrow the check. Use fenced code blocks only, never indented ones, and give at most 5 steps per comment. If a task needs more, split it in the `task-list` so each part has its own id and its own comment. A split part with no sub-issue is a parent-level task with `parentLevel: "convergence"`. The plan carries every design decision, so a cheap model chooses nothing. A control run is a proof an acceptance criterion depends on, such as a baseline or a negative control that must fail or differ before the change. Write each one as its own step with its own command and expected result, never folded into another step's validation.

Before posting, check every target the plan names with Grep or Glob in the checkout: each file path exists or is marked as created by that step, each test file sits beside the code it covers, and each symbol is found in the file named. Correct a plan whose target is missing or misplaced, and list the targets checked in the final report.

**Signature dry run.** Before posting, scan the code each plan fixes with the repository's own gate scanner, so a plan its PR gate would block never reaches `next-ticket`. A plan that introduced an 8-parameter method once stopped `next-ticket` twice with `step-plan-missing`.

- Write scratch files outside the checkout, one per source file the plan creates or changes, under the same extension. Put each new or changed function, method, and constructor header in it with an empty body, parameter lists copied exactly as the plan states them. Wrap the members of a C# or Java file in their class. Put code the plan gives verbatim in the file as written.
- Find the scanner as the preflight found the gate: `quality-scan.mjs` sits beside `quality-pr-gate.mjs`. In a repository that does not hold it, take it from the installed quality-guard plugin as `review-pr` does, from the client's plugin list, and never guess a cache path. Run `node <scanner-dir>/quality-scan.mjs <scratch-dir> --root=<scratch-dir> --no-config --format=json --rules=<rules>`.
- Rules: `param-count,flag-parameter,output-parameter,unnamed-tuple,line-length` for headers alone; add `function-length,complexity,nesting-depth,else-branch` when the plan gives verbatim bodies. `dead-export`, `test-only-export`, and `duplicate-block` need the whole project, so a scratch file cannot judge them and the PR gate keeps them.
- Read the `violations` array of the JSON. The scanner exits 0 even with findings, so the exit status proves nothing.
- The block level is the target's own: the `--block-on` its gate step in the CI workflow passes (`medium` when it passes none) and each `--rule-block-on` floor, never dod-guard's `--block-on=high`. A violation at or above it is a plan defect. Change the design in the plan (a parameter object, state held by the type, a split into helpers) and rescan until none remains. The gate identifies a finding by its rule plus function name, so keep the name of a function that already has a finding.
- Record the command, rules, level, and result in Implementation notes. When the scanner cannot run, record the reason and the command that would run it, and continue; never enable or install a plugin for it.

Post as the authenticated user. Write a plan for every task lacking a comment that the step-plan rule in `standards/project-workflow.md` accepts. On re-refinement, replace a changed task's comment only, by posting a new comment (the newest accepted one wins). Never edit another user's comment. Read every comment back with its author before the Status changes, or before you report when Status stays. If a comment is missing or its author is not the authenticated user, repost that task's comment only. After two reposts that still read back wrong, stop before the Status change and report.

## Apply labels and verify

1. Read the current labels. Add the chosen ones through the GitHub MCP issue update, else `gh issue edit {issue-number} --repo {owner}/{repo}` with repeated `--add-label` and `--remove-label`.
2. In the same edit, remove every other priority or effort label, including stale `Prio <number>` and `Effort <number>` variants. Keep unrelated labels. Remove an obsolete standard label only when research shows it no longer applies.
3. Read back the body, labels, linked sub-issues, step-plan comments, and Project status. Confirm the sections, evidence, a step-plan comment per task, linked sub-issues, Status unchanged (`Backlog` for a Backlog parent, `Todo` for a Todo parent), exactly one label per scale plus a standard label, and effort below 13. An unknown priority must explain the missing evidence.
4. For a structured PBI also confirm that the seven records are coherent, each linked child matches one independently deliverable slice and is actionable and Todo, and each lens has an owner.
5. Save the readback body as a UTF-8 file and run `node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>] --plans=<path> --root=<dir>`, passing `outcome: "verified"`. Save the newest accepted step plan comment of each task, each starting with its `## Step plan: <task-id>` heading, to one UTF-8 file for `--plans`, and pass the target checkout for `--root`. Exit 1 lists each proxy hit that no `File:` line names, a proxy check that searched no file, a malformed or invalid proxy check, a plan with no `File:` line, and a task id that appears twice; correct the plan by posting a new comment and rerun. Write and read back the step plan comments before this step, because the proof needs them. With children, `--children` is a JSON array of slice id and evidence per child. Exit 0 is ok, 1 is an actionable remainder, 2 is a missing or invalid record or argument (including a file that is neither UTF-8 nor UTF-16 with a BOM). On exit 1 or 2, correct the records and rerun. Stop on any actionable remainder.
6. Move to Todo only on exit 0 with outcome `verified`, using `node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <todo-option-id> Todo <item-id>`; `Todo` is the Status to set and the readback target (see that script's `--help`). A parent already in `Todo` skips the move. Read back the final Project status: it must read `Todo`. Otherwise report the partial state and never claim readiness.

If an edit fails or a readback taken before the status change disagrees, stop before the status change, report the actual partial state, and never claim readiness.

Final report: PBI, priority, effort, standard labels, linked or replacement issues, and unresolved decisions. Then stop before implementation. Regression checks use [the refinement fixtures](fixtures.md).
