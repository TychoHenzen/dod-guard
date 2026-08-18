## 1. Regression takes the exit code

- [ ] 1.1 In `src/cover/run.ts`, change the regression-path return so both plan checks are awaited for their reports and `EXIT_REGRESSION` is returned unconditionally, instead of sitting last in a `??` chain
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression on its own is unaffected -->
- [ ] 1.2 Pin that a change with a regression and an unexpanded group exits with the regression code, and that the report still names the unexpanded group
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression alongside an unexpanded group -->
- [ ] 1.3 Pin that a change with a regression and a fully expanded plan naming none of its scenarios exits with the regression code, and that the report still names the unnamed scenarios
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: A regression alongside an unbound plan -->
- [ ] 1.4 Pin that the clean path is untouched: with no regression, an unexpanded group plus an unannotated plan still exits with the plan-incomplete code
<!-- covers: dod-guard/coverage-gate :: A coverage regression outranks the plan checks in the exit code :: The plan checks keep their order when nothing regressed -->

## 2. The exit-code tables say which wins

- [ ] 2.1 Add the precedence rule to the `dod-guard cover` exit-code list in the root `CLAUDE.md`, so the list says a regression outranks both plan codes rather than only naming the five values
- [ ] 2.2 Add the same rule to `packages/dod-guard/CLAUDE.md`
