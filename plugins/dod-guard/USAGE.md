# Using dod-guard

## Set up a repository

Run from the local project that should join the dod-guard workflow:

```text
/dod-guard:setup-repository
```

The skill preserves existing Git and project configuration. When no GitHub
remote exists, it collects the owner, repository name, visibility, and default
branch before creating one. It pushes reviewed files, waits for generated
quality checks, links one Project with `Backlog`, `Todo`, `In Progress`, and
`Done`, enables supported security settings, and then protects the default
branch.

Unsupported plan features, failed checks, ambiguous Projects, and likely
credentials stop setup with a mutation ledger. The skill never rewrites
history, force-pushes, or silently replaces configuration.

## Backlog to draft PR

Capture one or more requested features without designing them:

```text
/dod-guard:add-backlog-idea TychoHenzen/dod-guard Add a stale-asset report using tracked plugin files, and show installed and available plugin versions in the marketplace list
```

The repository argument is every backlog item's target repository. The skill
creates one issue for each outcome that can be implemented, verified, and
closed independently and is useful on its own. Different implementation parts
of one user-visible capability stay in one issue. A single outcome still
creates one issue.

Backlog items are real issues, not drafts, so the Project Repository field
stays populated. The result maps every identified feature to its issue URL.

Refine one Backlog item into a Todo PBI and any independently completable
subtasks:

```text
/dod-guard:refine-backlog-item 42
```

Refinement reads affected code, callers, and tests before choosing priority,
Fibonacci effort, and standard labels from the repository's live descriptions.
Missing scale labels stop refinement. Implementation notes record the evidence.
Re-refinement from Backlog replaces stale estimates. Unknown priority records
the missing information. Effort 13 stays in Backlog and requires independent
issues before implementation. Body, labels, and links are verified before Todo.

Start or continue the Todo PBI from a clean checkout:

From a clean Git checkout:

```text
/dod-guard:next-ticket 42
```

The selected issue must contain a short outcome, implementation notes, and
verifiable acceptance criteria. Use GitHub sub-issues for criteria that should
be completed independently.

`next-ticket` then:

1. Resolves the GitHub repository and its explicitly linked open Project.
2. Creates and pushes `codex/<issue>-<slug>` from the current default branch.
3. Assigns the issue and moves it to `In Progress`.
4. Implements and verifies the acceptance criteria.
5. Runs one fresh independent completion review, then commits and pushes.

The reviewer receives the PBI, linked sub-issues, repository instructions, final
diff and files, and verification evidence. The coordinator checks every challenge
and records it as `resolved`, `invalid`, or `irrelevant` with evidence. Valid gaps
block commit and implementation push until repaired, verified, and reviewed again.
The initial branch-only push remains permitted. An unavailable or failed review
also blocks completion. The result reports every disposition before stopping
with the verified branch pushed. This review edits no files or remote comments.

Submit or refresh its draft pull request in a separate step:

```text
/dod-guard:submit-draft-pr 42
```

Close a sub-issue only after its implementation commit is pushed. An
administrative sub-issue may close after its remote state is verified and the
evidence is recorded in a comment.

`submit-draft-pr` adds `Closes #<issue>` only after the evidence exists. The
agent must not approve its pull request, mark it ready, merge it, or close the
parent issue.

Review the current branch, a named Git ref, or a GitHub pull request without
checking it out:

```text
/dod-guard:review-pr
/dod-guard:review-pr origin/codex/42-example
/dod-guard:review-pr https://github.com/owner/repository/pull/42
```

The skill loads the linked PBI and subtasks, then runs feature, design,
reliability, and hygiene reviewers independently. Local Git findings use the
active client's inline code comments. GitHub findings become one comment-only
review on validated changed lines.

Azure DevOps is an additional explicit mode. It writes one Markdown report and
posts no inline comments:

```text
/dod-guard:review-pr https://dev.azure.com/owner/project/_git/repository/pullrequest/42 reports/review-42.md
```

Fix selected local or GitHub inline findings, or Azure report entries:

```text
/dod-guard:fix-pr-review #42 GH-12345
/dod-guard:fix-pr-review reports/review-42.md ADO-42-1
```

The skill reloads the parent PBI and linked subtasks, then rechecks each
finding against the current head. It skips stale or unsupported findings. It
pushes the smallest verified fix before replying to or resolving GitHub
threads. Azure entries change to `Fixed` with commit and check evidence while
unresolved entries stay unchanged.

After review, explicitly accept and complete the current pull request:

```text
/dod-guard:complete-pr 42
```

`complete-pr` accepts either a draft or ready pull request. It records the
accepted head first and marks a draft ready only when needed. It then enables
guarded auto-merge, updates a stale base only from the accepted head, waits for
required checks, confirms the merge and linked issue state, and deletes the
unchanged remote head branch. Conflicts, failed checks, permission errors,
unexpected pushes, and changed branch refs stop the command.

## Release a marketplace change

After the changed plugin has its own manifest version bump and local gates
pass, use:

```text
/dod-guard:publish
```

It delegates draft pull-request creation to `/submit-draft-pr`. After a human
merges and CI passes, refresh both clients:

```text
Claude Code: /plugin update, then /reload-plugins
Codex: codex plugin marketplace upgrade dod-guard-monorepo
Codex: codex plugin add dod-guard@dod-guard-monorepo
```

This repository does not publish npm packages or tags.

## Quality dashboard

Run `quality-dashboard.cmd` from this repository root. The dashboard reads each
registered project's `.quality/quality-report.json`; it never runs a scanner or
edits a project.
