# Quality MCP Tools Specification

## Purpose

Lets an agent ask the same structural questions the write gate asks, on demand
and over any set of paths. The tools wrap one scanner, so a scan an agent runs
by hand and a gate that blocks a write always agree.
## Requirements
### Requirement: Server exposes three tools

The server SHALL expose a scan tool that reports violations. It SHALL expose a baseline gate tool that returns a ratchet verdict. It SHALL expose a waiver tool that lists open skip records. It SHALL expose a commit-gate tool that judges staged content. Each SHALL return text content.

#### Scenario: Client lists the tools
- **WHEN** a client asks the server what tools it offers
- **THEN** the server names the scan tool, baseline gate tool, waiver tool, and commit-gate tool, each with a description

### Requirement: Scan reports without judging

The scan tool SHALL take one or more paths. It SHALL optionally take a root, a
rule list, path fragments to exclude, path fragments to treat as test code, and
a profile. It SHALL return the scanner's report as JSON. It SHALL apply no pass
or fail verdict.

#### Scenario: Scan a directory
- **WHEN** the tool is called with a path
- **THEN** it returns the report as JSON, holding the summary and the violation
  list

#### Scenario: No path given
- **WHEN** the tool is called with an empty path list
- **THEN** the call is rejected, because at least one path is required

### Requirement: Gate returns a verdict against a baseline

The gate tool SHALL require a baseline path as well as the paths to scan. It
SHALL default to failing on a regression. It SHALL return the verdict, the
scanner's exit code, and the full report.

#### Scenario: Regression against the baseline
- **WHEN** the scanned paths raise a recorded count
- **THEN** the tool returns a failing verdict with the exit code and the report

#### Scenario: Clean run
- **WHEN** no recorded count rose
- **THEN** the tool returns a passing verdict

### Requirement: Waiver tool lists only open records

The waiver tool SHALL require a repository root. It SHALL list every record
that is not acknowledged, naming the file, the kind of waiver, and its time.
It SHALL say plainly when none are open, and SHALL say how to acknowledge one.

#### Scenario: Open waivers exist
- **WHEN** the log holds unacknowledged records
- **THEN** the tool lists each one with its reasons and states how to
  acknowledge it

#### Scenario: Every waiver acknowledged
- **WHEN** no record is open
- **THEN** the tool reports that no waiver is unacknowledged

### Requirement: A failed scan is reported, not thrown

A tool SHALL return an error message as ordinary text rather than a protocol
error. The message SHALL name what failed and SHALL NOT leak a stack trace. A
scanner run that produced a report SHALL be returned as a verdict, even when
its exit code is non-zero.

#### Scenario: Scanner cannot start
- **WHEN** the scanner process fails to produce any report
- **THEN** the tool returns text naming the failure

#### Scenario: Scanner exits non-zero with a report
- **WHEN** the gate fails and the scanner still returns a report
- **THEN** the tool returns a failing verdict and the report, not an error

### Requirement: Importing the server never opens a transport

The server SHALL connect its transport only when the module is run as the
program's entry point. A failure to start SHALL be written to stderr and SHALL
exit non-zero.

#### Scenario: Test imports the module
- **WHEN** a test imports the server module
- **THEN** no stdio transport is opened

#### Scenario: Server started as a program
- **WHEN** the bundle is run directly
- **THEN** the server connects over stdio and reports the package's own version

### Requirement: The tools and the gate agree on where records live

The skip-log path the waiver tool reads SHALL be the same path the write gate
writes. The baseline path the gate tool describes SHALL be the same path the
write gate reads. Both pairs live on either side of a TypeScript boundary, so
each side keeps its own copy of the constant. A test SHALL assert that both
sides of each pair still name the same path.

#### Scenario: Skip-log path changes on one side
- **WHEN** either side's skip-log constant changes without the other
- **THEN** the test fails, because a drift there would hide waivers from the
  waiver tool

#### Scenario: Baseline path changes on one side
- **WHEN** either side's baseline path changes without the other
- **THEN** the test fails, because the gate tool would send a caller to a
  baseline the write gate never reads

### Requirement: Commit-gate tool uses the authoritative decision
The commit-gate tool SHALL require a repository root and SHALL accept change or refactor intent plus an optional target. It SHALL return the same verdict, fingerprint, and ordered findings as `quality-guard check --staged` for the same Git state. It SHALL NOT maintain a second implementation of the decision rules.

#### Scenario: Agent checks a staged change
- **WHEN** an MCP client invokes the commit-gate tool for a repository with staged source changes
- **THEN** the tool returns `PASS`, `REVIEW_REQUIRED`, or `FAIL` with the staged fingerprint and findings

#### Scenario: Refactor tool call omits target
- **WHEN** an MCP client selects refactor intent without a target
- **THEN** the tool returns a concise usage error as text and no stack trace
