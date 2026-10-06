---
name: goal-sdlc
description: Provide full continuous-delivery guidance during built-in /goal runs while preserving goal ownership, delegated work, and existing lifecycle skill contracts.
---

# Goal SDLC

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

This is a supporting skill for built-in `/goal` runs. It does not implement,
replace, or claim the built-in `/goal` command; the built-in command owns goal
persistence and continuation. Existing lifecycle skills remain authoritative:
this skill composes their contracts instead of creating a second delivery
framework.

## Delegation contract

The main thread is the high-level orchestrator. For every real work step:

1. Record one bounded checkpoint with the parent/child PBI, current branch and
   head, owned responsibility, required evidence, and applicable instructions.
2. Dispatch at least one fresh subagent with only that bounded brief. The
   subagent may edit only its owned scope and must return exact results and
   evidence; it must not choose the next step or mutate an unrelated PBI.
3. Inspect the result, read back any external mutation, and run the named proof
   before advancing the checkpoint.
4. Preserve the checkpoint on failure or interruption; repair the same step or
   record an external blocker before selecting another parent.

Context-heavy execution belongs in the bounded subagent, not in the main
thread's working context. Put repository discovery, large source or history
reads, implementation, validation preparation, and noisy test output in the
subagent brief. Return a compact handoff containing changed paths, commands,
results, and exact evidence instead of pasting the full context back. The main
thread supplies the snapshot, owns sequencing and external mutations, reads
back their results, and runs the named proof; it must not redo unchanged
context work just to reconstruct a handoff.

Use subagents only for bounded work that benefits from independent context or
real parallelism. Do not delegate workflow rereads, compaction recovery, or
unchanged-state checks; reuse the handoff snapshot instead.

Subagents are the only delegation mechanism for real work. Do not use
user-visible Codex tasks or threads as workers, and do not satisfy this
contract with `create_thread`, `fork_thread`, `send_message_to_thread`, or a
`codex://threads/...` task; those create peer tasks, not subagents.

Keep each subagent short-lived and scoped to one bounded responsibility. Reuse
the same subagent only while its cumulative context remains below approximately
100,000 tokens and the responsibility is unchanged. If its context is already
over that boundary, or the next call would cross it, terminate the subagent
before sending another call and start a fresh one with only the compact
checkpoint, changed paths, exact commands and results, and remaining work.

Run telemetry is part of every handoff. Prefix progress and status messages
with the local 24-hour `[HH:MM]` timestamp. Carry a `PBIs completed: N` counter
in the goal snapshot, initialize it from the latest surviving handoff or zero,
and increment it only after one parent PBI is merged and its final Project
status is read back. Do not count a child, a draft PR, or implementation-
complete work as a completed PBI.

Codex's built-in checks cover ordinary PR/code-review validation. The main
thread still owns sequencing, evidence verification, mutation decisions, and
the built-in goal's stop condition. Handle any externally supplied findings
before `complete-pr` as described in section 6.

## Shared-checkout ownership handshake

The existing goal/PBI handoff is the ownership record for a shared checkout.
Do not create a lock file, local coordination ledger, hidden ref, or second
review record. Before selecting or delegating a checkpoint, read active peer
goal or agent runs and the latest handoff for the same repository, parent and
child PBI, branch, and owned responsibility. Missing, stale, or conflicting
evidence is unsafe; it is not permission to guess.

Each active checkpoint has one canonical owner record with these values:

- owner handle: the active goal or subagent handle that owns the checkpoint;
- repository: the exact `nameWithOwner` value;
- parent and child PBI: the parent number and optional child number;
- branch and head: the exact branch ref and observed commit SHA; and
- responsibility and observed-at: the bounded checkpoint and its read time.

Treat repository, parent and child PBI, branch, and responsibility as the
logical scope. Head and handoff revision are volatile evidence for that scope.
When one active peer matches the logical scope and the exact evidence, keep
that peer's owner handle canonical and return a wait/no-mutation result. Do not dispatch, switch or
edit the checkout, assign or move an issue, commit,
push, create a pull request, or write a second handoff record. The waiting run's mutation list is
empty; it waits for the owner to finish and then performs a fresh read.

An active peer with complete identity in the same logical scope but a changed
head or handoff revision is stale conflicting evidence, not an absent peer.
Treat any such peer, alone or alongside an exact peer, as a conflict and fail
closed with its handle as the recovery owner. A peer that appears between the
no-peer read and the claim is the same conflict; do not let the first read
authorize a second writer.

When no active peer in the logical scope exists, read the local branch, remote
branch, and latest handoff immediately before claiming the checkpoint. Record
the current handle, exact branch, exact head, and responsibility in the
existing handoff, read it back, and dispatch only after that exact identity is stable.
If a peer appears or any identity changes during the claim, stop without
mutation and return the conflicting owner or a named recovery owner.

