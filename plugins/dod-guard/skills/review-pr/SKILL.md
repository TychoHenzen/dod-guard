---
name: review-pr
description: Get the independent review of a GitHub pull request from Codex's automatic PR review. Triggers it once when needed, waits for it at the exact head, and reports its findings with a recommendation. GitHub only.
argument-hint: "[PR URL or number; default: the open PR for the current branch]"
---

# Review pull request

The independent review of a pull request is Codex's automatic GitHub review.
This skill makes sure that review runs once, waits for it, and turns its
result into a report that `/fix-pr-review`, `/quick-pbi`, and `/complete-pr`
consume. It never writes its own review, approves, marks ready, merges, or
closes anything. The only write it may make is one `@codex review` comment.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

## How Codex review behaves

- Codex reviews a PR automatically when it is opened for review or a draft is
  marked ready, and on request when someone comments `@codex review`. A draft
  PR never starts a review on its own.
- While a review runs, the bot `chatgpt-codex-connector[bot]` puts an `eyes`
  reaction on the PR.
- It keeps one summary comment (marked `codex-pull-request-review-summary`)
  whose "Code Review" row shows the status and the short commit it reviewed.
- Findings arrive as one review pinned to that commit, with inline comments
  carrying a `P0`, `P1`, or `P2` badge. No findings means no review at that
  commit.

## Resolve the pull request

Resolve the repository as described under "Resolve the repository and
Project" in `standards/github-request-discipline.md`; the Project is not
needed here. Accept a PR URL or number. Without an argument, use the one open
PR whose head is the current branch (`gh pr view --json number`). Stop when no
PR exists: this skill reviews GitHub pull requests only.

## Read, trigger, and wait

The skill directory is `${CLAUDE_PLUGIN_ROOT}/skills/review-pr` in Claude
Code and the directory containing this `SKILL.md` in Codex. Run:

```text
node "<skill-dir>/scripts/codex-review.mjs" --repo=<owner/name> --pr=<number> --waited-ms=<ms since your first read>
```

It reads the PR, its summary comment, reviews, review comments, and
reactions, and prints one JSON state. Pass each flag as its own native
argument, as the repository's
[command-composition contract](../../docs/command-composition.md) requires.
Act on its `action`:

| `action` | Meaning | Do |
|---|---|---|
| `report` | The code review completed. | Go to "Report". |
| `trigger` | A draft with no review, a ready PR with no review after two minutes, or a failed review. | Rerun with `--post-trigger`. It posts `@codex review` only if the state still says `trigger`. |
| `wait` | A review is running, or a trigger was already sent. | Read again about once a minute. |
| `hold` | The summary layout is unrecognized, a trigger got no reaction for ten minutes, or the review the trigger started failed (`code-review-failed`). | Stop and report `reason` with the PR URL. |

Pass the elapsed time since your first read as `--waited-ms`; the two-minute
wait for an automatic review is measured from it. Never post `@codex review`
yourself, and never post it twice: an earlier trigger comment on the PR counts.

A completed review is the review. Commits pushed after it, such as
`/fix-pr-review` remediation, do not start another one from this skill.

## Report

From the `report` state, show:

- PR, current head, `reviewedCommit`, and whether it is the current head
  (`reviewedCurrentHead`);
- `Recommendation`: `BLOCK` when any finding is `P0`, `REQUEST_CHANGES` when
  any other finding exists, `APPROVE` when there are none;
- each finding as `GH-<id>`, severity, title, `file:line`, and URL. An
  `outdated` finding points at code that has moved since; it still needs
  revalidation.

Callers pass the `GH-` IDs to `/fix-pr-review`. The PR on GitHub is the
durable record; do not copy the report into a local file.
