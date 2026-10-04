---
name: next-ticket
description: Execute a refined GitHub Project PBI through implementation, verified commits, and a pushed branch. Use when the user asks to pick up, start, or continue a ready PBI. Use submit-draft-pr to create its pull request.
---

# Next ticket

Use the repository's main checkout as the source of truth for ordinary ticket
work. Before selection, run `git worktree list --porcelain`; its first worktree
is the main checkout. When it can safely create the selected branch from the
fetched default, run there. Otherwise use one isolated worktree only for a
locked, unavailable, active, or unsafe user-owned main checkout, and record the
reason, affected checkout, and recovery path. Never reset, stash, overwrite,
move, or silently include user-owned changes. Never choose a project by title
similarity or from a remembered owner.

After selection, create the PBI's feature branch, assign the issue, move it
to In Progress, implement it, verify it, review completion, commit it, and push
the branch.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

## Preconditions

1. Confirm the current directory is inside a Git worktree.
2. Read `git status --short --branch` and classify every pending path. A dirty
   worktree is not a blocker by itself. If ordinary pending changes clearly
   belong to the requested work, keep them uncommitted until the ticket branch
   exists, then carry them through the normal `/commit` path on that branch.
   Do not commit them on the current or default branch to clear status.
   Preserve and report secrets, destructive intent, unrelated changes, or work
   that cannot be separated safely.

## Resolve the repository and Project

Resolve the repository, its linked Project, and the `Todo` and `In Progress`
statuses as described under "Resolve the repository and Project" in
`standards/github-request-discipline.md`. Report the Project's owner, number,
and title, then use it for ticket lookup.

## Select a ticket

If the user supplied an issue number, verify that it belongs to this repository
and appears in the linked project.

Without an issue number, list open project items from this repository. Keep
only unassigned issues whose Status is exactly `Todo`, and exclude pull
requests. Show the issue number, title, assignee, and status. If exactly one
issue remains, select it. Otherwise let the user choose.

Before reporting a ticket as ready, read its body and require:

- a short description of the intended change;
- implementation notes;
- acceptance criteria written as checkboxes with observable outcomes.

For an ordinary parent, require every linked sub-issue to be open or closed
with pushed implementation evidence. A parent PBI with no linked sub-issues is
valid only when it is a small, clear implementation slice. For a structured
PBI, require exactly one linked child for implementation; wiring and end-to-end
usability; refactoring and quality; and fixing and reliability. Each mandatory
child must be actionable and `Todo` before execution starts; require pushed
implementation evidence before a commit or PR handoff, not before execution.
Stop before implementation when a mandatory category is absent, duplicated, or
not actionable.

Stop and name the missing section when the issue is incomplete. Do not invent
requirements.

Resolve the active dod-guard plugin root from the directory containing this skill,
then read `<plugin-root>/standards/project-workflow.md` and classify the PBI
before editing. Do not assume the target checkout contains the shared standard.
A small, clear fix may use the ordinary path. A feature or materially ambiguous
PBI uses its `requirements`, `clarifications`, `implementation-plan`, and
`task-list` records as the implementation handoff. Do not create a tracked
planning file or bypass stops for credentials, destructive or authority-bound
actions, unrelated work, provider or head mismatch, or missing high-risk
evidence.

## Prepare the mutation

Resolve every value before changing local or remote state:

1. Fetch the remote default branch.
2. Turn the issue title into a lowercase ASCII slug. Keep letters, digits, and
   single hyphens. Remove leading and trailing hyphens.
3. Form the branch name `codex/<issue-number>-<slug>`. Keep the complete name
   under 64 characters by shortening only the slug.
4. Confirm that the branch name exists neither locally nor on `origin`.
5. Confirm the selected PBI currently has Status `Todo`. Resolve its project
   item id, the numeric project number, the live Status field id, and the In
   Progress option id.

Stop before any mutation if a value is missing or ambiguous. Never hardcode a
project, field, option, repository, default branch, or user id from an earlier
run.

Selecting a ticket authorizes the branch, assignment, and status mutations
below. Do not ask for another confirmation when the requested ticket and every
resolved value are unambiguous.

## Start the ticket

Perform these actions in order:

1. Create the local branch from the fetched remote default branch while
   retaining the classified in-scope pending changes. If Git cannot create the
   branch without overwriting or losing them, stop rather than stash, discard,
   or commit them on another branch.
2. Push it with upstream tracking to the branch of the same name on `origin`.
3. Assign the issue with the GitHub MCP assignee operation. If MCP is
   unavailable, use `gh issue edit` with `--add-assignee @me`.
4. Set the issue's project Status to `In Progress` with the shared status-write
   runner, passing the project owner, numeric project number, Status field node
   id, In Progress option id, expected status name, and the selected item node
   id in that order:

   ```text
   node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <in-progress-option-id> "In Progress" <item-node-id>
   ```

   The runner resolves the live REST field and item ids from the linked Project,
   uses the numeric project number as the REST path identifier, and reads the
   item back before the ticket-start sequence can continue.

