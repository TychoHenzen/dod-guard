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
2. Run `node <plugin-root>/skills/complete-pr/scripts/ticket-preconditions.mjs --repository=<owner/name> --issue=<parent> --expect-status="In Progress"` and stop on exit 1 or 2; it confirms the parent belongs to the repository, sits in that Project, and has Status `In Progress`.
3. Run `git status --short` and classify pending paths. A dirty worktree alone is not a blocker. Leave in-scope ordinary changes uncommitted until branch, PBI, and acceptance evidence are verified. Stop for secrets, destructive intent, unrelated changes, or inseparable work.
4. Confirm the branch is the PBI's `codex/<issue>-<slug>`, has an `origin` upstream, and has pushed commits ahead of the default branch.
5. Read the PBI and its linked sub-issues. Stop if a required acceptance criterion lacks evidence or a code-backed closed sub-issue lacks a pushed implementation commit.
6. If in-scope changes were pending, run `git status --porcelain` and account for every `??` line, stage only reviewed paths by explicit path (never `git add -A` or `git add .`), commit, push, reread the head, and rerun required checks.

## Checks

Run the required pre-PR checks when fresh evidence is unavailable. Stop on any failed or unavailable check.

If root `package.json` defines `preflight:static-analysis`, always run `npm run preflight:static-analysis` after verifying the exact pushed head and before any PR write. A failed or unavailable preflight blocks PR writes. Inspect every reported path, commit and push only intended changes on the same branch, reread the head, and rerun. Never stage preflight outputs automatically.

Follow the [command-composition contract](../../docs/command-composition.md) for shell choice, argument vectors, bounded output, and preflight failures.

## Head convergence

Run after the source-branch push and after PR create or update, before trusting checks or writing the handoff. Read read-only at most 12 times, one Bash call per read, with `sleep 5` before every read after the first (never a `sleep` of 30 seconds or more), until `git ls-remote origin refs/heads/<branch>`, the PR API head, and `refs/pull/<number>/head` name the expected SHA. Right after the push no PR exists, so read only the branch ref. Read `refs/pull/<number>/merge` parents only to corroborate it, never as CI or review evidence. Stop at once when a ref is missing, malformed, duplicated, forked, moved, or inconsistent; read again only when a value is stale. After the 12th read without a match, stop and report the expected SHA and the three observed SHAs, writing `missing` for a ref that does not exist. Never write hidden PR refs or call `update-branch`.

## Structured-work convergence

Before creating or updating the PR, apply the Convergence record in `standards/project-workflow.md`. A small, clear fix takes the ordinary path without structured records. This gate never bypasses the stops for credentials, destructive action, authority, unrelated work, provider mismatch, or missing evidence.

For a structured PBI:

- Compare the branch against outcome, `requirements`, `clarifications`, `implementation-plan`, `task-list`, `lens-ownership`, acceptance criteria, and verification evidence. Map each task and sub-issue to evidence: a code-backed sub-issue to changed files and commits, an administrative one to verified remote-state evidence.
- Give `implementation`, `wiring/usability`, `quality`, and `reliability` each an owning slice or task with observable evidence. They are ownership labels only, with no fixed child count or category set.
- Require one durable parent `## Implementation handoff` comment from `next-ticket` holding the single `## Acceptance matrix`. Consume its mappings. Each row must pass at the current head or be inapplicable with a reason. Passing tests alone are not convergence.
- Before consuming the handoff, read its branch's remote head. Remote SHA, checked-out HEAD, handoff commit, and branch names must match. Any mismatch makes it stale: stop, rerun the implementation handoff, and never copy stale evidence into Convergence.
- At that matched head, run the post-push proof on the saved issue body and the saved `## Implementation handoff` comment: `node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path> --head-sha=<sha> [--children=<path>]`. Exit 1 is the stale case above: stop, rerun the implementation handoff, and never copy stale evidence into Convergence. Exit 2 means the body or handoff could not be read or parsed; stop and report it the same way. A stop at either exit leaves the PR without a `## Preflight checkpoint`, and `dod-guard:complete-pr` then stops with "handoff has no ## Preflight checkpoint section". Say so in the stop report: once the proof passes, rerun this skill, and "Early preflight checkpoint" writes the record.
- If implementation is incomplete or contradicted, write the remainder to the issue and stop.

