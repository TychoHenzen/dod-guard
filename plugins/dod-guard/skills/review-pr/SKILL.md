---
name: review-pr
description: Review a GitHub pull request's changed files with the quality-guard scanner and four independent reviewer agents, then post one comment-only review with GH-<id> findings and a recommendation. Loads the linked PBI first. GitHub only.
argument-hint: "[PR URL or number; default: the open PR for the current branch]"
---

# Review pull request

Review the files a pull request changes, the way `/quality-guard:quality-refactor`
reviews a scope, plus judgment the scanner cannot give: correctness, PBI
acceptance, wiring, and failure handling. Report only. Post one GitHub review;
`/fix-pr-review` owns the fixes. Never edit files, approve, mark ready, merge,
or close anything.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

The skill directory is `${CLAUDE_PLUGIN_ROOT}/skills/review-pr` in Claude Code
and the directory containing this `SKILL.md` in Codex. Keep scratch files
outside the repository and delete them after posting. Pass every script flag
as its own native argument, as the
[command-composition contract](../../docs/command-composition.md) requires.

## 1. Resolve the pull request and its PBI

Resolve the repository as described under "Resolve the repository and Project"
in `standards/github-request-discipline.md`. Accept a PR URL or number; without
one, use the open PR whose head is the current branch. Stop when no PR exists.

Require local `HEAD` to equal the PR head SHA, and `git status --porcelain` to
be empty, because the scanner and reviewers read the working tree. If either
fails, stop and name the SHAs or the pending paths; do not switch branches,
stash, or create a worktree.

Load the parent PBI from the PR's closing issue or the `codex/<issue>-<slug>`
branch segment, with its acceptance criteria and linked sub-issues. Stop and
name the missing PBI when none resolves.

## 2. One review per pull request

Save the PR's reviews (`gh api --paginate --slurp "repos/{owner}/{repo}/pulls/{n}/reviews?per_page=100"`), then run:

```text
node "<skill-dir>/scripts/review-findings.mjs" existing --reviews=<reviews.json>
```

When it reports `found: true`, report that review's recommendation, head, and
URL, and stop. Commits pushed after it, such as `/fix-pr-review` remediation, do
not start another review unless the user asks for one.

## 3. Diff

Find the merge base with the PR base branch and save
`git diff --unified=0 --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ <merge-base> HEAD`
as the diff file. The explicit prefixes override a user's `diff.mnemonicPrefix`
or `diff.noprefix` setting. The build step reads
the changed files and their added lines from this diff, decoding Git's quoted
paths, so no separate file list is needed.

## 4. Scan

Save the client's plugin list (`claude plugin list --json` in Claude Code,
`codex plugin list --json` in Codex), check its exit status, then run:

```text
node "<skill-dir>/scripts/review-findings.mjs" scan --client=<claude|codex> --registry=<plugins.json> --root=<repository> --out=<scan.json>
```

It locates the installed quality-guard scanner from that list and scans the
whole repository. A scan of only the changed files would report every export
as dead, because their importers sit outside the scan. Stop when quality-guard
is not installed or the scan fails; never guess a cache path.

Structural rules such as complexity, length, duplication, nesting, parameters,
and dead or test-only exports cover each whole changed file, including what it
had before this PR: a touched file's design debt is in scope. Line-level rules
such as `line-length` and the comment rules cover only the lines this PR adds.

## 5. Reviewer agents

Dispatch all four reviewers at once, each with the same brief: PR number and
URL, base and head SHAs, the changed-file list, the diff file path, the PBI
acceptance criteria and sub-issues verbatim, and the governing `AGENTS.md` and
`CLAUDE.md` paths.

- In Claude Code, use the Agent tool with `dod-guard:review-pr-feature`,
  `dod-guard:review-pr-design`, `dod-guard:review-pr-reliability`, and
  `dod-guard:review-pr-hygiene`.
- In Codex, use the `dod_guard_review_pr_*` agents when the project registers
  them in `.codex/agents/` (as this repository does); otherwise spawn an
  explorer with the full agent definition from `<plugin-root>/agents/` in its
  message.

Each returns one JSON object with `reviewer`, `coverage`, and `findings`. Save
the four objects as one JSON array. When an agent returns malformed JSON, send
it one correction request for the same review in the exact format. If it fails
again, stop without posting and name the reviewer: a review is posted once per
PR, so a missing angle cannot be filled in later. The build step refuses
results that lack any of the four reviewers.

## 6. Build and post

```text
node "<skill-dir>/scripts/review-findings.mjs" build --head=<full 40-character head SHA> --scan=<scan.json> --diff=<unified0.diff> --results=<results.json> --out=<payload.json>
```

It groups scanner findings into one comment per changed file, dedupes reviewer
findings by file and root cause, and posts every finding as an inline comment
so each gets a `GH-<id>`. A finding whose cited line this PR did not add moves
to the nearest added line, and its body names the cited location.
Severity: reviewer `BLOCKER`/`MAJOR`/`MINOR` as given, scanner `error` as
`MAJOR` and `warn` as `MINOR`. Recommendation: any `BLOCKER` is `BLOCK`, any
other finding is `REQUEST_CHANGES`, none is `APPROVE`.

It writes the review payload to `--out` and prints the recommendation and
severity counts. Reread the PR head; stop if it moved. Post the payload as one
review:

```text
gh api --method POST "repos/{owner}/{repo}/pulls/{n}/reviews" --input <payload.json>
```

The review event is always `COMMENT`, and its body carries the
`dod-guard:review-pr` marker that step 2 detects. If the post fails or is
ambiguous, rerun step 2 before any retry; never post a second review.

## 7. Report

Save the PR's review comments, then run:

```text
node "<skill-dir>/scripts/review-findings.mjs" report --review-id=<posted id> --comments=<comments.json>
```

Report the PR, head SHA, PBI, `Recommendation`, the review URL, and each
finding as `GH-<id>`, severity, and `file:line`. Callers pass the `GH-` IDs to
`/fix-pr-review`.