Before every later write, refresh the branch ref, remote head, and existing
handoff. A peer write, branch movement, changed handoff, or head mismatch
invalidates the old owner evidence. Do not append a competing owner or repair
stale evidence with a hidden state channel. Refresh once at the exact head;
only then may the owning lifecycle skill continue with commit, push, pull
request, review, or completion work.

Missing owner evidence, duplicate owners, stale same-scope peers, unexpected
branch movement, and stale handoffs fail closed with an actionable recovery owner.
The failure leaves the checkout and GitHub administration untouched until the
recovery owner has fresh exact-head and remote evidence.

## Acceptance matrix contract

Every structured PBI uses one compact acceptance matrix in its GitHub
implementation handoff. It has one row for each parent acceptance criterion
and each mandatory user-facing path. A row records `id`, contract or criterion,
risk or user path, proof action, expected observable, observed result, status,
evidence location, and the exact pushed branch head SHA.

The only row statuses are `pass`, `unverified`, `failed`, `blocked`, and
`inapplicable`. `inapplicable` is valid only with an explicit reason. Missing
fields, a non-passing status, or a row bound to another head stops PR and
Review Summary convergence. A later pushed head invalidates every row and
requires fresh evidence.

When applicable, the matrix names identity/authorization, interactive controls
such as zoom or pan, behavioral browser or end-to-end paths, data/error
boundaries, and recovery behavior. Each category still gets an explicit
inapplicable row when the PBI does not expose that path. The same matrix is
carried from the handoff into `submit-draft-pr` convergence and Codex's
built-in Review Summary; it is not a local ledger or a numeric quality gate.

## Exact-head pre-review checkpoint

Before Codex's built-in Review Summary or guarded completion, run one
read-before-write checkpoint for the selected pull request. The checkpoint is
part of the existing implementation handoff and never becomes a second ledger.

1. Read the same-repository branch ref and the pull request at one exact pushed
   head. Record the branch ref, branch head SHA, PR head SHA, base ref, base
   SHA, and mergeability before trusting any acceptance or review evidence.
2. Enumerate every required provider context from the live branch-protection
   or provider response. Record one row per context with its name, provider,
   workflow, run ID, branch ref, exact head SHA, observed provider state, and
   the normalized state `present`, `pending`, `failed`, `skipped`, or
   `unavailable`. Classic status-only contexts may omit workflow and run ID, but
   still require the observed provider, repository ref, and exact head. A
   missing, malformed, stale, duplicate, forked, or provider-mismatched row is
   `unavailable`, not success.
3. If a draft lifecycle skipped a required workflow, read back draft readiness
   first, then dispatch that workflow at most once for the same repository,
   branch ref, and exact head. Record the workflow, ref, run ID, and resulting
   head SHA from the dispatch readback before proceeding. A workflow without a
   supported dispatch path is a fail-closed stop.
4. If the base ref or SHA advances, or mergeability becomes conflicting, mark
   the acceptance matrix stale. Route one bounded synchronization through the
   existing `complete-pr` owner, read back the final branch and PR heads, and
   rerun acceptance, required-context, and real-data proof at that final head.
   Unexpected branch movement, unresolved conflicts, provider failure, or an
   exhausted synchronization bound stops before review resolution, merge, or
   cleanup.

`submit-draft-pr` owns draft creation and read-only convergence; `complete-pr`
retains the existing provider dispatch, exact-head, branch-update, conflict,
merge, and cleanup safeguards. This checkpoint orchestrates their evidence
early; it does not force-push, write generated refs, call `update-branch` as
metadata repair, invoke manual review, or edit an external checkout.

## Review trigger lifecycle

Codex's built-in Review Summary is the only review authority. Read the pull
request's current review state and exact head before deciding whether a review
trigger is allowed; the GitHub pull request and its comments are the durable
record.

- A completed Review Summary suppresses every later review trigger for that
  pull request, including after follow-up remediation commits. Carry the
  reviewed head, current head, findings, and resolved-finding evidence through
  `fix-pr-review` instead of starting another review.
- If no Review Summary exists and the automatic review has not started after
  the required two-minute wait, emit exactly one `@codex review` trigger for
  that pull request and exact head. Record that the fallback was sent; never
  emit a second trigger for the same PR.
- If the automatic review is started, its state is unavailable, the wait is
  incomplete, or the current head is missing, wait or stop with the named
  evidence. Do not guess that a quiet operation failed and do not trigger a
  duplicate review.
- The pure decision boundary is
  `skills/goal-sdlc/scripts/lib/review-trigger.mjs`; it has no timer, provider
  mutation, or local review ledger.

## Contract ownership

- Built-in `/goal` owns goal persistence, continuation, and the final stop
  decision.
- `$dod-guard:next-ticket` owns one PBI's implementation branch, evidence, and
  pushed handoff.
- `$dod-guard:submit-draft-pr` owns PR creation and convergence before completion.
- `$dod-guard:fix-pr-review` owns remediation of externally supplied findings;
  `$dod-guard:complete-pr` owns the guarded merge gate.
