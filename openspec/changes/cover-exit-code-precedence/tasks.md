## 1. Regression takes the exit code

- [x] 1.1 In `src/cover/run.ts`, change the regression-path return so both plan checks are awaited for their reports and `EXIT_REGRESSION` is returned unconditionally, instead of sitting last in a `??` chain
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression on its own is unaffected -->
<!-- status: completed -->
- [x] 1.2 Pin that a change with a regression and an unexpanded group exits with the regression code, and that the report still names the unexpanded group
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression alongside an unexpanded group -->
<!-- status: completed -->
- [x] 1.3 Pin that a change with a regression and a fully expanded plan naming none of its scenarios exits with the regression code, and that the report still names the unnamed scenarios
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression alongside an unbound plan -->
<!-- status: completed -->
- [x] 1.4 Pin that the clean path is untouched: with no regression, an unexpanded group plus an unannotated plan still exits with the plan-incomplete code
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: The plan checks keep their order when nothing regressed -->
<!-- status: completed -->
- [x] 1.5 Bind the regression-alone scenario to a test of its own. Task 1.1's annotation named it, but `cover` binds a scenario only to a marker in a test file, so no production task could reach it
<!-- status: completed -->

## 2. The exit-code tables say which wins

- [x] 2.1 Add the precedence rule to the `dod-guard cover` exit-code list in the root `CLAUDE.md`, so the list says a regression outranks both plan codes rather than only naming the five values
<!-- status: completed -->
- [x] 2.2 Add the same rule to `packages/dod-guard/CLAUDE.md`
<!-- status: completed -->
- [x] 2.3 Add the rule to the `EXIT CODES` block of the `USAGE` string in `src/cli.ts`. `packages/dod-guard/CLAUDE.md` calls that string the authoritative reference, so stating the rule only in the docs left the two contradicting each other
<!-- status: completed -->
