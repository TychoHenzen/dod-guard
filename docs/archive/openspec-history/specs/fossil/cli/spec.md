# fossil/cli Specification

## Purpose
Provides a stable command-line and programmatic contract for running fossil analysis and consuming its human-readable or machine-readable results.
## Requirements
### Requirement: Analyze command
The package SHALL provide `fossil analyze [repo-path]` with the documented analysis options, including comma-separated caller exclusion globs through `--exclude <list>`, and SHALL use the current directory when the repository path is omitted.

#### Scenario: Defaults are applied
- **WHEN** `fossil analyze` is invoked without options
- **THEN** it analyzes the current directory with 90 days, a 48-hour gap, a 0.4 threshold, table output, all extensions, and untracked age of 90 days

#### Scenario: Explicit options are applied
- **WHEN** valid days, gap, threshold, format, extensions, untracked age, exclusions, or verbose options are supplied
- **THEN** the analysis result reflects those values

### Requirement: Argument validation
The CLI SHALL reject a days or untracked-age value outside 1 through 3650, a gap outside 1 through 8760 hours, a threshold outside zero through one, more than 64 extensions, an unknown format, an unknown option, or an extra positional argument.

#### Scenario: Invalid arguments use the usage exit
- **WHEN** command-line validation fails
- **THEN** the CLI writes a concise diagnostic and usage to stderr and exits with code 2

### Requirement: Table output
Table mode SHALL write repository statistics, burst date ranges in UTC `YYYY-MM-DD`, commit and file counts, survivors, threshold-matching candidate findings, unique candidate path totals, warnings, and a separate workspace-debris section to stdout. It SHALL order bursts newest first, survivors by normalized path, findings by descending score then path, debris by path, and warnings by code then path.

#### Scenario: Burst table keeps context together
- **WHEN** a burst has survivors and reported fossil candidates
- **THEN** table output shows the survivors before that burst's score rows

#### Scenario: Verbose table explains a candidate
- **WHEN** verbose table mode reports a candidate
- **THEN** the row is followed by one line describing creation status, burst commits, post-burst commits, and reference evidence

#### Scenario: Redirected table contains no ANSI escapes
- **WHEN** stdout is not a TTY
- **THEN** table output contains no color escape sequences

#### Scenario: Repository text cannot control the terminal
- **WHEN** a repository path or warning contains tabs, newlines, escape bytes, or other control characters
- **THEN** table output renders those characters as visible escaped sequences without emitting repository-derived ANSI controls

### Requirement: Versioned JSON output
JSON mode SHALL use the platform JSON serializer to emit one valid JSON document with schema version 1, normalized options, repository statistics, warnings, bursts, survivors, burst-path findings, unique candidate counts, and workspace-debris findings. It SHALL contain bounded metadata and locations only, never source text, commit messages, environment values, or raw command output.

#### Scenario: JSON output is machine-readable
- **WHEN** analysis succeeds with JSON format
- **THEN** stdout parses as one JSON document and contains no table prose or ANSI escapes

#### Scenario: JSON distinguishes row and path totals
- **WHEN** a path appears as a candidate in multiple bursts
- **THEN** JSON reports both the burst-path finding count and the unique candidate path count

#### Scenario: Nonfatal warnings remain successful data
- **WHEN** analysis completes with reference or completeness warnings
- **THEN** JSON includes sorted bounded warning objects and the process still exits with code 0

### Requirement: Programmatic API parity
The package SHALL export an asynchronous repository-analysis API that accepts the same normalized analysis options and returns the same versioned report represented by JSON output. Invalid options SHALL reject with typed code `invalid_options`; Git, containment, or resource failures SHALL reject with typed analysis error codes; nonfatal problems SHALL remain report warnings.

#### Scenario: CLI and API agree
- **WHEN** the CLI and programmatic API analyze the same repository with the same options
- **THEN** their versioned report data is equivalent apart from presentation-only fields

#### Scenario: Typed API failure maps to CLI status
- **WHEN** the API rejects with `invalid_options` or another fatal analysis error
- **THEN** the CLI maps it to exit code 2 or 1 respectively without writing partial success output

### Requirement: Process outcomes
The CLI SHALL exit with code 0 after a completed analysis, code 1 after a repository or analysis failure, and code 2 after command-line validation failure. It SHALL visibly escape control characters and cap every stderr diagnostic at 4 KiB.