## Early preflight checkpoint

After the draft exists, before `dod-guard:review-pr` or guarded `complete-pr`, write the one `## Preflight checkpoint` record into the `## Implementation handoff` comment, as `standards/project-workflow.md` defines it. A handoff without one is the normal input, because `dod-guard:next-ticket` writes none. If the handoff already holds one, replace it and never add a second. Edit the comment as `standards/github-request-discipline.md` says: read it with `--jq .body`, check that the first line is the heading, send it with `-F body=@<file>`, and read it back. Never create a local ledger.

1. Run head convergence at one exact pushed SHA.
2. Record base ref, base SHA, mergeability, and one row per required context: name, provider, workflow, run ID, branch ref, exact head SHA, and state (`present`, `pending`, `failed`, `skipped`, `unavailable`). Write the rows as one fenced `json` array. Missing, malformed, stale, duplicate, forked, or provider-mismatched evidence stops.
3. If a draft-skipped required workflow is dispatchable, read back readiness, then route exactly one dispatch (same repository, branch ref, workflow, exact head) through the existing guarded owner. Read back and record the run. A second dispatch, unavailable provider, or failed readback stops with no review, merge, cleanup, or generated-ref change.
4. A row whose state is `failed` or `unavailable` stops the run. Record the row, name its context under `Remainder` in `## Convergence` (for example `- Remainder: quality-guard failed at <sha>`), do not create or update the review request, and route a fix stage (`dod-guard:fix-pr-review` for a review-caused failure, else a new `dod-guard:next-ticket` task). Rerun this section on the new head.
5. Compare the recorded base and head with the current PR. Base advancement invalidates earlier acceptance: route one bounded branch synchronization through `complete-pr`, then rerun checks and acceptance proof at the final head.
6. Send a merge conflict to `standards/conflict-triage.md`, then converge on the new head. If triage cannot resolve it, or the branch moves unexpectedly, stop and report expected and observed refs and SHAs.

## Create or update the draft

Before any write, list the open PRs for the head with `gh api -X GET repos/{owner}/{repo}/pulls -f state=open -f head=<owner>:<branch> -f per_page=100` (the GitHub MCP list operation first), and read `number`, `draft`, `head.ref`, and `head.repo.full_name` of each. Stop and report every PR number with its draft state, and do not convert, close, merge, or edit any of them, when more than one is listed, the one listed is not a draft, or its head repo is not this repository. If none is listed, create one draft PR against the default branch. If one draft is listed, update its title and body, never a second PR. After a failed, timed-out, or ambiguous write, run the lookup again: update the PR if it lists one at the intended branch, and retry one identical creation once only if it lists no PR. Never alter a PR whose head no longer matches the verified branch.

Keep the body short: what changed and why, material verification results, the parent acceptance checklist checked only where evidence exists, `Closes #<issue-number>`, and this block, with the handoff linked and not restated.

The PR body always names the parent with `Closes #<issue-number>`. Never write "Part of" in its place. If the branch delivers less than the parent's scope, that is an incomplete implementation: write the remainder to the issue and stop, or split the undelivered scope into a new Backlog issue and narrow the parent before the draft is created.

```text
## Convergence
- Handoff: <link to the ## Implementation handoff comment> (head <sha>)
- Preflight checkpoint: same handoff record (head <sha>)
- Remainder: none
```

Replace `none` with each failed context, one per line, when a row did not pass.

Leave the Project item `In Progress`. Report the PR URL, head commit, and verification evidence, then stop.

## Update mode

Run this skill again on an existing draft whose head moved, for example after conflict triage. Create nothing: find the open PR for the head branch, then:

1. Run head convergence at the new pushed SHA, then the post-push proof from "Structured-work convergence" at that head. An exit-1 remainder stops and names the stale row ids.
2. Rewrite the `## Preflight checkpoint` for the new head by following "Early preflight checkpoint", replacing the record in the same comment.
3. Update the PR title and body as "Create or update the draft" says, with the Convergence block naming the new head. Report the PR URL, the new head, and the checkpoint head, then stop.
