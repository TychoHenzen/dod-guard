## Why

`dod-guard cover --all` reports 919 scenarios across 53 capabilities. Ten of them carry a `// covers:` marker. The coverage-gate ratchet and `/spec-test` skill both exist, but neither closes the loop: the ratchet watches for regressions but cannot cause new markers to appear, and `/spec-test` generates tests but does not wire `// covers:` markers into them. The result is 1.1% marker coverage on a project with 81 test files that do test real behavior. The tests exist; the wiring does not.

Two things broke. First, the `/spec-test` skill generates test files without `// covers:` markers, so every test it writes is invisible to `dod-guard cover`. Second, the coverage audit in `/spec-test`'s own SKILL.md advertises a gap report but does not show the denominator, so "12 scenarios with no test" reads like a small gap when the real number is 909 of 919.

## What Changes

- `/spec-test` writes a `// covers: <group>/<capability> :: <requirement> :: <scenario>` marker above every `test()` or `it()` call it generates, matching the format `dod-guard cover` already parses.
- `/spec-test`'s coverage audit step shows total scenarios, covered count, uncovered count, and percentage, not just the uncovered list.
- The coverage-gate baseline (`.github/quality/coverage-gate-baseline.json`) drops 11 orphaned entries from deleted capabilities (`dod-guard/generation-from-spec` and `dod-guard/trace-closure`).
- A batch wiring pass adds `// covers:` markers to existing test files where a test already covers a spec scenario but lacks the marker. This is manual, guided work, not an automated rewrite.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dod-guard/spec-test`: The skill's test generation requirement changes to include `// covers:` marker emission, and the coverage audit requirement changes to include denominator and percentage reporting.
- `dod-guard/coverage-gate`: No behavioral change to `dod-guard cover` itself. The baseline cleanup (dropping orphaned entries) is a data fix, not a spec change.

## Impact

- `packages/dod-guard/skills/spec-test/SKILL.md`: The skill's instructions change to require marker emission and richer audit output.
- `packages/dod-guard/src/cover/`: No code changes. The marker format and parsing are already correct.
- `.github/quality/coverage-gate-baseline.json`: Orphaned entries removed. The next CI run adopts the cleaned baseline.
- Existing test files across all five packages: `// covers:` markers added above test declarations that already exercise spec scenarios. This is the bulk of the work and happens file by file.
