## Purpose

Defines how planned tasks map onto sub-issues: each sub-issue is a behavior slice that ships working and tested, and task categories become a checklist inside it.

## Requirements

### Requirement: Sub-issues are behavior slices
A structured parent SHALL be split into at most five sub-issues, each named by the behavior that it adds. A sub-issue SHALL NOT be named only by a layer or a task category such as domain rules, UI wiring, tests, or docs. Each sub-issue SHALL leave the system working with its tests passing.

#### Scenario: Category proposed as a sub-issue
- **WHEN** a plan proposes a sub-issue named "Tests"
- **THEN** refinement rejects that split and moves the test tasks into the slices whose behavior they test

#### Scenario: Six slices
- **WHEN** a plan needs more than five slices
- **THEN** refinement keeps the parent in Backlog and reports that its scope is more than one pull request

### Requirement: Category checklist inside a slice
Each slice sub-issue SHALL hold its tasks as a checklist grouped under category headings. A category SHALL appear only when it has at least one task in that slice.

#### Scenario: Slice with code, tests, and docs
- **WHEN** a slice needs a domain rule change, a test, and a doc update
- **THEN** its sub-issue body has a checklist with one heading per category and the matching tasks under each

### Requirement: Single trivial task stays in the parent
A slice whose whole work is one trivial task SHALL NOT get a sub-issue. Its task SHALL stay in the parent's task list.

#### Scenario: One-line doc fix
- **WHEN** a slice consists only of a one-line documentation fix
- **THEN** no sub-issue is created and the task appears in the parent's `task-list` record
