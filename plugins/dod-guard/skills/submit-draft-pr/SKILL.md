---
name: submit-draft-pr
description: Create or update the draft pull request for a pushed PBI branch using fresh acceptance and verification evidence. Use after next-ticket, not to implement, approve, or merge.
---

# Submit draft PR

Create or update the one draft pull request for a pushed parent-PBI branch. Do
not change implementation scope, approve, mark ready, merge, close the PR, or
close the parent issue.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

## Preconditions

1. Resolve the repository, its default branch, its linked Project, and the
   `In Progress` status as described under "Resolve the repository and
   Project" in `standards/github-request-discipline.md`.
2. Verify the supplied parent issue belongs to that repository, is in that
   Project, and has Status `In Progress`.
3. Inspect `git status --short` and classify pending paths. A dirty worktree is
   not a blocker by itself. Keep clearly in-scope ordinary changes uncommitted
   until the branch, PBI, and acceptance evidence are verified. Stop for
   secrets, destructive intent, unrelated changes, or work that cannot be
   separated safely.
4. Verify the current branch is the PBI's `codex/<issue>-<slug>` branch, has an
   upstream on `origin`, and has pushed commits ahead of the default branch.
5. Read the PBI and its linked sub-issues. Stop if a required acceptance
   criterion lacks evidence or a code-backed closed sub-issue lacks a pushed
   implementation commit.
6. If clearly in-scope ordinary changes were pending, invoke `/commit` on the
   verified PBI branch. Reread the branch head and rerun the required pre-PR
   checks before creating or updating the draft. Stop on a failed or unavailable
   check.

If the target checkout's root `package.json` defines `preflight:static-analysis`,
always run `npm run preflight:static-analysis` after verifying the exact pushed
head and before any PR create/update, even when other required checks have fresh
evidence. A failure or unavailable command blocks PR writes. Inspect every
reported path; commit and push only intended changes on the same branch, reread
the new head, and rerun the preflight. Do not stage or commit its outputs
automatically.

Run the repository's required pre-PR checks when fresh evidence is unavailable.
Stop on a failed or unavailable required check.

Use the repository's [command-composition contract](../../docs/command-composition.md)
for shell selection, native argument vectors, bounded output, and preflight
failures while running those checks.

After a successful source-branch push, and again after creating or updating the
pull request, use the same bounded, read-only head convergence contract before
trusting checks or writing the draft handoff. Read the same-repository branch
ref, PR API head, and `refs/pull/<number>/head` until they all identify the
expected pushed SHA. If `refs/pull/<number>/merge` is available, inspect its
parents only to corroborate that source SHA; never use the generated merge SHA
for CI or review evidence. Stop with expected and observed identities when a
ref is missing, malformed, duplicated, forked, moved, inconsistent, or still
stale after the bound. Never write hidden pull-request or generated merge refs
or call `update-branch` as metadata repair.

## Early required-context and base checkpoint

After the draft PR is created or updated, and before built-in Review Summary
or guarded completion, consume the one `## Preflight checkpoint` record in the
implementation handoff. Read the same-repository branch ref, PR API head, and
`refs/pull/<number>/head` at one exact pushed SHA, then record the base ref and
base SHA, mergeability, and every required provider context. Each context row
must carry its name, provider, workflow, run ID, branch ref, exact head SHA, and
one of `present`, `pending`, `failed`, `skipped`, or `unavailable`.

Missing, malformed, stale, duplicate, forked, or provider-mismatched evidence
stops convergence. When a draft-skipped required workflow is dispatchable,
read back readiness first and route one dispatch for the same repository,
branch ref, workflow, and exact head through the existing guarded owner. Read
back the resulting run and record its run ID, ref, workflow, and head before
proceeding. A second dispatch, an unavailable provider, or a failed readback
stops without review, merge, cleanup, or generated-ref mutation.

Compare the recorded base and head with the current PR before trusting the
acceptance matrix. Base advancement invalidates earlier acceptance and routes
one bounded synchronization through `complete-pr`, followed by fresh checks and
proof at the final head. Conflicts, unexpected branch movement, or an exhausted
bound stop with the expected and observed ref/SHA values. The checkpoint remains
in the same handoff and Convergence record; do not create a local ledger.

## Converge structured work

Resolve the active dod-guard plugin root from the directory containing this skill,
then read `<plugin-root>/standards/project-workflow.md`. Do not assume the
target checkout contains the shared standard. For a structured PBI, compare the pushed
branch with its outcome, `requirements`, `clarifications`,
`implementation-plan`, `task-list`, `lens-ownership`, acceptance criteria, and verification
evidence before creating or updating the draft PR.

Map every task and linked sub-issue to applicable evidence. For a structured
parent, require the task list's functional decomposition, map each linked child
to one independently deliverable slice, and map each slice or parent-level task
to the parent branch or verified remote-state evidence. There is no fixed child
count or category set. The implementation, wiring and end-to-end usability,
refactoring and code quality, and failure/recovery concerns must still each have
an owning slice or parent-level task with observable evidence:

- implementation;
- wiring and end-to-end usability;
- refactoring and code quality;
- failure/recovery.

For a code-backed
sub-issue, map changed files and commits and require its pushed implementation.
For an administrative sub-issue, map verified remote-state evidence instead of
branch evidence. Require one durable parent-issue `## Implementation
handoff` comment from `next-ticket`, containing the single `## Acceptance matrix`;
consume its task, child, commit, check, matrix-row, and user-path
mappings rather than reconstructing them from passing tests. Validate every
matrix row against the current pushed head and require pass or explicitly
reasoned inapplicable status before convergence. Before consuming it, read the current remote head
for the handoff branch with the
GitHub branch metadata operation or `git ls-remote origin refs/heads/<branch>`
and require an exact remote-head match: the remote branch SHA, checked-out
`HEAD`, and handoff commit must be identical, and the branch names must match.
If any value or matrix row head differs, treat the handoff as stale, stop, and
rerun the implementation handoff after the branch state is stable; do not copy
stale evidence into Convergence. If
implementation is incomplete or contradicted, write the actionable remainder to
the issue and stop without creating or updating the draft PR. Do not call
passing tests convergence by themselves. When all records agree, link the
handoff instead of restating its mapping. The linked handoff and the built-in
Review Summary must consume the same matrix and exact head. Include this
section in the draft PR body:

```text
## Convergence
- Handoff: <link to the ## Implementation handoff comment> (head <sha>)
- Preflight checkpoint: same handoff record (head <sha>)
- Remainder: none
```

Small, clear fixes use the ordinary path and do not require structured records.
This gate does not bypass credential, destructive-action, authority, unrelated-
work, provider-mismatch, or missing-evidence stops.

## Create or update the draft

Confirm whether an open PR already uses the current head branch. If none exists,
create one draft PR against the resolved default branch. If one exists, update
its title and body instead of creating another PR.

Keep the body short. Include:

- what changed and why;
- the material verification commands and results;
- the parent acceptance checklist, checked only where evidence exists;
- `Closes #<issue-number>`.

Leave the Project item `In Progress`. Report the PR URL, head commit, and
verification evidence. Stop after the draft PR is updated.

If pull-request creation or update fails, times out, or returns ambiguously,
read back the branch's open pull request and its head before retrying. Update
the one observed PR when it exists at the intended branch; otherwise retry one
identical transient creation once. Do not create a second PR or alter a PR whose
head no longer matches the verified branch.
