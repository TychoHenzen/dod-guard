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
slices. Every declared slice must have a useful independently implementable,
testable, and verifiable user-facing boundary. Parent-level tasks may own
explicitly cross-cutting slices without inventing a child; a task without a
child must carry `parentLevel: "convergence"` to mark that ownership
explicitly. Every linked child maps back to exactly one declared slice.

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
cross-cutting parent work without a linked child. The following is an
illustrative fragment; the executable contract and failure cases live in
`skills/next-ticket/scripts/structured-workflow-proof.mjs` and its focused
tests:
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
`complete-pr`. A merge conflict on the PBI head goes to the triage in
`standards/conflict-triage.md`; an unresolvable conflict or unexpected branch
movement stops the workflow.

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

## Closure records

Two records let delivered and superseded issues close without a person. They
are defined here once; `skills/complete-pr/scripts/lib/closure-records.mjs`
parses and renders them, `skills/complete-pr/scripts/closure.mjs` is the
command that records and applies them, and no prose comment is parsed in
their place.

- `supersedes`: a replacement delivery root carries one `### supersedes` record
  under its `## Implementation notes`, a JSON block holding a non-empty array of
  issue numbers in the same repository that the root replaces. The record lives
  only on the root; the original carries no reverse link.
- `## Completion evidence`: after a verified merge, `complete-pr` posts one
  comment with this heading on each linked closing issue and each finalized
  child. It carries the marker `<!-- dod-guard-completion-evidence -->` and a
  JSON block with `pullRequest`, `mergeCommit`, `trustedHeadSha` (the head the
  merge helper trusted, which moves after a base update), `requiredChecks`, and
  `pendingRows`: every acceptance-matrix row whose status is neither `pass` nor
  `inapplicable`. A record with pending rows is `merged-pending`, not verified.
  Recording again updates the same comment in place.

Each caller of `closure.mjs plan`, `apply`, or `annotate` saves one closure
snapshot as JSON and passes it with `--snapshot`. The closure snapshot is the
whole linked Project, read the way goal-sdlc's select-next snapshot is:
`repository`, `defaultBranch`, every item from every page, every listed issue,
and every linked pull request. On every issue it also carries `children` (an
empty array when it has none), `body`, `state_reason`, and `comments` as
`[{id, body}]`. It carries a `project` object with `owner`, `number`,
`statusFieldId`, and `doneOptionId`: the Project owner login and number, and the
Status field node ID and Done option ID from the Project fields read, the same
values `/complete-pr` passes to `project-status.mjs`. The whole Project is read
because a `supersedes` record lives only on its root, and a parent closes only
after every sub-issue is checked, so a narrower read misses roots and siblings.
An issue whose `children` list is missing is held with "sub-issue list missing",
never treated as childless. Any caller's run may therefore also close other
verified originals and parents, and report older `unverified-closed` records,
because the helper is the single closing authority.

A delivery is verified only when its completion record matches the live pull
request readback (merge commit, trusted head, default base, passing checks) and
the goal-sdlc queue decision classifies its group as `complete` with
`trustedHeadSha` and a finished checkpoint taken from the records. Comment text
alone is never trusted. When a root's delivery is verified, each open issue its
`supersedes` record names closes as `completed`. A malformed, cross-repository,
or duplicate record, or a delivery that is not verified, is a hold with a named
reason and no write. Every close posts one `## Closure evidence` comment
(marker `<!-- dod-guard-closure-evidence -->`) before the issue closes, so a
rerun never posts a second one.

A comment is a record only when its body begins with the record heading, a
blank line, and the marker line, which is the shape the helper writes. A
comment that quotes a marker anywhere else, such as a handoff or a review, is
never edited, counted, or parsed as a record.

An issue this helper closed whose Project status is not Done is planned as a
status repair, so a rerun finishes a stopped Done write without a second
comment or close.

After any close, the helper walks to the closed issue's parent and closes it as
`completed` when every sub-issue is closed with verified evidence or superseded
by a verified root, no linked pull request is open, and no unchecked acceptance
criterion outside a sub-issue remains. The walk stops at the first parent that
does not qualify, or after five levels. A record that is already closed or Done
without verified evidence is reported as `unverified-closed` and is never
reopened or edited.

`refine-backlog-item` closes a pure hierarchy record as `not_planned`: an issue
with no linked pull request, no unchecked criterion outside its sub-issues, and
every sub-issue either settled or named by an existing root's `supersedes`
record. An original that still owns delivery scope stays open until its root's
delivery is verified.

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
to its owner. Every acceptance criterion and matrix row has fresh evidence at
the exact head. No item is
contradicted or unresolved. The
required-context and base/mergeability
checkpoint must also be stable at that exact head. `/review-pr` then reviews
that head; neither record is copied into a second review
ledger.

An incomplete or contradicted result is not reported as complete. Write the
actionable remainder, with the next task and owner, to the PBI and stop before
creating or updating the draft PR. After a failed or ambiguous write, read back
that resource before retrying, as the shared GitHub standard requires. The
ordinary small-fix path bypasses these records and uses its direct issue,
commit, test, and review evidence instead.
