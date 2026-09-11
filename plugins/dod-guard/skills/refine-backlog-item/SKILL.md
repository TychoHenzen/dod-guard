---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
---

# Refine backlog item

Turn one existing backlog issue into an implementation-ready parent PBI. Its
repository is the issue's target repository. Do not create a branch, assign the
PBI, change it to In Progress, implement code, or open a pull request.

Before GitHub calls, read `<plugin-root>/standards/github-request-discipline.md`.

## Preconditions

1. Resolve the repository with the GitHub MCP repository operation. If MCP is
   unavailable, use `gh repo view --json nameWithOwner,defaultBranchRef,url`.
2. Resolve exactly one open Project explicitly linked to that repository.
3. Verify the specified issue belongs to the repository, appears in that
   Project, and has Status `Backlog`.
4. Resolve exactly one `Status` field with one case-insensitive `Todo` option.
5. Query all live labels in the target repository, including descriptions:

   Use the GitHub MCP repository-resource operation with the labels endpoint.
   If MCP is unavailable, use:

   ```text
   gh api "repos/{owner}/{repo}/labels?per_page=100"
   ```

   Substitute the resolved repository. Require exactly one exact-name match
   and a nonempty description for every label in both scales below. Stop
   before mutations if a label is missing or ambiguous. Do not create labels,
   duplicate labels, Project fields, or another estimation scale.

Stop and report the missing or ambiguous value. Do not infer product decisions.
Do not accept a draft issue. Backlog items are repository issues so their target
repository stays explicit.

## Research and discovery triage

Read the issue, relevant repository instructions, the affected code, callers,
and existing tests before classifying any missing context or finalizing
priority, effort, or implementation direction. For documentation or skill
work, read the affected instructions, their entry points, and existing
validation. Record absent code or test coverage instead of assuming it exists.

After that repository and issue research, state a discovery triage in the
implementation notes. Classify each unresolved point as one of these:

- `user constraints or priorities`: the user's intended behavior, priority, or
  acceptance boundary is missing;
- `external facts or context`: the repository cannot establish a fact needed to
  choose or describe the implementation;
- `genuine tradeoff`: the relevant facts and user constraints are known, but a
  concrete decision still has multiple plausible options with unclear tradeoffs;
- `no gap`: the task and evidence support one clear direction.

A PBI may need more than one route. Resolve user constraints and external facts
before using debate. Do not ask the user for facts that repository inspection,
the web, or Context7 can establish. When the result is `no gap`, continue
without invoking a discovery workflow.

When user constraints or priorities are missing, use the existing `/interview`
workflow's research-first contract through ordinary conversation. This skill
intentionally overrides its one-question-at-a-time interaction rule. Ask every
currently independent clarification question in one round, give each question
multiple concrete options, and mark the recommended default. Defer questions
whose options depend on an earlier answer to a later round. Record the resulting
behavioral contract in an `interview-contract` implementation note.
Wait for the current round's answers before using an answer-dependent option.
Do not ask dependent questions or finalize labels or `Todo` while a material
answer is missing. If an answer is unavailable, record an `unresolved-decision`
and apply the residual-uncertainty gate below.

Do not require a provider-specific `AskUserQuestion` tool. If `/interview` is
unavailable, preserve its contract through ordinary conversation when possible.
Otherwise record the unavailable workflow, the fallback, its impact, and the
next decision or evidence needed. Keep the issue in Backlog when a material
requirement cannot be stated without inventing it.

When external facts or context are missing, perform targeted research. Inspect
the code, callers, tests, and current architecture first. Use the web or
Context7 only when the missing fact is outside the repository or needs current
external evidence. Record each source and its relevant finding in a
`research-source` implementation note. Do not ask the user for a fact that this
research can answer.

When a genuine tradeoff remains, frame one concrete decision and invoke the
existing `$debate` protocol only after the required facts and user constraints
are available. Select three to five named real experts whose documented
positions match the competing concerns. Record each expert's name, lens,
competing concern, and why that lens applies, plus the challenges, acknowledged
uncertainty, synthesis, accepted option, and rejected options in
`debate-synthesis`, `accepted-option`, and `rejected-option` implementation
notes. Follow the existing multi-round protocol, keep raw debate scratch files
outside the repository, and do not turn expert speculation into a requirement.

After each interview, research, or debate round, run the triage again. If new
evidence exposes a missing user constraint or external fact, return to the
matching route before finalizing the PBI. If debate reveals a new tradeoff,
record it and continue the same decision. Do not silently convert a new gap
into an assumption.

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

