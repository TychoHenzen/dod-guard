# Safety Gate Specification

## Purpose

Works out what a destructive move would cost before it happens. A spawn or
abandon rewrites the working tree. The gate scans for what that rewrite
would lose, and refuses the move unless the caller accepts the risk. The
branching operations that call the gate belong to `gitevo/branch-lifecycle`.
The memory bus that records what happened belongs to `gitevo/memory-bus`.

## Requirements

### Requirement: The gate scans before a spawn or an abandon
The system SHALL run the safety scan as part of spawning a branch and as
part of abandoning one. It SHALL run before either operation changes the
working tree.

#### Scenario: Spawning from a checkpoint
- **WHEN** a caller spawns a new branch from a checkpoint
- **THEN** the system scans for what the move to that checkpoint would cost
  before it creates the branch

#### Scenario: Abandoning a branch
- **WHEN** a caller abandons a branch back to its spawn point or to an
  explicit reference
- **THEN** the system scans for what the move to that reference would cost
  before it reverts the branch

### Requirement: Three independent findings describe what a move would cost
The system SHALL evaluate a move against three findings. The first is
tracked source files present at HEAD and absent from the target reference.
The second is uncommitted files that look like source. The third is build
output whose source no longer exists. Each
finding SHALL be reported only when it holds at least one file. A move with
no finding SHALL be treated as safe.

#### Scenario: Tracked source missing at the destination
- **WHEN** a file counts as source and is tracked at HEAD but absent from the
  target reference
- **THEN** the system names it under the finding for source the destination
  does not have

#### Scenario: Untracked source file
- **WHEN** a file counts as source and git reports it as untracked
- **THEN** the system names it under the finding for uncommitted source,
  even though the file would survive the move in a stash

#### Scenario: Build output with no surviving source
- **WHEN** a compiled file sits in a configured build directory and none of
  the source files it could have come from exist
- **THEN** the system names it under the build-output finding

#### Scenario: Safe move
- **WHEN** none of the three findings holds any file
- **THEN** the system treats the move as safe and reports nothing

### Requirement: Build output is never folded into the other two findings
The system SHALL exclude every file inside a configured build directory from
the source-missing finding and from the uncommitted-source finding. A file
inside a build directory SHALL be reportable only under the build-output
finding.

#### Scenario: Build output also missing from the target reference
- **WHEN** a stale build artifact sits inside a configured build directory and
  is also absent from the target reference
- **THEN** the system reports it once, under the build-output finding, and
  not under the source-missing finding

### Requirement: Configuration controls what counts as source, where build
output lives, and whether the stale check runs

The system SHALL read source extensions, build directory layouts, and a
switch to skip the stale-output check. It SHALL read them from a settings
file at `.evo/config.json` under the repository root. A setting the file
does not name SHALL fall back to a default. A file that does not exist or
will not parse SHALL be treated as no settings at all.

#### Scenario: No settings file
- **WHEN** the repository has no `.evo/config.json`
- **THEN** the system uses its built-in source extensions, build layouts, and
  a stale check that runs

#### Scenario: Settings file overrides one key
- **WHEN** `.evo/config.json` names only one of the three settings
- **THEN** the system uses that value for the named setting and its defaults
  for the other two

#### Scenario: Settings file will not parse
- **WHEN** `.evo/config.json` exists but its content is not valid JSON
- **THEN** the system falls back to its built-in defaults rather than
  refusing to run

#### Scenario: Stale check disabled
- **WHEN** the settings switch off the stale-output check
- **THEN** the system reports no build-output finding regardless of what the
  build directories hold

### Requirement: A test-shaped build artifact is not flagged stale when its
source language is not configured

The system SHALL recognize a build artifact named like a test file. It
SHALL exempt that artifact from the stale-output finding under one
condition. The repository's configured source extensions must name none
of the source extensions the artifact could have compiled from.

#### Scenario: JS-only repository with a compiled test file
- **WHEN** the configured source extensions include only JavaScript
  extensions and a build directory holds a compiled test artifact whose only
  possible sources are TypeScript
- **THEN** the system does not report that artifact under the build-output
  finding

#### Scenario: Non-test build artifact with the same missing source
- **WHEN** a build artifact that is not named like a test file has no
  surviving source among the extensions it could have compiled from
- **THEN** the system reports it under the build-output finding regardless of
  which source extensions are configured

### Requirement: The gate refuses the move by default and reports a
diagnostic

The system SHALL refuse a move that has at least one finding, unless the
caller explicitly forces it. The refusal SHALL raise a user-facing error
whose message lists every finding.

#### Scenario: Costly move without force
- **WHEN** the scan produces at least one finding and the caller does not
  pass force
- **THEN** the system raises the user-facing error type with a message
  listing every finding and states that nothing was changed

#### Scenario: Costly move with force
- **WHEN** the scan produces at least one finding and the caller passes force
- **THEN** the system does not raise an error, and returns the same finding
  detail as text so the caller can report what it accepted

### Requirement: Refusals are a dedicated error type
The system SHALL raise refusals as a single error type distinct from a
generic error. This lets a caller across a package boundary recognize and
handle it by type. That type SHALL carry a message and SHALL behave as a
standard error in every other respect.

#### Scenario: Refusal is recognizable by type
- **WHEN** the gate refuses a move
- **THEN** the raised value is an instance of the dedicated error type and
  also an instance of the standard error type

#### Scenario: An unresolved target reference
- **WHEN** the target reference of a move does not resolve in the repository
- **THEN** the system raises the dedicated error type naming the reference
  that could not be found

### Requirement: An optional read swallows the dedicated error type
The system SHALL provide a way to run a read that may legitimately fail
because of the same refusal condition. For callers that treat the read as
optional, the system SHALL swallow that refusal by returning an empty
result rather than propagating the error.

#### Scenario: Optional read succeeds
- **WHEN** an optional read completes without triggering a refusal
- **THEN** the caller receives the read's result

#### Scenario: Optional read hits a refusal
- **WHEN** an optional read would otherwise raise the dedicated error type
- **THEN** the system returns an empty result instead of propagating the
  error
