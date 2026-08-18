---
name: opsx-continue
description: Advance an OpenSpec change's build frontier by creating its missing planning artifacts, one wave of tasks at a time. Use when the user wants to continue this change, fill in the missing artifacts, expand the next wave, or pick up where it left off. Never edits code and never revises an artifact that already exists.
---

# opsx-continue

Create a change's missing planning artifacts, in the order the schema
requires, and expand `tasks.md` in waves. Never edit code. Never revise an
artifact that already exists - that is `/opsx-update`'s job.

## The change is the plan

A change never delivers a plan. The change *is* the plan, and its artifacts
are that same change at increasing detail: the proposal is the draft, the
specs fix the behavior it must have, the design fixes the approach, and
`tasks.md` is the change made executable.

So a proposal that calls itself a planning pass, a refinement pass, or says
it produces a plan rather than the implementation, is describing its own
draft state. `openspec status` already reports that state. It never tells
you what the change delivers.

Writing the concrete plan is what running this skill does. Never write a
checkbox item whose deliverable is a plan: no item that writes an
implementation-plan document, defines the phases, or locks a contract
document. When the proposal lists such documents among its required
outputs, their content belongs in this run's own artifacts, written now.
An item that says "write the plan" means this run stopped one level short
and handed its own job to a later worker.

What the change delivers is the behavior its spec deltas describe. Write
items that build that behavior. A decision this run has already closed with
the user stays closed - never re-open it as a document for a later task.

## 1. Store selection

A store is a standalone OpenSpec repo registered on this machine. If the
user names one or the work lives in one, run `openspec store list --json`
to discover registered store ids. Pass `--store <id>` on commands that
read or write specs and changes (`status`, `instructions`, `list`, `show`,
`validate`, `archive`, `doctor`, `context`, `view`). Keep the flag on every
applicable command for the rest of the workflow.

Every unscoped example below is shorthand. Without a store, commands act
on the nearest local `openspec/` root.

## 2. Select the change

**Input**: Optionally specify a change name.

If a name is provided, use it. Otherwise:
- Auto-select if only one active change exists
- If zero or multiple active changes exist, run `openspec list --json` to
  get available changes sorted by most recently modified, and ask the
  user to select one

Always announce: "Using change: <name>" and how to override (e.g.,
`/dod-guard:opsx-continue <other>`).

## 3. Read the change's artifact state

```bash
openspec status --change "<name>" --json
```

Parse the JSON to learn:
- `artifacts`: every artifact the schema defines, each with a `status`
  (`done`, `ready`, `blocked`, or `skipped`) and its `requires` edges
- `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path
  and scope context - use these instead of assuming repo-local paths

The artifact ids, their build order, and their output paths come from
this response, never from a hardcoded list. A custom schema must work
unchanged: do not branch on a specific artifact name anywhere in this
workflow.

## 4. Create every artifact whose status is `ready`

Use a todo list to track progress. Work through artifacts in the order
`status` reports, re-checking status after each write since creating one
artifact can move another from `blocked` to `ready`.

For each artifact with status `ready`:

```bash
openspec instructions "<artifact-id>" --change "<name>" --json
```

This is the authoritative source of that artifact's rules, template, and
output path - never invent a second copy of them here. Read the
dependency artifacts it names, from disk, before writing. If the
`instruction` field delegates creation to a specific skill or command,
invoke that instead of writing the file directly.

An artifact with status `skipped` is satisfied as-is; create nothing for
it, and never treat it as blocking a downstream artifact that requires
it - the schema already resolved that. Name it as skipped in the run's
report (see section 8's **Output**).

Write-nothing exit: only when both hold. Every artifact the schema
defines is already `done` or `skipped`, AND every `## N.` group in
`tasks.md` already carries checkbox items. The tasks artifact reports
`done` from its first write onward even while later groups are still
bare headings, so status alone is not enough - check the groups too.
When both hold, before doing anything else: create nothing, write
nothing, and report that the change is already complete. That is
not an error - point the user at `/opsx-update` for revisions instead
(see section 8).

When every artifact is `done` or `skipped` but a heading-only group
remains, this is not the write-nothing case - it is the next wave.
Continue to section 5 or 6.

## 5. Expand `tasks.md` in waves

When the artifact being created is the tasks artifact, do not write every
task fully expanded in one pass. `openspec instructions` still owns how a
`tasks.md` heading and checkbox item are authored - format, numbering,
what a task line says. What follows is this skill's own choreography for
which of those headings get checkbox items on a given run, not a second
copy of OpenSpec's authoring rules.

Write a `## N. <group>` heading for every unit of work the proposal and
specs imply, including work that cannot yet be broken down into checkbox
items. Expand `- [ ]` checkbox items under the near wave only - the near
wave is the first group with no checkbox items under it, or on a first
pass over an empty `tasks.md`, the first group. Leave every later group
as a bare heading with no checkboxes.

When a checkbox item's work maps to a spec scenario, put
the covers annotation on the line directly after it, as one unwrapped
line:

```
<!-- covers: <group>/<capability> :: <requirement title> :: <scenario title> -->
```

The parser reads it as a single line, so never wrap it. An item with no matching
scenario carries no annotation - do not invent one to fill the slot.

Before writing the wave, check its items against the change's scenarios as
a set. When the spec deltas carry at least one scenario and not one item in
the wave binds to any of them, stop. Report the scenarios, report the items
drafted, and ask the user before writing anything. A whole wave that binds
nothing means the items and the specs describe different work, and one of
the two is wrong.

