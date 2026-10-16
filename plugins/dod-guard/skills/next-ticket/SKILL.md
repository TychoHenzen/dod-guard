---
name: next-ticket
description: Execute a refined GitHub Project PBI through implementation, verified commits, and a pushed branch. Use when the user asks to pick up, start, or continue a ready PBI. Use submit-draft-pr to create its pull request.
---

# Next ticket

This skill takes one ready PBI from the Project queue to a pushed feature branch with evidence for every acceptance criterion. It stops short of the pull request, which belongs to `dod-guard:submit-draft-pr`.

Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root. When this skill sets a stricter boundary, the skill wins. Resolve the active dod-guard plugin root from the directory this skill lives in, not from the target repository, and read `standards/project-workflow.md` before touching any file. Then classify the PBI. A small, clear fix takes the ordinary path. A feature or an ambiguous PBI uses these seven records as the implementation handoff: `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, `acceptance-evidence`, and `planned-acceptance-matrix`.

Work in the repository's main checkout as the source of truth for ordinary ticket work. Do not create a tracked planning file or bypass stops for credentials, destructive or authority-bound actions, unrelated work, provider or head mismatch, or missing high-risk evidence. Scratch notes live outside the repository, or go before the commit.

## Preconditions

1. Confirm the current directory is inside a Git worktree. This skill never creates a worktree.
2. Before selection, run `git worktree list --porcelain`. Its first entry is the main checkout. Use that checkout when it can safely create the branch from the fetched default.
3. If you find a locked, unavailable, active, or unsafe user-owned main checkout, stop and report why, which checkout is affected, and how to recover.
4. Never reset, stash, overwrite, move, or silently include user-owned changes.
5. Read `git status --short --branch` and sort every pending path into one of two groups. In-scope ordinary changes stay uncommitted until the ticket branch exists. Then stage and commit them there with the ticket's other reviewed changes. Do not commit them on the current or default branch to clear status output. Secrets, destructive intent, unrelated edits, and work that cannot be separated are preserved and reported. A dirty worktree is not a blocker by itself.
6. Run verification commands that cross PowerShell, native executables, or a chosen POSIX shell as the [command-composition contract](../../docs/command-composition.md) directs: separate path arguments, required-argument checks, destination-parent preconditions, and producer exit status.

## Resolve the repository and Project

For the repository, the linked Project, and the `Todo` and `In Progress` statuses, follow "Resolve the repository and Project" in `standards/github-request-discipline.md`. The Project lookup is `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`; stop on outcome `none` or `several` or on exit 2. Do not pick a Project by a similar title or a remembered owner. State the Project's owner, number, and title, and use it for all later lookups.

## Select a ticket

Pick the issue.

- With an issue number from the user, check that it belongs to this repository and sits in the linked Project.
- Without one, list this repository's open Project items. Keep issues that are unassigned and have Status exactly `Todo`. Drop pull requests. Show number, title, assignee, and status. One survivor is selected automatically. With several, the user chooses.

Read the issue body before calling the ticket ready. It must contain:

- a short description of the intended change;
- implementation notes;
- acceptance criteria written as checkboxes with observable outcomes;
- one step plan per task: a `## Step plan: <task-id>` comment written by `dod-guard:refine-backlog-item` that the step plan rule in `standards/project-workflow.md` accepts by its author. A PBI without a task list has a single task, `task-1`.

If any of that is missing, stop and name the missing section. Do not invent requirements.

Check the parent's shape.

- Ordinary parent: each linked sub-issue is open, or closed with pushed implementation evidence. A parent with no linked sub-issues is valid when it is one coherent implementation slice.
- Structured PBI: the task list shows its functional decomposition, and every linked child, if any, is actionable and `Todo`, maps to exactly one independently deliverable slice, and has an owning task. Before implementation, verify the named `lens-ownership` record maps each required lens (`implementation`, `wiring/usability`, `quality`, `reliability`) to an existing task or slice with observable acceptance or verification evidence. A task that owns cross-cutting parent work with no child is marked `parentLevel: "convergence"`. Any other task names a functional slice.
- The lens IDs are the canonical names for the prose concerns: implementation, wiring and end-to-end usability (`wiring/usability`), code quality (`quality`), and failure and recovery (`reliability`).
- Do not require a fixed child count or category set.
- Require pushed implementation evidence before a commit or PR handoff, not before execution.
- Stop before implementation when a child is duplicated, mis-mapped, or not actionable, or when a lens has no owning slice or parent-level task.

Prove the handoff. Before the branch exists, save the issue body as read back from GitHub into a local UTF-8 file, then run this:

```text
node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
```

When linked functional-slice children exist, pass `--children` a JSON array holding each child's slice id and evidence. The command prints `{outcome, remainder}` and exits 0 only on `verified`. Exit 1 means an actionable remainder and exit 2 means a usage or parse error that names the argument or record; stop on both. Input that is not UTF-8 fails with exit 2, for example the UTF-16 that `>` produces in Windows PowerShell 5.1. A UTF-8 BOM passes. The proof checks the named records, slice ownership, lens ownership, the evidence shape, and the planned matrix. It reads `acceptance-evidence` and `planned-acceptance-matrix` among the records, and applies the finalization-gate rules of `dod-guard:complete-pr` without an exact head. Any actionable remainder from the structural phase of the executable convergence proof is a stop. After the handoff is pushed, rerun the proof with the exact head and matrix, and require it to be fresh.

