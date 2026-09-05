---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
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
5. Query all live labels in the target repository, including descriptions:

   ```text
   gh api --paginate "repos/{owner}/{repo}/labels?per_page=100"
   ```

   Substitute the resolved repository. Require exactly one exact-name match
   and a nonempty description for every label in both scales below. Stop
   before mutations if a label is missing or ambiguous. Do not create labels,
   duplicate labels, Project fields, or another estimation scale.

Stop and report the missing or ambiguous value. Do not infer product decisions.
Do not accept a draft issue. Backlog items are repository issues so their target
repository stays explicit.

## Research before classification

Read the issue, relevant repository instructions, the affected code, callers,
and existing tests before finalizing priority, effort, or implementation
direction. For documentation or skill work, read the affected instructions,
their entry points, and existing validation. Record absent code or test
coverage instead of assuming it exists.

Use the live label descriptions as the classification contract. Select exactly
one priority and one effort label whose description fits the researched
impact, urgency, scope, dependencies, risk, and uncertainty. Do not infer
urgency from effort or choose estimates from the title alone.

| Priority labels | Fibonacci effort labels |
|---|---|
| `Prio 1 - Emergency` | `Effort 1 - Trivial` |
| `Prio 2 - Urgent` | `Effort 2 - Easy` |
| `Prio 3 - Standard` | `Effort 3 - Medium` |
| `Prio 4 - Non-Urgent` | `Effort 5 - Large` |
| `Prio 5 - Planned` | `Effort 8 - Huge` |
| `Prio 6 - Unknown` | `Effort 13 - Epic` |

The columns are independent scales. `Prio 6 - Unknown` is valid only when
the evidence cannot support another priority. State the missing information
needed for reassessment in the implementation notes.

Select one or more appropriate existing standard labels by exact name and
description from `bug`, `documentation`, `duplicate`, `enhancement`,
`good first issue`, `help wanted`, `invalid`, `question`, and `wontfix`.
Do not apply the whole set. Stop if no available label has a description
that supports the classification. Do not create missing standard labels.

## Refine the PBI

Update the parent issue with these sections:

- `## Outcome`: the observable user or system result;
- `## Scope`: included behavior and explicit non-goals;
- `## Implementation notes`: affected boundaries and constraints, researched
  code/caller/test evidence, the selected priority and effort with supporting
  evidence tied to their live descriptions, standard classification rationale,
  and the evidence supporting the implementation direction;
- `## Acceptance criteria`: checkboxes with observable outcomes;
- `## Verification`: the checks that can prove each criterion.

Ask for direction instead of writing a false choice as a requirement.

Create linked GitHub sub-issues only when a criterion can be completed,
committed, and closed independently. Each sub-issue needs its own outcome,
implementation notes, acceptance criteria, and verification. Keep dependent
steps in the parent PBI instead of inventing administrative subtasks.

Apply the same research, sections, and label requirements to any sub-issue
being refined into a PBI. Reuse appropriate existing linked issues.

`Effort 13 - Epic` blocks the epic's transition to `Todo`. Keep it in
`Backlog` and split it into independently deliverable linked issues, or
explicitly linked replacement issues. Research and estimate each resulting
PBI separately before it can move to `Todo`. Merely adding dependent subtasks
does not clear the block. The original issue can move to `Todo` only if its
remaining scope is independently deliverable and evidence supports a lower
effort label. Do not close the original issue as part of refinement.

## Apply labels and verify before Todo

Re-read the issue's current labels before editing. Add the chosen priority,
effort, and standard labels with
`gh issue edit {issue-number} --repo {owner}/{repo}`.
Remove every other current priority or effort label, including stale scale
variants with a `Prio <number>` or `Effort <number>` prefix. Use repeated
`--add-label` and `--remove-label` arguments in the same edit. Preserve
unrelated labels. Remove obsolete standard classifications only when the
research establishes that they no longer apply.

For re-refinement, the issue must still satisfy the `Backlog` precondition.
Replace previous estimates and their rationale instead of accumulating them.

Read back the issue body, labels, linked sub-issues, and Project status from
GitHub. Confirm all required sections and evidence exist, sub-issues are
linked, the PBI is still in Backlog, exactly one label from each scale remains,
and at least one standard
label applies. Confirm unknown priority explains missing evidence and effort
is below 13 before moving that PBI to `Todo` with `gh project item-edit`.
If an edit fails or readback disagrees, stop before the status change and
report the actual partial state. Do not claim the PBI is ready.

Read back the final Project status after the transition. Report the PBI,
priority, effort, standard labels, linked or replacement issues, and unresolved
decisions. Stop before implementation.

For regression verification, exercise [the refinement fixtures](fixtures.md).
