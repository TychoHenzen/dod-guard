## Purpose

Detects prototype work sessions from repository history and identifies which participating files consolidated or became fossil candidates.

## ADDED Requirements

### Requirement: History activity model
The analyzer SHALL read every non-merge commit reachable through any parent of HEAD within the configured lookback window, use committer epoch timestamps normalized to UTC, and record each logical file's commit count, first and last appearance, and creation or deletion status.

#### Scenario: Merge commits do not add activity
- **WHEN** a merge commit falls inside the lookback window
- **THEN** its file list does not increase any burst or file activity count

#### Scenario: Commit time is deterministic
- **WHEN** commits carry different author time zones or appear in non-monotonic traversal order
- **THEN** burst ordering uses UTC committer epoch time followed by commit hash as a stable tie-breaker

#### Scenario: Future commit time is incomplete evidence
- **WHEN** an included commit has a committer time later than analysis time
- **THEN** the analyzer records a history-completeness warning and does not close its temporal cluster

#### Scenario: Rename preserves logical identity
- **WHEN** Git reports a file rename at its 50 percent similarity threshold inside or after a burst
- **THEN** activity before and after the rename is assigned to one logical file whose reported path is the current path

#### Scenario: Copy or delete-recreate starts another identity
- **WHEN** Git reports a copy or separate deletion and addition instead of a rename
- **THEN** the destination and prior path retain separate logical file identities

#### Scenario: Extension filter limits history
- **WHEN** an extension filter is supplied
- **THEN** only matching candidate files contribute to burst qualification and Git scoring while cross-extension files remain eligible reference neighbors

#### Scenario: Extension values are normalized
- **WHEN** extension values differ by leading dot or letter case
- **THEN** the analyzer compares them case-insensitively after adding one leading dot

### Requirement: History completeness reporting
The analyzer SHALL detect shallow repositories, sparse checkouts, and nested submodules and SHALL describe their effect in report warnings without traversing submodule contents.

#### Scenario: Shallow history is reported
- **WHEN** Git identifies the repository as shallow
- **THEN** analysis completes with a warning that burst and consolidation history may be incomplete

#### Scenario: Sparse checkout is reported
- **WHEN** the working tree uses sparse checkout
- **THEN** analysis completes with a warning that current-file existence and references may be incomplete

#### Scenario: Empty repository has no bursts
- **WHEN** the target is a Git repository with no commits
- **THEN** analysis succeeds with zero bursts and a history-completeness warning

### Requirement: Temporal burst detection
The analyzer SHALL start a new temporal cluster when consecutive included commits are separated by more than the configured gap.

#### Scenario: Gap above threshold splits commits
- **WHEN** two consecutive included commits are separated by more than the configured gap
- **THEN** the commits belong to different temporal clusters

#### Scenario: Gap at threshold keeps commits together
- **WHEN** two consecutive included commits are separated by exactly the configured gap
- **THEN** the commits remain in the same temporal cluster

### Requirement: File-set change-point detection
After temporal clustering, the analyzer SHALL recursively split at a sustained file-set change. For a cut before commit `i`, it SHALL compare the union of logical files in commits `i-5` through `i-1` with commits `i` through `i+4`. Each file SHALL have weight `ln((1 + C) / (1 + touches(file))) + 1`, where `C` is the included history-window commit count. Similarity SHALL be the summed weight of the intersection divided by the summed weight of the union, with two empty windows defined as 1.0. A cut qualifies when the adjacent gap is at least four hours, similarity is at most 0.10, and both complete partitions still qualify.

#### Scenario: Disjoint close work becomes separate bursts
- **WHEN** a qualifying temporal cluster contains a qualifying change point less than the temporal gap apart
- **THEN** the analyzer reports separate bursts on the two sides of that change point

#### Scenario: Small partition prevents a close split
- **WHEN** a low-similarity change point would leave either side with fewer than five commits or fewer than three distinct files
- **THEN** the analyzer keeps the temporal cluster intact at that change point

#### Scenario: Deterministic recursive split order
- **WHEN** more than one qualifying change point exists in a cluster
- **THEN** the analyzer selects the lowest similarity first, then the largest time gap, then the earliest commit position, and recursively evaluates both results

#### Scenario: Close split refines temporal clustering
- **WHEN** a change point qualifies inside one temporal cluster
- **THEN** the final burst dates, counts, and membership use the recursively split partitions rather than the initial cluster

### Requirement: Burst qualification
The analyzer SHALL keep only closed bursts containing at least five commits and at least three distinct included files.

#### Scenario: Ordinary small cluster is dropped
- **WHEN** a closed cluster contains fewer than five commits or fewer than three distinct included files
- **THEN** the cluster does not appear as a prototype burst

#### Scenario: Recent temporal cluster remains unfinished
- **WHEN** less than the configured gap has elapsed between the newest included commit in a temporal cluster and analysis time
- **THEN** that cluster does not produce survivors or fossil candidates

### Requirement: Consolidation classification
For each burst, the analyzer SHALL count reachable non-merge commits after the burst's last commit time through repository HEAD for every participating logical identity. It SHALL classify current files as survivors or fossil candidates using the resolved rename identity.

#### Scenario: Absolute survivor threshold
- **WHEN** a burst file has at least three post-burst commits
- **THEN** the file is classified as a survivor

#### Scenario: Relative survivor threshold
- **WHEN** a burst file has post-burst commits at least 20 percent of the maximum post-burst commit count among that burst's files and that maximum is greater than zero
- **THEN** the file is classified as a survivor

#### Scenario: Zero post-burst maximum creates no relative survivor
- **WHEN** every burst file has zero post-burst commits
- **THEN** no file becomes a survivor through the relative activity rule

#### Scenario: Quiet current file becomes a candidate
- **WHEN** a burst file meets neither survivor threshold and still exists at its resolved current path
- **THEN** the file is classified as a fossil candidate for that burst

#### Scenario: Deleted file is not fossilized
- **WHEN** a non-survivor burst file no longer exists at repository HEAD
- **THEN** the file is omitted from fossil candidates and recorded as deleted
