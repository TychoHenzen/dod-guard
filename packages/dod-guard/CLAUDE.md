# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test

```bash
tsc                    # compile TypeScript to dist/
tsc --watch            # dev mode with live rebuild
npm test               # full tsc rebuild + run all tests
node --experimental-test-module-mocks --test "dist/*.test.js"           # run tests without rebuild
node --experimental-test-module-mocks --test "dist/checker.test.js"     # run a single test file
node --test --test-name-pattern="tdd*" # run tests matching pattern (omit flag if no mock.module)
npm run bundle         # esbuild bundle for distribution (prepublish)
```

The bundled output is `dist/bundle.js` — this is what ships as the package entry point. The MCP server runs TypeScript directly via tsx in development or the compiled dist output.

## Architecture

**dod-guard** is an MCP server + Claude Code plugin that enforces anti-cheat Definition of Done verification. Proofs are stored canonically in `~/.claude/dod-store/` — the rendered markdown cannot influence verification.

### Core type: TaskNode

The DoD is a recursive tree of `TaskNode` objects (not flat steps). A node is either:
- **Task group** — has `children: TaskNode[]`. Internal node, further decomposition.
- **Draft leaf** — `refinement: "draft"`, has `intent` describing what it will prove. No command yet.
- **Concrete leaf** — `refinement: "concrete"`, has `command`, `predicate`, `description`, `category`. Ready to execute.

A branch is "locked" when `hasDraftNodes(subtree) === false` (computed, never stored).

### Predicate types

What gets evaluated about a proof command's output:

| Type | Behavior |
|------|----------|
| `exit_code` / `exit_code_not` | Pass/fail based on exit code. `exit_code` defaults to `value: 0` when value is omitted. Issue #18. |
| `output_contains` / `output_not_contains` | Substring match in combined stdout+stderr |
| `output_matches` / `output_not_matches` | Regex match |
| `tdd` | Test must fail first (RED), then pass (GREEN). Bakes in assertion quality check. |
| `manual` / `review` | Out-of-band human verification via MCP elicitation |
| `mutation` | Parse surviving mutants from Stryker/mutmut/cargo-mutants output |
| `regression` | Capture baseline metric, compare subsequent runs with tolerance |
| `assertions` | Static analysis: count non-trivial assertions in test files |
| `streamline` | Grep for old symbol references — prove old code was removed |
| `observability` | Static analysis: log statement count, error handler coverage, anti-patterns |
| `brevity` | Static analysis: line length, function size, file size, cohesion, replacement ratio |

### Proof execution flow (checker.ts)

`checkDocument()` is the main entry point:
1. Flatten concrete leaves via `flattenConcreteLeaves()` (skips drafts, recurses into groups)
2. For each leaf: `executeProof()` → runs command via `exec()` with timeout from `predicate.timeout_ms` (default 120s). Slow tools like Stryker use 600s.
3. Manual/review proofs check `manual_result` cache (fingerprint-match = reuse without re-prompting)
4. TDD proofs track `seen_failing` state across runs (must fail before passing)
5. `computeProofFingerprint()` hashes all concrete leaves → compared against stored hash for tamper detection
6. Computes derived signals: `manual_unverified` count, `amendment_warnings` (nodes amended >2×), `blocked_by_manuals` (all automated pass but manuals unverified), scoped-check suggestion (>5 concrete proofs)

### MCP tools (index.ts)

| Tool | Purpose |
|------|---------|
| `dod_create` | Build a new DoD with roots tree, validate baseline, check OS tool availability |
| `dod_check` | Run all (or scoped) proofs, produce pass/fail/incomplete verdict. Pass `summary: true` to collapse unchanged drafts into a count line. |
| `dod_refine` | Turn a draft leaf into concrete (supply command + predicate + description) |
| `dod_add_node` / `dod_remove_node` | Add/remove nodes anywhere in the tree |
| `dod_amend` | Modify a concrete proof with audit trail. `node_path='*'` bulk-amends all concrete leaves. `node_path='__meta__'` updates DoD-level skip_reasons. Blocks machine→out-of-band (manual/review) conversion. |
| `dod_verify` | MCP elicitation for one manual/review proof (must be called explicitly) |
| `dod_status` | Read cached check result without re-running |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing markdown DoD into canonical storage |

### Scoped runs

