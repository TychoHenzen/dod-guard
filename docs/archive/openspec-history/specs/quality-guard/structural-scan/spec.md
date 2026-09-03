# Structural Scan Specification

## Purpose

Defines one structural measure of code quality that every consumer shares. The
scanner reads source files, applies one rule set across all supported
languages, and reports violations that a gate can act on.

## Requirements

### Requirement: Scanner runs as a standalone command

The scanner SHALL run as a single command with no install step and no runtime
dependencies. It SHALL accept one or more paths and resolve each one against
the root directory. It SHALL scan the current directory when given no path.

#### Scenario: No path given
- **WHEN** the scanner runs with no path argument
- **THEN** it scans the current directory

#### Scenario: Help requested
- **WHEN** the scanner runs with `--help`
- **THEN** it prints usage on stdout, names every rule it can emit, and exits 0

### Requirement: Exit codes separate a failed gate from a broken call

The scanner SHALL exit 0 when the gate passes, 1 when the gate fails, and 3
when the caller made a mistake. A usage error SHALL print the message and the
full usage text on stderr.

#### Scenario: Unknown flag
- **WHEN** the caller passes a flag the scanner does not define
- **THEN** the scanner reports the unknown option on stderr and exits 3

#### Scenario: Unknown rule name
- **WHEN** the caller passes `--rules` naming a rule the scanner cannot emit
- **THEN** the scanner names the unknown rules on stderr and exits 3

#### Scenario: Violations found with no failure condition set
- **WHEN** the scanner finds violations and the caller set no `--fail-on`
- **THEN** the scanner reports them and exits 0

### Requirement: Caller chooses what makes the run fail

The scanner SHALL accept a failure condition of `none`, `error`, `regression`,
or `any`, and SHALL default to `none`. It SHALL exit 1 only when the chosen
condition holds.

#### Scenario: Fail on any violation
- **WHEN** the caller sets the failure condition to `any` and the scan finds at
  least one violation
- **THEN** the scanner exits 1

#### Scenario: Fail on regression without a baseline
- **WHEN** the caller sets the failure condition to `regression` and passes no
  baseline
- **THEN** the scanner exits 0, because no comparison ran

### Requirement: Report is available as text, JSON, and work units

The scanner SHALL emit a report holding the profile, the count of files
scanned, and a summary. The report SHALL also hold the violation list, and the
baseline comparison when one ran. The scanner SHALL offer a human-readable text
form, a machine-readable JSON form, and a per-file work-unit form for planning
a refactor.

#### Scenario: Machine-readable output
- **WHEN** the caller asks for JSON output
- **THEN** the scanner prints the whole report as JSON on stdout and prints no
  other text

#### Scenario: Human-readable output
- **WHEN** the caller asks for text output
- **THEN** the scanner prints the file and violation counts, the count per
  rule, and the worst files in rank order

### Requirement: Numeric rules carry a preferred bound and a hard bound

Each numeric rule SHALL hold a preferred bound and a hard bound. A measured
value above the hard bound SHALL be an error. A value above the preferred bound
but not above the hard bound SHALL be a warning. Both comparisons SHALL be
strictly greater than, so a value equal to a bound never fires.

The bounds, preferred first, are these. Line length 80 and 120. File length 100
and 300. Function length 30 and 60. Cyclomatic complexity 5 and 10. Parameter
count 3 and 7. Nesting depth 3 and 5. Comment-to-code ratio 2 and 4. One type
per file has no preferred bound and an error bound of 1.

#### Scenario: Value sits exactly on the hard bound
- **WHEN** a function measures a cyclomatic complexity of 10
- **THEN** the scanner reports no error for it

#### Scenario: Value sits above the hard bound
- **WHEN** a file measures 301 lines
- **THEN** the scanner reports a file-length error

#### Scenario: Second top-level type in one file
- **WHEN** a file declares two top-level types
- **THEN** the scanner reports a types-per-file error, because that rule has no
  warning tier

### Requirement: Strict profile promotes the preferred bound

Under the strict profile, every numeric rule with a preferred bound SHALL treat
that bound as its error bound. Its old hard bound SHALL no longer apply. Every
presence rule SHALL become an error. A rule that already has no preferred bound
SHALL be left alone.

#### Scenario: Strict run on a long function
- **WHEN** a 40-line function is scanned under the strict profile
- **THEN** the scanner reports a function-length error, not a warning

### Requirement: Presence rules report a pattern, not a measurement

The scanner SHALL emit these rules on presence rather than on a threshold.
Tuple type, unused local, commented-out code, and dead export SHALL be
errors. Else branch, stateless method, comment restates code, todo marker,
assumption marker, and test-only export SHALL be warnings.

#### Scenario: Named tuple elements
- **WHEN** a tuple type gives every element a name
- **THEN** the scanner reports an `unnamed-tuple` error because all tuple types are forbidden

#### Scenario: Marker left in a comment
- **WHEN** a comment holds TODO, FIXME, HACK, or XXX
- **THEN** the scanner reports a todo-marker warning naming the comment

