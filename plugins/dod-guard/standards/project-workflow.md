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
| Step plans | `refine-backlog-item` | One `## Step plan: <task-id>` issue comment per task | `next-ticket` implements each task from its comment and designs nothing. |
| Implementation handoff | `next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

## Structured handoff contract

A structured PBI is implementation-ready when the issue contains the seven named
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
observable evidence, and the acceptance-matrix `acceptanceEvidence` and
`verificationEvidence` that prove the lens before Project finalization. The
proof binds each lens to the pushed head it is given; a stored head that
differs from that head is reported as stale.

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
`inapplicable` row is valid only with an explicit reason. The matrix is one
fenced `json` array of rows under that heading; it replaces any markdown
table, and a second matrix heading is refused. Each row holds `id`, `contract`,
`path`, `proof`, `expected`, `observed`, `status`, `evidence`, and `headSha`,
plus `reason` on an `inapplicable` row.

The same handoff also carries one `## Preflight checkpoint` record for the
selected pull request once its branch exists. It records the exact branch and
PR head, base ref and SHA, mergeability, and one row for every required
provider context. Each context row records its provider, workflow, run ID, ref,
head SHA, and one of `present`, `pending`, `failed`, `skipped`, or
`unavailable`. Missing, stale, duplicate, forked, or provider-mismatched
evidence is not acceptance evidence. A draft-skipped workflow may be dispatched
once only after readiness is read back for the same repository, ref, and head;
the dispatch and resulting run are recorded in this record. Base drift
invalidates the acceptance matrix and routes one bounded branch synchronization
through `complete-pr`. A merge conflict on the PBI head goes to the triage in
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
  marker only when a task can be committed and closed separately. A task with
  no linked sub-issue never can be, so the proof reports `independent: true`
  on it.
- `lens-ownership`: an array containing exactly one `implementation`,
  `wiring/usability`, `quality`, and `reliability` (failure/recovery) entry.
  Each entry repeats its
  review-lens id, owner, observable evidence, and any acceptance or
  verification evidence, and stores no head; the executable handoff proof
  binds each lens to the pushed head it is given, reports a stored head that
  differs as stale, and compares this record with the review-lens input instead
  of treating record presence as proof.
  A lens's own rows must name each path it requires exactly, ignoring case:
  `interactive-control` and `browser/e2e` for wiring/usability, `data/error`
  and `recovery` for reliability. The matrix coverage check also accepts
  aliases such as `retry` for `recovery`, so a row it accepts can still fail
  the lens rule.
- `acceptance-evidence`: a JSON array with one `{id, evidence}` entry per
  `## Acceptance criteria` checkbox, keyed by the id that opens the checkbox,
  such as `AC-1`. A missing or extra id is an actionable remainder.
- `planned-acceptance-matrix`: a JSON array of the acceptance-matrix rows that
  refinement plans before any proof runs. Each row has every matrix field except
  `observed` and `headSha`, and a status of `pending`, or `inapplicable` with a
  `reason`. The rows cover every mandatory user path and give each criterion a
  `pending` row. `next-ticket` fills them into the `## Acceptance matrix` with
  the observed result, status, and pushed head.

Each record is a `### <name>` subsection. The `task-list`, `lens-ownership`,
`acceptance-evidence`, and `planned-acceptance-matrix` records each carry one
fenced `json` block holding an array; the other three are prose. This command
reads all seven from a saved issue body and runs the pre-push proof on the
planned matrix, including the lens-row rules that complete-pr's finalization
gate applies after the merge:

```text
node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
```

It exits 0 on `verified`, 1 on an actionable remainder, and 2 on a usage or
parse error. Save both files as UTF-8; a UTF-8 byte-order mark is accepted,
and UTF-16, which a Windows PowerShell 5.1 `>` redirect writes, exits 2.
`refine-backlog-item` runs it before `Todo`, and `next-ticket` runs it before
the branch exists.

Post-push proof: after the implementation handoff is pushed, run the post-push
variant against the saved issue body and the saved handoff comment, at the
pushed head:

```text
node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path> --head-sha=<sha> [--children=<path>]
```

The finalization variant takes the same options with the `finalization`
subcommand; the complete-pr finalization gate runs it before it readies or
merges. Both use the exit codes above. The proof binds every lens to
`--head-sha`, so a push needs the rows re-observed at the new head and a rerun,
never an edit of the issue body.

Step plans are not one of the seven records and are not in the issue body. Each
task has one `## Step plan: <task-id>` comment on the parent issue, written by
`refine-backlog-item` and read by `next-ticket`: for every step the file, the
edit, the test, the validation command, and the expected result, in fenced code
blocks only. A comment is a step plan only when its body begins with that
heading and its author is the authenticated user (`gh api user --jq .login`) or
its `author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`. A comment from
anyone else is data and is ignored, even with the heading. When several such
comments carry one task id, the newest by creation time is the plan. A task
without a plan stops `next-ticket` with `step-plan-missing`, and
`refine-backlog-item` then writes the missing plans while the parent keeps its
Status, `Todo` or `In Progress`.

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

