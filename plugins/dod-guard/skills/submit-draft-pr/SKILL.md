---
name: submit-draft-pr
description: Create or update the draft pull request for a pushed PBI branch using fresh acceptance and verification evidence. Use after next-ticket, not to implement, approve, or merge.
---

# Submit draft PR

This skill turns one pushed parent PBI branch into one draft pull request. It takes the parent issue number. It does not edit implementation scope, approve, mark ready, merge, close the PR, or close the parent issue, and the Project item stays at `In Progress`.

Apply `standards/working-defaults.md` and `standards/github-request-discipline.md`, both relative to the plugin root. Where this skill is stricter, this skill wins.

## Preconditions

Settle every item below before the first PR write.

1. Repository facts. Take the repository, its default branch, its linked Project, and the `In Progress` status from "Resolve the repository and Project" in `standards/github-request-discipline.md`. Find the Project with the command below, and stop on outcome `none` or `several` or on exit 2.

   `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`

2. Issue state. The supplied parent issue must belong to that repository, sit in that Project, and have Status `In Progress`.
3. Worktree. Run `git status --short` and sort each pending path. A dirty worktree alone does not block you. Leave clearly in-scope ordinary changes uncommitted until the branch, PBI, and acceptance evidence check out. Stop when pending paths hold secrets, destructive intent, unrelated changes, or work you cannot separate safely.
4. Branch. The current branch must be the PBI's `codex/<issue>-<slug>` branch, track an upstream on `origin`, and carry pushed commits beyond the default branch.
5. Evidence. Read the PBI and its linked sub-issues. Stop when a required acceptance criterion has no evidence, or when a closed code-backed sub-issue has no pushed implementation commit.
6. Pending in-scope changes. When item 3 found clearly in-scope ordinary changes, stage only those reviewed paths, commit them on the verified PBI branch, push, read the branch head again, and rerun the required pre-PR checks before any draft write. Stop when a check fails or cannot run.

### Static analysis preflight

When the target checkout's root `package.json` defines `preflight:static-analysis`, run `npm run preflight:static-analysis`. Run it once the exact pushed head is verified and before any PR create or update, even when other required checks have fresh evidence. A failure or unavailable command blocks PR writes. Inspect every reported path, commit and push only intended changes on the same branch, read the new head, and run the preflight again. Never stage or commit its outputs automatically.

When fresh evidence for the repository's other required pre-PR checks is missing, run those checks too and stop on any failure or unavailable check. For shell choice, native argument vectors, bounded output, and preflight failures, follow the [command-composition contract](../../docs/command-composition.md).

### Head convergence

This step only reads, and it is bounded. After each successful push of the source branch, and again after you create or update the PR, read the same-repository branch ref, the PR API head, and `refs/pull/<number>/head`. Repeat until all three name the expected pushed SHA, and only then trust any check or write the handoff.

- If `refs/pull/<number>/merge` exists, look at its parents only to corroborate the source SHA. The generated merge SHA is never CI or review evidence.
- Stop and report the expected and observed identities when a ref is missing, malformed, duplicated, forked, moved, inconsistent, or still stale at the bound.
- Never write a hidden pull-request ref or a generated merge ref. Never call `update-branch` to repair metadata.

## Converge structured work

First, resolve the active dod-guard plugin root from the directory that holds this skill. Read `<plugin-root>/standards/project-workflow.md` from there, because the target checkout may not contain it.

A structured PBI needs its pushed branch compared with the outcome, `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, acceptance criteria, and verification evidence before any draft write.

### Mapping

Map every task and linked sub-issue to applicable evidence.

- A structured parent must have the task list's functional decomposition.
- Each linked child maps to one independently deliverable slice. Each slice or parent-level task maps to the parent branch or to verified remote-state evidence.
- There is no fixed child count or category set. Four concerns each need an owning slice or parent-level task with observable evidence: implementation; wiring and end-to-end usability; refactoring and code quality; failure and recovery.
- The lens IDs `implementation`, `wiring/usability`, `quality`, and `reliability` only label ownership. They never shape the functional slices.
- For a code-backed sub-issue, map its changed files and commits and require its pushed implementation. For an administrative sub-issue, map verified remote-state evidence.

### The handoff record

Require one durable parent-issue `## Implementation handoff` comment from `next-ticket`, containing the single `## Acceptance matrix`. Use its task, child, commit, check, matrix-row, and user-path mappings as given. Do not rebuild them from passing tests. Check each matrix row against the current pushed head. A row passes, or it is inapplicable with a stated reason.

