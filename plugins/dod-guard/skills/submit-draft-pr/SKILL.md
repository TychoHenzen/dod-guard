---
name: submit-draft-pr
description: Create or update the draft pull request for a pushed PBI branch using fresh acceptance and verification evidence. Use after next-ticket, not to implement, approve, or merge.
---

# Submit draft PR

Create or update the single draft PR for a pushed parent-PBI branch. Never change implementation scope, approve, mark ready, merge, close the PR, or close the parent issue.

Resolve the plugin root from this skill's directory; the target checkout may lack the shared standards. Read `standards/working-defaults.md` and `standards/github-request-discipline.md` there. Stricter rules below win. Every stop reports expected and observed identities.

## Preconditions

All must hold, in order, before any PR write.

1. Resolve repository, default branch, linked Project, and `In Progress` status (heading "Resolve the repository and Project"). Run `node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>`. Stop on outcome `none`, `several`, or exit code 2. To read the Status option names, run `project-status.mjs --list-options` (see "ProjectV2 status writes" in `standards/github-request-discipline.md`); never write a reader.
2. Confirm the parent issue belongs to the repository, sits in that Project, and has Status `In Progress`.
3. Run `git status --short` and classify pending paths. A dirty worktree alone is not a blocker. Leave in-scope ordinary changes uncommitted until branch, PBI, and acceptance evidence are verified. Stop for secrets, destructive intent, unrelated changes, or inseparable work.
4. Confirm the branch is the PBI's `codex/<issue>-<slug>`, has an `origin` upstream, and has pushed commits ahead of the default branch.
5. Read the PBI and its linked sub-issues. Stop if a required acceptance criterion lacks evidence or a code-backed closed sub-issue lacks a pushed implementation commit.
6. If in-scope changes were pending, stage only reviewed paths, commit, push, reread the head, and rerun required checks.

## Checks

Run the required pre-PR checks when fresh evidence is unavailable. Stop on any failed or unavailable check.

If root `package.json` defines `preflight:static-analysis`, always run `npm run preflight:static-analysis` after verifying the exact pushed head and before any PR write. A failed or unavailable preflight blocks PR writes. Inspect every reported path, commit and push only intended changes on the same branch, reread the head, and rerun. Never stage preflight outputs automatically.

Follow the [command-composition contract](../../docs/command-composition.md) for shell choice, argument vectors, bounded output, and preflight failures.

## Head convergence

Run after the source-branch push and after PR create or update, before trusting checks or writing the handoff. Poll read-only within a bound until `git ls-remote origin refs/heads/<branch>`, the PR API head, and `refs/pull/<number>/head` name the expected SHA. Read `refs/pull/<number>/merge` parents only to corroborate it, never as CI or review evidence. Stop when a ref is missing, malformed, duplicated, forked, moved, inconsistent, or stale after the bound. Never write hidden PR refs or call `update-branch`.

## Structured-work convergence

Before creating or updating the PR, apply the Convergence record in `standards/project-workflow.md`. A small, clear fix takes the ordinary path without structured records. This gate never bypasses the stops for credentials, destructive action, authority, unrelated work, provider mismatch, or missing evidence.

For a structured PBI:

- Compare the branch against outcome, `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, acceptance criteria, and verification evidence. Map each task and sub-issue to evidence: a code-backed sub-issue to changed files and commits, an administrative one to verified remote-state evidence.
- Give `implementation`, `wiring/usability`, `quality`, and `reliability` each an owning slice or task with observable evidence. They are ownership labels only, with no fixed child count or category set.
- Require one durable parent `## Implementation handoff` comment from `next-ticket` holding the single `## Acceptance matrix`. Consume its mappings. Each row must pass at the current head or be inapplicable with a reason. Passing tests alone are not convergence.
- Before consuming the handoff, read its branch's remote head. Remote SHA, checked-out HEAD, handoff commit, and branch names must match. Any mismatch makes it stale: stop, rerun the implementation handoff, and never copy stale evidence into Convergence.
- If implementation is incomplete or contradicted, write the remainder to the issue and stop.

## Early preflight checkpoint

After the draft exists, before `dod-guard:review-pr` or guarded `complete-pr`, consume the one `## Preflight checkpoint` record in the handoff. Never create a local ledger.

1. Run head convergence at one exact pushed SHA.
2. Record base ref, base SHA, mergeability, and one row per required context: name, provider, workflow, run ID, branch ref, exact head SHA, and state (`present`, `pending`, `failed`, `skipped`, `unavailable`). Missing, malformed, stale, duplicate, forked, or provider-mismatched evidence stops.
3. If a draft-skipped required workflow is dispatchable, read back readiness, then route exactly one dispatch (same repository, branch ref, workflow, exact head) through the existing guarded owner. Read back and record the run. A second dispatch, unavailable provider, or failed readback stops with no review, merge, cleanup, or generated-ref change.
4. Compare the recorded base and head with the current PR. Base advancement invalidates earlier acceptance: route one bounded branch synchronization through `complete-pr`, then rerun checks and acceptance proof at the final head.
5. Send a merge conflict to `standards/conflict-triage.md`, then converge on the new head. If triage cannot resolve it, or the branch moves unexpectedly, stop and report expected and observed refs and SHAs.

## Create or update the draft

If no open PR uses the head branch, create one draft PR against the default branch. If one exists, update its title and body, never a second PR. After a failed, timed-out, or ambiguous write, read back the open PR and head. Update it if it sits at the intended branch, else retry one identical creation once. Never alter a PR whose head no longer matches the verified branch.

Keep the body short: what changed and why, material verification results, the parent acceptance checklist checked only where evidence exists, `Closes #<issue-number>`, and this block, with the handoff linked and not restated.

The PR body always names the parent with `Closes #<issue-number>`. Never write "Part of" in its place. If the branch delivers less than the parent's scope, that is an incomplete implementation: write the remainder to the issue and stop, or split the undelivered scope into a new Backlog issue and narrow the parent before the draft is created.

```text
## Convergence
- Handoff: <link to the ## Implementation handoff comment> (head <sha>)
- Preflight checkpoint: same handoff record (head <sha>)
- Remainder: none
```

Leave the Project item `In Progress`. Report the PR URL, head commit, and verification evidence, then stop.
