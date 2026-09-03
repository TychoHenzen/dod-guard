# Baseline Ratchet Specification

## Purpose

Records what a repository measures today so that old debt is allowed and new
debt is not. One baseline file serves both the per-write gate and the CI
ratchet, so the two can never disagree about the bar.

## Requirements

### Requirement: Baseline records scanned files as well as counts

The baseline SHALL be a JSON document. It SHALL hold its format version, the
profile it was recorded under, and the time it was written. It SHALL also hold
the total violation count, the list of every file the recording scan walked,
and a count per file and rule pair. The current format version SHALL be 2.

The file list is load-bearing. Without it, a file the baseline never scanned
reads the same as a file that was clean. Every extracted file would then look
like a jump from zero.

#### Scenario: Clean file was scanned
- **WHEN** a scan records a baseline over a file that has no violations
- **THEN** the baseline lists that file and records no counts for it

#### Scenario: Counts carry no line numbers
- **WHEN** code moves within a file without changing how much it violates
- **THEN** the baseline comparison reports no change

### Requirement: An unreadable baseline stops the run

A baseline whose version is not 2, or which holds no file list, SHALL be
rejected. The message SHALL name the path, name the version found, and say to
record the baseline again.

#### Scenario: Baseline from an older format
- **WHEN** the scanner is pointed at a version 1 baseline
- **THEN** it reports the version mismatch on stderr and exits 3

### Requirement: Comparison is per file and rule pair

A comparison SHALL report a regression when a pair's count rose, an improvement
when it fell, and neither when it held. Each rule on a file SHALL ratchet
independently of every other rule on that file.

#### Scenario: One rule rises while another falls
- **WHEN** a file gains a complexity violation and loses a nesting violation
- **THEN** the comparison reports one regression and one improvement

#### Scenario: File no longer scanned
- **WHEN** a file the baseline lists is deleted or moved out of scope
- **THEN** the comparison reports an improvement, never a regression

### Requirement: Every violation counts, whatever its severity

The ratchet SHALL count warnings and errors alike. A rule the scanner rates as
a warning SHALL block a regression exactly as an error-severity rule does.

#### Scenario: Warning count rises
- **WHEN** a file goes from four todo markers to five
- **THEN** the comparison reports a regression

### Requirement: A file the baseline has never seen is adopted

A scanned file absent from the baseline's file list SHALL be adopted at
whatever it currently measures. Such a file SHALL never produce a regression.
The adopted counts SHALL be written back into the baseline, so the file
ratchets normally from the next run.

#### Scenario: File extracted out of a larger one
- **WHEN** a commit splits a file, so the new file is unknown to the baseline
- **THEN** the new file is adopted at its current counts, and the original
  file, now shorter, reports improvements

#### Scenario: New file is clean
- **WHEN** an unknown file holds no violations
- **THEN** nothing is adopted for it, because it has no counts to record

### Requirement: A known file is held to zero for a rule it has no row for

A file the baseline already lists SHALL have a bar of zero for any rule the
baseline records no count for. Its first violation of that rule SHALL be a
regression, not an adoption.

#### Scenario: New rule added to the rule set
- **WHEN** a rule is switched on and an already-listed file violates it
- **THEN** the comparison reports a regression, so the commit that adds the
  rule has to record the baseline again in the same commit

#### Scenario: Rule set widened for one run
- **WHEN** a run asks for more rules than the baseline was recorded with
- **THEN** every previously unrecorded pair reads as a regression from zero

### Requirement: Recording the baseline again is explicit

Writing the whole baseline SHALL happen only when the caller asks for it.
That write SHALL replace the file, so a file no longer scanned drops out.
A comparison run SHALL write back adopted files alone, and SHALL leave every
other recorded count as it was.

#### Scenario: Full recording after a deletion
- **WHEN** the caller records the baseline again after deleting a file
- **THEN** that file's rows are gone from the baseline

#### Scenario: Comparison run with an adoption
- **WHEN** a comparison adopts an unknown file
- **THEN** the baseline gains that file and its counts, and no other row
  changes

### Requirement: CI raises the bar when the repository improves

When a ratcheted run reports improvements and the gate passed, CI SHALL record
the tightened counts back into the baseline and commit them. When the gate
fails, CI SHALL NOT tighten the baseline.

#### Scenario: Commit removes violations
- **WHEN** a push lowers the count of a rule on a tracked file and the gate
  passes
- **THEN** CI commits the tightened baseline, so the lower count becomes the
  new bar

#### Scenario: Gate is red
- **WHEN** the ratchet reports a regression
- **THEN** CI leaves the baseline alone and the run fails

### Requirement: The repository ratchet checks more rules than the write gate

The repository ratchet SHALL check every rule a single file cannot decide,
which the per-write gate has to skip. Those are dead export, test-only export,
and duplicate block. It SHALL also check assumption marker, which the gate does
not ask for. It SHALL skip line length, because the repository formatter owns
that bound.

A write can therefore pass the gate and still fail the ratchet. The gate is the
narrower check, not the same check run earlier.

#### Scenario: Export goes dead
- **WHEN** an edit leaves an exported symbol with no reference anywhere
- **THEN** the write gate allows the write, and the repository ratchet reports
  the regression

#### Scenario: Guess left in a comment
- **WHEN** an edit adds an ASSUMPTION comment to a file the baseline lists with
  no count for that rule
- **THEN** the write gate allows the write, and the repository ratchet reports
  a regression from zero