- This skill owns only the queue-level orchestration and bounded delegation
  between those existing owners.

Referenced `dod-guard` skills resolve by name under the active plugin root, not
by cached absolute or versioned paths.

Do not infer workflow authority from files merely present in the repository.
Read a project-local process document only when the user explicitly names it or
an active skill requires a specific artifact from it; otherwise use this skill,
the active lifecycle skills, and scoped `AGENTS.md` instructions only. If a
requested cached or versioned skill path is missing, resolve the skill by name
under the active plugin root instead of substituting a local process document.

## Source Workflow

Operate as a continuous delivery worker for the current repository and its linked GitHub Project.

Never copy a cached absolute path or plugin version into a handoff, ledger,
issue, or progress message; the relative links in this skill are the stable
source references:
[$dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md),
[$dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md),
[$dod-guard:next-ticket](../next-ticket/SKILL.md),
[$dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md),
[$dod-guard:complete-pr](../complete-pr/SKILL.md).

target project: the single open GitHub Project explicitly linked to the current repository
target repo: based on what is in the current working directory

### Checkout and execution policy

- Work only in the current repository checkout. Git worktrees are prohibited: do not create, use, register, switch to, prune, remove, or clean them up. If a skill or tool requires a worktree, do not use it; choose a same-checkout path or record the incompatibility as a blocker.
- Process exactly one parent PBI/delivery unit at a time, sequentially. Finish and verify it before selecting the next. Do not implement, mutate, validate, or deliver multiple PBIs in parallel.
- Treat a dirty current checkout as evidence that a task is probably already in progress, not as a reason to stop or declare the queue empty. Match the changed paths, branch, checkpoint, issue, child PBIs, and PR before choosing a new unit; when they match, preserve the edits and resume that task from its latest safe checkpoint.
- If dirty work or an in-progress branch cannot be matched to an existing PBI, create one through `[$dod-guard:add-backlog-idea](../add-backlog-idea/SKILL.md)` from the observed scope and evidence before continuing. Do not discard, reset, stash, overwrite, or silently absorb those edits into an unrelated PBI; refine the new PBI and resume the same work after it is tracked.

Do not stop after merging one PBI. Continue processing eligible work until the queue is empty, the user explicitly stops the goal, or every remaining item is blocked by an external condition with no safe workaround.

Assume the primary model is `gpt-5.6-luna` with `max` reasoning, this is also the model to be used for all subagents. Luna must follow the explicit state machine below; do not infer a shorter or different workflow.

Hard invariants:

- The checkout and execution policy above holds throughout: one parent at a time, sequentially, in the current checkout.
- Each refined parent has a non-duplicated functional decomposition and only
  the linked child PBIs that independently deliver and verify a functional
  slice.
- All linked child and parent-level implementation happens on one branch and
  one PR.
- Do not create or publish a PR until every linked child and parent-level task
  is implementation-complete.
- Use Codex's built-in checks for ordinary PR/code-review validation, and handle
  externally supplied findings as described in section 6.
- After merge, mark every child and its parent complete and read the statuses back.
- Do not routinely ask the user to resolve problems. Make conservative, reversible, repository-consistent choices and continue.

Definitions:

- `implementation-complete`: all linked slice work and parent-level tasks are implemented and verified enough to enter the PR lifecycle.
- `Project Done`: the parent and all linked children are marked complete after the PR is merged and final remote checks pass.
- The parent is implementation-complete when every linked slice and parent-level task is implementation-complete, but Project Done is finalized with the children after merge.
- “Pre-existing” is not a deferral reason for a failure in a touched path, required suite, user-facing flow, or required gate.

### Continuous queue loop

Repeat this loop after every completed delivery unit:

### State snapshot and read discipline

Resolve the repository, linked Project, queue, selected parent and children, pull requests, branch heads, checks, permissions, and unrelated work once at goal start. Carry that read-only snapshot through the delivery loop.

Reuse snapshot data until it is invalidated. Invalidate it only after a mutation, a known remote change, a failed or timed-out operation, a user steering message, or a phase boundary that changes the relevant state.

Do not repeat identical issue, Project, PBI, pull-request, or queue reads inside one phase. If a helper needs data already in the snapshot, pass it through instead of querying the provider again. Batch only missing reads.

Pass the snapshot into each skill handoff. A skill may read a field it was not given, or an invalidated field, but it must not rerun discovery solely because the lifecycle phase changed.

Before broad delegation, run a short external-prerequisite preflight for the selected delivery unit: source/provenance rights, publish or cache policy, credentials, remote permissions, and provider capabilities required by the next mutation. Resolve facts already established by repository or provider state without asking the user. If a prerequisite is genuinely missing, do not fan out dependent subagents; preserve the checkpoint, record the exact missing prerequisite, and isolate only that parent while the queue continues.