If the step plan is missing or comes from an unaccepted author, follow the `step-plan-missing` stop in "Implement the issue".

Maintainer note: refine-backlog-item, submit-draft-pr, complete-pr, and project-workflow share this slice and lens handoff, so change it in step with them and keep the one-parent-branch, one-PR boundary.

## Prepare the mutation

Before any mutation, settle these values.

| Value | Rule |
|---|---|
| Default branch | Fetch it from the remote. |
| Slug | Lowercase ASCII letters, digits, and single hyphens, with no hyphen at either end. |
| Branch | `codex/<issue-number>-<slug>`, under 64 characters in total. Shorten only the slug. |
| Branch absence | The branch exists neither locally nor on `origin`. |
| PBI Status | Currently `Todo`. |
| Project ids | The project item id, the numeric project number, the live Status field id, and the In Progress option id. |

Stop before any mutation when a value is missing or ambiguous. Do not hardcode a project, field, option, repository, default branch, or user id carried over from an earlier run. Choosing the ticket already authorizes the branch, assignment, and status changes, so do not ask again when every value resolved without ambiguity.

## Start the ticket

Perform the four actions in this order.

1. Create the local branch from the fetched remote default and carry the classified in-scope pending changes with it. If Git cannot do that without losing them, stop. Never stash, discard, or commit them elsewhere.
2. Push with upstream tracking to an `origin` branch of the same name. This branch-only push is allowed even when an unmet criterion will later block the implementation commit and push.
3. Assign the issue through the GitHub MCP assignee operation, or else `gh issue edit` with `--add-assignee @me`.
4. Move Status to `In Progress` with the runner below.

`node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <in-progress-option-id> "In Progress" <item-id>`

The runner resolves the live REST field and item ids from the linked Project. It uses the numeric project number as the REST path identifier. It takes the item as a numeric REST id or its `PVTI_` global node id, and resolves either form to the same item. Pass the numeric id: the runner reads that through the single-item endpoint, whereas a `PVTI_` id turns up only in the items list, which can trail a freshly added item. The runner also reads the item back before the ticket-start sequence can continue.

Never create a branch over an existing one or switch to it. When something fails later, report exactly which actions finished and leave the created branch and remote state alone. There is no automatic rollback.

When a start action fails, times out, or ends ambiguously, first read back the local and remote branch, issue assignee, and Project status. Keep the branch and carry out only the action that is missing, and never create a second branch, repeat an assignment, or repeat a status mutation before its readback.

## Implement the issue

The issue's description, notes, and criteria are the task contract. Read the repository instructions that cover each file you will touch, and inspect the affected code, its callers, and its tests before changing anything. Add no behavior the issue does not require. Implement every acceptance criterion, add or update automatable tests, and respect any smaller-step boundary in the repository instructions.

Dispatch rules:

- Dispatch every task, including the single task of a one-task PBI, to `dod-guard:stage-cheap` from the task's step plan, the `## Step plan: <task-id>` comment that the step plan rule in `standards/project-workflow.md` accepts.
- Before dispatching a task, save its step plan comment, unchanged, to a scratch file outside the repository.
- The brief is the one "Stage brief" in `standards/model-routing.md` defines, and its first line reads `Follow the step plan in <scratch file>.`
- This thread writes no step plan and decides no design question: the plan carries every design decision.
- Implementing the task from that plan uses the cheap tier on `dod-guard:stage-cheap`.
- Edit tracked files for implementation on this thread only when your brief carries the failure record of an earlier cheap run of the same task. When you run on `dod-guard:stage-cheap-skill` and a task fails that way, stop the stage and report the failure record to your dispatcher.
- Each task report names its dispatch (agent, model, and effort) or the escalation record that explains an owner edit; a report with neither is a failed check.

When the task list has more than one task, run each task in order as one step of [dod-guard:step-by-step](../step-by-step/SKILL.md), with one fresh subagent per task, passing the task list as a calling-skill plan with a commit per step. In that run, regenerating artifacts uses the cheap tier on `dod-guard:stage-cheap`, as `standards/model-routing.md` routes it. Because step-by-step's per-step commit makes every verified task a durable checkpoint, an interrupted run resumes from the last commit.

A task with no plan, a comment with the heading from an author that the step plan rule does not accept, or a plan that leaves a design decision open, is the stop `step-plan-missing`: name the task, change nothing, and report to the dispatcher, which runs `dod-guard:refine-backlog-item` on the parent. Never write or complete a step plan yourself.

Report each task of a structured PBI with its changed files, commit, and fresh evidence. A task is not complete while its requirement is contradicted or its evidence is missing.