That check is about the wave as a whole. A single item that maps to no
scenario is ordinary - adding a dependency is real work that no scenario
describes - and it still carries no annotation.

Do not introduce a task format beyond those two levels. No nested
checkboxes under an item, no per-group metadata block, no second task
file alongside `tasks.md`. A heading and, where expanded, its flat list
of checkbox items is the whole shape.

A heading-only group is not a defect to route around. `dod-guard cover
<change-id>` names every `## <digits>.` heading with no checkbox items
and exits with the plan-incomplete code, refusing to archive the change
until every group is expanded. That is the intended gate on a change
expanded in waves, not a bug this skill works to avoid triggering early.

## 6. Re-invocation

Running this skill again against the same change must be safe: it picks
up wherever the previous run left off rather than repeating work.

Leave every already-expanded group untouched. A group that already
carries `- [ ]` items is not rewritten, and a checked item stays
checked - this skill never revises what a prior run or a later manual
edit produced. Expand only the first group that is still heading-only.
Every group after that stays a bare heading, exactly as section 5
already requires on a first pass.

Before writing the next wave's items, read the implementation the
already-expanded groups produced - the code and tests those waves
wrote, not just the proposal. Write the new group's items against what
that work actually turned out to need, not the original guess the
proposal made before any of it existed. A wave that only ever reread
the proposal would keep repeating the same guess instead of learning
from what shipped.

If a group is discovered mid-flight that the original heading list did
not anticipate, append it as a new `## N.` heading at the end rather
than inserting it and renumbering the groups after it. A task's id
comes from its item text, not from the heading number, so renumbering
breaks nothing - but it churns the file for no gain, since every
already-expanded group's headings would shift for an insertion that
adds no information the file didn't already have room for. Appending
keeps every prior wave's heading numbers stable across re-invocations.

If what the already-expanded groups' implementation shows contradicts an
assumption the proposal made about a later group - the later group's items
only made sense given something about an earlier group that shipped
differently - stop before writing that later wave. Report three things: what
the proposal assumed, what the implementation actually showed, and what this
skill would write for that group's items instead given the new information.
Then ask the user before writing anything. Do not adjust the proposal to
match - that is `/opsx-update`'s job, and this skill never revises an
artifact that already exists (this document's opening paragraph, section 8's
guardrails). Point the user at `/opsx-update` if the proposal itself needs
changing. Only after the user answers does this skill write the next wave,
and only what the user confirmed.

If every `## N.` group in `tasks.md` already carries checkbox items - no
heading-only group remains - and every artifact is `done` or `skipped`, this
is section 4's write-nothing exit: write no items, report that every group is
expanded, and point the user at `/opsx:apply` to start implementation
(section 8).

## 7. Validate after each artifact

After writing (or invoking a delegated skill or command to write) any
artifact - a full artifact in section 4, or a wave in section 5 or 6 - run:

```bash
openspec validate "<name>" --strict --no-interactive
```

`--strict` and `--no-interactive` are both required, not optional.
`--no-interactive` matters because this skill runs unattended inside a
longer workflow; a prompt would hang it with nothing able to answer it.

Validate right after that write, before moving to the next artifact or the
next wave. An error found immediately names the artifact that caused it;
the same error found three artifacts later leaves the cause ambiguous
among everything written since.

If validate reports an error, repair the artifact just written and
re-validate. Repeat until it passes before continuing. The repair loop
targets only that artifact. If the error text points at an artifact from
an earlier write in this run or a prior run, that is a revision, and this
skill does not revise an artifact that already exists (this document's
opening paragraph, section 8's guardrails). Stop, report the error and which
earlier artifact it implicates, and point the user at `/opsx-update`
instead of touching it.

If repair does not converge - the same error persists after a repair
attempt, or a fix introduces a new one with no end in sight - stop after a
reasonable number of attempts. Report the error text, what was tried, and
leave the artifact on disk as it stands rather than deleting it. Do not
mark the run as done and do not silently move on to the next artifact.

## 8. Point to the next step (guidance only - NEVER act on it)

- Every planning artifact done or skipped, and every `## N.` group in
  `tasks.md` already carries checkbox items -> suggest `/opsx:apply` to
  start implementation.
- That same state holds when this skill starts -> report that, write
  nothing, and point at `/opsx-update` for revisions instead (section 4).
- Every artifact done or skipped but a heading-only group remains ->
  this run expanded (or should next run) that group; suggest running
  `/opsx-continue` again to expand the following one, until none remain.

**Output**

After each invocation, show:
- Which artifacts were created, and which were already present or
  skipped
- Which `tasks.md` group(s), if any, were expanded this run
- The result of `openspec validate` after the last write, and any repairs
  it took to get there
- Where the change stands and the recommended next command

**Guardrails**
- Planning artifacts only - NEVER edit implementation code.
- Never write a task whose deliverable is a plan. Producing the plan is
  this run's job, not an item inside it.
- Use the artifact ids, build order, and paths reported by
  `openspec status`; never branch on a hardcoded artifact name.
- Never revise an artifact that already exists - that is
  `/opsx-update`'s job. This skill only fills in what is missing.
- Never write a `## N.` group's checkbox items until that group is the
  wave being expanded; a later group stays a heading only.
- Confirm every artifact against `openspec validate` before moving to the
  next one.
