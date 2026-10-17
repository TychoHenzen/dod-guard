---
name: next-ticket
description: Execute a refined GitHub Project PBI through implementation, verified commits, and a pushed branch. Use when the user asks to pick up, start, or continue a ready PBI. Use submit-draft-pr to create its pull request.
---

# Next ticket

Take one ready PBI from `Todo` to a pushed branch: branch, assign, `In Progress`, implement, verify, commit, push.

Resolve the plugin root from this skill's directory. Before editing, read `standards/working-defaults.md`, `standards/github-request-discipline.md` (section "Resolve the repository and Project"), and `standards/project-workflow.md`. Do not assume the target repository has them. Where this skill is stricter, it wins. Keep the one-parent-branch, one-PR boundary aligned with refine-backlog-item, submit-draft-pr, complete-pr, and project-workflow.

## Checkout and safety

- The current directory must be inside a Git worktree.
- Run `git worktree list --porcelain`. Work in the first entry, the main checkout, when it can safely create the branch from the fetched default. If it is locked, unavailable, active, or unsafe and user-owned, stop and report the reason, the checkout, and the recovery path.
- Never create a worktree.
- Run `git status --short --branch` and classify every pending path. A dirty tree alone is not a blocker.
- Ordinary changes that clearly belong to the work stay uncommitted until the ticket branch exists, then are committed there. Never commit them on the current or default branch to clear status.
- Preserve and report secrets, destructive intent, unrelated changes, and work that cannot be separated safely. Never reset, stash, overwrite, move, or silently include user-owned changes.
- Never create a tracked planning file; keep temporary notes outside the repo or remove them before commit.
- Follow any smaller-step boundary in repository instructions.
- Never bypass stops for credentials, destructive or authority-bound actions, unrelated work, provider or head mismatch, or missing high-risk evidence.

## Project and ticket

Run `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`. Stop on outcome `none`, outcome `several`, or exit 2. Never pick a Project by title similarity or from a remembered owner. Report the Project owner, number, and title, then use it for lookup.

A user-supplied issue number must belong to this repository and appear in the linked Project. Without one, list open Project items from this repository, keep unassigned issues with Status exactly `Todo`, drop pull requests, and show number, title, assignee, status. Select a lone result automatically. Otherwise the user chooses.

## Readiness

A small clear fix may take the ordinary path. A feature or materially ambiguous PBI uses the seven records in project-workflow as its handoff (`requirements` through `planned-acceptance-matrix`, including `lens-ownership`).

A ready ticket has a change description, implementation notes, checkbox acceptance criteria with observable outcomes, and one `## Step plan: <task-id>` comment per task (`task-1` for a PBI with no task list). Linked sub-issues are open, or closed with pushed implementation evidence; a parent with none is valid as one coherent slice. In a structured PBI each child is actionable, `Todo`, owned by a task, and maps to exactly one independently deliverable slice, and `lens-ownership` maps `implementation`, `wiring/usability`, `quality`, and `reliability` to a task or slice with observable acceptance or verification evidence. A task owning cross-cutting parent work with no child carries `parentLevel: "convergence"`.

Stop before implementation when the issue is incomplete (name the missing section, never invent requirements), a child is duplicated, mis-mapped, or not actionable, or a lens has no owner.

A missing step plan, a plan from an author the step plan rule does not accept, or a plan that leaves a design decision open is stop `step-plan-missing`. Name the task, change nothing, and report to the dispatcher, which runs `dod-guard:refine-backlog-item` on the parent. Never write or complete a step plan.

Before the branch exists, save the issue body as read back from GitHub to a UTF-8 file and run:

`node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]`

Pass `--children` as a JSON array of linked functional-slice children (slice id plus evidence) when any exist. It prints `{outcome, remainder}`: exit 0 is `verified`, exit 1 an actionable remainder, exit 2 a usage or parse error. Stop on 1 or 2. It rejects non-UTF-8 files such as PowerShell 5.1 `>` UTF-16, and accepts a UTF-8 BOM. After the handoff is pushed, rerun it with the exact head and matrix and require freshness. Implementation evidence must be pushed before commit or PR handoff, not before execution.

## Prepare and start

Fetch the remote default branch first. Name the branch `codex/<issue-number>-<slug>`, under 64 characters. The slug is lowercase ASCII from the title (letters, digits, single hyphens, none leading or trailing). Shorten only the slug. The branch must not exist locally or on `origin`. Never create or switch to an existing branch.

The issue must currently be `Todo`. Resolve the project item id, numeric project number, live Status field id, and `In Progress` option id. Stop before any mutation if a value is missing or ambiguous. Never hardcode ids from an earlier run. Selecting the ticket authorizes the branch, assignment, and status changes, so ask no further confirmation. In order:

1. Create the local branch from the fetched remote default, keeping the classified in-scope pending changes. If Git cannot do that without losing them, stop. Do not stash, discard, or commit elsewhere.
2. Push with upstream tracking to the same-named branch on `origin`.
3. Assign the issue through the GitHub MCP assignee operation. Fall back to `gh issue edit` with `--add-assignee @me`.
4. Run `node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <in-progress-option-id> "In Progress" <item-id>`. It reads the item back before you continue. Pass the numeric item id: a `PVTI_` id is found only through the items list, which can lag.

