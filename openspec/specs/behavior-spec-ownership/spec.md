## Purpose

Defines where the plan and the behavior spec live: the GitHub issue owns the plan, the committed `openspec/specs/` tree owns behavior, and `openspec/changes/` is ignored local state.

## Requirements

### Requirement: Issue owns the plan, specs own behavior
`standards/project-workflow.md` SHALL name the GitHub issue as the owner of the plan, tasks, and acceptance criteria, and `openspec/specs/` as the owner of how the system behaves. It SHALL state that a local OpenSpec change folder is a working copy and never the source of truth.

#### Scenario: Plan disagrees with a local change folder
- **WHEN** the issue body and a local `openspec/changes/<name>/tasks.md` disagree
- **THEN** the workflow standard directs agents to follow the issue body

### Requirement: Change folders stay out of git
A repository that uses this workflow SHALL ignore `openspec/changes/` in git and SHALL track `openspec/config.yaml` and `openspec/specs/`.

#### Scenario: HagiCode writes a change folder
- **WHEN** a HagiCode session writes `openspec/changes/<name>/proposal.md`
- **THEN** `git status --porcelain` does not list that path

### Requirement: Behavior spec is not a planning file
`next-ticket` SHALL keep its rule against tracked planning files and SHALL allow changes under `openspec/specs/` as an explicit exception.

#### Scenario: Implementation updates a spec
- **WHEN** a ticket branch changes `openspec/specs/card-rules/spec.md`
- **THEN** `next-ticket` treats the path as in scope and does not report it as a planning file

#### Scenario: Implementation adds a change folder file
- **WHEN** a ticket branch would add a tracked file under `openspec/changes/`
- **THEN** `next-ticket` reports it as a planning file and leaves it out of the commit

### Requirement: Spec deltas merge in the implementing pull request
`next-ticket` SHALL merge the parent issue's requirement deltas into `openspec/specs/` on the ticket branch before the draft pull request is submitted, so that the spec change and the code change land in one pull request.

#### Scenario: Issue with two ADDED requirements
- **WHEN** the parent issue has two ADDED requirements in capability `card-rules`
- **THEN** the ticket branch contains `openspec/specs/card-rules/spec.md` with both requirements and their scenarios

### Requirement: complete-pr confirms the spec merge
Before any ready transition or merge, `complete-pr` SHALL confirm that every ADDED, MODIFIED, or RENAMED requirement in the parent issue appears by name in `openspec/specs/<capability>/spec.md` at the pull request head, and that every REMOVED requirement does not. A parent issue whose body has no capability-tagged requirement SHALL skip this check.

#### Scenario: Requirement missing from the spec
- **WHEN** R-2 is ADDED to `card-rules` but `openspec/specs/card-rules/spec.md` at the head has no requirement of that name
- **THEN** `complete-pr` stops before ready with `spec-merge-missing` and names R-2 and the spec path

#### Scenario: Legacy issue without capability tags
- **WHEN** the parent issue's requirement bullets carry no operation and capability
- **THEN** the spec-merge check reports `skipped` and `complete-pr` continues
