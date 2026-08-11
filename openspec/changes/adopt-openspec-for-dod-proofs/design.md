## Context

See `proposal.md` for the why. This document covers items 7 to 41 of
`docs/plans/2026-08-11-openspec-migration.md`. Phase 0 (items 1 to 6) is
already done by the session that proposed this change.

The custom schema rests on a docs claim, not a run: that
`openspec/schemas/<name>/schema.yaml` accepts a user-defined artifact with an
`id`, an `outputPath` and a `requires` list. Item 7 in the tasks below is
where that claim gets tested. If it fails, the `dod` and `steps` artifacts
in this design do not exist and the plan needs reworking before any other
task proceeds.

Execution runs in four `/step-by-step` sessions, detailed in
`docs/plans/2026-08-11-openspec-execution.md`. Sessions 1 to 4 build against
a local `dist/bundle.js`, because the deployed plugin cannot see this
repo's own changes until release. Session 5, the release and the
acceptance test, is not part of this change's task list. It runs by hand
through `/publish`.

## Goals / Non-Goals

**Goals:**
- One scenario maps to one DoD leaf, checked in both directions by
  `dod-guard trace`.
- The DoD is generated, never hand-maintained twice.
- `/interview`, `/step-by-step` and `/cheap-step` read from and write to
  OpenSpec artifacts as their default flow.
- An `ASSUMPTION:` comment convention exists with a counting rule and an
  audit, so an unbacked guess is visible and gets rechecked.

**Non-Goals:**
- A standalone `decisions.md`. An accepted OpenSpec requirement is the
  decision record.
- A traceability matrix or web UI beyond `dod-guard trace`'s report.
- Rewriting the fingerprint algorithm itself. The design keeps it as is and
  works around it (see Decisions, fingerprint).
- Testing the rewritten skills under the deployed plugin. That is session 5,
  outside this change's task list.

## Decisions

### The DoD is a schema artifact, not a file bolted on beside the change
Making `dod` an artifact with `requires: [specs]` lets `openspec status`
track it and lets `applyRequires` block implementation on it existing.
Alternative considered: generate `dod.md` as a side effect of some other
step, outside the schema. Rejected, because then `status` cannot see it and
nothing stops a change from reaching `apply` without proofs.

### Regeneration keeps the fingerprint by diffing at the leaf level
Item 14's open risk: can a regenerated DoD pass the tamper fingerprint
without weakening it? The fingerprint exists to catch someone hand-editing
a leaf's proof or verdict outside the tool. A regeneration triggered by a
spec edit is not that threat, but a naive "regenerate the whole file and
re-import" would blow away every fingerprint, checked or not. That would
let a real tamper edit sitting next to a legitimate spec change slip
through unnoticed.

The converter therefore diffs the previous DoD against the newly generated
one at the leaf level. It keys the diff on the requirement heading and the
scenario text driving each leaf. A leaf whose source scenario is unchanged
keeps its existing intent, proof command and fingerprint untouched. Only
leaves whose scenario text changed get rewritten, and only those get a
fresh fingerprint on re-import. `dod_amend` already supports amending a
subset of leaves. The converter calls it per changed leaf rather than
replacing the file wholesale. If `dod_amend` cannot target a leaf subset,
that gap blocks item 14's task. It forces a design change, not a
workaround that touches every leaf.

Alternative considered: regenerate and re-import the whole file every time,
accepting that fingerprints reset. Rejected: it cannot distinguish "the spec
changed here" from "someone edited an unrelated leaf by hand," which is the
exact drift item 15's closure check exists to catch.

### trace checks two directions, not one combined pass
Leaf-to-scenario and scenario-to-leaf are different failure modes: an
unasked-for proof versus an unproven claim. Keeping them as two named checks
in one command's report (rather than a single pass/fail) lets each fail
independently. It also lets the leaf-to-scenario direction block while the
scenario-to-leaf direction only reports. A single merged check would force
both to share one severity, which the closure rule in the migration plan
explicitly rejects.

### Skill rewrites land dormant, then release, then get tested
Sessions 1 to 4 write skill and agent files but run under the currently
deployed plugin, which cannot execute its own in-repo edits. Alternative
considered: test each skill change by hand outside `/step-by-step` during
the session. Rejected as out of scope for this change: the plan names
session 5 as the first point any of it is verified end to end.
Duplicating that inside session 3 or 4 would not use the real orchestrator.

### assumption-marker is a new rule, not a todo-marker exception
`todo-marker` already exists and would catch `ASSUMPTION:` as a marker
comment. Adding a bypass inside `todo-marker` couples two unrelated
conventions. A separate `assumption-marker` rule, checked before
`todo-marker` runs (or with `todo-marker`'s pattern narrowed to exclude the
`ASSUMPTION:` prefix), keeps the two independent. One still fails a scan,
and the other only counts.

## Risks / Trade-offs

- [The custom schema doc claim, items 7 and 21, might not hold when run] ->
  Session 1 tests `openspec schema fork` and `openspec schema validate`
  before any other task proceeds. If the artifact fields do
  not work as documented, this whole change needs rework before continuing.
- [Diffing leaves during regeneration adds complexity to the converter,
  beyond a naive whole-file replace] -> Keep the diff key narrow
  (requirement heading, scenario text). That keeps the comparison simple.
  If `dod_amend` cannot target individual leaves, surface that as a blocker
  on item 14 rather than building a workaround.
- [Skill rewrites in sessions 3 and 4 ship unverified against the real
  orchestrator] -> Session 5's acceptance test is the named gate. This
  change's task list does not close until that test runs, even though the
  tasks that write the skill files can be marked done earlier.
- [Two sources of truth if someone hand-edits a generated dod.md] ->
  `dod-guard trace`'s leaf-to-scenario direction is the catch: a hand-added
  leaf traces to nothing and fails the gate.

## Migration Plan

1. Session 1 (already run, outside this change's task list) installed
   OpenSpec and proposed this change.
2. Session 2 builds the seam: schema fork, `dod` artifact, converter,
   `dod_import` wiring, fingerprint handling, `dod-guard trace`. Test-first,
   dispatched to `dod-guard:step-tdd-implementer`.
3. Session 3 rewrites `/step-by-step` and `/cheap-step`. Files land in the
   repo but stay dormant until release.
4. Session 4 rewrites `/interview` and builds the `ASSUMPTION:` convention,
   the `assumption-marker` rule, and the audit.
5. Release (outside this change, run by hand through `/publish`): bump
   `dod-guard` and `quality-guard` versions, wait for CI, `/plugin update`,
   `/reload-plugins`.
6. Acceptance test (outside this change): drive one real change through
   `/interview`, `/step-by-step`, and archive, using item 36 (deciding where
   the audit runs) as the test subject.

Rollback: each session ends in its own commit with no push, reviewed before
pushing. A session that fails its exit gate does not get pushed, so master
never carries a half-built seam.

## Open Questions

None. Item 14's fingerprint question is resolved above as a design decision
(leaf-level diffing), not deferred.
