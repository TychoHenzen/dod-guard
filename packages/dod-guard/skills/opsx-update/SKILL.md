---
name: opsx-update
description: Revise an OpenSpec change's existing planning artifacts, keep them coherent with one another, and re-validate. Use when the user wants to revise a change's plan, fold new decisions into it, or reconcile its artifacts after an edit. Never edits code.
---

# opsx-update

Revise a change's existing planning artifacts and keep them coherent. Never
edit code.

## 1. Store selection

A store is a standalone OpenSpec repo registered on this machine. If the
user names one or the work lives in one, run `openspec store list --json`
to discover registered store ids. Pass `--store <id>` on commands that
read or write specs and changes (`new change`, `status`, `instructions`,
`list`, `show`, `validate`, `archive`, `doctor`, `context`, `view`). Keep
the flag on every applicable command for the rest of the workflow.

Every unscoped example below is shorthand. Without a store, commands
act on the nearest local `openspec/` root.

## 2. Select the change

**Input**: Optionally specify a change name.

If a name is provided, use it. Otherwise:
- Auto-select if only one active change exists
- If zero or multiple active changes exist, run `openspec list --json`
  to get available changes sorted by most recently modified, and ask
  the user to select one

When prompting, present the top 3-4 most recently modified changes as
options, showing:
- Change name
- Schema (from `schema` field if present, otherwise "spec-driven")
- Status (e.g., "0/5 tasks", "complete", "no tasks")
- How recently it was modified (from `lastModified` field)

Mark the most recently modified change as "(Recommended)" since it's likely
what the user wants to update.

Always announce: "Using change: <name>" and how to override (e.g.,
`/opsx:update <other>`).

## 3. Get the change's artifacts

```bash
openspec status --change "<name>" --json
```

Parse the JSON to understand current state. The response includes:
- `schemaName`: The workflow schema being used (e.g., "spec-driven")
- `artifacts`: Array of artifacts with their status ("done", "skipped",
  "ready", "blocked")
- `isPlanningComplete`: Boolean indicating if all planning artifacts are
  complete. Older CLI versions expose the same value as `isComplete`.
- `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path
  and scope context. Use these instead of assuming repo-local paths.

The artifact ids and paths come from the active schema - do NOT assume them,
and do NOT branch on hardcoded artifact names. Custom schemas must work
unchanged.

The files to edit are `artifactPaths.<id>.existingOutputPaths` - the
concrete files that exist on disk, already glob-expanded for glob artifacts
(e.g. `specs/**/*.md`). Do NOT write to `resolvedOutputPath`: for a glob
artifact it is still the glob pattern, not a real file.

## 4. Understand the request

- If the user asked for a specific revision ("the design now uses X"), that
  is the starting edit.
- If they only said "update" / "make this coherent", treat it as a coherence
  review: read the existing artifacts and check them against each other for
  contradictions, gaps, and duplication.

## 5. Read and reconcile

- Read the artifact(s) the request touches and the change's other existing
  artifacts.
- Apply the requested edit. Then check every other existing artifact
  against it, in any direction. An edit to a later artifact may require
  revising an earlier one. Build order is a useful reading order, not a
  constraint on which artifacts may be revised.
- Note everything that is now inconsistent, missing, or contradictory.
  Two checks apply specifically:
  - **New capability in `proposal.md`**: if the edit adds a capability
    that no spec delta covers, report that a new delta is needed. Offer
    to create it (subject to the existing-files-only rule below).
  - **Scenario removed from a spec delta**: if the edit removes a
    `#### Scenario:` block, search `tasks.md` for `<!-- covers: -->`
    annotations naming that scenario. Report every task that still
    references it so the user can reword the task or drop the annotation.
- Revise only files that already exist (`existingOutputPaths`). Do NOT
  create artifacts that don't exist yet. Do NOT invent new files under a
  glob artifact. Note them and point the user to `/dod-guard:opsx-continue`.
- If the change is already coherent, say so and make no edits.

## 6. Confirm and apply, one artifact at a time

- Show each proposed revision and why. Write only after the user confirms.
- If the user rejects a revision, do not write it - leave that artifact
  unchanged.
- When a substantial rewrite is needed, get that artifact's rules and
  template first:
  ```bash
  openspec instructions "<artifact-id>" --change "<name>" --json
  ```

## 7. Validate after each update

After writing any artifact revision, validate the change:

```bash
openspec validate "<name>" --strict --no-interactive
```

If validation fails, fix the reported error in the relevant artifact and
re-run validate. Repeat until it passes. If the fix is out of scope
(for example, it needs an artifact that does not exist yet), defer to
`/dod-guard:opsx-continue` and report the gap instead of forcing a fix.

## 8. Point to the next step (guidance only - NEVER act on it)

- Artifacts still missing -> suggest `/dod-guard:opsx-continue` to create them.
- The user wants to implement, or the change is already implemented and
  the code may not match the revised plan -> suggest `/opsx:apply`. If
  the user asks to code mid-conversation, refuse and point to
  `/opsx:apply`.
- Everything done and implemented -> suggest `/opsx:archive`.

**Output**

After each invocation, show:
- Which artifacts were revised (and which proposed revisions were rejected)
- The result of `openspec validate`
- Anything deferred to `/dod-guard:opsx-continue` (not-yet-created artifacts or files)
- Where the change stands and the recommended next command

**Guardrails**
- Planning artifacts only - NEVER edit implementation code. If the revised
  plan implies code changes, stop and point to `/opsx:apply`.
- Use the artifact ids and paths reported by `openspec status`; never branch
  on hardcoded artifact names.
- Edit only the concrete files in `existingOutputPaths`; never write to a
  glob `resolvedOutputPath`.
- Do not advance the build frontier: no new artifacts, no new files under
  glob artifacts - that is `/dod-guard:opsx-continue`'s job.
- Confirm every edit with the user before writing, and re-validate after
  every confirmed edit.
- If the request changes the change's *intent* rather than refining it,
  first verify whether the expanded-profile `/opsx:new` workflow is
  available. If it is, recommend starting fresh with `/opsx:new` (the
  "Update vs. Start Fresh" heuristic). If it is unavailable, ask for a
  distinct unused change name and recommend `openspec new change
  "<new-change-name>"` instead.
