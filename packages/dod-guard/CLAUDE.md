# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test

```bash
tsc                    # compile TypeScript to dist/
tsc --watch            # dev mode with live rebuild
npm test               # full tsc rebuild + run all tests
node --experimental-test-module-mocks --test "dist/*.test.js"           # run tests without rebuild
node --test --test-name-pattern="tdd*" # run tests matching pattern (omit flag if no mock.module)
npm run bundle         # esbuild bundle for distribution (prepublish)
```

The bundled output is `dist/bundle.js` - this is what ships as the package entry point.

## Architecture

**dod-guard** is a scenario-coverage tool, not a proof-tree verifier. It has
two surfaces. `cover` checks whether OpenSpec scenarios are bound to tests.
It also checks whether those tests actually execute the package's declared
entry points. `steps` derives a `steps.json` execution plan from a change's
`tasks.md`. It binds each task's `verify_cmd` through `cover` where a
`<!-- covers: -->` annotation names a scenario.

### Two entry points, one binary

`dist/bundle.js` is both the MCP server and a CLI. `process.argv.slice(2)` decides:

| Invocation | Behavior |
|------------|----------|
| `dod-guard` (no args) | Starts the MCP stdio server (registers no tools - see `index.ts`) |
| `dod-guard cover [<change-id>] [--all] [--write-baseline] [--cwd=<dir>]` | Reports each scenario as covered-and-integrated, covered-but-not-integrated, unwired, or failed against `.github/quality/coverage-gate-baseline.json`. One of `<change-id>` or `--all` is required; `--write-baseline` needs `--all`. Exits `0` no regressions / `1` a regression / `3` usage error |
| `dod-guard steps <change-id> [--cwd=<dir>]` | Writes `openspec/changes/<id>/steps.json` from that change's `tasks.md`. Exits `0` on success / `3` usage error |

See the `USAGE` string in `cli.ts` for the authoritative, always-current command reference.

### Core concepts

**Scenario identity.** A scenario's id is stable across a spec delta and its
eventual merge into the main tree: `<group>/<capability>::<requirement
title>||<scenario title>`. Built by `buildScenarioId()` in
`src/openspec/scenario-id.ts`.

**The three-outcome report.** `cover` resolves each scenario to one of four
`Outcome` values, defined in `src/cover/report.ts`. `unwired` means no test
binds it. `covered-but-not-integrated` means a bound test passed but never
reached a declared entry point, or the package declares none. `covered-and-integrated`
means a bound test passed and reached a declared entry point. `failed` means
the bound test failed, or no test with that name exists. `failed` and
`unwired` rank equally for the ratchet. A failing bound test proves nothing
more than no test at all.

**The `// covers:` test marker.** A scenario binds to a test by a comment
directly above the `test(`/`it(` call, read by regex, never by running the
test file. Format, quoted from `markers.ts`'s own header comment:
`// covers: <group>/<capability> :: <requirement title> :: <scenario title>`

**`openspec/entry-points.json`.** The files a project considers user-facing for
each package, keyed by package directory (`entry-points.ts`). A package absent
from this file gets an honest report instead of a crash or a silent pass.
Every one of its bound scenarios reports `covered-but-not-integrated` with a
reason.

**The coverage-gate ratchet.** `.github/quality/coverage-gate-baseline.json`
adopts a scenario the baseline has never seen, at whatever outcome `cover`
finds it at (`baseline.ts`). It fails a run only when a scenario the baseline
already scored regresses to a worse one. `cover` also reports `improved`
scenarios, which rose above their baseline outcome. On an `--all` run it
reports `orphaned` baseline ids too: present in the baseline, absent from the
current run, report-only. This is the same adopt-unseen/block-on-regression
pattern the root CLAUDE.md's Ratchets table documents for
`coverage-baseline.json`. See that table for how CI invokes it.

### File responsibilities