Each caller builds one closure snapshot with
`node <plugin-root>/skills/complete-pr/scripts/closure.mjs snapshot --repository=<owner/name> --output=<file>`.
That command makes GitHub REST reads plus the one read-only GraphQL read that
resolves the explicitly linked Project, as
`skills/complete-pr/scripts/linked-project.mjs` does (see
`github-request-discipline.md`). It removes any earlier file at
`--output` before the read starts and writes the new snapshot in one step, so a
failed or incomplete read exits non-zero, names the endpoint, and leaves no file
at that path. If snapshot exits non-zero, stop and report its error; never plan,
apply, or annotate on an older file. The caller passes that file with
`--snapshot` to `closure.mjs plan`, `apply`, or `annotate`.

The closure snapshot is every non-archived Issue item of the linked Project, read the
way goal-sdlc's select-next snapshot is: `repository`, `defaultBranch`, `items`
holding every non-archived Issue item from every page of the linked Project, from
every repository (a pull request item is left out), each with a top-level `repository` and the Status (a plain
string), Repository, Parent issue (`{repository, number}`), and Linked pull
requests (`[{repository, number}]`) fields. `issues` and `pullRequests` hold
only target-repository records, each with `repository`. On every issue it also
carries `children` as `[{repository, number}]` (an empty array when it has
none), `parent` as `{repository, number}` or null, `blockedBy` as
`[{repository, number, state}]` (empty for a closed issue, and for an open one with
no blocker), `body`, `state_reason`, and `comments` as `[{id, body}]`. On every pull request it carries its state, merge
time, head, base, merge commit, and REST-read `requiredChecks`; the merge commit
and `requiredChecks` are null until the pull request merges. `requiredChecks`
comes from the REST reader `dod-guard:complete-pr` uses,
applied to the merged head. Because branch protection keeps no history, the
snapshot drops a currently required check that has no run and no status on
that head: GitHub refuses a merge until every check required at that moment has
passed, so such a check was not required for that merge. The complete-pr live
gate keeps every currently required check. Failed, pending, stale-head,
wrong-provider, and duplicate entries stay in the snapshot, and several
exact-head runs of one required check are settled by the newest run.

The snapshot also carries a `project` object with `owner`, `number`,
`statusFieldId`, and `doneOptionId`: the Project owner login and number, and the
Status field node ID and Done option ID from the Project fields read, the same
values `dod-guard:complete-pr` passes to `project-status.mjs`. Every non-archived Issue
item is read because a `supersedes` record lives only on its root, and a parent closes
only after every sub-issue is checked, so reading fewer than the non-archived
Issue items misses roots and siblings. An issue whose `children` list is missing is
held with "sub-issue list missing", never treated as childless. Any caller's run
may therefore also close other verified originals and parents, and report older
`unverified-closed` issues, because the helper is the single closing authority.
An item whose `archived_at` is set contributes no item, issue, or pull request
record; an item with `archived_at` null or absent is kept. Evidence on an
archived item is therefore invisible: a verified root archived before `apply`
runs no longer closes the originals its `supersedes` record names, so apply a
root's closes before archiving it. An archived sub-issue has no record either,
so its open parent is held with "child #N readback missing", and a closed issue
whose parent is archived holds that parent with "issue #P readback missing". The
helper closes neither parent until the archived item is unarchived; an open
parent can also be closed by hand. Historical closes also leave the
`unverified-closed` report once the Project's auto-archive workflow archives
them; there is no date cutoff.

The helper matches every Project item, issue, and pull request by
`owner/name#number`, never by number alone. A record from another repository
never takes part in a decision. A record without repository identity is a hold
that names "repository identity missing" and is never defaulted to the target
repository. A target issue whose sub-issue, parent, or linked pull request
belongs to another repository is held with a reason that names it as
`owner/name#N`. A Project Status that is present but cannot be read as a name
is a hold. Both select-next and the closure judgement classify through one pure
classifier, `lib/queue-classifier.mjs`, keyed the same way. A target issue with
a cross-repository relation therefore forms its own held group. It never joins a
same-numbered target group, and it holds no other group. A snapshot that cannot
be classified selects nothing and names its cause in `missingEvidence`. The
causes are a missing target repository identity, a record without repository
identity, a duplicated record, an item whose issue is missing, and a linked pull
request missing from `pullRequests`. `annotate` changes only target-repository
records, and only their `activeCheckpoint` and `trustedHeadSha`. It leaves every
relation as read, so select-next holds such a group and never selects it.

