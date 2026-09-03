## REMOVED Requirements

### Requirement: trace command exists

**Reason**: `dod-guard trace` and `packages/dod-guard/src/openspec/trace.ts`
are deleted along with the DoD document it read.

**Migration**: `dod-guard cover <change-id>` is the direct successor; see
`dod-guard/coverage-gate`.

### Requirement: Untraced leaf fails the check

**Reason**: No DoD leaf exists to be untraced.

**Migration**: `dod-guard cover` reports a scenario as `unwired` when
nothing reaches it, and a regression against the ratchet baseline is what
fails the gate; see `dod-guard/coverage-gate`.

### Requirement: Untraced scenario is reported, not blocking

**Reason**: No DoD leaf exists for a scenario to trace to.

**Migration**: `dod-guard cover` reports every scenario's coverage state
directly - `unwired` replaces "untraced scenario" with no separate report
mode needed, since coverage was always the actual question.

### Requirement: trace is wired into the CI gate table

**Reason**: `scripts/ci/check-trace.mjs` is deleted; the `plugin-config` CI
job no longer runs `dod-guard trace`.

**Migration**: The root `CLAUDE.md` gate table gains a `dod-guard cover`
row once `dod-guard/coverage-gate`'s CI wiring lands.