`dod_check` accepts optional `nodePath` (dot-separated, e.g. `"0.children.1"`). Only that subtree executes; others are carried forward from last state. Scoped runs always return `INCOMPLETE` — only a full run can return `PASS`.

### Tamper detection

Every mutation (create, refine, amend, add/remove node) recomputes `doc.proof_fingerprint` — SHA256 of all concrete leaf `command|type|value` lines. `dod_check` compares the stored fingerprint against the live tree. Mismatch = TAMPER DETECTED, overall forced to FAIL.

### Baseline enforcement (baseline.ts)

Company baseline from `standards/dod-baselines.md` is machine-enforced at `dod_create`:

- **`type: "minimal"`**: Only lint+format+test enforced. All other checks skipped. Use for narrow-scope changes.
- **`type: "bug"`**: Hard mandatory + optional + regression categories enforced. TDD warning mentions regression test.
- **`type: "general"`**: Full enforcement — hard mandatory + all optional-requiring-justification + all regression categories.

**Hard mandatory** for `bug` and `general`: `integration_wiring`, `integration_behavioral`, `test`
**Optional requiring justification** (absent + no skip_reason → hard error): `tdd`, `mutation`, `streamline`, `observability`
**Regression categories** (same escalation): `performance`, `complexity`, `coverage`, `duplication`

Proof categories now include `"regression"` (added 2026-07-13) to avoid confusion with the `regression` predicate type.
- Advisory-only at creation for optional cats (they get filled during refinement)

### File responsibilities

| File | Role |
|------|------|
| `index.ts` | MCP server: tool registration, Zod schemas, input→TaskNode tree construction |
| `types.ts` | All types: `TaskNode`, `DodDocument`, `Predicate`, `CheckResult`, `LeafResult`, `ProofCategory` |
| `checker.ts` | Proof execution engine: flatten leaves, run commands, evaluate predicates, tamper detection |
| `author.ts` | Markdown rendering: `renderMarkdown()` → `<claude_instructions>`, `<definition_of_done>`, XML-tagged sections |
| `parser.ts` | Reverse: parse existing DoD markdown → `DodDocument`. Handles indentation-based tree structure. |
| `store.ts` | JSON file persistence in `~/.claude/dod-store/{uuid}.json` |
| `manual.ts` | Human verification: fingerprint caching, `resolveManual()` with confirmer callback |
| `assertions.ts` | Static analysis: scan test files for trivial assertions (constant-on-constant, always-passing) |
| `observability.ts` | Static analysis: scan source files for log statements, error handler coverage, anti-patterns (empty catch, swallowed errors, bare static logs) |
| `brevity.ts` | Static analysis: scan source files for line/function/file length, cohesion (mixed selection+iteration), replacement ratio |
| `regression.ts` | Extract metric number from regression command output (last number or regex capture) |
| `baseline.ts` | Baseline category enforcement with two-tier (hard error / warn-with-skip_reason) |
| `notify.ts` | Jingle (PowerShell beep arpeggio) for manual verification attention chime |
| `command-check.ts` | Validate proof commands: OS tool availability, glob expansion (`expandGlobsInCommand()`), mutating flag detection (`detectMutatingFlags()`) |
| `evaluate-proof.ts` | Predicate-specific analysis: builders (`buildLineLenFail`, etc.) and handlers (`hAssertions`, `hObservability`, `hBrevity`, `hManual`) that evaluate complex predicates (assertions/observability/brevity/regression/mutation) against analysis reports |

### Predicate evaluation in checkDocument()

After `executeProof()` runs the command:
- **mutation**: parse survivors, pass iff ≤ max allowed
- **regression**: capture baseline on first run, compare subsequent runs with tolerance
- **streamline**: grep for old symbols, count matches, pass iff ≤ max allowed
- **assertions**: run command, then static-analyze test files — pass iff ≥ min non-trivial assertions
- **observability**: run command, then static-analyze source files — pass iff log counts + error handler coverage + zero anti-patterns
- **brevity**: run command, then static-analyze source files — pass iff violations ≤ max allowed
- **tdd**: reject GREEN without prior RED; on GREEN, also check assertion quality
- **basic predicates** (exit_code, output_contains, etc.): evaluate directly against exit code + combined output

### Adding a new predicate type

1. Add the type string to `Predicate.type` union in `types.ts`
2. Add it to `PredicateSchema` Zod enum in `index.ts` (two places: `dod_create` and `dod_amend`)
3. Add evaluation logic in `checker.ts` → `executeProof()`
4. If it has a static analysis component, add a new analyzer module (like `assertions.ts`/`observability.ts`)
5. Add rendering support in `author.ts` → `renderLeaf()`
6. Add tests

