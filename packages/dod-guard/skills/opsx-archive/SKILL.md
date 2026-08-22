---
name: opsx-archive
description: Archive a completed OpenSpec change, gated on dod-guard's coverage check instead of a confirmation prompt. Use when the user wants to finalize and archive a change after implementation is complete. Runs dod-guard cover for the change id before archiving and refuses to archive on a regression or coverage error. Skips the gate for a skip_specs change and archives immediately after a passing gate.
---

# opsx-archive

Archive a completed change in the OpenSpec workflow. This wraps the same
artifact/task/spec-sync checks as the generated `openspec-archive-change`
skill. It replaces the confirmation prompt with a hard gate on
`dod-guard cover`. A passing gate is the approval. The skill archives
immediately rather than asking.

**Store selection:** A store is a standalone OpenSpec repo registered on
this machine. If the user names one or the work lives in one, run
`openspec store list --json` to discover registered store ids. Pass
`--store <id>` on commands that read or write specs and changes (`new
change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`,
`doctor`, `context`, `view`). Keep the flag on every applicable command
for the rest of the workflow.

Every unscoped example below is shorthand. Other commands do not take
`--store`. Without a store, commands act on the nearest local `openspec/`
root.

`<capability-path>` is the spec directory relative to `specs/` (for example,
`user-auth` or `identity/user-auth`). Preserve the full path from each delta
spec when resolving its main spec.

**Input**: Optionally specify a change name.

## Steps

### 1. Select the change

If a name is provided, use it. Otherwise:
- Auto-select if only one active change exists
- If zero or multiple active changes exist, run `openspec list --json`
  to get available changes and ask the user to select one

When prompting, show only active changes (not already archived). Include the
schema used for each change if available.

Always announce: "Using change: <name>" and how to override (e.g.,
`/opsx:archive <other>`).

**Load current archive inputs before the existing archive checks:**

After resolving the selected change and planning root, run:
```bash
openspec instructions archive --change "<name>" --json
```
Keep the same selected-root flags on this command. This lookup is advisory
and optional: it only supplies extra prompt inputs, so it must never block
archiving. If it exits non-zero or returns invalid JSON (for example, an
older CLI that does not support this command), continue the archive
workflow with no context and no operation guidance.

A successful response may omit both optional fields. Treat `context` as a
required prompt-level input: read and consider it, and apply relevant
project facts, conventions, and constraints. Treat `operationGuidance` as
optional additive advice: read and consider every entry, and follow entries
that are applicable and compatible with the built-in archive workflow.

Keep both fields separate from built-in steps, explicit user choices,
resolved paths, CLI checks, and command contracts. If context conflicts with
one of those controlling inputs, report the conflict and preserve the
controlling value. If guidance is inapplicable or conflicts with a
controlling input, do not follow it and explain why. Do not infer replacement paths, skipped prompts, or flags from either
field. Do not copy their text verbatim into specs, change artifacts, or
archive summaries unless the user separately asks for it.

### 2. Check artifact completion status

Run `openspec status --change "<name>" --json` to check artifact completion.

