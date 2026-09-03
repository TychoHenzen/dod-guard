## Purpose

Checks the seam between an OpenSpec change and its generated DoD in both
directions. An unproven scenario or an unasked-for proof surfaces before
the change ships.

## ADDED Requirements

### Requirement: trace command exists
`packages/dod-guard/src/cli.ts` SHALL expose a `dod-guard trace <change-id>`
command that reads the change's spec deltas and its DoD document.

#### Scenario: Command runs against a real change
- **WHEN** `dod-guard trace <change-id>` is run against a change that has
  both spec deltas and an imported `dod.md`
- **THEN** the command exits without a usage error and prints a report

### Requirement: Untraced leaf fails the check
A DoD leaf with no matching scenario in the change's spec deltas SHALL be
reported as untraced. The command SHALL exit non-zero when one exists.

#### Scenario: Leaf added by hand outside the generator
- **WHEN** `dod.md` contains a leaf whose intent matches no scenario's
  `THEN` line in the change's spec deltas
- **THEN** `dod-guard trace` reports that leaf as untraced and exits non-zero

### Requirement: Untraced scenario is reported, not blocking
A scenario with no matching DoD leaf and no `MANUAL:` draft SHALL be
reported by name. Its presence alone SHALL NOT change the command's
exit code.

#### Scenario: Scenario added after DoD generation
- **WHEN** a spec delta gains a new scenario after `dod.md` was generated,
  and no leaf or draft covers it
- **THEN** `dod-guard trace` names that scenario in its report and, absent
  any untraced leaf, exits zero

### Requirement: trace is wired into the CI gate table
`CLAUDE.md` SHALL list `dod-guard trace` in its CI gate table alongside the
other ratchets.

#### Scenario: Gate table documents the command
- **WHEN** a reader checks the CI gate table in `CLAUDE.md`
- **THEN** it names `dod-guard trace` and states that an untraced leaf fails
  the gate
