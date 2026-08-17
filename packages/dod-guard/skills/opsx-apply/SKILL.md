---
name: opsx-apply
description: Apply an OpenSpec change by routing execution through /dod-guard:step-by-step, then gate archival on dod-guard cover. Use when the user wants to start implementing, continue implementation, or work through tasks for a change. Checks tasks.md freshness before dispatch and does not implement tasks itself.
---

# opsx-apply

Thin routing layer over `/dod-guard:step-by-step`. This skill never
implements a task itself. It selects the change, confirms `tasks.md`
is current, hands execution to `/dod-guard:step-by-step`, and gates
archival on `dod-guard cover` once that finishes.

**Store selection:** A store is a standalone OpenSpec repo registered on
this machine. If the user names one or the work lives in one, run
`openspec store list --json` to discover registered store ids. Pass
`--store <id>` on every OpenSpec command below (`status`, `list`,
`archive`, `instructions`). Keep the flag on every applicable command for
the rest of the workflow. `dod-guard cover` does not take `--store`. It
resolves the change through `--cwd` instead.

**Input**: Optionally specify a change name (e.g., `/opsx:apply add-auth`).

## 1. Select the change

If a name is provided, use it. Otherwise:
- Auto-select if only one active change exists, and announce the
  selection: "Using change: `<name>` (only active change)"
- If zero or multiple active changes exist, run `openspec list --json`
  to get available changes and ask the user to select one

Always announce: "Using change: `<name>`" and how to override (e.g.,
`/opsx:apply <other>`).

## 2. Check status and tasks

```bash
openspec status --change "<name>" --json
```

If the change has no tasks (nothing to execute), report that and stop -
there is nothing for step-by-step to do. Suggest `/dod-guard:opsx-continue` to
create the missing artifact instead.

## 3. Confirm tasks.md is current

Read the `<!-- plan_artifacts: ... -->` comment near the top of
`openspec/changes/<name>/tasks.md`.

- **No comment, or it matches the `artifacts` field from the `openspec
  status --json` output taken in step 2:** proceed directly to routing.
  `/dod-guard:step-by-step` resolves `verify_cmd`s itself on startup.
- **Mismatch:** report the staleness (which artifacts changed status)
  and note that `/dod-guard:step-by-step` will ask the user whether to
  re-resolve `verify_cmd`s when it starts.

## 4. Route to step-by-step

Invoke `/dod-guard:step-by-step <name>` (via the Skill tool) to execute
the plan. Step-by-step dispatches typed workers, runs each step's
`verify_cmd`, and commits per completed step. Do not loop through task
checkboxes or implement tasks in this skill - step-by-step owns that
entirely.

Wait for step-by-step to report completion (all steps done, or paused on
a blocker) before continuing.

## 5. Coverage gate before archive

Once step-by-step reports every step complete, run:

```bash
dod-guard cover <name>
```

Handle by exit code:

- **`0` (no regressions):** run `openspec archive <name> --yes` and report
  the archive result.
- **`1` (a scenario regressed):** report which scenarios regressed (from
  the command's output) and do not archive. Wait for the user's guidance
  before retrying.
- **`3` (usage error):** report the error and do not archive. This
  usually means the change id or `--cwd` was wrong - check the invocation
  before retrying.

If step-by-step paused instead of completing, do not run the coverage
gate or archive. Report the pause and wait for guidance.

## Guardrails

- This skill is a thin router: it never implements tasks, edits code, or
  checks off task checkboxes. All of that is `/dod-guard:step-by-step`'s
  job.
- Always check `tasks.md` freshness before dispatching to step-by-step -
  a stale plan can bind verify_cmds to artifacts that no longer match the
  change's status.
- Never archive on a `cover` exit code other than `0`.
- Auto-select only when exactly one active change exists; otherwise ask.
