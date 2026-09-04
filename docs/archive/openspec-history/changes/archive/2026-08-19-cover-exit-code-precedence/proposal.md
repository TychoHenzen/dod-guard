## Why

`dod-guard cover` reports its result through an exit code, and callers branch on
it. `/opsx-archive` gates the whole archive on that code, and
`check-coverage-gate.mjs` runs it in CI.

On the regression path in `packages/dod-guard/src/cover/run.ts`, the return is a
`??` chain that puts both plan checks ahead of `EXIT_REGRESSION`:

```
return (
  (await checkPlanComplete(opts, io)) ?? (await checkPlanBound(opts, scenarioIds(reports), io)) ?? EXIT_REGRESSION
);
```

`??` yields the first non-null value, so a change carrying both a real coverage
regression and an unusable plan exits 4 or 5 rather than 1. The regression lines
still print, so a human reading the output sees them. A caller reading only the
code is told the plan is the problem when the actual problem is that a scenario
lost its test.

The two failures are not equal. A plan-shape complaint is about a document that
is still being written. A regression means shipped behavior stopped being
covered. The louder failure is being masked by the quieter one.

## What Changes

A coverage regression takes precedence over both plan checks in `cover`'s exit
code. When a change-scoped run finds regressions, it exits `1`, whatever the
plan checks would have said on their own.

The plan checks keep their existing precedence relative to each other:
plan-incomplete before plan-unbound. That ordering is already specified and is
not touched.

Both plan checks still run and still print their reports on the regression path.
Only the returned code changes, so no diagnostic output is lost.

## Capabilities

### Modified Capabilities

- `dod-guard/coverage-gate`: adds a requirement fixing the precedence between the
  regression exit code and the two plan-check exit codes.

## Impact

- `packages/dod-guard/src/cover/run.ts` - the regression-path return
- `packages/dod-guard/src/cover/run.test.ts` - a case per precedence pair
- `packages/dod-guard/CLAUDE.md` and the root `CLAUDE.md` - the exit-code table
  gains the precedence rule
