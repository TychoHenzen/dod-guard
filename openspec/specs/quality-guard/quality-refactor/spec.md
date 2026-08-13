# quality-guard/quality-refactor Specification

## Purpose
Skill that systematically refactors code to a high quality bar using the quality-guard scanner's machine-checked rule set, organizing work into waves ordered by structural impact and delivering a step plan for `/step-by-step` execution.

## Requirements

### Requirement: scanner drives the work, not taste
The skill SHALL run `quality-scan.mjs` to identify violations. Refactoring targets SHALL come from scanner findings, not from subjective code review. Each proposed change SHALL reference the scanner rule it addresses.

#### Scenario: scanner output seeds the plan
- **WHEN** the skill starts on a target directory
- **THEN** it runs `quality-scan.mjs` on that directory and uses the violation report to build the refactoring plan

#### Scenario: test-path prevents false positives on harness code
- **WHEN** the target directory contains test-support code such as fixtures or harnesses
- **THEN** the skill passes `--test-path` to the scanner so harness files are not reported as production code with test-only exports

#### Scenario: scanner exits with a usage error
- **WHEN** `quality-scan.mjs` exits with code 3
- **THEN** the skill reports the usage error and stops without building a plan

### Requirement: waves execute in fixed order
The skill SHALL organize work into 6 waves in this order: DELETE (remove dead code), DEDUPE (consolidate duplicates), SPLIT (break apart god modules), SIMPLIFY (reduce complexity), SIGNATURES (clean up interfaces), COSMETIC (naming and formatting). Earlier waves reduce scope for later ones.

#### Scenario: delete before dedupe
- **WHEN** the scanner finds both dead code and duplicate code in the same file
- **THEN** the DELETE wave runs first, and the DEDUPE wave works on whatever remains

#### Scenario: re-scan after each wave replans from fresh results
- **WHEN** a wave finishes executing
- **THEN** the skill re-scans the scope and plans the next wave from the new results, because a deleted file needs no further steps

#### Scenario: file deleted in earlier wave produces no later steps
- **WHEN** a file is removed in the DELETE wave
- **THEN** no steps for that file appear in DEDUPE, SPLIT, SIMPLIFY, SIGNATURES, or COSMETIC waves

### Requirement: output is a step plan, not direct edits
The skill SHALL produce a step plan with one step per refactoring action, suitable for `/step-by-step` execution. Each step SHALL include a verify command. The skill SHALL NOT apply refactoring edits directly.

#### Scenario: plan handed to step-by-step
- **WHEN** the skill finishes planning
- **THEN** it produces a `tasks.md` with numbered steps, each carrying a description and verification command, and hands off to `/step-by-step`

#### Scenario: each step's verify_cmd joins test and ratchet commands
- **WHEN** the skill writes a step in `steps.json`
- **THEN** the step's `verify_cmd` joins the project test command and the ratchet check with `&&`, and expands all paths to absolutes

#### Scenario: OpenSpec change opened with skip-specs
- **WHEN** the skill starts planning a refactor
- **THEN** it opens an OpenSpec change with `--skip-specs` and sets `skip_specs: true`, because a refactor changes no behavior and declares no capability

### Requirement: measurement guards against regression
The skill SHALL run the scanner before and after the refactoring plan is built. The plan SHALL NOT propose changes that would increase the total violation count in any rule.

#### Scenario: proposed change would add violations
- **WHEN** splitting a module would create a new file that violates the barrel-export rule
- **THEN** the skill adjusts the plan to resolve the new violation or drops that step

#### Scenario: build or tests already failing stops the run
- **WHEN** the build or test suite is already failing before the refactor starts
- **THEN** the skill stops at the initial check and reports that behavior preservation cannot be proved against a red baseline

#### Scenario: baseline recorded before planning
- **WHEN** the skill starts a new refactoring run
- **THEN** it records a ratchet baseline with `--write-baseline` so that each pass locks in what the prior pass fixed

### Requirement: scope stays within the target
The skill SHALL limit edits to the files and directories the user specified as the target. Violations in out-of-scope files SHALL be reported but not planned for.

#### Scenario: out-of-scope violations reported only
- **WHEN** the scanner finds violations in files outside the target path
- **THEN** the skill lists them in the report as informational but does not create steps to fix them

#### Scenario: large scope batches the worst files first
- **WHEN** the target contains 50 or more files
- **THEN** the skill plans only the worst 10 by error count, executes them, re-scans, and repeats until the scope is clean

#### Scenario: concept word argument requires user confirmation
- **WHEN** the user passes a concept word instead of a file path
- **THEN** the skill resolves the matching file list and confirms it with the user before planning