After discovery is complete, save a mutation snapshot of the issue body,
labels, state, repository membership, Project item, Project membership, and
current Status. Before each issue write, including a body, label, or
linked-sub-issue mutation, re-read those values and compare them with the
latest mutation snapshot. If any value changed, stop without writing and
report the mismatch. After each successful write, read back the affected
issue and Project item and replace the snapshot before the next write.
Immediately before moving to `Todo`, repeat the same comparison and require
the issue to remain in the repository, the Project item to remain present with
Status `Backlog`, and the body and labels to match the current refinement.

Update the parent issue with these sections:

- `## Outcome`: the observable user or system result;
- `## Scope`: included behavior and explicit non-goals;
- `## Implementation notes`: the discovery triage and applicable interview,
  research, debate, option, and unresolved-decision summaries, plus affected
  boundaries and constraints, researched code/caller/test evidence, the
  selected priority and effort with supporting evidence tied to their live
  descriptions, standard classification rationale, and the evidence
  supporting the implementation direction;
- `## Acceptance criteria`: checkboxes with observable outcomes;
- `## Verification`: the checks that can prove each criterion.

Ask for direction when a missing choice changes observable behavior, a public
interface, data handling, or an acceptance test. Do not write a false choice as
a requirement.

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

## Record discovery and re-refinement state

Keep concise discovery evidence in `## Implementation notes`. Include a
`discovery-triage` result and, when applicable, these named summaries:

- `interview-contract`: the questions asked, options, recommended defaults,
  answers, and deferred dependent questions;
- `research-source`: the source, relevant finding, and remaining uncertainty;
- `debate-synthesis`: the decision, each named expert's lens and why it applies
  to a competing concern, challenges, uncertainty, and synthesis;
- `accepted-option`: the chosen option and the evidence supporting it;
- `rejected-option`: each rejected option and the reason it was rejected;
- `unresolved-decision`: what remains unclear, why, its impact, and the next
  decision or evidence needed.

If a question, fact, or tradeoff remains unresolved, or a named workflow was
unavailable, document the exact gap, fallback, impact, and next step. An
unresolved item does not by itself block `Todo` when the PBI is independently
deliverable, its outcome, scope, and acceptance criteria remain coherent, and
no material requirement was invented. Keep the issue in `Backlog` when those
requirements cannot be stated safely.

For feature work or material ambiguity, resolve the active dod-guard plugin root
from the directory containing this skill, then read
`<plugin-root>/standards/project-workflow.md`. Do not assume the target checkout
contains the shared standard. Keep these named records in
`## Implementation notes`: `requirements`, `clarifications`,
`implementation-plan`, and `task-list`. Use the existing discovery markers as
the evidence inside those records. The task list must identify dependencies and
mark a task `independent` only when it can be committed and closed separately.
Small, clear fixes may use the ordinary path and do not need these records.

For re-refinement, read the existing discovery notes and compare them with the
current requirements, code, callers, tests, sources, and decisions. Reuse
evidence that is still current. Repeat only phases made stale or newly
triggered, and update the existing summaries instead of appending conflicting
assumptions. Do not create duplicate linked sub-issues or scale labels.

## Apply labels and verify before Todo

Immediately before the label edit, run the mutation snapshot check above.
Re-read the issue's current labels as part of that check. Add the chosen priority,
effort, and standard labels with the GitHub MCP issue update operation. If MCP is
unavailable, use `gh issue edit {issue-number} --repo {owner}/{repo}`.
Remove every other current priority or effort label, including stale scale
variants with a `Prio <number>` or `Effort <number>` prefix. Use repeated
`--add-label` and `--remove-label` arguments in the same edit. Preserve
unrelated labels. Remove obsolete standard classifications only when the
research establishes that they no longer apply.

For re-refinement, the issue must still satisfy the `Backlog` precondition.
Replace previous estimates and their rationale instead of accumulating them.
Reuse current discovery evidence and replace only stale or newly triggered
summaries.

Read back the issue body, labels, linked sub-issues, and Project status from
GitHub. Confirm all required sections and evidence exist, sub-issues are
linked, the PBI is still in Backlog, exactly one label from each scale remains,
and at least one standard
label applies. Confirm unknown priority explains missing evidence and effort
is below 13 before moving that PBI to `Todo` with `gh project item-edit`.
For a structured PBI, also confirm the named `requirements`, `clarifications`,
`implementation-plan`, and `task-list` records are present and coherent before
moving it to `Todo`.
If an edit fails or readback disagrees, stop before the status change and
report the actual partial state. Do not claim the PBI is ready.

Read back the final Project status after the transition. Report the PBI,
priority, effort, standard labels, linked or replacement issues, and unresolved
decisions. Stop before implementation.

For regression verification, exercise [the refinement fixtures](fixtures.md).
