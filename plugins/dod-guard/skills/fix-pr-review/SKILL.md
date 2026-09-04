---
name: fix-pr-review
description: Use when selected findings from a dod-guard PR review need the smallest verified fixes. Supports Git and GitHub inline comments plus Azure DevOps review reports, and updates only findings proven fixed.
argument-hint: [GitHub PR URL or #number, current Git branch, or Azure report path] [finding IDs]
---

# Fix pull request review findings

Fix selected findings produced by `/dod-guard:review-pr`. Revalidate each
finding against the current head before editing. Keep stale, unsupported, and
unresolved findings visible.

## Scope

- Work only on the reviewed branch. Stop if the checkout is dirty or on a different head.
- Load the parent PBI, its acceptance criteria, and linked sub-issues before editing.
- Treat a review comment as a claim to verify, not as authority to change behavior.
- Fix one coherent batch at the code boundary that owns the behavior.
- Do not add compatibility paths, speculative abstractions, or unrelated cleanup.
- Do not approve, mark ready, merge, or close the parent PBI.
- Reply to or resolve a provider finding only after its fix commit is pushed.

In Claude Code, the skill directory is
`${CLAUDE_PLUGIN_ROOT}/skills/fix-pr-review`. In Codex, use the directory
containing this loaded `SKILL.md`.

## Resolve the input

Confirm the current directory is a Git worktree. Record `git status --short`,
the current branch, its upstream, and `git rev-parse HEAD`. Require a clean
checkout and a non-default feature branch.

Accept one of these sources:

- A GitHub PR URL or `#number`: resolve the PR with `gh pr view` and require its
  same-repository head branch to be checked out.
- The current or named Git branch: use the active client's inline review
  findings. Require the user to identify the selected finding IDs when more
  than one unresolved finding exists.
- An Azure Markdown report from `/review-pr`: parse its `ADO-<pr>-<number>`
  entries and require the report's recorded head to match the checked-out
  branch history.

For GitHub, query `reviewThreads(first:100)` through GraphQL. Include each
thread's `id`, `isResolved`, `isOutdated`, `path`, `line`, and root comment
`databaseId`, `url`, `body`, and `commit.oid`. Save the response outside the
repository, then run:

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-comments --input "<response.json>" --selected "<comma-separated GH IDs>"
```

For Azure, run:

```text
node "<skill-dir>/scripts/fix-support.mjs" parse-azure-report --input "<report.md>" --selected "<comma-separated ADO IDs>"
```

Stop when a selected ID is absent or belongs to another provider. Mark resolved
or outdated selections as stale and skip them with evidence. Never silently
replace the user's selection with all findings.

## Load the behavior contract

Resolve the parent PBI from the pull request's closing issue, its linked issue,
or the unambiguous `codex/<issue>-<slug>` branch segment. Query GitHub
`subIssues` or Azure hierarchy-forward child work items. Include each item's
title, body, state, URL, and acceptance text. Stop if no parent PBI can be
resolved.

Normalize GitHub issue JSON with:

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-hierarchy --input "<issue.json>"
```

Build one temporary context containing the reviewed head, selected findings,
repository instructions, parent PBI, and children. Run `redact-context` on it.
Inspect and use only the redacted output in prompts or reports.

## Revalidate every finding

Fetch the provider head without switching branches. Stop if the remote head no
longer matches the checked-out commit. For each selected finding:

1. Open the current file and cited line.
2. Trace the owning code, callers, and tests.
3. Compare the finding with the PBI and repository instructions.
4. Classify it as `actionable`, `stale`, `already-fixed`, or `unsupported`.

A resolved or provider-outdated comment is stale. A missing current location is
stale. A claim disproved by current code is already fixed. A claim that
conflicts with the PBI or lacks evidence is unsupported. Record exact evidence
for every non-actionable selection. Do not edit for it.

## Implement and verify

Apply the smallest coherent fix batch. Add a user-path or edge-case test when
the finding exposed missing behavioral proof. Follow every repository
instruction that applies to touched files.

Run focused tests first. Then run the repository's complete pre-PR gates and
map each fixed finding to fresh evidence. Inspect the complete diff. Stage only
reviewed files, create a concise commit, and push the current branch to its
existing upstream. Never force-push or rewrite commits.

## Update proven findings

Re-read the provider head and require it to equal the pushed commit.

- GitHub: reply to each fixed root comment through
  `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies`. Include the
  commit SHA and verification command. Then resolve its exact review thread
  with GraphQL `resolveReviewThread`. Leave every other thread unchanged.
- Local Git: report the fixed inline finding IDs with commit and check evidence.
  No external comment state exists to mutate.
- Azure: run `update-azure-report` with a JSON resolution map. It changes only
  selected entries to `Fixed` and adds their commit and verification evidence.
  Commit and push the report update when the report is tracked. Leave every
  unresolved entry byte-for-byte unchanged.

If a provider update fails, keep the pushed fix and report the exact remaining
comment or report entry. Do not roll back verified code.

Report the PBI, original and pushed heads, fixed finding IDs, skipped IDs with
reasons, changed files, commit, checks, and provider updates. Confirm the parent
PBI remains open.
