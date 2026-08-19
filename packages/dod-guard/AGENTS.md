# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test

```bash
tsc                    # compile TypeScript to dist/
tsc --watch            # dev mode with live rebuild
npm test               # full tsc rebuild + run all tests
node --experimental-test-module-mocks --test "dist/*.test.js"           # run tests without rebuild
node --test --test-name-pattern="tdd*" # run tests matching pattern (omit flag if no mock.module)
npm run bundle         # esbuild bundle -> dist/bundle.js, the tracked artifact users run
```

The bundled output is `dist/bundle.js` - this is what ships as the package entry point.

## Architecture

**dod-guard** is a scenario-coverage tool, not a proof-tree verifier. `cover`
checks whether OpenSpec scenarios are bound to tests by scanning for `covers:`
markers in test files. It never runs a test. A skill such as `/step-by-step`
binds each `tasks.md` task's `verify_cmd` through `cover` where a
`<!-- covers: -->` annotation names a scenario.

### Two entry points, one binary

`dist/bundle.js` is both the MCP server and a CLI. `process.argv.slice(2)` decides:

| Invocation | Behavior |
|------------|----------|
| `dod-guard` (no args) | Starts the MCP stdio server (registers no tools - see `index.ts`) |
| `dod-guard cover [<change-id>] [--all] [--write-baseline] [--cwd=<dir>]` | Reports each scenario as `bound` or `unwired` against `.github/quality/coverage-gate-baseline.json`. One of `<change-id>` or `--all` is required; `--write-baseline` needs `--all`. Exits `0` no regressions / `1` a regression / `3` usage error / `4` an unexpanded task group / `5` a fully expanded plan naming none of the change's scenarios |

A regression outranks both plan codes: when a change-scoped run finds one, it exits `1` even when a plan check would also have fired, though both plan checks still run and still write their reports on that path. Between the plan codes themselves, order holds: when nothing regressed, `4` is reported ahead of `5`.

See the `USAGE` string in `cli.ts` for the authoritative, always-current command reference.

### Core concepts

**Scenario identity.** A scenario's id is stable across a spec delta and its
eventual merge into the main tree: `<group>/<capability>::<requirement
title>||<scenario title>`. Built by `buildScenarioId()` in
`src/openspec/scenario-id.ts`.

**The two-outcome report.** `cover` resolves each scenario to one of two
`Outcome` values, defined in `src/cover/report.ts`. `bound` means a test
carries a marker naming this scenario. `unwired` means no test binds it.
`cover` never runs a test - it scans markers by regex. Whether a bound test
passes is the language's own test runner's job.

**The `covers:` test marker.** A scenario binds to a test by a comment
placed on the line directly above the test declaration. The scanner reads
the marker by regex, never by running the test file. The comment prefix
and test-declaration pattern are determined by the file's extension
(`languages.ts`). Format:
`<comment-prefix> covers: <group>/<capability> :: <requirement title> :: <scenario title>`

The marker goes on the line immediately before the test declaration. It
must not go inside the function body, even when the language allows
comments there. The scanner looks forward from the marker to find the
next test declaration; a marker inside the body has no declaration after
it and binds nothing.

```python
# CORRECT - marker above the def
# covers: eval/events :: ProbeTruth frozen :: difficulty defaults
def test_probe_truth_difficulty():
    assert truth.difficulty is None

# WRONG - marker inside the body, binds nothing
def test_probe_truth_difficulty():
    # covers: eval/events :: ProbeTruth frozen :: difficulty defaults
    assert truth.difficulty is None
```

```typescript
// CORRECT - marker above the test call
// covers: dod-guard/coverage-gate :: cover reports :: unwired
test("cover reports unwired", async () => {});
```

Supported extensions: `.ts`/`.js`/`.mjs`/`.cjs` (`//`, `test(`/`it(`),
`.py` (`#`, `def test_`), `.go` (`//`, `func Test`),
`.rs` (`//`, `#[test]` then `fn`), `.rb` (`#`, `def test_` or `it`),
`.java`/`.kt` (`//`, `void test`/`fun test` or `@Test` then method),
`.sh`/`.bash` (`#`, `test_()` function).

**`openspec/test-globs.json`.** Optional project-level override for
test-file discovery, keyed by spec group. Shape:
`{"<group>": ["glob1", "glob2"]}`. When absent or missing an entry for a
group, `scanMarkers` falls back to the built-in globs in `package-dir.ts`.

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
| `cli.ts` | Shell CLI: `dod-guard cover`, argument parsing, `USAGE` string, exit codes |
| `shell.ts` | `buildShellInvocation()` - the one place that knows how to reach a host shell (Windows quirks documented inline) |
| `cover/run.ts` | `cover` top-level orchestration: enumerate scenarios, build the report, write or check against the ratchet baseline |
| `cover/report.ts` | The two-outcome report: `buildReport()`, `Outcome` (`bound`/`unwired`), `outcomeRank()`, `summarizeReport()` |
| `cover/markers.ts` | Scans test files for `covers:` comments and binds them to the next test declaration, dispatching on file extension |
| `cover/languages.ts` | `LanguageSpec` interface and `LANG_TABLE`: maps file extensions to marker regex, test-declaration regex, and name extractor |
| `cover/test-globs.ts` | Loads and validates `openspec/test-globs.json` for configurable test-file discovery per group |
| `cover/enumerate.ts` | Reads scenarios out of `openspec/specs/**/spec.md` (`--all`) or `openspec/changes/<id>/specs/**/spec.md` (change-scoped) |
| `cover/baseline.ts` | The coverage-gate ratchet: read/write/compare `.github/quality/coverage-gate-baseline.json` |
| `cover/plan-checks.ts` | The two plan checks a change-scoped run adds on top of coverage: `checkPlanComplete` (a numbered group with no checkbox) and `checkPlanBound` (a finished plan whose items name no scenario) |
| `cover/package-dir.ts` | Maps a spec group to its package/tool directory and test file globs |
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