For a confirmed prerequisite, checkout, or provider blocker, record one blocker owner and one bounded next recovery action in the handoff snapshot. Do not dispatch duplicate subagents or repeat an unchanged audit; add another independent advisor only after the first recovery path produces new evidence.

Context compaction is not state invalidation. When a continuation rereads this workflow file, restore the latest handoff snapshot first. Do not rerun repository, Project, issue, PBI, pull-request, or queue discovery unless the snapshot is missing or invalidated.

Each handoff snapshot must record the snapshot time, selected parent, child and pull-request IDs, relevant branch heads, Project statuses, and the reason for the next refresh. If no snapshot survives compaction, read only the current delivery unit and rebuild the snapshot once.

After a merge, refresh the changed pull request, linked issue, parent and child items, and the next queue selection. Do not reread the entire Project or every PBI unless the snapshot was invalidated.

### 1. Reconcile live state when no valid snapshot exists

Before mutating anything, use the current snapshot. If it is invalid or missing:

- Identify the target repository, remote, linked Project, current checkout/branch, tech stack, PBI statuses, parent/child links, PRs, branch SHAs, checks, permissions, and unrelated changes.
- Treat live remote state as authoritative over stale notes.
- Preserve unrelated user work. Never reset, stash, overwrite, or include it.
- Apply the dirty-checkout rules from the checkout and execution policy before selecting unrelated work.
- Read existing child PBIs and PRs before creating anything only when they are absent from the snapshot or the snapshot was invalidated.
- Repair recoverable orphan states before selecting new work:

  - parent left in Backlog while children or a PR are advanced;

  - completed children with an incomplete parent;

  - an existing PR for the current parent;

  - a branch or checkpoint showing implementation already underway.

- Reconcile the current repository's Project items before selecting a parent:

  - paginate every Project page, filter to the target repository, and group
    parent/child issues with their linked pull requests before deciding
    eligibility;

  - run the read-only adapter at `scripts/lib/queue-readback.mjs` (or the
    equivalent provider implementation under the active plugin root) before
    either `Todo` or `Backlog` selection branch. Request the same `Status`,
    `Linked pull requests`, `Repository`, and `Parent issue` fields on every
    Project page, follow each `pageInfo.nextCursor` until
    `pageInfo.hasNextPage` is false, and filter every returned item by exact
    repository identity before grouping it;

  - read the current issue, parent, and child relationship for each filtered
    item, then read every linked pull request and retain its state, merge
    commit, base ref/SHA, head repository/ref/SHA, and required-check fields
    alongside the Project status. Pass this snapshot to reconciliation and
    queue selection; do not infer missing fields from titles, stale comments,
    or a filtered query;

  - normalize each issue group into one delivery record before classification:
    a real parent owns its observed children, a child points to its parent, a
    parent with no children owns a single-item record, an orphaned child has a
    missing or unobserved parent, and status drift records the parent/child
    Project statuses separately rather than collapsing them into a boolean;
    group by the observed root issue and never select a child record as an
    independent parent;

   - publish one canonical count record from that same complete,
     exact-repository Project snapshot: raw items, parent items, child items,
     parent items with `Done`, and child items with `Done` are separate named
     values. Require the raw total to reconcile with the observed parent and
     child groups and report missing, late, contradictory, or unavailable
     `Parent issue` fields explicitly; never run a second scan or infer a count
     by subtraction from an older snapshot;

  - treat every reconciliation input as an explicit live observation. An
    omitted, unknown, stale, filtered, or provider-unavailable value is not
    `true`; classify the missing evidence as `hold` and report its exact
    field. Record provider availability, acceptance evidence, active
    checkpoints, child grouping, head/base/trust/merge evidence,
    head-to-PR relationship, required checks, linked issue/child closure,
    and Project status separately;

  - classify a record with no merged delivery and no active checkpoint as
    eligible for the normal `Todo`/`Backlog` selection rules;

  - classify a merged delivery as `complete` only when the existing
    `complete-pr` recovery evidence is present: same-repository head,
    default base, active checkpoint explicitly observed as `false`, trusted
    head and merge commit, complete required checks, closed linked issues, and
    `Done` Project statuses for the grouped record;
    exclude it from queue candidates and hand any cleanup to
    `complete-pr` rather than mutating it here;

  - classify a merged delivery with any missing check, open issue or child,
    non-`Done` Project status, unresolved acceptance evidence, provider
    limitation, or head/relationship mismatch as `hold`; exclude it from
    queue candidates, report the exact missing evidence, and preserve its
    live issue and Project state; an orphaned child or parent/child status
    drift is also an explicit hold, never a fresh queue candidate;

  - do not select a held or complete child as an independent parent while
    its grouped parent record is being reconciled. A merged PR, title,
    branch name, stale comment, or filtered query alone is not completion or
    absence evidence.

