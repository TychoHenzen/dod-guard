---
name: refine-backlog-item
description: Research a backlog item and give it justified priority, Fibonacci effort, and classification labels before moving the refined PBI to Todo. Use before next-ticket, not for implementation.
---

# Refine backlog item

Turn one existing backlog issue into an implementation-ready parent PBI. Its
repository is the issue's target repository. Do not create a branch, assign the
PBI, change it to In Progress, implement code, or open a pull request.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

## Preconditions

1. Resolve the repository, its linked Project, and the `Backlog` and `Todo`
   statuses as described under "Resolve the repository and Project" in
   `standards/github-request-discipline.md`.
2. Verify the specified issue belongs to the repository, appears in that
   Project, and has Status `Backlog`.
3. Query all live labels in the target repository, including descriptions:

   Use the GitHub MCP repository-resource operation with the labels endpoint.
   If MCP is unavailable, use:

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

When user constraints or priorities are missing, choose the route from the
current run mode. In ordinary interactive refinement, ask the user through
ordinary conversation, after research: never ask what the repository, the web,
or Context7 can answer. Ask every currently independent clarification question in one round, give each
question multiple concrete options, and mark the recommended default. Defer
questions whose options depend on an earlier answer to a later round. Record
the resulting behavioral contract in an `interview-contract` implementation
note. Wait for the current round's answers before using an answer-dependent
option.

During an active goal or explicitly non-interactive refinement, invoke exactly
one fresh `dod-guard:codex-advisor` instead of asking the user. It uses
Claude's advisor tool in Claude Code, otherwise Codex with `gpt-5.6-luna` at
`max` reasoning effort. Give the advisor only the unresolved
question, candidate answers and recommended default, repository and PBI context,
the researched evidence, and the affected acceptance boundary and constraints.
Batch every currently independent question into that one advisor brief. Defer a
question whose options depend on an advisor answer until triage runs again.
The advisor is advice-only and cannot replace user authority. Record an
`advisor-decision` implementation note with the advisor used, briefing scope,
advice, and the evidence for accepting or rejecting it. Do not invoke another
advisor to retry, vote, or refine its answer.

Re-run triage after either route. Do not ask dependent questions or finalize
labels or `Todo` while a material answer is missing. If the advisor cannot
resolve a user-authority question, record an `unresolved-decision` with the
question, evidence, impact, and next required authority, then keep the issue in
`Backlog`. If the advisor invocation fails or its response is unusable, record
an `unresolved-decision` with the question, researched evidence, exact advisor
failure, impact, and next required authority, then keep the issue in `Backlog`.

Do not require a provider-specific `AskUserQuestion` tool. Keep the issue in
Backlog when a material requirement cannot be stated without inventing it.

When external facts or context are missing, perform targeted research. Inspect
the code, callers, tests, and current architecture first. Use the web or
Context7 only when the missing fact is outside the repository or needs current
external evidence. Record each source and its relevant finding in a
`research-source` implementation note. Do not ask the user for a fact that this
research can answer.

When a genuine tradeoff remains, frame one concrete decision and debate it
only after the required facts and user constraints
are available. Select three to five named real experts whose documented
positions match the competing concerns. Run at least two rounds: each expert
states a position from their lens, then challenges the strongest opposing
position. Then synthesize. Record each expert's name, lens,
competing concern, and why that lens applies, plus the challenges, acknowledged
uncertainty, synthesis, accepted option, and rejected options in
`debate-synthesis`, `accepted-option`, and `rejected-option` implementation
notes. Keep raw debate scratch files
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

After a failed, timed-out, or ambiguous write, follow the shared GitHub
standard: read back that resource before retrying or issuing another write.

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

For an ordinary parent, create linked GitHub sub-issues only when a criterion
can be completed, committed, and closed independently. Each sub-issue needs
its own outcome, implementation notes, acceptance criteria, and verification.
Keep dependent steps in the parent PBI instead of inventing administrative
subtasks.

For a structured parent PBI, use functional decomposition: start from the
user actions and split the outcome into a small set of coherent functional
slices. Decompose each slice only to a useful level that can be independently
implemented, tested, and verified; avoid tiny administrative subtasks. Create
one linked child per useful unit only when it warrants independent tracking;
keep dependent steps in the parent checklist. A cohesive feature may remain
one parent-level checklist, and no child is required merely to fill a fixed
category list. Reuse an existing child when its outcome and acceptance
criteria already own the unit. Never duplicate a unit, and give every created
child minimal parent context, scope, acceptance criteria, and verification.

For every structured PBI, explicitly assess implementation, wiring and
end-to-end usability—including proof that the feature is reachable from its
intended UI or supported user-facing surface—refactoring and code quality, and
failure/recovery reliability beyond the happy path. Attach each concern to the
functional child or parent-level task that owns it, with observable acceptance and verification;
these are review lenses, not mandatory child categories. Linked children are
checklist work within the parent's one branch and one PR; they do not
authorize child branches or pull requests.

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
- `advisor-decision`: the advisor used (Claude advisor tool, or the Codex
  model and effort), bounded briefing scope,
  advice, and the evidence for accepting or rejecting it;
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
`implementation-plan`, `task-list`, and `lens-ownership`. Use the existing discovery markers as
the evidence inside those records. The task list must identify dependencies and
mark a task `independent` only when it can be committed and closed separately.
Write each record as a distinct named subsection, keep the task order stable,
and map every task to its functional slice or explicitly mark it as a
parent-level convergence task. Record where the implementation, wiring and
end-to-end usability, code quality, and reliability lenses are covered, or why
one is not applicable. Functional-slice children are checklist work on the
parent's one branch and one pull request, not separate delivery units.
Small, clear fixes may use the ordinary path and do not need these records.

For re-refinement, read the existing discovery notes and compare them with the
current requirements, code, callers, tests, sources, and decisions. Reuse
evidence that is still current. Repeat only phases made stale or newly
triggered, and update the existing summaries instead of appending conflicting
assumptions. Do not create duplicate linked sub-issues or scale labels.

## Apply labels and verify before Todo

Read the issue's current labels, then add the chosen priority,
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
is below 13 before moving that PBI to `Todo` with the shared REST Project status
writer.
For a structured PBI, also confirm the named `requirements`, `clarifications`,
`implementation-plan`, `task-list`, and `lens-ownership` records are present and coherent; every
linked child matches one independently deliverable functional slice (each is separately tracked)
in the task list, is actionable, and is `Todo`; and the four review lenses each have
an owning child or parent-level task plus mapped observable acceptance or
verification evidence. Pass the complete task, slice, owner, and evidence mapping
through the same executable convergence proof used by `next-ticket` before moving
the parent to `Todo`; `submit-draft-pr` and `complete-pr` consume or revalidate the
resulting handoff after implementation and PR creation. Stop on any actionable
remainder. Do not require a fixed
child count or create category placeholders. When no linked child represents
cross-cutting parent work, record an explicit parent-level task with
`parentLevel: "convergence"` so that ownership remains visible and verifiable.
The executable proof rejects duplicate or missing slice links, unowned slices,
duplicate evidence, missing or duplicate review lenses, invalid acceptance IDs,
and incomplete or stale acceptance-matrix rows.
If an edit fails or readback disagrees, stop before the status change and
report the actual partial state. Do not claim the PBI is ready.

Read back the final Project status after the transition. Report the PBI,
priority, effort, standard labels, linked or replacement issues, and unresolved
decisions. Stop before implementation.

For regression verification, exercise [the refinement fixtures](fixtures.md).