#### Scenario: Guess left in a comment
- **WHEN** a comment holds the word ASSUMPTION
- **THEN** the scanner reports an assumption-marker warning, so unverified
  guesses can be counted and ratcheted

### Requirement: Some rules need the whole project

Dead export, test-only export, and duplicate block SHALL be decided across the
whole scanned corpus, not from one file. An export referenced only by test code
SHALL be reported as test-only rather than dead.

#### Scenario: Export used nowhere
- **WHEN** an exported symbol has no reference in production code and none in
  test code
- **THEN** the scanner reports a dead-export error

#### Scenario: Export used only by tests
- **WHEN** an exported symbol is referenced by test code alone
- **THEN** the scanner reports a test-only-export warning

#### Scenario: Entry point export
- **WHEN** the export sits in an entry-point file such as `index`, `main`, or
  `cli`, or in a test file
- **THEN** the scanner reports neither export rule for it

### Requirement: One rule set covers every supported language

The scanner SHALL apply the same rules to TypeScript and JavaScript, C#, Rust,
Python, Go, Java and Kotlin, and C and C++. Language differences SHALL affect
only how a construct is recognised, never which rules apply.

#### Scenario: Mixed-language repository
- **WHEN** the scanner runs over a repository holding several supported
  languages
- **THEN** every file is measured against the same rule set and the same bounds

#### Scenario: Unsupported file type
- **WHEN** a file's extension is not one the scanner supports
- **THEN** the scanner does not read it and does not count it

### Requirement: Generated and vendored code is skipped

The scanner SHALL skip build output, dependency, and tooling directories such
as `node_modules`, `dist`, `build`, `out`, `target`, `bin`, `obj`, `vendor`,
`coverage`, and virtual environment directories. It SHALL skip minified files,
TypeScript declaration files, and files whose names mark them as generated. It
SHALL skip any file holding binary content.

#### Scenario: Dependency directory in the tree
- **WHEN** the scanned tree holds a `node_modules` directory
- **THEN** the scanner reads no file inside it

#### Scenario: Binary file with a source extension
- **WHEN** a file carries a source extension but holds control bytes
- **THEN** the scanner skips it rather than reporting violations for it

### Requirement: Root anchors manifest collection

The caller SHALL point the root at the repository, not at the scanned
subdirectory. The scanner SHALL collect manifest files from the root, and SHALL
count a symbol named in a manifest as a production reference.

#### Scenario: Class wired only by a scene or project file
- **WHEN** a class is referenced by a Godot scene, a C# project file, or
  another supported manifest under the root
- **THEN** the scanner does not report that class as a dead export

#### Scenario: Root points at a subdirectory
- **WHEN** the root points below the manifests that wire the scanned code
- **THEN** those manifests are out of scope and their references do not count

### Requirement: Test code is declared, not guessed

The scanner SHALL treat common test paths as test code by default, including
files named with `.test.` or `.spec.` and directories named `test`, `tests`, or
`__tests__`. The caller SHALL be able to declare further test paths, and any
path holding a declared fragment SHALL count as test code.

#### Scenario: Harness directory not declared
- **WHEN** test-support code sits in a directory the defaults do not match and
  the caller declares no extra test path
- **THEN** the scanner reads that code as production code

#### Scenario: Harness directory declared
- **WHEN** the caller declares that directory as a test path
- **THEN** the scanner treats the code inside it as test code

### Requirement: Comment rules judge a comment against the code under it

Comment bloat and comment restates code SHALL be decided against blanked
source. Blanking replaces every comment, string body, and regex literal with
whitespace of the same width. A comment sharing its line with remaining code
SHALL count as a trailing comment, and SHALL NOT open a comment block. Both
rules SHALL ignore a comment with no code under it. Both SHALL also ignore a
comment sitting above a file header such as an import block.

#### Scenario: Trailing comment
- **WHEN** a comment sits at the end of a line that also holds code
- **THEN** neither comment rule judges it as a standalone block

#### Scenario: Long comment over a short unit
- **WHEN** a comment block of at least five lines sits above code whose length
  is a small fraction of it
- **THEN** the scanner reports comment bloat

#### Scenario: Comment repeating the declaration below it
- **WHEN** a comment of at most two lines shares most of its content words with
  the code directly below it
- **THEN** the scanner reports that the comment restates the code

### Requirement: Marker rules read the comment text itself

Todo marker, assumption marker, and commented-out code SHALL be decided from
the raw comment text, and SHALL apply to trailing comments as well. A
documentation comment SHALL NOT be reported as commented-out code.

#### Scenario: Marker in a trailing comment
- **WHEN** a TODO sits in a comment at the end of a code line
- **THEN** the scanner still reports a todo-marker warning

#### Scenario: Documentation comment holding a code-shaped line
- **WHEN** a doc comment holds a line that reads like code
- **THEN** the scanner does not report commented-out code for it
