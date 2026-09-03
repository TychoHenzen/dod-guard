---
name: refine-backlog-item
description: Turn a backlog item into a concrete GitHub Project PBI in Todo with observable criteria and only independently completable subtasks. Use before next-ticket, not for implementation.
---

# Refine backlog item

Turn one existing backlog issue into an implementation-ready parent PBI. Its
repository is the issue's target repository. Do not create a branch, assign the
PBI, change it to In Progress, implement code, or open a pull request.

## Preconditions

1. Resolve the repository with `gh repo view --json nameWithOwner,defaultBranchRef,url`.
2. Resolve exactly one open Project explicitly linked to that repository.
3. Verify the specified issue belongs to the repository, appears in that
   Project, and has Status `Backlog`.
4. Resolve exactly one `Status` field with one case-insensitive `Todo` option.

Stop and report the missing or ambiguous value. Do not infer product decisions.
Do not accept a draft issue. Backlog items are repository issues so their target
repository stays explicit.

## Refine the PBI

Read the issue, relevant repository instructions, the affected code, callers,
and existing tests. Update the parent issue with these sections:

- `## Outcome`: the observable user or system result;
- `## Scope`: included behavior and explicit non-goals;
- `## Implementation notes`: affected boundaries and constraints discovered in
  the repository;
- `## Acceptance criteria`: checkboxes with observable outcomes;
- `## Verification`: the checks that can prove each criterion.

Ask for direction instead of writing a false choice as a requirement.

Create linked GitHub sub-issues only when a criterion can be completed,
committed, and closed independently. Each sub-issue needs its own outcome,
implementation notes, acceptance criteria, and verification. Keep dependent
steps in the parent PBI instead of inventing administrative subtasks.

Set the parent PBI to `Todo` only after every required section is complete and
each sub-issue is linked. Report the PBI, created sub-issues, and unresolved
decisions. Stop before implementation.
