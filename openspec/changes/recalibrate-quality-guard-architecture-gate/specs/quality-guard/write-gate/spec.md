## MODIFIED Requirements

### Requirement: Gate declines work it cannot judge

The gate SHALL take no action when the tool call names no file. It SHALL take no action when the file extension is not one the scanner supports, or when the file does not exist on disk. When the repository has no recorded baseline, the gate SHALL still apply the scanner's absolute hard bounds but SHALL make no baseline comparison.

#### Scenario: Markdown file written
- **WHEN** an edit targets a file whose extension the scanner does not support
- **THEN** the gate takes no action

#### Scenario: Repository has no baseline
- **WHEN** no baseline file exists under the repository root and an agent writes a supported source file
- **THEN** the gate checks the file against absolute hard bounds and makes no regression claim

### Requirement: A blocked write records nothing

The gate SHALL NOT update the tracked quality baseline after any write. A blocked or allowed write SHALL leave the baseline byte-for-byte unchanged. Baseline recording SHALL remain an explicit repository or CI operation.

#### Scenario: Oversized new file is blocked
- **WHEN** the gate blocks an untracked new file
- **THEN** the tracked baseline remains unchanged

#### Scenario: Write is allowed after adoption
- **WHEN** the gate allows a tracked or untracked source write
- **THEN** the tracked baseline remains unchanged

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Git tracking decides how an unknown file is judged
**Reason**: Tracking status no longer authorizes adopting an unknown file or bypassing normal hard bounds during a write.

**Migration**: The write gate applies hard bounds without baseline mutation. The staged commit gate performs the authoritative repository decision.

### Requirement: A new file is held to a generous ceiling
**Reason**: Multiplying hard bounds by 1.5 permits the oversized agent-authored structures this change is intended to prevent.

**Migration**: Use the scanner's normal hard bounds and resolve the structural violation before the write passes.
