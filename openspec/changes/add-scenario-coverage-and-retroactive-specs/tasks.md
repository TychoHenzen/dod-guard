## 1. Read scenarios and their bindings

- [ ] 1.1 Add a reader that lists every scenario in a change's spec deltas, reusing the path `dod-guard trace` already reads
- [ ] 1.2 Define the test marker that names the scenario a test case aims at, and document its exact form
- [ ] 1.3 Add a scanner that reads test files and returns each marker with its test file and case name
- [ ] 1.4 Join scenarios to markers and classify each scenario as bound, unbound, or a broken binding
- [ ] 1.5 Test the join against a scenario with no marker, a marker naming a missing test, and a correct pair

## 2. Read test results

- [ ] 2.1 Pick the `node --test` reporter format to read, resolving the first design Open Question
- [ ] 2.2 Add a reader that turns one run's reporter output into a pass, fail or skip verdict per test case
- [ ] 2.3 Report a bound scenario as not covered when any of its tests failed, and name the failing test
- [ ] 2.4 Report a bound scenario as not covered when its only test was skipped
- [ ] 2.5 Test all three verdicts against recorded reporter output, with no live test run

## 3. Declare entry points

- [ ] 3.1 Pick where the entry point declaration lives, resolving the second design Open Question
- [ ] 3.2 Define and document the declaration format, listing the modules or functions that count as user-facing
- [ ] 3.3 Add a loader that reads the declaration and reports a project that declares none
- [ ] 3.4 Write the declaration for this repository, covering the MCP tool handlers and the CLI subcommands
- [ ] 3.5 Test that a project declaring no entry points reports its integration as unchecked, rather than passing it

## 4. Measure reachability

- [ ] 4.1 Run a single bound test in isolation under c8 and capture the coverage file it writes
- [ ] 4.2 Decide whether a declared entry point executed during that test from the coverage output
- [ ] 4.3 Decide whether the scenario's implementation executed during that test
- [ ] 4.4 Classify the scenario as covered and integrated, covered but not integrated, or unwired
- [ ] 4.5 Detect the unwired case with the static call graph when no test run reaches the implementation
- [ ] 4.6 Test each of the three classifications against a fixture with a known call shape

## 5. The cover command

- [ ] 5.1 Add the `cover` subcommand to `packages/dod-guard/src/cli.ts` beside `check` and `trace`
- [ ] 5.2 Report every scenario in the change with exactly one coverage state
- [ ] 5.3 Exit 0 on any completed reading, whatever the states, and exit 3 on an unreadable change or run
- [ ] 5.4 Name the unknown change id in the error message when the id resolves to nothing
- [ ] 5.5 Test the exit codes for a clean run, a run with uncovered scenarios, and an unknown id

## 6. Backfill drafting

- [ ] 6.1 Add the `backfill` subcommand and make it exit 3 on a path that does not exist
- [ ] 6.2 Gather the evidence for a path: its exported surface, its tests, and the scenarios already covering it
- [ ] 6.3 Skip behavior an existing requirement already describes, and report which requirement covered it
- [ ] 6.4 Draft only the uncovered part when an existing requirement covers a behavior in part
- [ ] 6.5 Hand the gathered evidence to an agent for prose drafting, and write the result as unconfirmed
- [ ] 6.6 Record the source file and test case behind each draft, and state when no test backed it
- [ ] 6.7 Leave a confirmed requirement untouched and report code that contradicts it
- [ ] 6.8 Make a second run on unchanged code add no new draft
- [ ] 6.9 Test the skip, the partial draft, the no-test note, and the repeat run

## 7. Confirmation state

- [ ] 7.1 Define how a requirement carries its drafted or confirmed state in the spec file
- [ ] 7.2 Make `cover` report a scenario under an unconfirmed requirement as unconfirmed, not covered
- [ ] 7.3 Make a confirmed requirement read identically to a hand-written one in every command
- [ ] 7.4 Test that confirming a draft moves its scenarios from unconfirmed into the ordinary coverage states

## 8. Wire it up

- [ ] 8.1 Add a coverage report script under `scripts/ci/` that runs `cover` and prints its findings
- [ ] 8.2 Add the report to the CI workflow as a step that reports and never fails the build
- [ ] 8.3 Add the row to the gate table in `CLAUDE.md`, stating plainly that it does not block
- [ ] 8.4 Document both subcommands in `packages/dod-guard/README.md` and the docs folder
- [ ] 8.5 Run `cover` against this change itself and record what it reports
- [ ] 8.6 Confirm no package.json version changed, so nothing publishes from this change
