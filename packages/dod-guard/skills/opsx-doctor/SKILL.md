---
name: opsx-doctor
description: Check the health of an OpenSpec project. Use when the user says "check openspec health", "openspec doctor", "diagnose openspec", "validate specs", "is openspec broken", or asks whether specs and changes are consistent. Runs `openspec doctor` and `openspec validate --all --strict --no-interactive`, then translates every finding into plain language with the affected file path. Never dumps raw CLI output.
---

# opsx-doctor

Two checks, one report. `openspec doctor` finds relationship problems
between specs and changes. `openspec validate --all --strict --no-interactive`
finds structural violations in the artifacts themselves. Run both, then
translate every finding for the user. Never paste raw CLI output into the
reply.

## 1. Detect a store

Read `openspec/config.yaml` if it exists. If it names a store id, pass
`--store <id>` to both commands below and name that store at the top of
your report ("Checking store `<id>`"). If the file is absent, or present but
names no store, run both commands with no `--store` flag and report against
the local root instead ("Checking the local project").

Do not guess a store id from anything other than `config.yaml`. If the
file exists but you cannot find a store field, treat the project as
unstored and say so.

## 2. Run the two commands

```
openspec doctor [--store <id>]
openspec validate --all --strict --no-interactive [--store <id>]
```

Run doctor first, then validate. Capture the exit code and full output of
each. A non-zero exit from either is expected when there are findings; it
is not itself a failure to report as an error.

## 3. The healthy case

If both commands exit 0 with no findings, say so in one or two sentences:
which store (or "the local project") was checked, and that both the
relationship check and the strict structural check came back clean. Stop
there. Do not list command output, do not editorialize.

## 4. Translating doctor findings

Read every finding `openspec doctor` reports and translate it. Group by
finding type. For each one, name the affected file path and explain the
problem in plain language, not the tool's own wording.

- **Orphaned spec delta** (a change's delta targets a capability with no
  main spec at `openspec/specs/<group>/<capability>/spec.md`): explain that
  the delta has nothing to merge into, and it will land as a new flat
  capability instead of updating the existing one. Suggest either creating
  the missing main spec first, or correcting the delta's path if the
  capability name was meant to match an existing one.
- **Broken reference** (a change or spec points at something that does not
  resolve): name what it points at and where the pointer lives.
- **Missing scenario** (a requirement with no scenario underneath it, or a
  reference to a scenario that is not present): name the requirement and
  the file.

If doctor reports a finding type not covered above, still name the file
and restate the tool's message in plain sentences rather than passing the
raw line through.

## 5. Translating validate findings

Read every strict violation `openspec validate` reports and translate it.
For each one: the file path, the line if the tool gives one, and what is
wrong in plain language.

- **Scenario heading level wrong** (a scenario uses `###` instead of the
  required `####`): name the file and line, state that scenarios need four
  hash marks while requirements need three, and offer to fix it (change
  that heading's level) if the user wants.
- Any other strict violation: file path, what the rule requires, what the
  file actually has.

Do not fix anything without the user agreeing first, except by offering,
as above, and waiting for a yes.

## 6. Report shape

One report, in this order: which store or project was checked, then
doctor findings grouped by type, then validate findings grouped by type,
then a one-line total ("N doctor findings, M validate violations"). Skip
any section with nothing to report rather than writing "no findings"
under every heading.

If the user agreed to a fix in section 5, apply it, then re-run only
`openspec validate --all --strict --no-interactive [--store <id>]` to
confirm it cleared, and report the new result.
