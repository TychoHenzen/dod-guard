## Why

A census of the DoD store on 2026-08-12 read 37 documents and 969 leaves. Of
the 750 concrete leaves that last passed, 430 only prove that a string exists
in a file. Another 153 re-run a command that CI runs anyway. Just 24 use the
`tdd` predicate, the one check that demands an observed failure first. So 78
percent of the passing proofs told nobody anything new.

The examples show the gap. One leaf claims "Back-edge expansion prevents
tunneling" and proves it with `findstr "MAX_SPEED" project.wgsl`. Another
claims "atomic write implemented" and proves it by grepping a C# file for
`temp`, `tmp`, `replace` or `move`. Forty-five leaves run `echo VERIFIED` under
the predicate `output_contains: VERIFIED`, covering claims such as "Public
exports unchanged" and "Backward compatible".

`packages/dod-guard/docs/shortcomings.md` named this on 2026-07-20 and found
the cause. The agent under test authors its own proofs, so it also picks what
"done" means.

The real-world failure this permits is integration skipping. An agent builds a
feature, writes a unit test that calls it directly, greps the file to prove the
code exists, and reports done. Nothing ever checked that a user can reach the
feature. This change builds the replacement measure. A later change retires the
proof language once this one can stand in for it.

## What Changes

- Add `dod-guard cover <change-id>`, a command that reads a change's scenarios
  and reports which ones a real test exercises. A scenario binds to a named
  test, not to an authored shell command.
- Judge coverage by reachability, not by whether a test file mentions the
  symbol. A scenario counts as covered when a passing test reaches the code
  through the same entry point a user reaches it through.
- Report a scenario whose only test calls the implementation directly, with no
  path from a user-facing entry point. That is the integration-skipping case,
  and it currently reports as covered everywhere.
- Add `dod-guard backfill <path>`, which reads shipped code and its existing
  tests and drafts OpenSpec requirements and scenarios for behavior that no
  spec describes yet.
- Mark every backfilled requirement as drafted rather than confirmed. A human
  confirms it before it counts. A machine-written spec that nobody read is the
  same failure this change exists to fix.
- Add a coverage report to the CI gate table. It reports and does not block in
  this change, because no repository can pass it on day one.

This change adds nothing to the predicate surface and removes nothing from it.
The proof language keeps working exactly as it does today.

## Capabilities

### New Capabilities

- `dod-guard/scenario-coverage`: binds a scenario to the tests that exercise
  it. It judges coverage by whether a test reaches the code through a
  user-facing entry point, and reports a scenario whose tests bypass that
  entry point.
- `dod-guard/retroactive-spec-backfill`: reads shipped code and its tests, then
  drafts requirements and scenarios for behavior that no current spec
  describes. Every draft carries a confirmation state.

### Modified Capabilities

(none. This change adds two capabilities beside the existing four and changes
no requirement any of them state. `dod-guard/trace-closure` keeps its
two-directional leaf and scenario check unchanged. The change that retires the
proof language will modify it.)

## Impact

- New source under `packages/dod-guard/src/`, holding the coverage reader, the
  reachability walk, and the backfill drafter. No existing predicate module
  changes.
- `packages/dod-guard/src/cli.ts` gains the `cover` and `backfill`
  subcommands beside the existing `check` and `trace`.
- `scripts/ci/` gains a coverage report script. The gate table in `CLAUDE.md`
  gains a row that reports without blocking.
- `openspec/specs/dod-guard/` gains two capability directories.
- No package.json version changes, so nothing publishes from this change.
- `packages/evomcp` is unaffected. Its `verify_cmd` takes any shell string, and
  `orchestrate.test.ts:77` already passes `npm test`.
