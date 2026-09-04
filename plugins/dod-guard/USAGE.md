# Using dod-guard

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
5. Commits and pushes reviewed files.
6. Stops with the verified branch pushed.

Submit or refresh its draft pull request in a separate step:

```text
/dod-guard:submit-draft-pr 42
```

Close a sub-issue only after its implementation commit is pushed. An
administrative sub-issue may close after its remote state is verified and the
evidence is recorded in a comment.

`submit-draft-pr` adds `Closes #<issue>` only after the evidence exists. The
agent must not approve its pull request, mark it ready, merge it, or close the
parent issue. Use `/review-pr-branch` for the read-only review.

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