#### Scenario: No findings is successful
- **WHEN** analysis completes without fossil or workspace-debris findings
- **THEN** the CLI exits with code 0 and reports zero findings

#### Scenario: Non-repository is an analysis failure
- **WHEN** the target path is not inside a readable Git repository
- **THEN** the CLI writes a bounded control-safe Git diagnostic to stderr and exits with code 1

### Requirement: Safe Git execution
The analyzer SHALL require Git 2.30 or newer and record its version. It SHALL invoke Git with argument arrays, `shell: false`, `--no-pager`, `--no-ext-diff` where supported, `-c core.fsmonitor=false`, `-c diff.external=`, noninteractive prompt and pager environment settings, and `--` before any pathspec. It SHALL never interpolate user input or Git-derived paths into a shell command. History and inventory commands SHALL use NUL-delimited paths, epoch timestamps, and disabled Git path quoting.

#### Scenario: Repository path is data, not a command
- **WHEN** the repository path contains spaces or shell metacharacters
- **THEN** Git receives it as one argument and no shell interpretation occurs

#### Scenario: Unusual filename remains one structured path
- **WHEN** Git reports a filename containing whitespace, a newline, a quote, or a control byte
- **THEN** NUL-delimited parsing retains one path value and does not create a false status or commit record

#### Scenario: Git cannot open an interactive process
- **WHEN** repository configuration names a pager, credential helper, or interactive prompt
- **THEN** fossil's Git subprocess remains noninteractive and returns bounded output or a fatal error

#### Scenario: Repository Git helper is disabled
- **WHEN** repository configuration names an executable filesystem monitor or external diff helper
- **THEN** fossil's read-only Git commands do not execute that helper

#### Scenario: Unsupported Git version fails capability check
- **WHEN** the available Git version is older than 2.30 or required command options are unavailable
- **THEN** analysis rejects with a bounded typed Git capability error before reading repository history

### Requirement: Analysis resource bounds
The analyzer SHALL stream Git output and stop with a typed `resource_limit` error after more than 100,000 included commit records, 1,000,000 file-status records, 100,000 inventoried files, 256 MiB of Git stdout, or 1 MiB of Git stderr. It SHALL terminate the child on a streaming limit breach and emit no partial report. Reference content limits SHALL degrade to incomplete-analysis warnings as defined by reference analysis rather than truncating Git evidence silently.

#### Scenario: Commit limit fails explicitly
- **WHEN** history contains more than 100,000 included commit records
- **THEN** analysis rejects with `resource_limit` and does not emit a partial fossil report

#### Scenario: File inventory limit fails explicitly
- **WHEN** current tracked and eligible workspace inventory exceeds 100,000 files
- **THEN** analysis rejects with `resource_limit` and does not emit a partial fossil report

#### Scenario: Git byte or status limit terminates ingestion
- **WHEN** one or more Git subprocess streams exceed the stdout, stderr, or file-status limit
- **THEN** fossil terminates the child and rejects with `resource_limit` without buffering or emitting a partial report

### Requirement: Analysis performance
On a GitHub-hosted `ubuntu-24.04` runner with Node.js 22, the benchmark SHALL prepare a temporary Git repository containing 5,000 non-merge commits and 1,000 eligible source files, run one untimed JSON analysis to warm Git and filesystem caches, then run three timed fresh-process JSON analyses. Fixture creation and warm-up are outside the timed interval. Process startup, Git subprocesses, analysis, and JSON serialization are inside each interval. The benchmark SHALL write the three durations and maximum duration as JSON, and every timed run SHALL finish within 10 seconds.

#### Scenario: Target-size fixture meets runtime bound
- **WHEN** the performance fixture is analyzed on the CI runner
- **THEN** elapsed wall time is less than 10 seconds

### Requirement: CLI-only package contract
The `@dod-guard/fossil` workspace SHALL expose `dist/index.js` as its programmatic entry and a tracked `dist/bundle.js` as its `fossil` executable. It SHALL participate in workspace build, test, bundle, lint, structural, audit, coverage, and CLI smoke gates without requiring an MCP or marketplace plugin manifest.

#### Scenario: Fossil package passes CLI integrity checks
- **WHEN** repository package-integrity validation runs
- **THEN** the fossil bundle answers `fossil --help` and analyzes a fixture without being subjected to an MCP handshake
