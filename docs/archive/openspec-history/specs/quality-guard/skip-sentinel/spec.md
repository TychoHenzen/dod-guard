# Skip Sentinel Specification

## Purpose

Gives an author one audited way past a blocked write. The bypass is easy to
use on purpose, and it is never silent. Every use is recorded, the bypass
switches itself off, and the record stays open until somebody signs it off.

## Requirements

### Requirement: A sentinel file waives one blocked write

A file named `.quality-skip` at the repository root SHALL waive the next
blocked write. The gate SHALL consume it once. It SHALL NOT act as a switch
that stays on.

#### Scenario: Author waives a block
- **WHEN** the sentinel exists and the gate would otherwise block the write
- **THEN** the gate allows the write and deletes the sentinel

#### Scenario: Write was never blocked
- **WHEN** the sentinel exists and the write passes on its own
- **THEN** the gate leaves the sentinel in place, because it waived nothing

### Requirement: An empty sentinel waives only the new-file ceiling

An empty sentinel, or one whose content will not parse, SHALL waive the
new-file ceiling alone. It SHALL NOT waive a regression on a file the baseline
already tracks. In that case the gate SHALL leave it unconsumed and record
nothing.

#### Scenario: Empty sentinel against an oversized new file
- **WHEN** the sentinel is empty and an untracked new file passes the ceiling
- **THEN** the gate allows the write, records the waiver, and deletes the
  sentinel

#### Scenario: Empty sentinel against a tracked regression
- **WHEN** the sentinel is empty and a tracked file got worse
- **THEN** the gate still blocks, the sentinel survives, and no record is
  written

### Requirement: Raising a tracked file's bar is declared

A sentinel holding `{"rebaseline": true}` SHALL also waive a regression on a
tracked file. The gate SHALL then record that file's current counts as its new
bar. The intent SHALL be honoured only for the boolean `true`.

#### Scenario: Deliberate raise
- **WHEN** the sentinel declares a rebaseline and a tracked file got worse
- **THEN** the gate allows the write and records the file's current counts

#### Scenario: Truthy value that is not true
- **WHEN** the sentinel holds a string or any value other than boolean `true`
- **THEN** it waives the new-file ceiling only, as an empty sentinel does

### Requirement: The gate never waives the project linter

A sentinel SHALL waive the structural check alone. A write the repository's own
linter rejects SHALL still be blocked.

#### Scenario: Sentinel present, linter rejects the edit
- **WHEN** the structural check is waived and the project linter reports an
  error on a changed line
- **THEN** the gate blocks the write

### Requirement: Every waiver is written to an open record

A consumed waiver SHALL append a record to a skip log under the repository's
quality directory. The record SHALL name the file, hold the reasons the write
was blocked, state whether the bar was raised, hold the time, and start
unacknowledged. Appending SHALL keep every earlier record.

#### Scenario: Second waiver
- **WHEN** a waiver is consumed and the log already holds records
- **THEN** the new record is appended and the earlier ones stay

#### Scenario: Log file is corrupt
- **WHEN** the skip log holds content that will not parse as a list
- **THEN** the reader treats it as empty rather than failing the write

### Requirement: An unacknowledged waiver refuses a commit

A command SHALL report every waiver whose record is not marked acknowledged.
It SHALL exit non-zero while any stays open, and exit 0 when none do. A record
missing the flag SHALL count as open. The report SHALL name each file, say
which kind of waiver it was, and say how to acknowledge it.

#### Scenario: Open waiver at commit time
- **WHEN** the check runs with one unacknowledged record
- **THEN** it prints the open waiver on stderr and exits non-zero

#### Scenario: Every waiver signed off
- **WHEN** every record is marked acknowledged
- **THEN** the check exits 0
