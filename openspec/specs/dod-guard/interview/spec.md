# dod-guard/interview Specification

## Purpose
Skill that pins down requirements before implementation by asking questions one at a time, writing an OpenSpec change with spec deltas and scenarios, running adversarial review, and handing off to an executor skill. No code is written until requirements are confirmed.

## Requirements

### Requirement: no code until requirements are confirmed
The skill SHALL NOT write, edit, or generate any implementation code. Its output is an OpenSpec change with spec deltas, a proposal, and optionally a design document. Reading existing code is allowed. Implementation is handed off to another skill.

#### Scenario: user asks to start coding during interview
- **WHEN** the user asks to implement something before the requirements summary is confirmed
- **THEN** the skill refuses and continues the requirements gathering

#### Scenario: gate restated once on repeated push
- **WHEN** the user pushes for code a second time before the summary is confirmed
- **THEN** the skill restates the gate once and continues with questions

#### Scenario: reading code is permitted during the gate
- **WHEN** the skill needs to understand existing behavior before asking a question
- **THEN** it reads the relevant files without creating or editing any

### Requirement: research before questions
The skill SHALL read existing code, specs, and documentation relevant to the request before asking any questions. Questions that the codebase already answers SHALL NOT be asked. The skill SHALL count pre-existing lint and format violations before any editing begins.

#### Scenario: question answered by existing code
- **WHEN** the user requests a feature and the answer to a potential question is visible in the existing code
- **THEN** the skill states what it found in the code rather than asking the user

#### Scenario: external lookup before follow-up
- **WHEN** a question depends on a library's real behavior or a published standard
- **THEN** the skill looks it up via WebSearch or WebFetch and reports the finding first

#### Scenario: lint and format violations counted before editing
- **WHEN** the skill starts researching a change
- **THEN** it counts lint and format violations with the project's own commands and records both numbers

### Requirement: questions one at a time with a floor
The skill SHALL ask one question per turn. Four tiers set the floor by change size. At least 2 for one file and one function. At least 3 for one to three files in one layer. At least 5 for four to eight files or two or more layers. At least 6 for nine or more files or three or more layers. A round of up to 3 clarifying questions is allowed when several answers are needed together.

#### Scenario: small change gets at least 3 questions
- **WHEN** the user describes a feature touching two files in one component
- **THEN** the skill asks at least 3 questions across 3 separate turns before presenting a summary

#### Scenario: large cross-layer change gets at least 6 questions
- **WHEN** the user describes a feature touching 9 or more files across 3 layers
- **THEN** the skill asks at least 6 questions before presenting a summary

#### Scenario: round caps at 3 clarifying questions
- **WHEN** several answers are needed together to unblock the interview
- **THEN** the skill batches at most 3 questions in one round

#### Scenario: high-risk question asked first
- **WHEN** both a High-risk and a Low-risk question are pending
- **THEN** the skill asks the High-risk question first

### Requirement: spec deltas use OpenSpec format
The skill SHALL write requirements as `### Requirement:` blocks with `#### Scenario:` sub-blocks using WHEN/THEN format. It SHALL create the change via `/opsx:propose` and validate with `openspec validate <change-id> --strict`. Only confirmed answers become scenarios. Unconfirmed answers go under "Open questions" in the change's `design.md`.

#### Scenario: validation catches format error
- **WHEN** the skill writes a scenario with `###` instead of `####`
- **THEN** `openspec validate` fails and the skill corrects the heading level

#### Scenario: unconfirmed answer excluded from scenarios
- **WHEN** an answer was inferred from code but never confirmed by the user
- **THEN** it appears under "Open questions" in design.md, not as a scenario

#### Scenario: complex scenario splits before handoff
- **WHEN** a scenario bundles too many outcomes for one test to observe
- **THEN** the skill splits it into separate scenarios while splitting is cheap

### Requirement: adversarial review before handoff
The skill SHALL dispatch five adversarial lenses in parallel: Security (via `adversarial-security`), Assumptions, Testability, Consistency, and Implementability (each via `adversarial-spec-reviewer`). Review findings that the user accepts SHALL be incorporated into the spec.

#### Scenario: adversarial lens finds a gap
- **WHEN** a review lens identifies a missing error-handling requirement
- **THEN** the skill presents the finding to the user and adds it to the spec delta if accepted

#### Scenario: all lenses pass with GO verdict
- **WHEN** 0 critical and at most 2 major findings across all five lenses
- **THEN** the verdict is GO and the skill proceeds to handoff

#### Scenario: revise verdict triggers redo
- **WHEN** 1 or more critical findings or 3 or more major findings appear
- **THEN** the verdict is REVISE and the skill fixes the spec and redispatches the lenses

#### Scenario: stop verdict aborts
- **WHEN** any lens returns a blocker finding
- **THEN** the verdict is STOP and the skill reports the blocker to the user and aborts

#### Scenario: third revise round asks for override
- **WHEN** the lenses return REVISE three times in a row
- **THEN** the skill stops and asks the user for an explicit override

### Requirement: handoff dispatches to the right executor
The skill SHALL hand off to an executor skill based on work shape. `/step-by-step` handles 5 or more discrete steps. `/cheap-step` handles the same with evomcp fanout per step. `/ratchet` handles interdependent sub-problems with regression risk. `/adversarial-workflow` handles work needing phased review. `/opsx:apply` handles a small change needing no per-step gate. The skill SHALL NOT implement the work itself.

#### Scenario: multi-step plan routes to step-by-step
- **WHEN** the confirmed requirements produce a plan with 5 discrete steps and no interdependent sub-problems
- **THEN** the skill hands off to `/step-by-step` with the change id

#### Scenario: interdependent problems route to ratchet
- **WHEN** the confirmed requirements involve regression risk or unknown unknowns
- **THEN** the skill hands off to `/ratchet` at its Phase B

#### Scenario: small self-contained change routes to opsx apply
- **WHEN** the change's own tasks.md covers the work with no per-step gate needed
- **THEN** the skill hands off to `/opsx:apply` with the change id