- Keep this reconciliation read-only and make zero mutation calls. The queue
  skill does not close, reopen, relabel, move, merge, publish, delete branches,
  or mark records `Done`; those mutations remain with the owning lifecycle skill
  after its evidence gates pass.

- If the repository or linked Project cannot be identified safely, use available repository evidence to resolve it. Ask the user only if no safe target can be determined.

### 2. Choose one current delivery unit

Use this precedence:

A. If active PBIs belong to the same parent, group them into one delivery unit.

B. If multiple parent PBIs are already In Progress due to existing state, select one deterministically and leave the others untouched:

- Prefer the parent with an existing PR furthest through the lifecycle.
- Otherwise prefer the parent associated with the current checkout or branch.
- Otherwise use Project priority/order, then oldest creation time as a deterministic tie-breaker.
- Record the selected parent and leave the other parent checkpoints untouched.
- Complete and verify the selected parent before returning to the next queued parent.

C. If the selected parent is genuinely blocked after recovery:

- Preserve its branch, checkpoint, evidence, and current checkout.
- Do not abandon or reset it, and do not create a worktree to unblock it.
- If another eligible parent can progress, serialize the next parent and return to the blocked checkpoint later.
- A blocked parent is not permission to stop the entire goal.
- Do not wait for a user response before making unrelated progress. Revisit the isolated parent only after a distinct recovery action or changed state/evidence.

D. If no parent is active:

- Choose one eligible parent from Todo using current Project priority/order.
- If Todo is empty, choose one eligible Backlog parent and use:

  [$dod-guard:refine-backlog-item](../refine-backlog-item/SKILL.md) with the added instructions listed under Refinement contract

- A `Friction log YYYY-MM-DD` issue dated today or later is not eligible yet, because it is still collecting entries. A log from an earlier day is ordinary Backlog work.
- After refinement, verify the parent and required children are in Todo, then continue implementation.
- If no eligible work exists, finish the loop with a queue-empty result only after checking for dirty or in-progress work and creating a matching PBI when none exists.

Never select a new unrelated parent while the current parent can still be advanced.

### 3. Refinement contract

Refinement happens once per parent delivery unit.

Use the snapshot's existing children first. Read missing children only when the
snapshot is invalidated. Create missing children only when functional
decomposition identifies an independently deliverable and verifiable slice;
never duplicate children or recreate a completed refinement set.

Every refined parent uses functional decomposition. Start from the user actions
and split the outcome into a small set of coherent functional slices. Decompose
each slice only to a useful level that can be independently implemented, tested,
and verified; avoid tiny administrative subtasks. Create one linked child per
useful slice only when independent tracking is useful, and keep dependent steps
in the parent checklist. Do not create children to fill a fixed category list.

Explicitly assess implementation, wiring and end-to-end usability, refactoring
and code quality, and failure/recovery reliability. Attach each concern to its
owning slice or named parent checklist task, and map that owner to observable
evidence in the parent task list.

#### Review lenses

##### A. Implementation

- Implement the requested behavior using existing repository patterns.
- Include precise acceptance criteria and verification.

- The refinement records the functional slices and creates one subtask with
  minimal details only for each independently deliverable slice.

##### B. Wiring and end-to-end usability

- Trace the real user path through the existing UI or supported user-facing surface.
- Create missing entry points, configuration, controls, feedback, error states, and recovery paths.
- Verify the feature is discoverable, invokable, understandable, and usable.
- Exercise the path end to end.
- If live UI automation is unavailable, use the closest available integration path and document the missing evidence; do not silently mark the slice complete.

##### C. Refactoring and quality

- Inspect both new code and nearby code.
- Remove accidental complexity, duplication, dead code, unnecessary abstractions, and spaghetti control flow.
- Prefer deletion and reuse.
- Reduce code or complexity where safe and improve the reported Quality Guard
  evidence; diagnostics are not correctness gates.
- Keep cleanup bounded to the selected feature and directly adjacent code.
- When adjacent cleanup is relevant, keep it bounded and record why no cleanup is safe when applicable.
- The owning slice or parent-level task must either make a justified cleanup or record evidence that no safe cleanup exists.

##### D. Failure/recovery reliability

- Fix errors found in the touched paths, required suites, integration path, or lint/type checks, and act on Quality Guard findings when they identify an in-scope problem.
- Do not label relevant failures “pre-existing” to defer them.
- Truly unrelated failures require evidence and a recovery decision, not silent dismissal.

Each linked child must contain minimal parent context, scope, acceptance criteria, and verification instructions.

After refinement:

- Verify the parent is Todo.
- Verify every linked child exists, is linked, matches one functional slice, and is Todo.
- Verify every named parent checklist task has an owner and observable evidence; when it
  owns cross-cutting work without a child, record the task object with
  `parentLevel: "convergence"` as defined in `standards/project-workflow.md`;
  the task still carries its `id`, implementation `evidence`, and explicit
  `acceptanceEvidence` and `verificationEvidence` fields.