After a failed, timed-out, or ambiguous action, read back the local and remote branch, assignee, and Project status, then resume only the missing action. Never create a second branch or repeat a mutation before its readback. Report which actions completed and keep the branch and remote state. Do not roll back.

## Implement

The issue description, notes, and acceptance criteria are the task contract. Add no behavior it does not require. Read the repository instructions for every touched file, and inspect affected code, callers, and tests before editing. Implement every criterion, with automated tests where possible. Prefer small pure functions, I/O at the boundaries.

Dispatch every task, including a one-task PBI's single task, to `dod-guard:stage-cheap` from its step plan comment. Save the comment unchanged to a scratch file outside the repository. The brief is the "Stage brief" in `standards/model-routing.md`: first line `Follow the step plan in <scratch file>.`, then the branch and the proofs to return. With more than one task, run each as one step of [`dod-guard:step-by-step`](../step-by-step/SKILL.md), passing the task list as a calling-skill plan with a commit per step and one fresh subagent per task.

- This thread writes no step plan and decides no design question. Validations and artifact regeneration also go to `dod-guard:stage-cheap`.
- Edit tracked files here only when the brief carries the failure record of an earlier cheap run of that task (a check failed twice, or a plan was reported unappliable).
- When running as `dod-guard:stage-cheap-skill` and a task fails that way, stop the stage and report the failure record to the dispatcher, which reruns it under the Escalation section of model-routing.
- Each task report names its dispatch (agent, model, effort) or the escalation record behind an owner edit. A report with neither is a failed check.
- For a structured PBI, map each task to files, commit, and fresh verification. Never report a task complete when its requirement is contradicted or evidence is missing.

## Verify

Use the repository's documented build, test, lint, and format commands: focused checks while working, then every pre-PR gate. Commands that cross PowerShell, native executables, or a POSIX shell follow [command composition](../../docs/command-composition.md).

- Confirm the test glob includes every new test or fixture before calling a suite green.
- Do not rerun an unchanged full suite. A suite consuming a changed or added fixture, scene, seed, or shared test data is not unchanged: run every consumer before push.
- A consumer suite that cannot run locally is named in the handoff as pending exact-head CI outside the acceptance matrix, and carried into the PR body. That alone does not stop PR handoff, but its exact-head CI must pass before review, with the run ID in the Preflight checkpoint (or the handoff if none).
- On a failing test, update a stale expectation or fix the implementation. Never weaken or delete a test just to pass.
- Generate tracked build outputs on the feature branch. Never rely on CI to write or repair them.
- Quality diagnostics are report-only: generate or persist no metric state.
- Live runtime tool proofs (MCP for a game, app, emulator): read the tool's schema (MCP `tools/list`) and send only declared arguments. Wait for its readiness signal, or record that none exists and use its documented ready condition or a no-op call. Failing to become ready is a failure under working-defaults failure-recovery. After a rejected or malformed call, never retry identical arguments: make one schema-corrected call or switch to the nearest supported proof, and record the switch and original error in the matrix row (or the `## Implementation handoff`).

### Evidence records

Map each acceptance criterion to fresh evidence. A structured PBI builds one `## Acceptance matrix` in the handoff: one row per criterion and mandatory user-facing path, with the fields in project-workflow and only the statuses `pass`, `unverified`, `failed`, `blocked`, `inapplicable` (the last needs a reason). Add identity/authorization, interactive-control, browser/E2E, data/error, and recovery rows when they apply, otherwise record why not. Validate every row against the checked-out and pushed head. Map every linked child to its task, files or state, commit, and verification.

Once the PR exists, a structured parent adds one `## Preflight checkpoint` to the same handoff, tied to the exact pushed head, with one row per required provider context (statuses `present`, `pending`, `failed`, `skipped`, `unavailable`). Dispatch a draft-skipped workflow only after readiness is read back, once per repository, ref, workflow, and head. Record base drift, merge conflicts with their `## Conflict triage` (see `standards/conflict-triage.md`) or unresolvable stop, unexpected movement, provider failure, and any recovery remainder.

Stop before commit or PR handoff when any row, criterion, child, required check, or proof is missing, failed, unverified, blocked, or head-mismatched. State the exact failed command or remainder.

## Commit and push

Include pending changes only if in scope and covered by the final diff. Inspect status, the complete diff, and the staged diff. Stage only reviewed files that belong to the issue, never in bulk. Write a concise commit message naming the outcome. Push to the existing upstream. Never force-push or rewrite commits.

After the push, create or update one parent-issue comment headed `## Implementation handoff`: an entry per ordered task and linked child (evidence, files, fresh result), then the single matrix, then the single checkpoint once the PR exists. The matrix is the durable acceptance record for submit-draft-pr and complete-pr, so never copy it to a local ledger or second issue. State the remainder, and write `none` only when everything is evidenced at the same head.

Report repository, Project, issue, branch, commit, checks, each criterion mapped to evidence, and any check that could not run. Stop after the push: `dod-guard:review-pr` is the one independent review.
