# Structured project workflow

This is the canonical stage map for work that needs more than the ordinary
issue, branch, test, and draft-PR path. It is guidance for GitHub-backed
artifacts, not a per-ticket planning file.

## Choose the path

Use the structured path for a feature, material ambiguity, several dependent
decisions, or work that needs an explicit plan and convergence check. Use the
ordinary path for a small, clear fix with known scope, acceptance, and tests.
Both paths use the repository's linked GitHub Project, issue, branch, commits,
and pull request as the source of truth.

## Principles and source of truth

- Existing repository instructions in `AGENTS.md` and `CLAUDE.md` are the
  project-principles source. Preserve both when both exist and follow the
  repository's existing import convention. Do not add a second constitution.
- The GitHub issue holds the outcome, requirements, decisions, plan, tasks,
  acceptance criteria, and verification. Project Status records lifecycle.
  Branch history and the pull request hold implementation and review evidence.
- OpenSpec material is historical reference only. It is not an active runtime,
  dependency, or source of truth.
- PBI #59 owns forgiving defaults, dirty-worktree handling, stale-test policy,
  and functional-style guidance. This map composes with those rules instead of
  replacing or duplicating them.
- The structured path never bypasses stops for material ambiguity, credentials,
  destructive or authority-bound actions, unrelated work, provider or head
  mismatch, or missing high-risk evidence.

## Stage map

| Stage | Owner | GitHub-backed artifact | Handoff |
| --- | --- | --- | --- |
| Principles | `setup-repository` | Repository instructions | Existing rules guide capture and refinement. |
| Problem | `add-backlog-idea` | Issue in `Backlog` with concise outcome and scope | Refine one coherent issue. |
| Requirements | `refine-backlog-item` | Issue `Outcome`, `Scope`, and checked `Acceptance criteria` | Clarify gaps, then plan. |
| Clarification | `refine-backlog-item` | `Implementation notes` with decisions and discovery evidence | Only resolved requirements enter the plan. |
| Plan | `refine-backlog-item` | `implementation-plan` record in the issue | Break the plan into actionable tasks. |
| Tasks | `refine-backlog-item` | `task-list` record and functional-slice child PBIs when independent delivery warrants them | `Todo` PBI hands every slice and parent task evidence to implementation on one branch and PR. |
| Implementation handoff | `next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

## Structured handoff contract

A structured PBI is implementation-ready when the issue contains the five named
records and decomposes the work into coherent, user-action-first functional
slices. Every declared slice maps to exactly one verifiable owner. A slice
intended for independent child delivery must be independently deliverable;
parent-level tasks may own explicitly cross-cutting slices without inventing a
child. A task without a child must carry `parentLevel: "convergence"` to mark
that cross-cutting ownership explicitly. Every linked child maps back to
exactly one declared slice.

Implementation, wiring and end-to-end usability, code quality, and
failure/recovery each need exactly one owning slice or parent-level task with
observable evidence bound to the accepted head. There is no fixed child count
or category set. The branch does not replace these records: it supplies the
implementation evidence they request.
The executable proof at `skills/next-ticket/scripts/structured-workflow-proof.mjs`
and its focused tests enforce the canonical lens IDs `implementation`,
`wiring/usability`, `quality`, and `reliability`; prose may expand those IDs
to the corresponding user-facing concern. Each lens entry records its owner,
observable evidence, `headSha`, and the acceptance-matrix `acceptanceEvidence`
and `verificationEvidence` that prove the lens before Project finalization.

Task-list records use `parentLevel: "convergence"` on a task that owns
cross-cutting parent work without a linked child; for example,
```json
{
  "id": "task-1",
  "parentLevel": "convergence",
  "evidence": "...",
  "acceptanceEvidence": "matrix-evidence-1",
  "verificationEvidence": "matrix-proof-1"
}
```

`next-ticket` writes one durable `## Implementation handoff` issue comment (or
updates the existing one) after pushing the branch. That comment maps every
ordered task and linked functional-slice child to its commit or verified remote-state
evidence, the checks that prove it, and the current user-path result. It is the
handoff from refinement to draft-PR convergence; it is not a local planning
file.

