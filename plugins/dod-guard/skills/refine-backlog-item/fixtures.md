# Refinement regression fixtures

These are manual behavioral fixtures for the instruction-only skill. They do
not test a runtime classifier. Run the skill against each supplied situation,
then compare its decisions and mutations with the expected result. Use a
disposable issue for GitHub writes. Record observed results separately from
these expectations.

## Shared setup

The issue is open and in the repository's single linked Project as `Backlog`.
All scale labels exist exactly once with the following descriptions. Standard
labels use GitHub's descriptions: `bug` means something is not working,
`documentation` means documentation improvements, and `enhancement` means a
new feature or request. Other unrelated labels may exist.

| Label | Fixture description |
|---|---|
| Prio 1 - Emergency | Critical/Urgent issue, requires immediate action. |
| Prio 2 - Urgent | Serious issues or important milestones that heavily impact progress. |
| Prio 3 - Standard | Moderate tasks or minor issues not halting overall progress. |
| Prio 4 - Non-Urgent | Minor inconveniences, cosmetic fixes, or standard requests. |
| Prio 5 - Planned | Proactive improvements, exploratory tasks, or routine updates. |
| Prio 6 - Unknown | Priority cannot be assessed yet; requires re-evaluation. |
| Effort 1 - Trivial | Tiny task, extremely clear, zero risk, minutes to a couple of hours. |
| Effort 2 - Easy | Simple, well understood, minimal effort or risk. |
| Effort 3 - Medium | About a day of work with minor unknowns. |
| Effort 5 - Large | Complex, significant effort or notable dependencies. |
| Effort 8 - Huge | Very complex, hard to estimate, often needs breakdown. |
| Effort 13 - Epic | Too big to implement; must be split before development. |

## Discovery routing cases

Run these after the shared repository and issue research. Record the observed
triage and summaries in the disposable issue's `## Implementation notes`.

| Case | Input variation | Expected route and record |
|---|---|---|
| No gap | The task and repository evidence define one clear, low-risk documentation change. | Record `discovery-triage: no gap`. Do not invoke interview, external research, or debate. |
| Batched clarification | Two independent user choices affect visible behavior, and a third question depends on the first answer. | Use ordinary conversation through `/interview`. Ask both independent questions in one round, give multiple options and a recommended default for each, defer the dependent question, and record `interview-contract`. |
| Unanswered clarification | A first-round answer is still missing and a dependent question cannot yet be answered. | Wait for the answer or record `unresolved-decision`. Do not ask the dependent question or move to `Todo` while the material constraint is missing. |
| Repository context | A caller, test boundary, or architectural owner is unclear from the issue. | Inspect the code, callers, tests, and current architecture. Record `research-source` findings and remaining uncertainty. Do not ask the user for repository facts. |
| External context | The repository cannot establish a current provider rule or external compatibility fact. | Use targeted web or Context7 research. Record the source, relevant finding, and uncertainty in `research-source`. Do not debate before the fact is known. |
| Debate after constraints | The facts and user constraints are known, but two implementation options have real unclear tradeoffs. | Frame one concrete decision. Use the existing multi-round `$debate` protocol with three to five named real experts selected for the competing concerns. Record each expert's lens and why it applies, plus challenges, uncertainty, and synthesis in `debate-synthesis`, `accepted-option`, and `rejected-option`. |
| Newly discovered gap | Research or debate exposes a missing user constraint or external fact. | Return to the matching interview or research route. Update the triage and notes. Do not turn the gap into an assumption. |
| Unavailable workflow | A named workflow cannot run, or a question, fact, or tradeoff remains unresolved. | Record what is unclear, the unavailable workflow or fallback, the impact, and the next decision or evidence. Move to `Todo` only when the PBI remains coherent and independently deliverable without invented requirements. Keep it in `Backlog` otherwise. |
| Re-refinement | Existing notes contain current evidence and one stale source or newly triggered question. | Reuse current summaries, repeat only the stale or new phase, update notes in place, and create no duplicate sub-issues or scale labels. |

## Classification cases

Treat each row's evidence as the result of code, caller, and test research.
Require implementation notes that cite that evidence and explain the direction.
The emergency case deliberately has tiny effort: urgency must not inflate size.