- Verify every declared functional slice is represented by a linked child or an
  explicitly marked parent-level task.
- If the parent remains Backlog, repair the status and read it back before implementation.
- Do not create additional children during implementation unless a genuinely independent acceptance requirement appears; update an existing child whenever possible.
- If the refinement skill cannot satisfy this contract, repair the skill minimally in the plugin cache and record the long-term dod-guard change in today's friction log instead of proceeding with an incomplete plan.

### 4. Implementation and branch rules

For a newly selected Todo parent, use:

  [$dod-guard:next-ticket](../next-ticket/SKILL.md)

For an already-started parent, resume its existing checkpoint and skip completed work.

- Implement every linked functional slice and parent-level task in the current checkout on one branch.
- Keep implementation, UI wiring, E2E work, refactoring, and fixes in that branch and checkout.
- Make one or more new commits for each functional slice or parent-level convergence task.
- Do not create a second branch or PR for the same parent delivery unit.
- Keep the diff bounded by the acceptance criteria.
- Prefer existing helpers, dependencies, patterns, and deletion.
- Do not generate speculative architecture, backwards-compatibility shims, boilerplate, unrelated noise, or huge amounts of code without a demonstrated requirement, every line of code written has an associated maintenance cost that must be considered.
- If the diff grows beyond the acceptance boundary, stop and prune it before continuing.

### 5. Goal-directed validation cadence

Do not spam the full linter, full test suite, or every gate after every edit, not every subtask needs to 100% pass.

Before broad validation gates, run the cheap workspace-loader preflight. It
must check that the workspace requirements can load without discovering the
whole tree. If the loader fails, assign one recovery owner and record the
current head SHA, loader path, exact error, and validation stage before giving
that owner at most one fresh bounded validator retry. Do not fan out duplicate
retries or hide a loader failure inside an application-test result.

If a protected user-owned path prevents broad discovery, record that
environment limitation separately from touched-path acceptance evidence. Keep
the protected path untouched, and list the changed paths, targeted checks, and
their results as the acceptance record; do not claim whole-tree validation
from those focused checks. The limitation does not trigger fan-out, a second
retry, or edits to the protected path. A failed touched-path check remains an
application failure; an unreadable protected path remains an environment
limitation.

During basic implementation:

- Use only small targeted checks needed to prevent obvious dead ends.
- Before committing or pushing, run one focused acceptance check for every
  changed behavior boundary or derived value at the precision used by its real
  consumer. This supplements, rather than replaces, the complete relevant suite.
- Build the wiring while implementing - logging and general observability are always valuable, but defer comprehensive validation until the required workstreams are substantially complete.

At the end of basic work:

1. Run the complete relevant suite once: tests, lint/type checks, integration/E2E checks, and Quality Guard diagnostics where applicable.
2. Group failures by tool and root cause.
3. While repairing a failure, run that failing tool or the narrowest relevant target only.
4. Fix every failure in the selected paths and required gates.
5. If step 1 found failures and they were repaired, run the complete relevant suite once more.
6. If the confirmation suite still fails, repeat the focused-fix loop and another complete confirmation run.
7. Do not rerun unchanged full suites merely for reassurance.
- If the complete suite is resource-limited, run its equivalent partitions sequentially or with reduced parallelism before escalating; keep the environment limitation distinct from a code or quality failure.
- Before claiming the complete suite is green, verify every newly added test or fixture is included by the configured test glob. For generated-artifact drift, record the producer's required working directory and compare exact hashes from that invocation before dispatching another audit; treat a root-cwd mismatch as an environment or procedure issue, not a code failure.

A linked child or parent-level task is not implementation-complete merely because
code compiles. Record acceptance evidence for every slice and task.

### 6. PR completion

When all linked functional slices and parent-level tasks are implementation-complete, use:

  [$dod-guard:submit-draft-pr](../submit-draft-pr/SKILL.md)

After the draft exists, complete the exact-head pre-review checkpoint before
allowing built-in Review Summary to run. Carry its required-context matrix,
dispatch readback, base/mergeability evidence, and any recovery remainder in
the same implementation handoff and Convergence record. A later branch or
base change invalidates the matrix and requires fresh proof; passing tests alone
do not restore stale evidence.

The resulting PR must be published/non-draft (`draft=false`). If the skill creates a draft, publish it using the supported repository operation and verify the remote state.

Codex's built-in checks cover ordinary PR/code-review validation; do not add a
separate reviewer phase. If external review findings are supplied:

- Inspect each finding against the current PR head and the PBI acceptance
  criteria before changing code.
- Fix every valid finding with
  [$dod-guard:fix-pr-review](../fix-pr-review/SKILL.md).
- Run focused checks for repaired areas and the complete relevant suite once.
- Verify the new head SHA, respond to each valid finding, and mark resolved
  finding comments as resolved before `complete-pr`.
- Preserve the checkpoint and record an external blocker for an invalid,
  ambiguous, or unrepairable finding; do not claim completion without the
  required evidence.

