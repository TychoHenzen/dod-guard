# Write Gate Specification

## Purpose

Checks every code file an agent writes, at the moment it writes it, and blocks
the write when that file got structurally worse. The gate reports the reason
and the way to proceed, so a blocked agent is never stuck without a next move.
## Requirements
### Requirement: Gate runs after a file-writing tool call

The gate SHALL run after a `Write`, `Edit`, or `MultiEdit` tool call and SHALL
read the tool call as JSON on standard input. It SHALL take no action for any
other tool call.

#### Scenario: Agent writes a source file
- **WHEN** a `Write` call targets a supported source file
- **THEN** the gate scans that file and decides whether to block

#### Scenario: Agent runs a shell command
- **WHEN** any tool other than `Write`, `Edit`, or `MultiEdit` runs
- **THEN** the gate takes no action

### Requirement: Gate declines work it cannot judge

The gate SHALL take no action when the tool call names no file. It SHALL take no action when the file extension is not one the scanner supports, or when the file does not exist on disk. When the repository has no recorded baseline, the gate SHALL still apply the scanner's absolute hard bounds but SHALL make no baseline comparison.

#### Scenario: Markdown file written
- **WHEN** an edit targets a file whose extension the scanner does not support
- **THEN** the gate takes no action

#### Scenario: Repository has no baseline
- **WHEN** no baseline file exists under the repository root and an agent writes a supported source file
- **THEN** the gate checks the file against absolute hard bounds and makes no regression claim

### Requirement: A file can opt out and so can the whole session

A file whose opening text declares the gate off SHALL be skipped. The
declaration SHALL be matched case-insensitively within the first 500
characters. Setting the gate's environment variable to `off` SHALL disable
every check for the session.

#### Scenario: Fixture file declares itself exempt
- **WHEN** a file's first lines hold the opt-out marker
- **THEN** the gate takes no action for that file

#### Scenario: Session disables the gate
- **WHEN** the environment variable is set to `off`
- **THEN** the gate takes no action for any write

### Requirement: A broken gate never stops work

The gate SHALL exit 0 on any internal failure. Unreadable input, a scanner that
produced no usable output, and a rejected baseline SHALL all end in exit 0 with
no block. A timeout and an unexpected error SHALL end the same way.

#### Scenario: Scanner fails to run
- **WHEN** the gate cannot get a parseable report from the scanner
- **THEN** it exits 0 and the write stands

#### Scenario: Input is not valid JSON
- **WHEN** the gate reads input it cannot parse
- **THEN** it exits 0 and the write stands

### Requirement: A block names the violations and the way out

A blocked write SHALL exit with a non-zero blocking code and write its report
to stderr. The report SHALL name the file, list the offending violations,
and end with the command that reproduces the finding or the step that waives
it. The list SHALL be capped, with a count of how many more were found.

#### Scenario: Long list of violations
- **WHEN** a blocked write has more violations than the report shows
- **THEN** the report lists the cap and states how many more there are

#### Scenario: Tracked file got worse
- **WHEN** a tracked file's violation count rose
- **THEN** the report names each rule with its count before and after, shows
  the scanner command to run, and names the deliberate-raise step

### Requirement: A single-file scan judges only what one file can decide

The gate SHALL ask the scanner only for rules a single file can decide. Dead
export, test-only export, and duplicate block SHALL be excluded, because they
need whole-project reachability and a per-file run would call every export
dead. Line length SHALL be excluded, because the repository formatter owns it.

#### Scenario: File holds an unreferenced export
- **WHEN** a written file exports a symbol used only in another file
- **THEN** the gate does not report it as dead, and leaves that judgement to a
  repository-wide scan

#### Scenario: File holds a long line
- **WHEN** a written line is longer than the scanner's bound
- **THEN** the gate does not block on it

### Requirement: A blocked write records nothing

The gate SHALL NOT update the tracked quality baseline after any write. A blocked or allowed write SHALL leave the baseline byte-for-byte unchanged. Baseline recording SHALL remain an explicit repository or CI operation.

#### Scenario: Oversized new file is blocked
- **WHEN** the gate blocks an untracked new file
- **THEN** the tracked baseline remains unchanged

#### Scenario: Write is allowed after adoption
- **WHEN** the gate allows a tracked or untracked source write
- **THEN** the tracked baseline remains unchanged

### Requirement: The project linter runs on top of the structural gate

After the structural check passes, the gate SHALL run the repository's own
linter for that file. It SHALL do so only when the repository configures one.
It SHALL report only findings the repository itself rates as an error. A
rejected write SHALL say that the rules came from the repository config rather
than from the gate.

#### Scenario: Repository configures a linter
- **WHEN** the written file is one the configured linter covers and that linter
  reports an error on a line this call wrote
- **THEN** the gate blocks the write and lists that finding

#### Scenario: Linter reports a warning
- **WHEN** the linter's only finding is rated below error
- **THEN** the gate does not block

### Requirement: Findings are scoped to the lines this call wrote

The gate SHALL keep only linter findings that land on lines the tool call
produced. When the written text cannot be located in the file, or the call
replaced the whole file, the gate SHALL treat every line as changed.

#### Scenario: Edit inside a file with older problems
- **WHEN** an edit changes a few lines of a file that already fails the linter
  elsewhere
- **THEN** the gate reports only findings on the changed lines

#### Scenario: Whole-file write
- **WHEN** the call wrote the whole file
- **THEN** every finding in the file is in scope

### Requirement: A missing or slow linter never blocks a write

Each linter SHALL run only when the repository shows its configuration.
A missing binary, a timeout, or output that will not parse SHALL come back as
no findings. Single-file linters SHALL share a short timeout, and linters with
no single-file mode SHALL share a longer one.

#### Scenario: Linter binary is not installed
- **WHEN** the repository configures a linter whose binary is absent
- **THEN** the gate reports no findings and allows the write

#### Scenario: Whole-project linter times out
- **WHEN** a linter that must build the whole crate or solution passes its
  timeout
- **THEN** the gate reports no findings, and a quiet write is not proof the
  project is clean

#### Scenario: No linter configured
- **WHEN** the repository holds no configuration for any supported linter
- **THEN** the gate spawns nothing and reports no findings

### Requirement: A new file is held to normal hard bounds
An untracked supported source file SHALL be checked against the scanner's normal hard bounds. The write gate SHALL NOT multiply those bounds or adopt the file at its current counts. Presence errors SHALL block in the same way they block a normal scanner run.

#### Scenario: New file exceeds normal file limit
- **WHEN** an untracked new file measures 301 lines under the default profile
- **THEN** the gate blocks the write for exceeding the 300-line hard bound

#### Scenario: New file contains a second top-level type
- **WHEN** an untracked new file declares two top-level types
- **THEN** the gate blocks the write for the types-per-file error

### Requirement: Write-time success is not commit evidence
The write gate SHALL describe its verdict as file-local feedback. It SHALL NOT claim that repository reachability, directory placement, dependency boundaries, staged architecture, or commit readiness were checked. A successful write SHALL direct commit callers to the staged commit gate.

#### Scenario: File-local write passes
- **WHEN** the write gate finds no file-local regression or hard-bound violation
- **THEN** it allows the write and identifies the staged gate as the commit decision

#### Scenario: Project-level rule could not run
- **WHEN** a rule requires repository or staged-diff context
- **THEN** the write gate omits that rule and makes no clean claim about it