| Case | Research evidence | Expected labels and status |
|---|---|---|
| Emergency | All users are blocked now by a wrong documentation URL. The correct target is verified. One text replacement has no code impact. | Prio 1, Effort 1, documentation; Todo. |
| Urgent | A reproducible defect blocks a major milestone. The existing caller and focused regression test isolate a simple fix. | Prio 2, Effort 2, bug; Todo. |
| Standard | A moderate defect has a workaround. Two callers and tests need about a day of changes with minor unknowns. | Prio 3, Effort 3, bug; Todo. |
| Non-urgent | A cosmetic preview defect has little impact, but research finds significant renderer dependencies and coupled tests. | Prio 4, Effort 5, bug; Todo. |
| Planned | A proactive feature spans several modules and tests with substantial uncertainty. Research still identifies one coherent implementation slice. | Prio 5, Effort 8, enhancement; Todo. |
| Unknown | A reported defect reproduces and the fix is simple, but affected users and operational impact cannot be established. | Prio 6, Effort 2, bug; Todo only with missing impact evidence recorded. |
| Epic | Proactive work covers multiple independent capabilities, callers, and test suites. Research finds it too big to implement as one PBI. | Prio 5, Effort 13, enhancement; parent stays Backlog. Split and independently research resulting issues before their Todo transitions. |
| Multiple standards | A small new option also requires user documentation. Existing option handling and tests establish a simple extension. | Prio 5, Effort 2, enhancement and documentation; Todo. |

## Boundary cases

| Input variation | Expected result |
|---|---|
| Existing Prio 1 and Prio 4, Effort 8 and stale `Effort 4 - Old`, plus an unrelated label; new evidence supports Prio 5 and Effort 2. | Replace all stale scale labels, preserve unrelated label, update rationale. Readback has exactly Prio 5 and Effort 2. |
| Repeat the previous refinement after returning the issue to Backlog. | Same final labels, no duplicates or duplicate sub-issues. |
| Re-refinement requested while issue is Todo. | Stop at the Backlog precondition; no mutations. |
| Remove `Effort 3 - Medium`, even though the chosen effort would be 2. | Stop before mutations; report the missing scale member. |
| Supply duplicate exact-name entries for `Prio 2 - Urgent` in the API fixture. | Stop before mutations; report ambiguity. |
| Put the only matching scale label on the second API page. | Follow pagination and resolve it successfully. |
| Required label has a blank description, or only a differently cased name exists. | Stop before mutations; no substitute or new label. |
| Change a live label description so it contradicts the proposed estimate. | Reassess using the live description; stop if no supported classification exists. |
| No existing standard label describes the researched change. | Stop; do not invent or create a classification label. |
| Unknown priority has no missing-information explanation. | No Todo transition until the evidence gap is recorded. |
| Epic has only dependent administrative subtasks. | Parent remains Backlog; subtasks do not clear the epic block. |
| Epic is split into two independently deliverable issues. | Each child needs its own researched sections and labels. Parent remains Backlog while effort is 13. |
| Original epic is reduced to an independently deliverable remainder with justified Effort 3. | Replace Effort 13 and rationale; verify split links and sections before Todo. |
| Label edit fails, a linked issue is absent, or readback shows two effort labels. | Stop before Todo and report the actual partial state. |
| Title suggests a quick fix, but callers and tests show cross-module work. | Research precedes the final estimate and implementation direction. Use observed scope. |

## Live GitHub exercise

Create an explicitly named disposable verification issue in the target
repository and add it to the linked Project as Backlog. Seed stale priority
and effort labels. Refine a small documentation change using the checked-out
skill, live descriptions, affected documentation, entry points, and validation.
Read back the final body, exact labels, sub-issue links (empty is valid for one
coherent slice), discovery summaries, and Todo status. Confirm the rationale
agrees with the labels. Exercise a second disposable path where a material
requirement cannot be stated and confirm it remains in Backlog. A coherent PBI
with documented residual uncertainty may reach Todo. Repeat one coherent path
from Backlog to check replacement stability. Close the disposable issues as not
planned and remove their Project items after recording the evidence.
