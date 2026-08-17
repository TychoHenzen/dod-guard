---
name: opsx-continue
description: Advance an OpenSpec change's build frontier by creating its missing planning artifacts, one wave of tasks at a time. Use when the user wants to continue this change, fill in the missing artifacts, plan the next wave, or pick up planning where it left off. Never edits code and never revises an artifact that already exists.
---

# opsx-continue

Create a change's missing planning artifacts, in the order the schema
requires, and plan `tasks.md` in waves. Never edit code. Never revise an
artifact that already exists - that is `/opsx-update`'s job.

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
`/opsx:continue <other>`).

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

If every artifact the schema defines is already `done` or `skipped`
when this skill starts, before doing anything else: create nothing,
write nothing, and report that the change is already fully planned.
That is not an error - point the user at `/opsx-update` for revisions
instead (see section 8).

## 5. Plan `tasks.md` in waves

When the artifact being created is the tasks artifact, do not write every
task fully expanded in one pass. Name every unit of work the proposal and
specs imply as a group heading up front, and expand checkbox items for
the nearest wave only. (The heading format, which wave counts as
"nearest", and the covers-annotation rule for an expanded item are
specified in a later step of this skill's own build.)

## 6. Re-invocation

Running this skill again against the same change must be safe: it picks
up wherever the previous run left off rather than repeating work.
(The rules for what stays untouched, what gets expanded next, and how
learning from an earlier wave feeds a later one are specified in a later
step of this skill's own build.)

## 7. Validate after each artifact

(The validate-and-repair loop after each artifact write is specified in a
later step of this skill's own build.)

## 8. Point to the next step (guidance only - NEVER act on it)

- Every planning artifact done, all task groups expanded -> suggest
  `/opsx:apply` to start implementation.
- The change is already fully planned when this skill starts -> report
  that, write nothing, and point at `/opsx-update` for revisions instead.

**Output**

After each invocation, show:
- Which artifacts were created, and which were already present or
  skipped
- Which `tasks.md` group(s), if any, were expanded this run
- The result of `openspec validate`
- Where the change stands and the recommended next command

**Guardrails**
- Planning artifacts only - NEVER edit implementation code.
- Use the artifact ids, build order, and paths reported by
  `openspec status`; never branch on a hardcoded artifact name.
- Never revise an artifact that already exists - that is
  `/opsx-update`'s job. This skill only fills in what is missing.
- Never write a `## N.` group's checkbox items until that group is the
  wave being expanded; a later group stays a heading only.
- Confirm every artifact against `openspec validate` before moving to the
  next one.
