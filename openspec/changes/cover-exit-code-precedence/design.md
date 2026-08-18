## Context

`runCover` in `packages/dod-guard/src/cover/run.ts` ends in two `??` chains, one
for the clean path and one for the regression path. The clean path is correct:
with no regression, `EXIT_OK` is the right fallback and the plan checks are the
only things that can raise a failure.

The regression path reuses the same chain shape with `EXIT_REGRESSION` as the
fallback. That reads naturally and is wrong, because `??` makes the fallback the
lowest-priority value rather than the highest.

## Goals

- A regression is reported as a regression, whatever else is true.
- Neither plan check loses its printed report.
- The plan checks keep their existing order with respect to each other.

## Decisions

### Run the plan checks for their output, then return the regression code

On the regression path, await both plan checks so their reports still print,
then return `EXIT_REGRESSION` unconditionally. Discarding their return values is
the whole point: their diagnostic value survives, their claim on the exit code
does not.

This keeps both checks side-effecting in the same order they run today, so the
printed output is byte-identical to what ships now. Only the code changes.

Alternative considered: skip the plan checks entirely when regressions exist.
Rejected, because it hides a real second problem. A change can genuinely have
both, and the person reading the output wants to see both.

### Leave the clean path alone

The clean path's `??` chain is already correct and already specified, including
the plan-incomplete before plan-unbound ordering. Touching it would put a
specified behavior at risk for no gain.

## Risks

The change is three lines in one function, and the existing tests for both plan
checks run on the clean path, so they do not constrain the regression path. The
risk is writing a test that passes without exercising the pairing. Each new
scenario needs a fixture that triggers a regression and a plan check at once,
which no current fixture does.
