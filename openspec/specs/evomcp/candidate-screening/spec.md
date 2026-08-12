# Candidate Screening Specification

## Purpose

Keeps the search honest from plan diversity through to the winner. Before
solve or evolve spend a token on a plan, screening thins near-duplicate plans.
After a candidate passes verification, screening still checks it for gaming
the metric and for touching files outside its mandate, and every refusal it
produces gets reported rather than dropped in silence. Screening also
compiles verification output into diagnostics a repair loop can act on, and
assembles the deterministic context a generation call reads from.

## Requirements

### Requirement: Pre-fanout plans are deduplicated by token overlap
The system SHALL deduplicate a list of candidate plans before fanout by
comparing each plan's summary text against the summaries already kept. It
SHALL discard a plan when its token-overlap ratio against an already-kept
plan exceeds 0.65. The overlap ratio SHALL be computed as the fraction of the
shorter summary's tokens that also appear in the longer summary's tokens.

#### Scenario: Near-duplicate plan discarded
- **WHEN** a plan's summary shares more than 65% of its tokens with a
  summary already kept
- **THEN** the system discards the later plan and keeps the first

#### Scenario: Sufficiently different plan kept
- **WHEN** a plan's summary shares 65% or less of its tokens with every
  summary already kept
- **THEN** the system keeps the plan

### Requirement: Tokenization for dedup filters stopwords and short tokens
The system SHALL lowercase and strip punctuation before tokenizing a plan
summary. It SHALL discard tokens of length two or less and tokens found in
its English stopword list before computing overlap.

#### Scenario: Stopword-only difference does not save a plan
- **WHEN** two plan summaries differ only in articles, conjunctions, and
  other stopwords
- **THEN** the system treats their token sets as equal for overlap purposes

### Requirement: Degenerate detectors catch metric-gaming candidates
The system SHALL scan a candidate's diff for hardcoded test outputs, deleted
assertions, broadened exception catches, dense type-ignore or lint
suppressions, disabled lint directives, runs of commented-out code, empty
test bodies, and TODO bombs in production files. Each finding SHALL carry a
severity of block or warn. The system SHALL mark a candidate unclean when it
carries at least one block-severity finding.

#### Scenario: Test input equals its expected output
- **WHEN** an added test line asserts that a function's output equals the
  literal it was called with
- **THEN** the system reports a block-severity hardcoded-test-output finding

#### Scenario: Three or more assertions deleted
- **WHEN** a diff removes three or more assertion lines
- **THEN** the system reports a block-severity deleted-assertion finding

#### Scenario: Specific catch replaced with a broad one
- **WHEN** a diff removes a catch naming a specific error type and adds a
  catch with no type or a blanket type
- **THEN** the system reports a block-severity broadened-catch finding

#### Scenario: Type-suppression density over threshold
- **WHEN** more than 5% of a diff's added lines carry a type-ignore or
  lint-suppression marker, and the diff adds at least 20 lines
- **THEN** the system reports a block-severity type-ignore-density finding

#### Scenario: Lint rule disabled
- **WHEN** an added line disables a lint rule inline or for a file
- **THEN** the system reports a block-severity disabled-lint finding

#### Scenario: Empty test body
- **WHEN** an added test function has an empty body
- **THEN** the system reports a block-severity empty-test finding

#### Scenario: Long run of commented-out code
- **WHEN** a diff adds three or more consecutive commented-out lines
- **THEN** the system reports a warn-severity commented-out-code finding

#### Scenario: TODO bomb in production code
- **WHEN** a diff adds three or more TODO, FIXME, HACK, or WORKAROUND
  markers across non-test files
- **THEN** the system reports a warn-severity todo-bomb finding

### Requirement: A candidate is rejected on any block finding or on multiple findings
The system SHALL reject a candidate whose degenerate report is unclean. It
SHALL also reject a candidate carrying two or more findings of any severity,
even when none of them is block-severity. It SHALL NOT reject a candidate
for a single warn-severity finding alone.

#### Scenario: Single warn-only finding accepted
- **WHEN** a candidate's degenerate report holds exactly one warn-severity
  finding and no block-severity finding
- **THEN** the system does not reject the candidate on that report

#### Scenario: Two warn-only findings rejected
- **WHEN** a candidate's degenerate report holds two or more findings, all
  warn-severity
- **THEN** the system rejects the candidate

### Requirement: Screening runs the degenerate check before the allowed-files check
The system SHALL run the degenerate check on a candidate before checking
whether its diff touches only allowed files. It SHALL check the diff's
touched files against the caller's allow list only after the candidate
clears the degenerate check. An absent allow list SHALL skip the
allowed-files check entirely.

#### Scenario: Degenerate candidate never reaches the allowed-files check
- **WHEN** a candidate's degenerate report is unclean
- **THEN** the system reports the degenerate rejection and does not evaluate
  allowed_files for that candidate

#### Scenario: Clean candidate touching a disallowed file
- **WHEN** a candidate clears the degenerate check but its diff touches a
  file outside the caller's allowed_files patterns
