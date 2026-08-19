# dod-guard/coverage-runtime Specification

## Purpose
Provides portable scenario coverage and test-command results to plugin consumers so OpenSpec plans can bind each scenario to a proving test without consumer-specific setup.
## Requirements
### Requirement: The installed plugin exposes the coverage engine

The installed plugin SHALL expose the same coverage engine to plugin consumers without requiring consumer projects to modify `PATH`, add workspace scripts, or configure device-specific paths.

#### Scenario: A consumer invokes coverage after plugin installation

- **WHEN** a consumer workspace has the plugin installed and provides its workspace path
- **THEN** the consumer can invoke coverage through the plugin runtime without additional setup

#### Scenario: Shell and plugin callers use the same engine

- **WHEN** a shell caller and a plugin caller scan the same workspace and scope
- **THEN** both callers receive the same scenario outcomes, regression result, and plan-check result

### Requirement: Plugin coverage results are structured

The plugin coverage interface SHALL return structured results for every enumerated scenario, including its scenario id, outcome, binding details when present, verification command when resolvable, and gate result.

#### Scenario: A bound scenario returns its test binding and command

- **WHEN** a scenario has a valid `covers:` marker above a supported test declaration
- **THEN** the result reports `bound`, the test file, the test name, the detected language, and a whole-file `verify_cmd`

#### Scenario: An unwired scenario returns no verification command

- **WHEN** a scenario has no valid marker binding
- **THEN** the result reports `unwired` and does not provide a `verify_cmd`

#### Scenario: An unsupported test file does not create a binding

- **WHEN** a marker appears in a file type without a registered language adapter
- **THEN** the result reports the scenario as `unwired` and identifies no verification command

### Requirement: Test-command resolution is language-aware and portable

The coverage engine SHALL resolve a bound test to a runnable whole-file command using the consumer workspace path and the language adapter for the test file. The command SHALL not contain paths to the plugin source repository.

#### Scenario: A supported language provides a whole-file command

- **WHEN** a bound test file uses a registered language and test runner configuration
- **THEN** the result contains a command that runs that file from the consumer workspace

#### Scenario: A language has no resolvable runner

- **WHEN** a bound test file uses a registered language but no runner command can be resolved
- **THEN** the result keeps the scenario `bound` and reports an unresolved verification command with a reason