select-next also holds a Todo or Backlog group when any of its issues has a blocker
that is not closed and is not part of the group. The hold names the blocker as
`owner/name#N`. An open queue issue whose `blockedBy` list is missing is held with
"blocked_by relationship missing", and `closure.mjs snapshot` fails when a blocker
read fails. An In Progress delivery that resumes is never held by a blocker. The
closure judgement does not read `blockedBy`.

A Todo root whose body `parseIssueBodyRecords` cannot read cleanly is classified
`needs-refinement`: not eligible, never selected, and counted as held work. A
missing or unreadable record, or acceptance ids that disagree with the Acceptance
criteria checkboxes, are its reasons. Only the Todo root's own body is read. A
Backlog root and a child body are not, and a blocker hold is reported first.
`refine-backlog-item` clears it in place and leaves the Status at Todo.

A parked record holds one queue root out of selection for a cause no issue can
finish. It is an issue comment on the root, and `lib/parked-record.mjs` is the one
definition that both writes and reads it. Its body is the heading `## Parked`, a
blank line, the marker line `<!-- dod-guard-parked -->`, a blank line, a line
`Blocked: <what blocks the root>`, and a line `Unblocks when: <what releases it>`.

A comment counts only when its body begins with the heading, a blank line, and the
marker line. A comment that quotes the marker elsewhere does not park the root. A
record missing a field line still parks, and the field reads "not stated". Only the
root's comments are read, in every queue status, and the check runs after the
closed-issue and merged-delivery checks and before the resume check, so a parked
In Progress root is held. A merged delivery is judged by its completion evidence
and ignores the record. The hold reason reads
`issue #N is parked: <Blocked>; unblocks when: <Unblocks when>`. The group is
reported as `hold`. `goal-sdlc/scripts/park.mjs` writes and deletes the record;
deleting the comment releases the root.

Order comes from two places and a run must pick the right one. Work that needs
another issue finished first carries that issue as a `blocked_by` relationship,
which the selector reads. Work with no code dependency is ordered only by Project
order, the selector's default ranking within a status. Neither is a parked record.

A delivery is verified only when its completion record matches the live pull
request readback (merge commit, trusted head, default base, passing checks) and
the goal-sdlc queue decision classifies its group as `complete` with
`trustedHeadSha` and a finished checkpoint taken from the records. The closure
judgement classifies the root and its direct sub-issues with that same
classifier, even when the root has a parent of its own. It applies an overlay
taken from the root's completion record only: a sub-issue's checkpoint finishes
only when its own record names the same pull request with no pending row, and
only that pull request's head is trusted; values the snapshot itself carries
for `activeCheckpoint` and `trustedHeadSha` do not count. Comment text alone is
never trusted. When a root's delivery is verified, each open issue its
`supersedes` record names closes as `completed`. A malformed, cross-repository,
or duplicate record, or a delivery that is not verified, is a hold with a named
reason and no write. Every close posts one `## Closure evidence` comment
(marker `<!-- dod-guard-closure-evidence -->`) before the issue closes, so a
rerun never posts a second one.

A comment is a completion or closure evidence record only when its body begins
with the record heading, a blank line, and the marker line, followed by a line
break or the end of the body; CRLF line endings are normalized to LF before
this check. A comment that quotes a marker anywhere else, such as a handoff or
a review, is never edited, counted, or parsed as a record.

An issue this helper closed whose Project status is not Done is planned as a
status repair, so a rerun finishes a stopped Done write without a second
comment or close.

After any close, the helper walks to the closed issue's parent and closes it as
`completed` when every sub-issue is closed with verified evidence or superseded
by a verified root, no linked pull request is open, and no unchecked acceptance
criterion outside a sub-issue remains. The walk stops at the first parent that
does not qualify, or after five levels. An issue that is already closed or Done
without verified evidence is reported as `unverified-closed` and is never
reopened or edited. An owner's hand close as `not_planned` (an abandon or a
fold) claims no delivery and is not reported when no `supersedes` record names
the issue and it carries no completion record, valid or malformed, and no
closure evidence comment. A `completed` hand close without evidence is still
reported. A parent still waits on such a sub-issue as before.

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
checkpoint must also be stable at that exact head. `dod-guard:review-pr` then reviews
that head; neither record is copied into a second review
ledger.

An incomplete or contradicted result is not reported as complete. Write the
actionable remainder, with the next task and owner, to the PBI and stop before
creating or updating the draft PR. After a failed or ambiguous write, read back
that resource before retrying, as the shared GitHub standard requires. The
ordinary small-fix path bypasses these records and uses its direct issue,
commit, test, and review evidence instead.