Do not create or switch to an existing branch. Report the exact completed
actions if a later mutation fails. Keep the successfully created branch and
remote state for diagnosis instead of attempting an automatic rollback.

If a Start-the-ticket action fails, times out, or returns ambiguously, read back
the local and remote branch, issue assignee, and Project status before retrying.
Preserve the created branch and resume only the missing action from that
observed checkpoint; never create a second branch, repeat an assignment, or
repeat a status mutation before its readback.

## Implement the issue

Read the repository instructions that apply to every file the issue touches.
Treat the issue description, implementation notes, and acceptance criteria as
the task contract. Do not add behavior that the issue does not require.

Inspect the affected code, its callers, and its existing tests before editing.
Implement every acceptance criterion. Add or update tests where an observable
criterion can be checked automatically. Follow any smaller-step boundary in the
repository's own instructions.

For a structured PBI, map each task to the changed files, commit, and fresh
verification evidence in the completion report. Do not report a task complete
when its requirement is contradicted or its evidence is missing.

For code shape, prefer small pure functions with explicit inputs and outputs,
keep external I/O at boundaries, and use ordinary loops or mutation when that
is clearer. Do not require a functional language or dense composition.

When a verification command crosses PowerShell, a native executable, or an
explicitly selected POSIX shell, apply the repository's
[command-composition contract](../../docs/command-composition.md). Preserve
separate path arguments, required-argument checks, destination-parent
preconditions, and producer exit status.

When a test fails, compare its expectation with the clear task contract. Update
a stale expectation and rerun it. Fix the implementation when it violates the
contract. Never weaken or delete a test only to obtain a pass.

Do not create a tracked planning document. Temporary working notes must stay
outside the repository or be removed before the commit.

## Verify and prepare generated files

Use the repository's documented build, test, lint, and formatting commands.
Run focused checks while implementing, then run every required pre-PR gate.

Generate tracked build outputs on the feature branch when the repository
requires them. Quality diagnostics are report-only evidence; do not generate or
persist metric state as part of ticket delivery. Inspect generated changes as
part of the same review.
Do not rely on CI to write generated files or repair the branch.

Map each acceptance criterion to fresh evidence. For a structured PBI, build
one `## Acceptance matrix` in the handoff with one row per acceptance
criterion and mandatory user-facing path. Each row records the contract or
criterion, risk or user path, proof action, expected observable, observed
result, status, evidence location, and exact pushed head SHA. Use only
`pass`, `unverified`, `failed`, `blocked`, or `inapplicable`; an inapplicable
row needs an explicit reason. Require explicit identity/authorization,
interactive-control, browser/E2E, data/error, and recovery rows when those
paths apply, and record why each does not apply otherwise. Validate every row
against the checked-out and pushed head before committing or handing off.

map every mandatory child to its owning task, changed files or verified remote
state, commit, and fresh verification. Stop before committing or PR handoff
when a matrix row, criterion, mandatory child, required check, or
required proof is missing, failed, unverified, blocked, or head-mismatched.
State the exact failed command or actionable remainder.

For a structured parent, add one `## Preflight checkpoint` section to the same
handoff record once the pull request exists. Keep it tied to the exact pushed
head and record the branch ref and SHA, PR head SHA, base ref and SHA,
mergeability, and one row for every required provider context. Each row carries
the provider, workflow, run ID, ref, head SHA, and one of `present`, `pending`,
`failed`, `skipped`, or `unavailable`. A draft-skipped workflow is dispatched
only after readiness is read back and only once for the same repository, ref,
workflow, and head; record the run and resulting head readback. The handoff
must record base drift, conflict, unexpected movement, provider failure, or
bounded-recovery remainder explicitly rather than treating the acceptance
matrix as still current. This is one evidence record, not a local review ledger.

## Commit and push

After implementation and required checks, include the classified pending
changes only when they are in scope for this PBI and covered by the final diff.

Inspect `git status`, the complete diff, and the staged diff. Preserve unrelated
files and never use a blanket staging command. Stage only reviewed files that
belong to the issue.

Create a concise commit that names the implemented outcome. Push the current
branch to its existing upstream. Do not force-push or rewrite existing commits.

After the verified implementation commit is pushed, create or update one
parent-issue comment headed `## Implementation handoff` with one entry per
ordered task and mandatory child category, followed by the single
`## Acceptance matrix` and, when the PR exists, the single `## Preflight
checkpoint`. Each entry names the commit or verified remote-state
evidence, changed files or artifact, and the fresh check or user-path result.
The matrix is the durable acceptance record consumed by convergence and
Codex's built-in Review Summary; do not copy it to a local ledger. Include the
current remainder explicitly; use `none` only when every task, matrix row,
acceptance criterion, required user path, and preflight checkpoint are
evidenced at the same head.
Do not create a local planning file or a second issue as a substitute.

## Result

Report the repository, linked project, selected issue, branch, commit, checks,
and pushed branch, with each acceptance criterion mapped to its evidence. Name
any check that could not run. Stop after the push. `/review-pr` is the one
independent review of this work.