Git history and the remote GitHub Project, PBI, pull request, comments, and
checks remain the durable administration record. Do not create or consult a
local review ledger or any other untracked administration file.

The complete relevant validation includes repository-required CI,
static-analysis, security, integration/E2E, and Quality Guard diagnostics;
built-in checks do not replace any required correctness gate.

Then use:

  [$dod-guard:complete-pr](../complete-pr/SKILL.md)

Only complete the PR when:

- It is published and mergeable.
- The current head passes all required checks.
- All child acceptance criteria are satisfied.
- No relevant failure is deferred as “pre-existing” (no part of the application is allowed to be broken on development - development must *ALWAYS* be 100% ready to deploy to production and be 100% usable by real end-users).
- The PR is merged and the merge state is read back.

After merge:

- Do not invoke `[$dod-guard:complete-pr](../complete-pr/SKILL.md)` again after
  merge; the preceding invocation owns the guarded merge, branch cleanup, and
  Project finalization pass.

- Do not write parent, child, branch, or worktree state from this queue skill.
- Read back all parent and child statuses after the completion owner returns.
- If a parent or child is still Backlog, Todo, or In Progress, preserve the
  checkpoint and return to the completion owner before selecting the next
  delivery unit.

### 7. Blocker triage and proactive recovery

For every failed, timed-out, or ambiguous action, follow the failure-recovery
rule in `standards/working-defaults.md`: preserve the checkpoint in the current
checkout, record the exact error with its stage, PBI, and SHA, read back remote
state, classify the failure, apply the smallest repair with its narrow proof,
and resume. Rotate to another eligible parent when this one is externally
blocked.

- A quiet test, reviewer, provider call, or nested command remains attached to
  its active process or session handle. Wait or poll that same handle until it
  reaches terminal state unless the operator explicitly cancels it; a tool
  yield limit is not an operation deadline and never authorizes a blind retry.
  Keep the exact command, redacted provider error, verified bytes, hash, and
  current head together in the evidence record.
- A provider `CreateProcess ... rejected by policy` result is a provider
  rejection, not wrapper cancellation. Preserve it as an external hold without
  killing the active handle or repeating the unchanged operation. The
  `skills/goal-sdlc/scripts/lib/operation-evidence.mjs` boundary keeps those
  evidence classes separate and forbids an unchanged retry.

- Daily friction log: record every encountered issue, execution failure, tooling or runtime defect, workflow friction, or recovery-worthy discrepancy in one PBI per day, titled `Friction log YYYY-MM-DD` with today's local date. Do not create a separate backlog issue per incident. Record it even when the immediate incident is recovered.

  - Dedupe in this order. If today's log already has an entry for the same friction, add the new occurrence to that entry. Otherwise, if one bounded search finds an open non-log PBI that already owns the durable fix, add the incident evidence to that PBI as a comment. Otherwise append a new entry to today's log.
  - Find today's log with one search for an open issue in the target repository titled exactly `Friction log YYYY-MM-DD`. Create it only when none exists, through `add-backlog-idea` as exactly one feature with that exact title. The queue recognizes the log by that title, so a reworded title would get refined the same day. Keep entries under a `## Entries` heading in the body.
  - Later entries edit the same issue body: re-read it, append under `## Entries`, write, and read it back.
  - Each entry is a `###` section with a short title and these fields: what happened (exact error, tool, stage, PBI, and SHA); the workaround used; the durable fix (owning files and the change); and how to verify the fix.
  - The queue holds today's log while it collects entries. After the day ends, the log is ordinary Backlog work: refine it and implement its entries like any other PBI.

- Preserve the current delivery unit and keep implementation out of the incident workaround. The workaround restores safe progress; the durable fix waits in the friction log.

External review-finding remediation may require another attempt after its cause
is repaired; never repeat an unchanged failure blindly.

When a provider returns a rate-limit error or reset time, record the operation,
reset time, and owning checkpoint; assign one wait owner and suppress duplicate
probes or mutations until the reset. Continue unrelated eligible queue work,
then retry the blocked operation once after the reset and read back remote state.
Classify another refusal as an external blocker instead of repeating the same
probe or asking the user to authorize routine work again.

When an external finding or required gate observes a changed branch head or
base ref, assign one ref-reconciliation owner. Invalidate evidence tied to the
old refs, suppress duplicate attestations while refs move, perform one branch
update and remote readback, then recompute and attest the exact target once.
Continue unrelated queue work while reconciliation is blocked; do not stack
parallel ref updates or repeat attestations against moving refs.

For every confirmed blocker that survives local triage, run the advisor that `standards/working-defaults.md` requires, [$dod-guard:codex-advisor](../codex-advisor/SKILL.md), before asking the user or declaring the workflow blocked. Include repository, parent/child PBI, stage, branch, current head SHA, exact error, attempts, constraints, and recovery options. The advisor is advice-only; implement and verify the chosen solution locally.

