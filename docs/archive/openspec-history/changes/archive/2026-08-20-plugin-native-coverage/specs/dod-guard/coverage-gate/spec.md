## MODIFIED Requirements

### Requirement: cover reports a scenario's state

`dod-guard cover` SHALL report every enumerated scenario as either unwired (no test binds it) or bound (a marker binds it to a named test). A bound result SHALL include the test name, file path, detected language, and a portable whole-file `verify_cmd` when the language adapter can resolve one. If no command can be resolved, the result SHALL remain bound and include the reason the command is unavailable. Distinguishing a bound test that merely runs from one that reaches the scenario's implementation through a project-declared entry point is a later requirement; until then, the coverage gate SHALL judge marker binding and ratchet outcomes as it does today.

#### Scenario: No test binds a scenario

- **WHEN** a scenario has no `// covers:` marker anywhere in its group's test files
- **THEN** cover reports the scenario as unwired and provides no verification command

#### Scenario: A marker binds a scenario to a test

- **WHEN** a scenario has a valid `covers:` marker binding it to a supported test
- **THEN** cover reports the scenario as bound, names the test and file, and provides the language-aware whole-file verification command when resolvable

#### Scenario: A bound test has no available runner

- **WHEN** a scenario has a valid marker binding but its language adapter cannot resolve a runner
- **THEN** cover reports the scenario as bound and states why its verification command is unresolved
