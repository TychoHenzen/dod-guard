# Using dod-guard

## Start or continue an issue

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
6. Opens a draft pull request containing `Closes #<issue>`.

Close a sub-issue only after its implementation commit is pushed. An
administrative sub-issue may close after its remote state is verified and the
evidence is recorded in a comment.

The agent must not approve its pull request, mark it ready, merge it, or close
the parent issue. Branch protection and required CI checks enforce that
boundary.

## Quality dashboard

Run `quality-dashboard.cmd` from this repository root. The dashboard reads each
registered project's `.quality/quality-report.json`; it never runs a scanner or
edits a project.