### OS awareness

Proof commands run on the host OS. `dod_create`/`dod_refine`/`dod_amend` validate that commands reference tools available on the current platform (Windows/Linux/macOS) via `findMissingTools()` in `command-check.ts`. Validation is skipped for out-of-band predicate types (manual, review) — use `isExecutablePredicate()` from checker.ts as the single gate. On Windows, `exec()` uses `cmd.exe` shell.

Additional command validation at `dod_create`/`dod_refine` time:

- **Glob expansion**: `expandGlobsInCommand()` auto-resolves directory-level globs (`packages/*/src/`) on Windows, showing the expanded form in warnings so users can copy it.
- **Mutating flag detection**: `detectMutatingFlags()` scans for 12 patterns that dirty the working tree (`--write`, `--fix`, `tsc` without `--noEmit`, `git add/commit`, `npm install`, etc.) and warns with check-only alternatives.
- **Placeholder detection**: `dod_refine` warns when the command is a no-op (`node -e "process.exit(0)"`, `echo ok`, `exit 0`). These always pass and provide zero verification.

### Adding a new predicate type — execution gate

When adding a new predicate type, check whether it needs a runnable command or is out-of-band (human-verified). Update `isExecutablePredicate()` in checker.ts — this single function gates OS tool validation across `dod_create`, `dod_refine`, `dod_add_node`, `dod_amend`, and `extractExecutableCommands`. Never inline `pred.type !== "manual"` checks — use the helper so both manual and review are covered.

## Lessons

- [LESSON] `mock.module` + ESM dynamic import: `mock.module("node:child_process", ...)` MUST run before the module under test is imported (ESM caching caches the original dependency). Use dynamic `import()` in `before` hooks after `mock.module` registration to get a mock-wired instance. The `--experimental-test-module-mocks` flag is required on Node 22. `mock.method()` does NOT work on named ESM exports — use `mock.module` with `namedExports` instead. Discovered when adding behavioral tests for `notify.test.ts` that needed to intercept `child_process.spawn`.

- [LESSON] ESM mock isolation via separate test file: When a target module's existing test file has static `import` of the target (locking in unmocked dependency resolution via ESM cache), tests that need `mock.module` for the same target's transitive dependencies MUST live in a separate file. That file must have ZERO static imports from the target — use `import type` for types only, and dynamic `import()` in `before` hooks after `mock.module` registration. See `evaluate-proof-builders.test.ts` (needs mocked assertions/observability/brevity modules, separate from `evaluate-proof.test.ts` which statically imports evaluate-proof.js).

## Bundled Skills

The plugin ships five skills in `skills/`:

| Skill | File | Purpose |
|-------|------|---------|
| `interview` | `skills/interview/SKILL.md` | Structured requirements gathering → DoD creation |
| `quality-upgrade` | `skills/quality-upgrade/SKILL.md` | Multi-phase orchestrator: baseline → fix cycles → coverage → commit |
| `test-verification` | `skills/test-verification/SKILL.md` | Score test files across 8 dimensions + source code quality analysis |
| `test-fixer` | `skills/test-fixer/SKILL.md` | Apply targeted fixes from test-verification findings |
| `ratchet` | `skills/ratchet/SKILL.md` | Unified ratcheting workflow combining dod-guard + gitevo + evomcp + obsidian-rag + code-review-graph |

**Skill dependency chain**: `quality-upgrade` orchestrates `test-verification` and `test-fixer`. `test-fixer` requires `test-verification` manifest. `ratchet` orchestrates `interview` (requirements), `quality-upgrade`/`test-verification` (quality baseline), and delegates to gitevo/evomcp/obsidian-rag for branching/cascade/memory.

**Skill references**: Skills reference each other via `Skill("name", ...)` using bare names. The plugin namespace (`dod-guard:`) is auto-prefixed by Claude Code at install time.

**Test-verification assets**: `skills/test-verification/assets/dashboard.html` (HTML dashboard template) and `skills/test-verification/references/scoring-rubric.md` (scoring formulas). Referenced via relative paths from the SKILL.md.

**When editing skills**: Skills are the canonical source — changes here ship to all plugin users. Skill behavior changes should be tested by invoking the skill against this repo's own test suite.