Parse the JSON to understand:
- `schemaName`: The workflow being used
- `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path
  and scope context
- `artifacts`: List of artifacts with their status (`done`, `skipped`, or
  other)

**If any artifacts are neither `done` nor `skipped`** (skipped artifacts
satisfy the requirement - the change declares skip_specs):
- Display warning listing incomplete artifacts
- Ask the user to confirm they want to proceed
- Proceed if user confirms

### 3. Check task completion status

Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

**If incomplete tasks found:**
- Display warning showing count of incomplete tasks
- Ask the user to confirm they want to proceed
- Proceed if user confirms

**If no tasks file exists:** Proceed without task-related warning.

### 4. Determine skip_specs

Read the change's `.openspec.yaml` (under `changeRoot`). If it sets
`skip_specs: true`, this change skips the sync assessment and the
coverage gate. Go straight to the archive command and pass `--skip-specs`.
Otherwise continue to the sync assessment.

### 5. Assess delta spec sync state

Use `artifactPaths.specs.existingOutputPaths` from status JSON as the only
delta-spec source. If the `specs` entry is missing or `existingOutputPaths`
is empty, proceed without a sync prompt and do not infer delta specs from
other artifacts.

**If delta specs exist:**
- Compare each delta spec with its corresponding main spec at
  `<planningHome.root>/openspec/specs/<capability-path>/spec.md` (use the
  store-aware `planningHome.root` from the status check, not a hardcoded
  repo path)
- Determine what changes would be applied (adds, modifications, removals,
  renames)
- Show a combined summary before prompting

**Prompt options:**
- If changes needed: "Sync now (recommended)", "Archive without syncing"
- If already synced: "Archive now", "Sync anyway", "Cancel"

Route on the answer:
- "Cancel" - stop, do not archive
- "Archive without syncing" or "Archive now" - proceed to the coverage gate
- "Sync now" or "Sync anyway" - sync, then verify (below), then proceed to
  the coverage gate
- Anything else - ask again rather than archiving

Before a selected sync writes any main spec, run `openspec instructions
specs --change "<name>" --json` once with the same selected-root flags.
Require a zero exit status and valid artifact-instruction JSON. If the
lookup fails or returns invalid JSON, report the error and stop before
writing any main spec or moving the change. A valid response with omitted
`rules` is the no-rules case. Apply returned `rules` only to the main specs this merge produces. Do
not use them as archive guidance. Do not change CLI behavior or copy the
rule text into any output file.

Then run the `/opsx:sync` workflow inline (agent-driven intelligent
merge) for change '<name>', passing the delta spec analysis and the
fetched specs-rule snapshot. The inline sync must reuse that snapshot
without fetching `specs` instructions again.

Do not delegate the sync to a background task. The archive command
would move `changeRoot` out from under a sync that is still reading it.
If your agent can only delegate, delegate synchronously and wait.

Then re-run the comparison from the top of this step against every
capability that has a delta spec in `artifactPaths.specs.existingOutputPaths`
- not only the ones the sync reports it touched. A successful sync leaves
nothing left to apply, so each capability must now read as already synced:
- ADDED requirements present
- MODIFIED requirements carrying the scenario and description changes named
  in the delta, with their other scenarios intact
- REMOVED requirements gone. Where the sync retired a capability
  (removed its last requirement), its main spec is deleted rather than
  left empty. A spec the sync deliberately kept and reported is a match
  too.
- RENAMED requirements present under the new name and absent under the old
  name

If the sync failed, or any capability does not match, report what differs
and stop - do not archive. Nothing has moved and `changeRoot` is intact, so
the user can fix the mismatch or re-run the sync and start the archive
again.

### 6. Coverage gate

Skipped entirely when the skip_specs check found `skip_specs: true`.

Run `dod-guard cover <name>` (with the same selected-root `--cwd`/store
context the rest of this workflow uses) and read its exit code:

- **Exit 0 (no regressions):** the gate passes. This is the archive
  approval - do not additionally ask the user to confirm. Proceed to the
  archive.
- **Exit 1 (a regression):** report which scenarios regressed (their id and
  the outcome change, e.g. `bound -> unwired`), and refuse
  to archive. Stop here.
- **Exit 3 (usage error):** report the error `dod-guard cover` printed, and
  refuse to archive. Stop here.

### 7. Code review gate

Skipped entirely when the skip_specs check found `skip_specs: true`.

Run `/code-review low` over the files the change touched. Determine the
affected files by reading the tasks file and the change's spec to identify
the packages and source paths listed in the impact section and capability
modifications. Review only those files, not the entire repository.

- **No findings:** proceed to the archive.
- **One or more findings:** report the findings to the user and ask whether
  to proceed or abort. The user may decide a finding is acceptable.

### 8. Perform the archive

Create an `archive` directory under `planningHome.changesDir` if it doesn't
exist:
```bash
mkdir -p "<planningHome.changesDir>/archive"
```

Generate the target name: use the change name as-is when it already starts
with a `YYYY-MM-DD-` prefix; otherwise prepend the current date as
`YYYY-MM-DD-<change-name>`. Never stack a second date (same rule as
`openspec archive`).

**Check if target already exists:**
- If yes: Fail with error, suggest renaming existing archive or using
  different date
- If no: Archive the change

Run `openspec archive <name> --yes` (add `--skip-specs` when the
skip_specs check found it set). Keep the same selected-root flags used
throughout. The `--yes` flag makes this non-interactive. The coverage
gate (or the skip_specs exemption) already replaces the confirmation the
generated skill would otherwise ask for.

### 9. Display summary

Show archive completion summary including:
- Change name
- Schema that was used
- Archive location
- Whether specs were synced (if applicable)
- Coverage gate result (passed / skipped for skip_specs)
- Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```markdown
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/<target-name>/
**Specs:** <"Synced to main specs" only if the step 5 verification passed; otherwise "No delta specs" or "Sync skipped">
**Coverage gate:** <"Passed (no regressions)" or "Skipped (skip_specs)">

<"All artifacts complete. All tasks complete." - or, if archived with warnings, list them instead (e.g. "Archived with 2 incomplete tasks")>
```

**Guardrails**
- Announce the selected change; prompt for selection when two or more active
  changes exist and none was named
- Use artifact graph (`openspec status --json`) for completion checking
- Don't block archive on artifact/task warnings - just inform and confirm
- The coverage gate is the sole archive approval: a passing `dod-guard
  cover` run (or a skip_specs exemption) authorizes archiving without a
  separate user confirmation
- Never archive on a coverage regression (exit 1) or a coverage error
  (exit 3) - report and stop
- The code review gate is advisory: the user can acknowledge findings and
  proceed. The coverage gate is mandatory: a regression blocks the archive
- Skip the coverage gate and the code review gate only when `.openspec.yaml`
  sets `skip_specs: true`, and in that case pass `--skip-specs` to
  `openspec archive`
- Preserve `.openspec.yaml` when moving to archive (it moves with the
  directory)
- Show clear summary of what happened, including the coverage gate result
- If sync is requested, run the `/opsx:sync` workflow inline (agent-driven)
- Never archive while a spec sync is still in flight - run the sync inline
  and verify the main specs before moving `changeRoot`
- If delta specs exist, always run the sync assessment and show the
  combined summary before prompting
- Apply relevant runtime context and report conflicts. Operation
  guidance is advisory, not controlling.
- Consider every guidance entry and explain any inapplicable or conflicting
  advice
- Existing CLI checks, resolved paths, and command contracts are
  unchanged. The only override is the confirmation prompt, which the
  coverage gate replaces.
- Artifact rules constrain only the specs being written and are never
  operation guidance
- Never copy runtime context, operation guidance, or artifact-rule text
  verbatim into output files