Shape code as small pure functions with explicit inputs and outputs, and keep I/O at the edges. Where it reads better, ordinary loops or mutation are fine. No functional-language style is required.

On a failing test, compare it with the task contract. A stale expectation gets updated, then the test reruns. An implementation that breaks the contract gets fixed. Never weaken or delete a test just to pass.

## Verify and prepare generated files

- Use the documented build, test, lint, and format commands: focused checks while working, then every required pre-PR gate. Confirm the test glob includes every new test or fixture before calling a suite green. Do not rerun an unchanged full suite for reassurance. A suite that consumes a changed fixture is not unchanged.
- When a change adds or modifies a fixture, scene, seed, or other shared test data, search for references to it and run every existing suite that consumes it before push. When such a suite cannot run locally, name it in the handoff as pending exact-head CI, outside the acceptance matrix, and carry that into the pull request body; that alone does not stop PR handoff. Its exact-head CI result must pass before review, recorded with its run ID in the Preflight checkpoint, or in the handoff when there is none.
- When a proof calls a live product or runtime tool, such as an MCP server for a game, an app, or an emulator, it follows these rules. Before the first proof call, read the tool's current schema (for MCP, its live `tools/list` entry) and send only arguments it declares. Wait for the tool's own readiness signal before the proof call. When the tool declares none, record that, and treat its documented ready condition or a successful no-op call as ready. A process exit, a startup error, or the end of the tool's own ready window before readiness is a failure under the failure-recovery rule in `standards/working-defaults.md`. After an unsupported-argument rejection or a malformed result, never retry identical arguments. Make one schema-corrected call, or switch to the nearest supported proof path and record the switch and the original error in the matrix row, or, for a PBI without a matrix, in the `## Implementation handoff`. GitHub and other provider calls keep the stop in `standards/github-request-discipline.md`.
- Generate tracked build outputs on the feature branch when the repository requires them. Quality diagnostics are report-only evidence, so do not generate or persist metric state. Review generated changes together with the rest of the diff. CI never writes generated files or repairs the branch for you.
- Tie each acceptance criterion to fresh evidence.

## Acceptance matrix

A structured PBI carries one `## Acceptance matrix` in the handoff. Each acceptance criterion and each mandatory user-facing path gets one row. A row records:

- the contract or criterion, and the risk or user path;
- the proof action and the expected observable;
- the observed result and the status;
- the evidence location and the exact pushed head SHA.

Status takes only `pass`, `unverified`, `failed`, `blocked`, or `inapplicable`, and `inapplicable` needs an explicit reason. Add rows for identity and authorization, interactive control, browser or E2E, data and error, and recovery when those paths apply. When one does not, record why. Check every row against the checked-out and pushed head before commit or handoff.

Before commit or handoff, map every linked child to its owning task, changed files or verified remote state, commit, and fresh verification. Stop before commit or PR handoff when a matrix row, criterion, child, required check, or proof is missing, failed, unverified, blocked, or head-mismatched, and state the exact failed command or the actionable remainder.

## Preflight checkpoint

For a structured parent, once the PR exists, add one `## Preflight checkpoint` section to the same handoff, tied to the exact pushed head. It holds:

- the branch ref and SHA, the PR head SHA, the base ref and SHA, and mergeability;
- one row per required provider context, with provider, workflow, run ID, ref, head SHA, and one of `present`, `pending`, `failed`, `skipped`, or `unavailable`.

Dispatch a draft-skipped workflow only after reading readiness back, and only once for the same repository, ref, workflow, and head, then record the run and the head read back afterward. Record base drift, a merge conflict and its triage (the `## Conflict triage` section that `standards/conflict-triage.md` defines) or its unresolvable stop, unexpected movement, provider failure, and any bounded-recovery remainder explicitly, instead of treating the matrix as current. The checkpoint is one evidence record, not a local review ledger.

## Commit and push

Stage only reviewed files that belong to the issue, never blindly, and leave unrelated files alone. Classified pending changes join the commit only when they are in scope and covered by the final diff. Inspect `git status`, the complete diff, and the staged diff first.

Commit with a concise message naming the outcome. For a PBI with more than one task, each task already has its own verified commit. Push the current branch to its existing upstream. Never force-push or rewrite commits.

After the verified implementation commit is pushed, create or update one parent-issue comment headed `## Implementation handoff`. Give it one entry per ordered task and per linked functional-slice child: commit or verified remote-state evidence, changed files or artifact, and the fresh check or user-path result. Then add the single `## Acceptance matrix` and, once the PR exists, the single `## Preflight checkpoint`. That matrix is the durable acceptance record that `dod-guard:submit-draft-pr` convergence and `dod-guard:complete-pr` read, so never copy it to a local ledger. State the remainder explicitly, and write `none` only when every task, row, criterion, user path, and preflight checkpoint is evidenced at the same head. Neither a local planning file nor a second issue replaces the comment.

## Result

Report the repository, linked Project, issue, branch, commit, checks, and pushed branch, and tie each criterion to its evidence. Name any check that could not run. Stop after the push. `dod-guard:review-pr` is the one independent review.
