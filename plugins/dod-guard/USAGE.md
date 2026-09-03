# Using dod-guard

## Backlog to draft PR

Capture a request without designing it:

```text
/dod-guard:add-backlog-idea TychoHenzen/dod-guard Add a validation report for stale plugin assets
```

The repository argument is the backlog item's target repository. Backlog items
are real issues, not drafts, so the Project Repository field stays populated.

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

## Release a marketplace change

After the changed plugin has its own manifest version bump and local gates
pass, use:

```text
/dod-guard:publish
```

It delegates draft pull-request creation to `/submit-draft-pr`. After a human
merges and CI passes, run `/plugin update` and `/reload-plugins` in Claude
Code. This repository does not publish npm packages or tags.

## Quality dashboard

Run `quality-dashboard.cmd` from this repository root. The dashboard reads each
registered project's `.quality/quality-report.json`; it never runs a scanner or
edits a project.
