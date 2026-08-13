# dod-guard/adversarial-workflow Specification

## Purpose
Drives work through a 4-phase adversarial review. The phases are spec review, test audit, implementation review, and structural proof. Each phase produces a GO, REVISE, or STOP verdict.

## Requirements

### Requirement: 4 phases in fixed order
The skill SHALL execute spec review, test audit, implementation review, and structural proof in that order. A phase SHALL NOT start until the previous phase's verdict is GO. A STOP verdict at any phase halts the workflow.

#### Scenario: REVISE at spec review blocks test audit
- **WHEN** spec review produces a REVISE verdict
- **THEN** the skill presents the findings, incorporates accepted revisions, and re-runs spec review before test audit

#### Scenario: STOP halts the workflow
- **WHEN** any phase produces a STOP verdict
- **THEN** the skill reaches the user immediately and does not advance to the next phase

#### Scenario: GO advances to next phase
- **WHEN** a phase produces a GO verdict
- **THEN** the skill advances to the next phase in sequence

#### Scenario: resume picks lowest non-GO phase
- **WHEN** the skill resumes from an existing design.md record
- **THEN** it restarts at the lowest-numbered phase whose verdict is not GO

### Requirement: spec review dispatches 5 adversarial lenses plus a negative control
Spec review SHALL dispatch 5 parallel agents, each with a different lens: security, spec-auditor, and spec-reviewer instances with distinct focus prompts. It also dispatches one negative control that receives the real spec with one flaw seeded inside the weakest lens's own territory.

#### Scenario: negative control finds nothing
- **WHEN** the negative control lens receives the spec with a seeded flaw and returns zero findings
- **THEN** the lens missed its own flaw, earns one repeat on a stronger model, and the summary names that lens

#### Scenario: negative control finds issues
- **WHEN** the negative control lens receives the spec with a seeded flaw and names it
- **THEN** the control passes and the summary records the result

#### Scenario: negative control skipped on short spec
- **WHEN** the spec under review is roughly 20 lines or fewer
- **THEN** the skill skips the negative control for that round

#### Scenario: negative control skipped after two runs
- **WHEN** this change has already seen two negative controls
- **THEN** the skill skips further negative controls

### Requirement: test audit dispatches 3 lens prompts
Test audit SHALL dispatch `adversarial-test-auditor` agents with 3 lens prompts. The first checks coverage gaps by mapping requirements to tests. The second checks falsifiability by asking whether each test would fail if the requirement were wrong. The third checks edge cases: missing boundary, error path, and null/empty tests.

#### Scenario: coverage gap found
- **WHEN** a test auditor finds a requirement with no corresponding test
- **THEN** the finding is reported with the requirement text

#### Scenario: falsifiability issue found
- **WHEN** a test auditor finds a test that would pass even if the requirement were wrong
- **THEN** the finding names the test and explains why it cannot falsify the requirement

#### Scenario: edge case gap found
- **WHEN** a test auditor finds missing boundary, error path, or null/empty tests
- **THEN** the finding names the missing case and the requirement it belongs to

### Requirement: implementation review dispatches 3 attacker agents
Implementation review SHALL dispatch 3 agents in parallel on the completed diff. `adversarial-saboteur` attacks with worst-case inputs, races, and resource exhaustion (mandatory 2 findings). `adversarial-new-hire` reads the diff cold for clarity (mandatory 1 finding). `adversarial-spec-auditor` checks the diff against requirements (mandatory 1 finding).

#### Scenario: saboteur finds a race condition
- **WHEN** the saboteur identifies a concurrent-access race in the diff
- **THEN** the finding is reported with the specific input sequence and expected failure mode

#### Scenario: new hire flags unclear naming
- **WHEN** the new hire reads the diff cold and finds a confusing name or undocumented assumption
- **THEN** the finding names the symbol and explains the confusion

#### Scenario: spec auditor finds scope drift
- **WHEN** the spec auditor detects behavior in the diff that no requirement describes
- **THEN** the finding reports the extra behavior and which requirement it was expected under

#### Scenario: critical finding persisted
- **WHEN** a reviewer produces a `critical` finding during implementation review
- **THEN** the skill saves it via `memory_save` or `evo_learn`, not a project-local rules file

### Requirement: structural proof runs proof commands and audits
Structural proof SHALL lift proof commands from `standards/structural-gates.md`, verify each can report failure, and run them. It SHALL audit, mend, and re-audit until two consecutive audits surface no fresh `critical` and no fresh `major`. Past 3 audits it escalates the remainder to the user.

#### Scenario: all proofs pass on first audit
- **WHEN** every proof command passes and the first audit surfaces no critical or major findings
- **THEN** the verdict is GO after the second clean audit confirms

#### Scenario: tests fail during structural proof
- **WHEN** the test suite fails during structural proof
- **THEN** the verdict is REVISE with the failing test names and output

#### Scenario: three audits reached without clearing findings
- **WHEN** three consecutive audits each surface fresh critical or major findings
- **THEN** the skill escalates the remaining findings to the user

### Requirement: verdict system with mandatory finding floors
Each phase produces exactly one verdict: GO, REVISE, or STOP. Agents with mandatory minimums (saboteur: 2, new-hire: 1, spec-auditor: 1) SHALL always produce at least that many findings. An agent that returns fewer is flagged as incomplete.

#### Scenario: saboteur returns only 1 finding
- **WHEN** the saboteur returns fewer than 2 findings
- **THEN** the skill flags the dispatch as incomplete and retries or reports the gap

#### Scenario: GO conditions met
- **WHEN** a round produces zero critical findings and 2 or fewer major findings
- **THEN** the verdict is GO

#### Scenario: STOP on a single blocker
- **WHEN** any lens returns a finding with severity `blocker`
- **THEN** the verdict is STOP

#### Scenario: REVISE on severity threshold
- **WHEN** a round at phases 1 or 2 produces 1 critical or 3 or more major findings
- **THEN** the verdict is REVISE

#### Scenario: NO_FINDINGS clears the floor
- **WHEN** a lens returns a `NO_FINDINGS:` line with a reason
- **THEN** the mandatory minimum is considered met for that lens

### Requirement: gate recording in design.md
Each phase's verdict, findings, and resolution SHALL be recorded in the change's `design.md`. The record SHALL include which findings were accepted, which were rejected with reasons, and the final verdict.

#### Scenario: accepted finding recorded
- **WHEN** the user accepts a spec review finding and the spec is revised
- **THEN** `design.md` records the finding, the acceptance, and the spec change made

#### Scenario: REVISE round also recorded
- **WHEN** a phase produces a REVISE verdict
- **THEN** the REVISE entry is appended to `design.md` before the corrected re-run

#### Scenario: phase filed out of order is blocked
- **WHEN** the skill tries to file an implementation review entry but the test audit entry is missing or not GO
- **THEN** the skill stops and returns to the test audit phase instead of filing out of order

#### Scenario: read-back confirms entry landed
- **WHEN** the skill appends a gate entry to design.md
- **THEN** it re-reads design.md to confirm the entry landed and all phases read in order