- **THEN** the system rejects the candidate and names the outside files

#### Scenario: No allow list configured
- **WHEN** the caller sets no allowed_files
- **THEN** the system accepts any file the diff touches

### Requirement: Every refusal is reported, never dropped in silence
The system SHALL record every candidate rejection, whether from the
degenerate check or the allowed-files check, as a named refusal attached to
its run. A rejected candidate SHALL NOT be silently discarded; the run
result SHALL always be able to account for why a candidate that reached
screening did not survive.

#### Scenario: Rejection surfaces in the run result
- **WHEN** a candidate is rejected by either screening check
- **THEN** the system attaches a rejection reason naming the candidate and
  the check that rejected it to the run's results

### Requirement: The judge compares multiple surviving candidates on a weighted rubric
The system SHALL score two or more candidates on correctness, clarity,
efficiency, and maintainability, and SHALL combine those scores with weights
0.4, 0.2, 0.2, and 0.2 respectively when deciding a winner from numeric
scores. It SHALL declare a winner rather than score when only one candidate
is given.

#### Scenario: Single candidate needs no judging
- **WHEN** exactly one candidate is given to the judge
- **THEN** the system returns that candidate as winner without scoring it

#### Scenario: Judge output names a winner with no matching scores
- **WHEN** the judge's parsed verdict names a winner branch that has no
  entry in its own scores
- **THEN** the system recomputes the winner as the candidate with the
  highest weighted composite score

### Requirement: The judge falls back to composite scoring when the LLM judge is unavailable
The system SHALL fall back to sorting candidates by their own numeric score,
highest first, whenever the judge proxy is unreachable, the judge process
fails or times out, or its output cannot be parsed into a verdict. A
fallback verdict SHALL be marked as a fallback and SHALL carry the reason in
its rationale.

#### Scenario: Judge process times out
- **WHEN** the spawned judge process reports a timeout
- **THEN** the system selects a winner by composite score and marks the
  result as a fallback

#### Scenario: No candidate carries a numeric score
- **WHEN** the fallback runs and no candidate carries a score
- **THEN** the system returns the first candidate as winner

### Requirement: Diagnostic feedback is parsed from verification output with attached context
The system SHALL parse raw verification output into structured diagnostics
recognizing TypeScript, ESLint, Biome, Python traceback, Rust, Go, and
Jest/Vitest formats. For each diagnostic with a known file and line, it
SHALL attach a window of source lines read from that file around the
reported line. It SHALL wrap unparseable output as a single diagnostic
carrying the raw text rather than discarding it.

#### Scenario: Unparseable output is preserved
- **WHEN** raw verification output matches none of the known diagnostic
  formats
- **THEN** the system returns one diagnostic carrying the raw text, not an
  empty list

#### Scenario: Diagnostic with a resolvable file and line gets context
- **WHEN** a parsed diagnostic names a file that exists on disk and a
  positive line number
- **THEN** the system attaches source lines surrounding that line to the
  diagnostic

#### Scenario: Diagnostic with no resolvable file gets no context
- **WHEN** a parsed diagnostic names no file or a file that does not exist
- **THEN** the system leaves that diagnostic's context empty rather than
  failing

### Requirement: Diagnostics are deduplicated, severity-sorted, and capped to a token budget
The system SHALL remove a diagnostic that repeats an earlier diagnostic's
file, line, and message prefix. It SHALL order the remaining diagnostics
errors first, then warnings, then info, and by file and line within a
severity tier. It SHALL cap the compiled diagnostics to roughly 300
estimated tokens by dropping lower-severity diagnostics before truncating
the surviving ones' text.

#### Scenario: Duplicate diagnostic dropped
- **WHEN** two diagnostics share the same file, line, and the first 80
  characters of their message
- **THEN** the system keeps only the first one

#### Scenario: Output exceeds the token budget
- **WHEN** the compiled diagnostics estimate above roughly 300 tokens
- **THEN** the system drops info-severity diagnostics first, then
  warning-severity diagnostics, before it truncates remaining messages and
  context

### Requirement: Context is assembled deterministically across seven layers and cached
The system SHALL assemble a curated context from up to seven layers, in
order: goal, strategy, target files, dependency graph, constraints, prior
attempts, and failure signatures. It SHALL include a layer's section only
when that layer's data is present. It SHALL cache an assembled result keyed
by a content hash of its input layers, and SHALL return the cached result
for identical layers rather than reassembling.

#### Scenario: Layer omitted when absent
- **WHEN** a context assembly call supplies no prior attempts
- **THEN** the assembled text carries no Prior Attempts section and the
  result's layer list does not name it

#### Scenario: Identical layers hit the cache
- **WHEN** context assembly runs twice with layers that hash identically
- **THEN** the system returns the previously assembled result instead of
  reassembling

#### Scenario: Assembled text exceeds the character budget
- **WHEN** the assembled sections exceed the assembler's character budget
- **THEN** the system truncates the assembled text and marks it as
  truncated