Do not ask the user to choose a workaround, authorize routine work, or confirm whether to continue until the advisor has supplied its recommendation and the safe local recovery path has been tried. A user question is a last resort for a missing external decision or authorization, not a substitute for blocker triage.

Do not hand routine problems back to the user:

- Infer missing details from the PBI, repository conventions, and existing behavior.
- Choose a conservative, reversible implementation when alternatives are compatible.
- Implement fixes for tool, test, wiring, or repository problems instead of merely reporting them.
- Treat the active workflow request as authorization for routine lifecycle actions already required by this skill, including reads, local edits, targeted checks, commits, pushes, queue/status repair, and bounded recovery. Do not ask permission for these; execute and verify them.
- A provider or tool approval prompt for an action already authorized here is not a new workflow decision: use the configured write route once, then classify any platform refusal as a capability or authorization blocker and continue with another eligible parent instead of repeatedly asking.
- Ask the user only for an irreversible/destructive action, missing credential or authorization, genuinely incompatible requirements, or a decision no repository evidence can resolve.
- If the current parent is blocked but another parent can progress, mark the PBI as blocked, document *why* it is blocked (what is the issue, what solutions did you try, what is the problem that needs solving to unblock), preserve the work so far, then pick a new item from the queue.
- Before marking a parent blocked, refresh its parent/child items, PR, branch, and external blocker once. If remote state changed, invalidate the snapshot and resume; do not carry forward a stale blocked report.
- If all remaining work is externally blocked, preserve durable checkpoints and exact evidence; do not claim completion or fabricate progress.

Blocked-state user-facing response:

- When safe progress must stop because the goal or every eligible delivery unit is blocked, replace progress narration with one brief user-facing message. Do not narrate checkpoint, snapshot, delegation, queue, or audit mechanics.
- Assume the user has zero prior context. Start with `Blocked:` and explain in plain English what was being attempted (repository, PBI number, title, and one-sentence purpose), what is blocking it, the concrete evidence, what recovery was tried, and the one decision or action needed to continue.
- Use one short paragraph or at most five bullets. Translate workflow jargon
  such as “stale acceptance evidence,” “dirty-path disposition,” “state
  reconciliation,” and “goal pass” instead of exposing it.
- If another eligible delivery unit can proceed, keep working and do not send a blocked-stop message. If the user must decide something, ask one concrete question with the safe options and their consequences.
- Keep any required `[HH:MM]` or `PBIs completed: N` telemetry compact; it must not become a second status narrative.

### 8. Quality Guard and cache changes

Quality Guard output is advisory diagnostic evidence. If it reports:

- Separate actual defects from tool failures, unavailable providers, and source
  findings.
- Fix actual findings.
- Keep report, test-quality, and readability evidence current when those paths
  apply.
- Never suppress findings or alter code merely to improve a metric.

Build, test, plugin configuration, workflow validation, lockfile,
generated-file, bundle/package-integrity, and Biome-error checks remain the
correctness gates. Quality Guard output never accepts a commit or merge and
never writes persisted quality state.

If a cached skill or script must be edited:

- Compare it with tracked source first.
- Make the smallest reversible change.
- Validate it.
- Record the exact cache path and behavior change.
- Record the long-term dod-guard repository fix as an entry in today's friction log, as described under the daily friction log rule.
- A cache-only fix is not proof that the tracked plugin is fixed.

### 9. Common-sense completion and continuation

Never cut:

- Security or validation.
- Accessibility basics.
- Data-integrity safeguards.
- Required acceptance criteria.
- Required tests, checks, UI wiring, or Quality Guard evidence.

You may cut speculative polish, unrelated cleanup, and unnecessary abstractions. Document each deliberate shortcut, its known ceiling, impact, and follow-up.

After every successful merge:

* let `[$dod-guard:complete-pr](../complete-pr/SKILL.md)` delete the local and
  remote copy of the exact merged branch after its head and merge state are
  verified; this queue skill never sweeps unrelated refs
* increment `PBIs completed: N` only after the parent and child Project
  statuses are read back, and include the updated count in the next `[HH:MM]`
  progress message
* before reporting throughput or selecting the next item, fully paginate the
  authoritative Project items and count parent PBIs and child PBIs separately;
  never infer either count by incrementing a prior snapshot or by subtracting
  one total from another

- If the merge changed queue state, refresh the affected items and select the next eligible delivery unit once. Otherwise select from the current snapshot.
- Continue the same goal loop.
- Do not mark the goal complete after one PBI.

Mark the goal complete only when no eligible work remains or the user explicitly ends it. Before marking the goal blocked, refresh every remaining parent/child/PR state and the external blocker once. Mark it blocked only after the same external blocker remains unresolved across three evidence-backed attempts/goal turns. Never use “two active PBIs” as a reason to stop. never stop when todo is empty but the backlog is not.
