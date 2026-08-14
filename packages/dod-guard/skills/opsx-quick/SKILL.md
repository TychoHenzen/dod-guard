---
name: opsx-quick
description: Lightweight development flow that asks a few clarifying questions, creates minimal OpenSpec documentation, generates steps, and hands off to step-by-step - all in one invocation. Use when the user knows what they want and the full propose/apply pipeline is too heavy.
---

# opsx-quick

Collapse the propose/apply/archive pipeline into one invocation. Ask a
few questions, create just enough OpenSpec documentation, generate
steps, hand off to `/dod-guard:step-by-step`, and sync specs afterwards.

**This skill creates documentation AND starts implementation.** Unlike
`/opsx:propose` (planning only) or `/opsx:apply` (execution only), this
skill runs the full cycle. It still uses the same workers and coverage
gate that the separate skills use.

**Store selection:** A store is a standalone OpenSpec repo registered on
this machine. If the user names one or the work lives in one, run
`openspec store list --json` to discover registered store ids. Pass
`--store <id>` on commands that read or write specs and changes (`new
change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`,
`doctor`, `context`, `view`). Keep the flag on every applicable command
for the rest of the workflow. `dod-guard steps` and `dod-guard cover` do
not take `--store`.

**Input**: The user's request should include what they want to build, and
optionally a change name. If no name is given, derive one in kebab-case
from the description.

---

## Phase 1: Clarify

Ask at most 3 clarifying questions using AskUserQuestion with concrete
options. Focus on scope boundaries and acceptance criteria, not
exhaustive requirements. A clear request with one ambiguity gets one
question. An unclear request gets up to three.

Do not ask questions whose answers you can infer from the codebase. Read
the relevant code first.

## Phase 2: Assess size and create the change

Count the files and capabilities the change will touch. Use that count
to decide artifact depth:

| Size | Files | Capabilities | Artifacts |
|------|-------|-------------|-----------|
| Small | 1-3 | 1 | proposal, tasks |
| Medium | 4+ | 1 | proposal, specs, tasks |
| Large | any | 2+ or cross-package | proposal, specs, design, tasks |

### Create the change

```bash
openspec new change "<name>" --schema dod-guard-spec-driven
```

### For small changes: set skip_specs

A small change has no spec-level behavior worth capturing before
implementation. Edit the change's `.openspec.yaml` to add
`skip_specs: true`:

```yaml
schema: dod-guard-spec-driven
created: <date>
skip_specs: true
```

`openspec validate` accepts this. The retroactive-spec question in
phase 5 catches the case where the scope was underestimated.

### Write the artifacts

Get the build order:
```bash
openspec status --change "<name>" --json
```

For each artifact in the required set (determined by your size
assessment), get its instructions:
```bash
openspec instructions <artifact-id> --change "<name>" --json
```

Follow the `instruction` field. Use the `template` as the output
structure. Apply `context` and `rules` as constraints but do NOT copy
them into the output file. Read dependency artifacts before writing
each new one.

When writing `tasks.md`, annotate each task that maps to a scenario
with `<!-- covers: <group>/<capability> :: <requirement title> ::
<scenario title> -->` immediately after the item.

An artifact whose `status` is already `skipped` must NOT be created.

## Phase 3: Generate steps and validate

```bash
dod-guard steps "<name>"
```

Then validate:
```bash
openspec validate "<name>" --strict --no-interactive
```

If validation fails, fix the affected artifacts, regenerate steps if
`tasks.md` changed, and re-validate.

**Task count warning**: If `tasks.md` has more than 8 items, warn the
user that the full step-by-step pipeline will run inside this single
invocation. Suggest using `/opsx:propose` and `/opsx:apply` separately
for very large changes. Proceed only if the user confirms.

## Phase 4: Hand off to step-by-step

Invoke `/dod-guard:step-by-step` with the change id via the Skill tool.
Wait for it to complete before continuing.

## Phase 5: Post-implementation spec sync

### Change had specs

Run `dod-guard cover <name>`. Handle by exit code:

- **0**: Run `openspec archive <name> --yes` and report the result.
- **1**: Report the regression and stop.
- **3**: Report the usage error and stop.

### Change skipped specs

Ask the user whether the implementation introduced new observable
behavior that warrants retroactive spec deltas:

- **Yes**: Create spec deltas under
  `openspec/changes/<name>/specs/<group>/<capability>/spec.md`,
  re-run `dod-guard cover <name>`, and archive on exit 0.
- **No**: Run `openspec archive <name> --yes --skip-specs` and report.

## Output

After the full cycle, report:

- Change name and what was built
- Artifacts created (and any skipped with reason)
- Step-by-step results (per-step status, commits made)
- Coverage gate result
- Archive outcome
- Any blocked or skipped steps with reasons

## Guardrails

- Never skip the coverage gate. A change archives only after
  `dod-guard cover` exits 0 (or the change set `skip_specs: true` and
  the user declined retroactive specs).
- Do not implement tasks yourself. Implementation goes through
  `/dod-guard:step-by-step` and its workers.
- Read dependency artifacts from disk before writing each new one.
  The user may have edited them since you last saw them.
- If the change already exists, ask whether the user wants to continue
  it or create a new one.
