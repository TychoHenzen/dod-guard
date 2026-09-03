## Why

Quality-guard currently treats local file metrics as the main definition of structural quality. That model catches oversized or complex code, but it does not stop agent-authored changes from attaching new responsibilities to familiar types, flattening unrelated classes into one directory, or polishing an existing structure instead of correcting ownership and dependencies.

## What Changes

- Add repository-level architecture analysis for responsibility growth, placement, dependency boundaries, encapsulation, change locality, structural progress, deletion, and local comprehensibility.
- Add one staged commit gate that compares the Git index with `HEAD`, combines deterministic checks with explicit architectural review findings, and returns `PASS`, `REVIEW_REQUIRED`, or `FAIL`.
- Keep the PostToolUse write gate as fast file-local feedback, but stop treating it as commit evidence or letting it mutate the tracked quality baseline.
- Replace generous new-file ceilings with the scanner's normal hard bounds for agent-written source files.
- Add a commit-gate MCP operation backed by the same implementation as the command-line gate.
- Make architectural refactors start from a responsibility and dependency map. Require structural evidence instead of accepting local metric reductions or cosmetic edits as completion.
- Tie each architectural review decision or waiver to the exact staged tree so later edits invalidate stale approval.
- Replay the staged gate in CI so bypassing a local hook cannot bypass the repository policy.

## Capabilities

### New Capabilities

- `quality-guard/architecture-analysis`: Measures repository and diff-level architecture qualities that a single-file scanner cannot decide.
- `quality-guard/commit-gate`: Defines the authoritative staged quality decision, result states, review records, CLI contract, and CI replay.

### Modified Capabilities

- `quality-guard/write-gate`: Limits the write-time hook to fast file-local feedback, applies normal hard bounds to new files, and prevents baseline mutation.
- `quality-guard/mcp-tools`: Adds a staged commit-gate operation backed by the shared quality decision implementation.
- `quality-guard/quality-refactor`: Plans architectural refactors from responsibilities and desired boundaries before creating implementation tasks, and requires structural completion evidence.

## Impact

- Affects the quality scanner library, PostToolUse hook, MCP server, quality-refactor skill, CI quality job, and quality baseline handling.
- Adds Git index and dependency-graph analysis to the pre-commit path.
- Adds a repository configuration surface for architectural boundaries and review thresholds.
- Changes quality-refactor task generation from existing-file work units to responsibility-oriented structural work.
- Does not change application runtime behavior or add a production dependency.
