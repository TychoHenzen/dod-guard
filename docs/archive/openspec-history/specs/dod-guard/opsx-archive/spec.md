## Purpose

Gates the archive workflow with a lightweight code review over the change's affected files, catching implementation gaps that task checkboxes and scenario coverage miss.

## Requirements

### Requirement: Code review gate before archive
The skill SHALL run a PR-style code review over the files the change touched before running `openspec archive`. The review checks that the implementation matches the spec and that no obvious correctness issues remain. The review runs after the coverage gate passes and before the archive command.

#### Scenario: Review finds no issues
- **WHEN** the code review produces no findings
- **THEN** the skill proceeds to the archive command

#### Scenario: Review finds issues
- **WHEN** the code review produces one or more findings
- **THEN** the skill reports the findings to the user and asks whether to proceed or abort

#### Scenario: Skip-specs change skips review
- **WHEN** the change has `skip_specs: true` in `.openspec.yaml`
- **THEN** the skill skips the code review, the same as it skips the coverage gate

### Requirement: Review scope is the change's implementation files
The skill SHALL determine which files were touched by the change's implementation by reading the tasks file and the change's spec to identify the affected packages and source files. The review SHALL NOT review unrelated files.

#### Scenario: Review reads only affected files
- **WHEN** the review runs
- **THEN** it targets only the source files the change's tasks and specs identify as affected, not the entire repository

### Requirement: Review effort level
The skill SHALL run the review at `low` effort to keep the archive workflow fast. The review is a sanity check, not a deep audit.

#### Scenario: Review runs at low effort
- **WHEN** the review runs
- **THEN** it uses `/code-review low` or equivalent low-effort review