The package ships 28 documented skills, one for each `skills/*/SKILL.md` file.

| Skill | Purpose |
|-------|---------|
| `codex-migrate` | Audit and migrate Claude-oriented agent setup for shared Claude and Codex use, one user-approved slice at a time |
| `adversarial-workflow` | 4-phase adversarial choreography (spec review, test audit, implementation review, structural gates) |
| `blind-rewrite` | Delete an implementation, rebuild it from a contract a fresh agent gets without seeing the original, then gate the result against the deleted code. Shape D covers prose with no test harness: the contract carries claims and their strength, and `overlap-scan.mjs --mode=prose` scores sentences and their order. Code contracts (shapes A, B, C) are written as OpenSpec `### Requirement:` and `#### Scenario:` blocks, so a repo with `openspec/` can seed them from an existing spec and write the leftovers back as a delta under `openspec/changes/<id>/` |
| `tighten` | Autonomous blind-rewrite loop against accidental complexity. One target per invocation, ranked by structural violations times git return-churn, gated on both difference and reduction |
| `skill-debug` | Debug a skill from the sessions that ran it. `find-runs.mjs` locates every recent run in `~/.claude/projects`, `extract-run.mjs` compacts one into a numbered trace, and the skill aligns that against what the SKILL.md required |
| `skill-migrate` | Migrate a SKILL.md, agent definition, CLAUDE.md, memory file, or instinct file to post-4.6 models via blind rewrite. Extracts a behavioral contract, classifies scaffolding vs essential instructions, and blind-rewrites the artifact. `migration-check.mjs` resolves the artifact kind, scores it against that kind's own check set and weight table renormalized to 100, and refuses to compare a baseline of one kind against a run of another |
| `spec-extract` | Extract an exhaustive OpenSpec-format behavioral spec from any code or prose target without deleting it. Dispatches `blind-contract-extractor` or `blind-prose-contract-extractor`, transforms the report into requirements and scenarios, and writes it as a spec file. Used standalone or as the extraction step inside `blind-rewrite` |
| `spec-explore` | Discover missing requirements, edge cases, and implicit assumptions in an existing spec by comparing it against the implementation. Produces a delta spec the user can selectively adopt |
| `spec-test` | Generate tests from spec WHEN/THEN contracts without reading the implementation for expected values. Reports contradictions between spec and code instead of silently adjusting assertions |
| `opsx-guide` | Interactive guide to the OpenSpec workflow and the `/opsx:*` skills. Reads the project's real specs and coverage state, routes to the right skill. Never writes code or creates a change |
| `publish` | Publish or release workflow for the monorepo: run every CI gate locally, commit, push to master, watch CI (including its follow-up autofix commit), then tell the user to run `/plugin update` and `/reload-plugins`. Every plugin, code-only or npm-backed, needs a `plugin.json` version bump for its own content changes so the plugin cache re-copies |
| `opsx-continue` | Creates a change's missing planning artifacts in the order `openspec status` reports, and plans `tasks.md` in waves - every `## N.` group heading written up front, checkbox items expanded for one group at a time, re-invocable so a later wave is written with what the earlier ones taught. Never edits code and never revises an existing artifact, which is `/opsx-update`'s job |
| `clean-house` | Hunt down duplicate and obsolete implementations with git archaeology, then delete them once the user approves |
| `doc-reconcile` | Find documents that contradict each other, date the conflicting claims, and remove the older side when history is decisive |
| `interview` | Structured requirements gathering that writes scenarios into an OpenSpec change and marks how each binds to a test |
| `opsx-apply` | Apply an OpenSpec change by routing execution through `step-by-step`, then gate archival on `dod-guard cover` |
| `opsx-archive` | Archive a completed OpenSpec change after its `dod-guard cover` gate passes |
| `opsx-dashboard` | Start, stop, open, or report status for the OpenSpec dashboard |
| `opsx-doctor` | Check OpenSpec project health and translate validation findings into plain language |
| `opsx-explore` | Explore a change with awareness of existing OpenSpec specs, capability groups, and coverage state |
| `opsx-init` | Initialize OpenSpec, configure its workflow schema, and register the project with the dashboard |
| `opsx-propose` | Propose a new OpenSpec change with its proposal, specs, design, and tasks |
| `opsx-quick` | Create minimal OpenSpec documentation and hand off a lightweight change to `step-by-step` |
| `opsx-sync` | Sync delta specs from an OpenSpec change into the main specs |
| `opsx-update` | Revise and revalidate an existing OpenSpec change's planning artifacts |
| `spec-split` | Split compound requirements into one scenario per uncovered obligation and reassign test bindings |
| `step-by-step` | Execute multi-step plans one atomic step at a time and update `openspec/changes/<id>/tasks.md` |
| `test-integrity-checker` | Audit tests for LLM-written patterns where tests bless production bugs instead of catching them |

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