| File | Role |
|------|------|
| `index.ts` | MCP server: registers no tools, starts stdio transport or delegates to the CLI |
| `cli.ts` | Shell CLI: `dod-guard cover\|steps`, argument parsing, `USAGE` string, exit codes |
| `shell.ts` | `buildShellInvocation()` - the one place that knows how to reach a host shell (Windows quirks documented inline) |
| `cover/run.ts` | `cover` top-level orchestration: enumerate scenarios, build the report, write or check against the ratchet baseline |
| `cover/report.ts` | The three-outcome report: `buildReport()`, `Outcome`, `outcomeRank()`, `summarizeReport()` |
| `cover/markers.ts` | Scans test files for `// covers:` comments and binds them to the next `test(`/`it(` call |
| `cover/enumerate.ts` | Reads scenarios out of `openspec/specs/**/spec.md` (`--all`) or `openspec/changes/<id>/specs/**/spec.md` (change-scoped) |
| `cover/entry-points.ts` | Loads and looks up `openspec/entry-points.json` |
| `cover/baseline.ts` | The coverage-gate ratchet: read/write/compare `.github/quality/coverage-gate-baseline.json` |
| `cover/reachability.ts` | Runs one bound test in isolation under c8, scoped to its package's compiled `dist/`, checks whether a declared entry point actually executed (per-function hit counts, not file-level coverage) |
| `cover/run-command.ts` | Builds the whole-file `node --test <dist file>` command a bound test runs by, for use as a `verify_cmd` |
| `cover/dist-file.ts` | Maps a source test file to the compiled `dist/` file `node --test` actually loads |
| `cover/package-dir.ts` | Maps a spec group to its package/tool directory and test file globs |
| `openspec/steps-cli.ts` | `steps` command: reads `tasks.md`, runs `cover`'s enumerate+report in-process, writes `steps.json` |
| `openspec/build-steps.ts` | Turns parsed task items plus a `cover` report into a `/step-by-step`-shaped `Step[]` |
| `openspec/tasks-parser.ts` | Parses `tasks.md` checkbox items and their `<!-- covers: -->` annotations |
| `openspec/requirements.ts` | Parses `### Requirement:` / `#### Scenario:` blocks out of a spec delta's markdown |
| `openspec/requirement-block.ts` | Type: one `### Requirement:` heading plus its scenarios |
| `openspec/scenario-block.ts` | Type: one `#### Scenario:` heading reduced to its `THEN` intent text |
| `openspec/scenario-id.ts` | `buildScenarioId()` - the stable scenario identity string |
| `openspec/fetch-instructions.ts` | Shells out to `openspec instructions`/`openspec status --json` for artifact paths and the change's artifact graph |
| `openspec/dependency.ts` | Type: one entry in `instructions --json`'s `dependencies` array |
| `openspec/types.ts` | Type: `OpenSpecInstructions`, the parsed shape of `openspec instructions ... --json` |
| `openspec/glob.ts` | Minimal glob resolver for `dependencies[].path` and test-file patterns (`*`, `**`) |

## Bundled Skills

| Skill | Purpose |
|-------|---------|
| `interview` | Structured requirements gathering that writes scenarios into an OpenSpec change and marks how each binds to a test |
| `ratchet` | Multi-step problem solving with verification gates |
| `clean-house` | Hunt down duplicate/obsolete implementations |
| `step-by-step` | Execute multi-step plans one atomic step at a time. An OpenSpec change also gets `openspec/changes/<id>/tasks.md`, checked off in the same update that marks a step completed in `steps.json` |
| `cheap-step` | Step-by-step with evomcp cheap-worker fanout |
| `adversarial-workflow` | 4-phase adversarial choreography (spec review, test audit, implementation review, structural gates) |
| `test-integrity-checker` | Audit tests for LLM-written patterns where tests bless production bugs instead of catching them |
| `blind-rewrite` | Delete an implementation, rebuild it from a contract a fresh agent gets without seeing the original, then gate the result against the deleted code. Shape D covers prose with no test harness: the contract carries claims and their strength, and `overlap-scan.mjs --mode=prose` scores sentences and their order. Code contracts (shapes A, B, C) are written as OpenSpec `### Requirement:` and `#### Scenario:` blocks, so a repo with `openspec/` can seed them from an existing spec and write the leftovers back as a delta under `openspec/changes/<id>/` |
| `tighten` | Autonomous blind-rewrite loop against accidental complexity. One target per invocation, ranked by structural violations times git return-churn, gated on both difference and reduction |
| `skill-debug` | Debug a skill from the sessions that ran it. `find-runs.mjs` locates every recent run in `~/.claude/projects`, `extract-run.mjs` compacts one into a numbered trace, and the skill aligns that against what the SKILL.md required |
| `skill-migrate` | Migrate a SKILL.md, agent definition, CLAUDE.md, memory file, or instinct file to post-4.6 models via blind rewrite. Extracts a behavioral contract, classifies scaffolding vs essential instructions, and blind-rewrites the artifact. `migration-check.mjs` resolves the artifact kind, scores it against that kind's own check set and weight table renormalized to 100, and refuses to compare a baseline of one kind against a run of another |

## Lessons

- [LESSON] Similarity thresholds need calibration against real file pairs before
  they ship. A 4-gram overlap limit picked by taste (0.25) failed a genuine
  reimplementation at 0.41, because typed languages share a large syntactic floor.
  Measuring unrelated pairs, a real rewrite, and a renamed copy gave the separation
  the guess did not. Longest shared token run separated them best: 10 to 13
  unrelated, 25 rewritten, 209 renamed. Discovered while building `blind-rewrite`.
- [LESSON] `quality-scan --baseline=<path>` writes to that path. It adopts every
  file the baseline has never seen. Point a local check at a copy, never at the
  tracked `.github/quality/quality-baseline.json`. Comparing against a baseline
  your own earlier run rewrote reports phantom regressions and hides real ones.
  Discovered while adding the `tighten` skill, after chasing 12 regressions that
  were an artifact of the mutated file.
- [LESSON] The quality baseline at HEAD can disagree with a clean scan of HEAD.
  Before you fix a reported regression, check whether it survives with your own
  change removed. Three `blind-rewrite` regressions reproduced with the whole
  `tighten` directory moved aside, so they predate that work.
- [LESSON] `mock.module` + ESM dynamic import: `mock.module("node:child_process", ...)` MUST run before the module under test is imported. Use dynamic `import()` in `before` hooks after `mock.module` registration. The `--experimental-test-module-mocks` flag is required on Node 22.
