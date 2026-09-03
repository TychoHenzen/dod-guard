## Purpose

Calculates deterministic fossil evidence scores and assembles candidate findings with their survivors and originating prototype burst.

## ADDED Requirements

### Requirement: Churn score
The grader SHALL divide a candidate's positive commit count during its burst by the positive highest burst commit count of any file in that burst. Tied maxima SHALL each score 1.0.

#### Scenario: Churn is normalized within a burst
- **WHEN** a candidate has 12 burst commits and the burst maximum is 15
- **THEN** its churn score is 0.8

### Requirement: Abandonment score
The grader SHALL calculate abandonment as `max(0, 1 - postBurstCommits / burstCommits)`.

#### Scenario: Complete abandonment scores one
- **WHEN** a candidate has no post-burst commits
- **THEN** its abandonment score is 1.0

#### Scenario: Continued activity lowers abandonment linearly
- **WHEN** a candidate has two post-burst commits and four burst commits
- **THEN** its abandonment score is 0.5

### Requirement: Reference weakness score
The grader SHALL base reference weakness only on strong inbound references from non-candidate files, assigning 1.0 for none, 0.5 for one, and 0.0 for two or more.

#### Scenario: Only weak or vestigial references remain
- **WHEN** a candidate has no strong inbound reference from a non-candidate file
- **THEN** its reference weakness score is 1.0

#### Scenario: One strong live reference remains
- **WHEN** a candidate has exactly one strong inbound reference from a non-candidate file
- **THEN** its reference weakness score is 0.5

#### Scenario: Multiple strong live references remain
- **WHEN** a candidate has at least two strong inbound references from non-candidate files
- **THEN** its reference weakness score is 0.0

### Requirement: Cluster isolation score
The grader SHALL divide the candidate's unique fossil-candidate neighbors by all unique resolved inbound and outbound reference neighbors.

#### Scenario: Candidate only references fossils
- **WHEN** every unique resolved neighbor of a candidate is also a fossil candidate
- **THEN** its cluster isolation score is 1.0

#### Scenario: Candidate has no resolved neighbors
- **WHEN** a candidate has no resolved inbound or outbound neighbors
- **THEN** its cluster isolation score is 1.0

#### Scenario: Candidate only references live code
- **WHEN** every unique resolved neighbor of a candidate is not a fossil candidate
- **THEN** its cluster isolation score is 0.0

### Requirement: Combined fossil score
The grader SHALL calculate `0.30 * churnScore + 0.35 * abandonmentScore + 0.20 * referenceWeakness + 0.15 * clusterIsolation` when all four subscores are available and label the basis `full`.

#### Scenario: Complete scoring uses fixed weights
- **WHEN** all four subscores are available
- **THEN** the fossil score equals the weighted sum using the defined coefficients

#### Scenario: Missing reference analysis renormalizes Git signals
- **WHEN** reference weakness and cluster isolation are unavailable for a candidate
- **THEN** the fossil score uses churn weight `0.30 / 0.65`, abandonment weight `0.35 / 0.65`, and score basis `git-only`

#### Scenario: Reference subscores are available as a pair
- **WHEN** reference analysis is incomplete for a candidate
- **THEN** both reference weakness and cluster isolation are unavailable rather than renormalizing only one missing subscore

### Requirement: Threshold and burst assembly
The grader SHALL report candidate findings at or above the configured threshold and group each finding with its originating burst and survivors.

#### Scenario: Threshold is inclusive
- **WHEN** a candidate's fossil score equals the configured threshold
- **THEN** the candidate appears in its burst's findings

#### Scenario: Same path can carry burst-specific evidence
- **WHEN** one logical path qualifies as a fossil candidate in more than one burst
- **THEN** each qualifying burst-path finding retains its own activity and score breakdown

### Requirement: Advisory-only findings
Every fossil finding SHALL carry `classification: advisory` and SHALL expose its score basis and evidence without recommending or performing deletion.

#### Scenario: High score is not deletion authority
- **WHEN** a candidate receives the maximum fossil score
- **THEN** the API, JSON, and table output still describe it as advisory evidence rather than safe deletion
