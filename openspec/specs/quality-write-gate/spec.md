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

The gate SHALL take no action when the tool call names no file. It SHALL take
no action when the file extension is not one the scanner supports, or when the
file does not exist on disk. It SHALL take no action when the repository has no
recorded baseline.

#### Scenario: Markdown file written
- **WHEN** an edit targets a file whose extension the scanner does not support
- **THEN** the gate takes no action

#### Scenario: Repository has no baseline
- **WHEN** no baseline file exists under the repository root
- **THEN** the gate takes no action, because it has nothing to compare against

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

### Requirement: Git tracking decides how an unknown file is judged

A file the baseline has never seen and that git already tracks SHALL be adopted
at its current counts, with no ceiling applied. A file the baseline has never
seen and that git does not track SHALL be held to the new-file ceiling. When
the tracking answer cannot be read, the gate SHALL treat the file as untracked.

#### Scenario: Existing file scanned for the first time
- **WHEN** a git-tracked file that the baseline does not list is edited, and it
  measures over the ceiling
- **THEN** the gate allows the write and adopts the file into the baseline

#### Scenario: Brand new oversized file
- **WHEN** an untracked file measures over the ceiling
- **THEN** the gate blocks the write

#### Scenario: Not a git working tree
- **WHEN** git cannot answer whether the file is tracked
- **THEN** the gate applies the new-file ceiling

### Requirement: A new file is held to a generous ceiling

The new-file ceiling SHALL be the rule's hard bound multiplied by 1.5 and
rounded. It SHALL apply only to rules with a numeric bound, and SHALL block
only on a value strictly above the ceiling. The resulting ceilings are line
length 180, file length 450, function length 90, complexity 15, parameter
count 11, and nesting depth 8.

#### Scenario: New file just under the ceiling
- **WHEN** an untracked new file measures 449 lines
- **THEN** the gate allows the write

#### Scenario: New file just over the ceiling
- **WHEN** an untracked new file measures 451 lines
- **THEN** the gate blocks the write and names the ceiling it passed

#### Scenario: Rule with no numeric bound
- **WHEN** a new file holds violations of a presence rule such as a todo marker
- **THEN** the ceiling does not apply and the gate does not block on them

### Requirement: A blocked write records nothing

The gate SHALL update the baseline only when the write is allowed. A blocked
file SHALL NOT be adopted, and its counts SHALL NOT be recorded.

#### Scenario: Oversized new file is blocked
- **WHEN** the gate blocks an untracked new file
- **THEN** the baseline still does not list that file

#### Scenario: Write is allowed after adoption
- **WHEN** the gate allows a write for a file it adopted or rebaselined
- **THEN** the baseline records that file's current counts, replacing any rows
  it held before

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