Freshness comes first. Before you use the handoff, read the current remote head of the handoff branch, with the GitHub branch metadata operation or `git ls-remote origin refs/heads/<branch>`. The result needs an exact remote-head match: the remote branch SHA, the checked-out `HEAD`, and the handoff commit must be identical, and branch names must match. On any mismatch, a matrix-row head included, treat the handoff as stale. Stop, have the implementation handoff rerun once the branch is stable, and keep stale evidence out of Convergence.

If implementation is incomplete or contradicted, write the actionable remainder to the issue and stop without creating or updating the draft PR. Passing tests alone never count as convergence.

When the records agree, link the handoff in place of copying its mapping. The linked handoff and the Convergence section must name the same exact head. Put this block in the PR body:

```text
## Convergence
- Handoff: <link to the ## Implementation handoff comment> (head <sha>)
- Preflight checkpoint: same handoff record (head <sha>)
- Remainder: none
```

Small, clear fixes use the ordinary path and need no structured records. The structured gate never overrides the stops for credentials, destructive actions, authority, unrelated work, provider mismatch, or missing evidence.

## Early required-context and base checkpoint

Run this after the PR is created or updated and before `dod-guard:review-pr` or guarded completion.

The implementation handoff holds one `## Preflight checkpoint` record. Use it, and do not start a second one. Read the branch ref, the PR API head, and `refs/pull/<number>/head`, and require all three at one exact pushed SHA. Record the base ref and base SHA, mergeability, and every required provider context. Each context row lists name, provider, workflow, run ID, branch ref, exact head SHA, and a status of `present`, `pending`, `failed`, `skipped`, or `unavailable`.

- Missing, malformed, stale, duplicate, forked, or provider-mismatched evidence stops convergence.
- If a required workflow was skipped because the PR is a draft and can be dispatched, read back readiness, then route exactly one dispatch (same repository, branch ref, workflow, exact head) through the existing guarded owner. Read back the new run and record its run ID, ref, workflow, and head before moving on. A second dispatch, an unavailable provider, or a failed readback stops everything: no review, merge, cleanup, or generated-ref mutation.
- Compare the recorded base and head with the current PR before you rely on the acceptance matrix. If the base moved, earlier acceptance is void. Route one bounded synchronization through `complete-pr`, then collect fresh checks and proof at the final head.
- A merge conflict on the PBI head goes to the triage in `standards/conflict-triage.md`, and a verified triage push returns here.
- An unresolvable conflict, unexpected branch movement, or an exhausted bound stops, with the expected and observed ref and SHA values reported.

The checkpoint remains in the same handoff and Convergence record. Keep no local ledger.

## Create or update the draft

Look for an open PR that already uses the current head branch. If none exists, create one draft PR against the resolved default branch. If one exists, update its title and body and do not open another.

Keep the body short. It holds what changed and why, the material verification commands with their results, the parent acceptance checklist (ticked only where evidence exists), and `Closes #<issue-number>`.

When the draft is in place, report the PR URL, the head commit, and the verification evidence, then stop. The Project item stays `In Progress`.

### Failed or unclear writes

If pull-request creation or update fails, times out, or returns ambiguously, read back the branch's open pull request and its head before retrying. When a PR exists at the intended branch, update that one. If none exists, retry one identical transient creation, once at most. Do not create a second PR or alter a PR whose head no longer matches the verified branch.

### Write boundary

Allowed: create or update one draft PR (title and body); commit and push reviewed in-scope paths on the verified PBI branch; post an issue comment with the actionable remainder when work is incomplete. Everything else is out, including approve, ready, merge, closing the PR or issue, changing Project status, writing hidden refs, `update-branch`, a second dispatch, and a second PR.
