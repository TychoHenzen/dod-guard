# Assumption Marker Audit Specification

## Purpose

Marks code that rests on an unconfirmed guess with a comment the scanner can
count. Defines the audit that resolves each marked guess to a verdict.

## Requirements

### Requirement: ASSUMPTION marker does not trip todo-marker

An `ASSUMPTION:` comment SHALL NOT be flagged by the existing `todo-marker`
rule in
`packages/quality-guard/skills/quality-refactor/scripts/lib/violations.mjs`.

#### Scenario: Code contains an ASSUMPTION comment
- **WHEN** the quality scanner runs against a file containing an
  `ASSUMPTION: <what and why>` comment
- **THEN** the `todo-marker` rule does not report a violation for that line

### Requirement: assumption-marker rule counts without failing

The scanner SHALL apply a new `assumption-marker` rule that counts
`ASSUMPTION:` comments per file and SHALL NOT fail a scan on their presence.

#### Scenario: File gains an ASSUMPTION comment
- **WHEN** a file's `ASSUMPTION:` comment count rises from the baseline
- **THEN** the scan reports the new count without exiting non-zero for that
  reason alone

#### Scenario: Baseline records the count
- **WHEN** the scanner runs on a file the quality baseline already tracks
- **THEN** `.github/quality/quality-baseline.json` holds that file's
  `assumption-marker` count

### Requirement: convention is documented

`~/.claude/CLAUDE.md` SHALL state the `ASSUMPTION: <what and why>` comment
convention for any non-obvious guess about intent or an API.

#### Scenario: Reader checks the convention
- **WHEN** a reader checks `~/.claude/CLAUDE.md` for the assumption
  convention
- **THEN** it states that a non-obvious guess gets an `ASSUMPTION: <what and
  why>` comment at that line

### Requirement: audit resolves each marker to one verdict

An audit process SHALL find every `ASSUMPTION:` comment in the repository.
It SHALL assign each one exactly one verdict: confirmed and deleted, wrong
and fixed, or still open.

#### Scenario: Audit runs against a repo with marked assumptions
- **WHEN** the audit runs
- **THEN** it reports every `ASSUMPTION:` comment found by
  `grep -rn "ASSUMPTION"` together with one verdict per comment

#### Scenario: Audit finds no unresolved assumption left silently
- **WHEN** the audit completes
- **THEN** every comment it found carries a verdict. None are left
  unreported
