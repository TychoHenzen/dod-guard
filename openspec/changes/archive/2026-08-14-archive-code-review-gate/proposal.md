## Why

The archive skill checks that task checkboxes are marked complete and that `dod-guard cover` passes, but neither of those proves the implementation actually works. A checked box means someone (or an agent) ticked it. A passing coverage gate means tests bind to scenarios. Neither reads the code that changed. A PR-style review over the affected files catches dead code, half-finished features, and regressions the scenario coverage misses.

## What Changes

- Add a new step to the archive skill after the coverage gate and before the archive command. The step runs a lightweight code review over the affected files.
- The review checks for unfinished implementations, dead code paths, obvious correctness bugs, and mismatches between the spec and the code.
- The review is blocking: findings above a threshold stop the archive, the same way a coverage regression does
- The review uses the `/code-review` skill at `low` effort level to keep it fast

## Capabilities

### New Capabilities

### Modified Capabilities
- `dod-guard/opsx-archive`: Add a code-review gate step that reads the relevant implementation diff before archiving

## Impact

- `packages/dod-guard/skills/opsx-archive/SKILL.md`: new step between coverage gate and archive
- No code changes to `src/` needed - the review is skill-level orchestration that invokes `/code-review`
- Archive workflow becomes slightly slower (one review pass) but catches implementation gaps that checkboxes and scenario coverage miss
