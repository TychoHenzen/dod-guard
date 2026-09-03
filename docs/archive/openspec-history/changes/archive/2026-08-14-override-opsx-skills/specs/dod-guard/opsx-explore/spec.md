## Purpose
Thinking partner skill that helps the user explore ideas, investigate problems, and clarify requirements before or during an OpenSpec change, with awareness of existing specs, capability groups, and the dod-guard verification pipeline.

## ADDED Requirements

### Requirement: Existing spec awareness
The skill SHALL read existing specs from `openspec/specs/` and active changes from `openspec list --json` at the start of a session. It SHALL reference existing capabilities by name when they are relevant to the exploration.

#### Scenario: Related spec exists
- **WHEN** the user explores an idea that touches behavior already specified in `openspec/specs/`
- **THEN** the skill names the existing capability and its requirement count and asks whether the change modifies it or creates a new one

#### Scenario: No active changes
- **WHEN** `openspec list --json` returns no active changes
- **THEN** the skill reports that and does not ask the user to select one

### Requirement: Handoff awareness
The skill SHALL recognize when exploration has crystallized enough to move to the next phase and offer the appropriate handoff. It SHALL NOT implement or create code.

#### Scenario: Requirements need pinning
- **WHEN** the user describes concrete acceptance criteria during exploration
- **THEN** the skill offers `/interview` as the next step for structured requirements gathering

#### Scenario: Ready to propose
- **WHEN** the user has a clear scope and wants to move forward without a full interview
- **THEN** the skill offers `/opsx:propose` and summarizes what to include in the proposal

#### Scenario: User asks to implement during exploration
- **WHEN** the user asks to write code or start building
- **THEN** the skill refuses and suggests exiting explore mode first

### Requirement: Capability group awareness
The skill SHALL know the six spec groups (dod-guard, quality-guard, evomcp, gitevo, obsidian-rag, openspec-dashboard) and use them to organize thinking when the exploration spans multiple packages.

#### Scenario: Cross-package exploration
- **WHEN** the user explores a feature that would touch specs in two or more groups
- **THEN** the skill names the affected groups and suggests whether the change should be split

### Requirement: Coverage context
The skill SHALL run `dod-guard cover --all` when the user asks about test coverage or scenario health, and report the results in plain language.

#### Scenario: User asks about coverage
- **WHEN** the user asks how well a capability is tested
- **THEN** the skill runs `dod-guard cover --all` and reports the outcome for the relevant scenarios
