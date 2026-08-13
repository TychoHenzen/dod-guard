# dod-guard/cheap-step Specification

## Purpose
Skill that executes a confirmed multi-step plan like `/step-by-step`, substituting each eligible step's implementation with the evomcp `solve` tool running cheap DeepSeek workers instead of host agents.

## Requirements

### Requirement: inherits step-by-step base discipline
The skill SHALL follow the same splitting, approval, `steps.json` persistence, staleness checks, dependency ordering, four statuses, verdict gate, repair cap, record-and-flush, closing integration, and final report as `/step-by-step`. The only substitution is the implementation dispatch mechanism.

#### Scenario: step ordering matches step-by-step
- **WHEN** `steps.json` defines dependencies between steps
- **THEN** the skill executes steps in dependency order, the same as `/step-by-step` would

#### Scenario: branch check after solve returns
- **WHEN** solve returns and the checked-out branch differs from the session branch
- **THEN** the skill switches back to the session branch before committing

#### Scenario: commit after verified step
- **WHEN** a step's verify_cmd passes
- **THEN** the skill commits on the session branch as the base discipline requires

### Requirement: evomcp status check before first dispatch
The skill SHALL call the evomcp `status` tool before dispatching any step to `solve`. If evomcp is unreachable or no key is configured, the skill SHALL fall back to the base `/step-by-step` host-agent dispatch for all steps.

#### Scenario: evomcp unreachable
- **WHEN** the `status` tool call fails or times out
- **THEN** the skill falls back to `/step-by-step` host-agent dispatch for all steps

#### Scenario: evomcp reachable
- **WHEN** the status tool reports the proxy is running with credentials set
- **THEN** the skill proceeds with cheap dispatch for eligible steps

### Requirement: per-step mode classification
Each step in `steps.json` SHALL carry a `mode` field: `cheap` (eligible for solve dispatch) or `host-only` (must run on the host). Visual/gameplay, design/architecture, security-sensitive, and wide-scope (more than 3 files) steps SHALL be classified as `host-only`.

#### Scenario: security-sensitive step stays on host
- **WHEN** a step involves authentication or credential handling
- **THEN** its mode is `host-only` and it dispatches to a host agent, not to `solve`

#### Scenario: visual verification stays on host
- **WHEN** a step's verify_surface is visual or gameplay
- **THEN** its mode is `host-only` because the worker cannot see rendered output

#### Scenario: narrow step dispatches to solve
- **WHEN** a step has no security concern, no design decision, and touches 3 or fewer files
- **THEN** its mode is `cheap`

#### Scenario: mode split reported at plan approval
- **WHEN** the plan is presented for user approval
- **THEN** the skill reports how many steps go to cheap vs host-only

### Requirement: solve spec includes verify_cmd
Each `solve` dispatch SHALL include a spec with at least `goal`, `verify_cmd`, and `cwd`. The `verify_cmd` SHALL be tested twice for flakiness before dispatch. Ambiguities SHALL be resolved via `AskUserQuestion` before writing the spec, because solve workers have no way to ask.

#### Scenario: flaky verify_cmd blocks dispatch
- **WHEN** running the verify_cmd twice produces different results
- **THEN** the skill does not dispatch to `solve` and either fixes the flakiness or moves the step to host-only

#### Scenario: stable verify_cmd allows dispatch
- **WHEN** running the verify_cmd twice produces the same result
- **THEN** the skill proceeds with the solve dispatch

#### Scenario: ambiguity resolved before spec
- **WHEN** the step description admits two readings
- **THEN** the skill asks via AskUserQuestion and writes the answer into the step description

### Requirement: degenerate-pass detection after solve returns
After `solve` returns a passing result, the skill SHALL check for 5 degenerate-pass patterns. Those are: special-case matching the test input, weakened or deleted assertion, file outside `allowed_files`, catch block swallowing an error, and commented-out code. It SHALL also run build and tests for all touched modules.

#### Scenario: solve returns hardcoded test value
- **WHEN** the solve worker passes the verify_cmd by hardcoding the expected return value
- **THEN** the skill detects the degenerate pattern, rejects the result, and retries

#### Scenario: catch block swallowing error detected
- **WHEN** the solve worker passes by adding a catch block that returns a default
- **THEN** the skill detects the pattern and rejects the result

#### Scenario: clean diff accepted
- **WHEN** the diff shows no degenerate patterns and the module tests pass
- **THEN** the skill accepts the result and proceeds

### Requirement: host fallback after 2 solve failures
The skill SHALL retry a failed `solve` dispatch at most twice with a more specific spec. After 2 retries fail, the step falls back to host-agent dispatch. When more than 30% of steps fall back to host, the skill switches all remaining steps to host dispatch.

#### Scenario: 30% threshold triggers full switch
- **WHEN** 3 out of 8 steps have fallen back to host dispatch
- **THEN** the skill switches all remaining steps to host-agent dispatch and stops calling `solve`

#### Scenario: first retry includes failure details
- **WHEN** the first solve attempt fails verification
- **THEN** the skill retries with what failed and what the attempt got wrong added to the spec

#### Scenario: second failure falls back to host
- **WHEN** both solve retries fail verification
- **THEN** the skill does the step on the host, sets status to completed, and keeps mode as cheap

#### Scenario: backend down switches to base
- **WHEN** two failures never reach a verify result and status shows the proxy is down
- **THEN** the skill tells the user and switches all remaining steps to host dispatch
