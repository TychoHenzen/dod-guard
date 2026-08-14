## Purpose
Lightweight development skill that asks a few clarifying questions, creates minimal OpenSpec documentation, builds the feature via step-by-step execution, and syncs behavioral changes back to specs.

## ADDED Requirements

### Requirement: Minimal clarification
The skill SHALL ask at most 3 clarifying questions before starting work. It SHALL focus on scope boundaries and acceptance criteria rather than exhaustive requirements. It SHALL use AskUserQuestion with concrete options rather than open-ended text prompts.

#### Scenario: Clear request needs one question
- **WHEN** the user's request has an obvious scope and only one ambiguous acceptance criterion
- **THEN** the skill asks one question and proceeds

#### Scenario: Ambiguous request needs three questions
- **WHEN** the user's request has unclear scope or multiple possible interpretations
- **THEN** the skill asks at most 3 questions before proceeding

### Requirement: Adaptive artifact depth
The skill SHALL assess the change size and decide which artifacts to create. A small change (1-3 files, one capability) gets a proposal and tasks only. A larger change (4+ files or multiple capabilities) gets a proposal, specs, and tasks. Design is included only when the skill detects cross-cutting concerns or ambiguous architecture choices.

#### Scenario: Small change skips specs and design
- **WHEN** the change touches 1-3 files in one component
- **THEN** the skill creates a proposal and tasks with `skip_specs: true` in `.openspec.yaml`, and no design

#### Scenario: Larger change includes specs
- **WHEN** the change touches 4 or more files or introduces a new capability
- **THEN** the skill creates a proposal, specs, and tasks

#### Scenario: Cross-cutting change includes design
- **WHEN** the change crosses multiple packages or introduces architectural decisions
- **THEN** the skill creates a proposal, specs, design, and tasks

### Requirement: Automatic steps generation and handoff
The skill SHALL generate `steps.json` via `dod-guard steps <change-id>` after writing tasks, fill in the `files` and `verify_surface` fields, and invoke `/dod-guard:step-by-step` for execution.

#### Scenario: Steps generated and step-by-step invoked
- **WHEN** tasks are written and steps generated
- **THEN** the skill invokes `/dod-guard:step-by-step` with the change id

### Requirement: Post-implementation spec sync
The skill SHALL offer to sync behavioral changes back to specs after implementation completes. When the change created specs, it runs `dod-guard cover <change-id>` to verify. When the change skipped specs, it asks the user whether the behavioral changes warrant retroactive specs.

#### Scenario: Change had specs and coverage passes
- **WHEN** the change created spec deltas and `dod-guard cover` exits 0
- **THEN** the skill archives the change

#### Scenario: Change skipped specs but added behavior
- **WHEN** the change set `skip_specs: true` and the implementation introduced new observable behavior
- **THEN** the skill asks whether to create retroactive spec deltas or archive as-is

### Requirement: Single-flow execution
The skill SHALL run the entire flow (clarify, create change, generate steps, hand off to step-by-step) in one invocation without requiring the user to run separate slash commands between phases.

#### Scenario: Complete flow in one run
- **WHEN** the user runs `/opsx:quick build a retry mechanism for the cascade solver`
- **THEN** the skill asks clarifying questions, creates the change, generates steps, and hands off to step-by-step without the user typing another command