The same comment contains one `## Acceptance matrix` with one row for every
acceptance criterion and mandatory user-facing path. Each row records the
contract or criterion, risk or path, proof action, expected and observed
behavior, status, evidence location, and exact pushed head SHA. Missing,
failed, unverified, blocked, or head-mismatched rows stop the handoff; an
`inapplicable` row is valid only with an explicit reason.

The same handoff also carries one `## Preflight checkpoint` record for the
selected pull request once its branch exists. It records the exact branch and
PR head, base ref and SHA, mergeability, and one row for every required
provider context. Each context row records its provider, workflow, run ID, ref,
head SHA, and one of `present`, `pending`, `failed`, `skipped`, or
`unavailable`. Missing, stale, duplicate, forked, or provider-mismatched
evidence is not acceptance evidence. A draft-skipped workflow may be dispatched
once only after readiness is read back for the same repository, ref, and head;
the dispatch and resulting run are recorded in this record. Base drift
invalidates the acceptance matrix and routes one bounded synchronization through
`complete-pr`; conflicts or unexpected branch movement stop the workflow.

## Structured handoff records

For a structured PBI, keep these records in the issue's `## Implementation
notes`. The exact prose can vary, but the names and meaning stay stable:

- `requirements`: observable user stories, constraints, and non-goals.
- `clarifications`: resolved decisions and their evidence. Keep
  `unresolved-decision` entries when a decision is not safe to invent.
- `implementation-plan`: affected owners, approach, and verification approach.
- `task-list`: ordered tasks with a clear dependency and an `independent`
  marker only when a task can be committed and closed separately.
- `lens-ownership`: an array containing exactly one `implementation`,
  `wiring/usability`, `quality`, and `reliability` (failure/recovery) entry.
  Each entry repeats its
  review-lens id, owner, observable evidence, accepted head, and any acceptance
  or verification evidence; the executable handoff proof compares this record
  with the review-lens input instead of treating record presence as proof.

`refine-backlog-item` owns these records. It keeps a material unresolved
requirement in `Backlog` and moves a coherent PBI to `Todo`. `next-ticket`
uses the records as its implementation handoff and maps tasks to changed
files, commits, and checks. It does not create a parallel local plan.

## Convergence record

Before a structured PBI gets a draft PR, `submit-draft-pr` compares the
implementation with the outcome, requirements, clarifications, plan, tasks,
lens ownership,
acceptance criteria, and verification evidence in the `## Implementation
handoff` comment. That comment is the one evidence record. The draft PR body
links it instead of restating it:

```text
## Convergence
- Handoff: <link to the ## Implementation handoff comment> (head <sha>)
- Preflight checkpoint: same handoff record (head <sha>)
- Remainder: none
```

Convergence is passing only when every named record exists and every declared
slice, task, and linked functional-slice child is mapped exactly once by the
implementation handoff. Each canonical review lens appears exactly once and
resolves to one task or slice owner; its evidence must be declared by that
owner and bound to the accepted head. Every declared evidence identifier is
unique; reuse the underlying commit or check with a distinct owner-specific
identifier rather than redeclaring one token. Every evidence reference resolves
to its owner. Every acceptance
criterion and matrix row has fresh evidence at the exact head. No item is
contradicted or unresolved. The
required-context and base/mergeability
checkpoint must also be stable at that exact head. Codex's built-in Review
Summary consumes that same matrix and checkpoint; neither is copied into a
second review ledger.

An incomplete or contradicted result is not reported as complete. Write the
actionable remainder, with the next task and owner, to the PBI and stop before
creating or updating the draft PR. After a failed or ambiguous write, read back
that resource before retrying, as the shared GitHub standard requires. The
ordinary small-fix path bypasses these records and uses its direct issue,
commit, test, and review evidence instead.
