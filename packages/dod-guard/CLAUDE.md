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
| `regression` | Capture baseline metric, compare subsequent runs with tolerance. First run returns `baseline_captured` status (not `pass`). |
| `assertions` | Static analysis: count non-trivial assertions in test files |
| `streamline` | Grep for old symbol references — prove old code was removed |
| `observability` | Static analysis: log statement count, error handler coverage, anti-patterns |
| `brevity` | Static analysis: line length, function size, file size, cohesion, replacement ratio |

### Proof execution flow (checker.ts)

`checkDocument()` is the main entry point:
1. **(Full checks only)** Capture VCS state: `git rev-parse HEAD` → `checked_commit`, `git status --porcelain` → `checked_dirty`. Dirty tree downgrades PASS to `PASS_DIRTY` unless `allow_dirty_pass` is set.
2. **(Full checks only)** Create ephemeral git worktree snapshot of `checked_commit` via `createSnapshot()` (snapshot.ts). All proof commands run inside the snapshot to prevent cross-proof tree pollution. Guaranteed cleanup in `finally`.
3. Flatten concrete leaves via `flattenConcreteLeaves()` (skips drafts, recurses into groups)
4. For each leaf: `executeProof()` → runs command via `exec()` with timeout from `predicate.timeout_ms` (default 120s). Slow tools like Stryker use 600s.
5. Manual/review proofs check `manual_result` cache (fingerprint-match = reuse without re-prompting). Review predicates require `review_verdict` + `reviewer` attestation.
6. TDD proofs track `seen_failing` state across runs (must fail before passing)
7. `computeProofFingerprint()` (fingerprint.ts) hashes all concrete leaves → compared against stored hash for tamper detection
8. Computes derived signals: `manual_unverified` count, `amendment_warnings`, `blocked_by_manuals`, `baseline_captured` leaves → INCOMPLETE, scoped-check suggestion

### MCP tools (index.ts)

| Tool | Purpose |
|------|---------|
| `dod_create` | Build a new DoD with roots tree, validate baseline, check OS tool availability |
| `dod_check` | Run all (or scoped) proofs, produce pass/fail/incomplete verdict. Pass `summary: true` to collapse unchanged drafts into a count line. |
| `dod_refine` | Turn a draft leaf into concrete (supply command + predicate + description) |
| `dod_add_node` / `dod_remove_node` | Add/remove nodes anywhere in the tree |
| `dod_amend` | Modify a concrete proof with audit trail. `node_path='*'` bulk-amends all concrete leaves. `node_path='__meta__'` updates DoD-level skip_reasons. Blocks machine→out-of-band (manual/review) conversion. Requires `amend_justification` after 3 amends to same node or for any strength-reducing change (threshold loosening, extract removal). |
| `dod_verify` | MCP elicitation for one manual/review proof (must be called explicitly). Review proofs require `review_verdict` + `reviewer` attestation payload. |
| `dod_status` | Read cached check result without re-running |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing markdown DoD into canonical storage. Uses explicit `<!--p:JSON-->` metadata from author.ts for lossless round-trip; proofs without metadata become draft leaves requiring `dod_refine`. Sets `execution_confirmed: false` — first `dod_check` returns command list without executing until `confirm_import: true` is passed. |
| `dod_tree` | Read-only structural dump — path, ID, title, status per node. No proof execution. Scopable via `node_id` or `node_path`. |

All mutation tools (`dod_refine`, `dod_amend`, `dod_add_node`, `dod_remove_node`) accept optional `node_id` as alternative to `node_path`/`parent_path`. Node IDs are stable UUIDs — they survive tree mutations (adds, removes, subdivisions) that shift positional paths. Use `dod_tree` to discover current paths and IDs.

### Scoped runs

`dod_check` accepts optional `nodePath` (dot-separated, e.g. `"0.children.1"`). Only that subtree executes; others are carried forward from last state. Scoped runs always return `INCOMPLETE` — only a full run can return `PASS`. Use `dod_tree` to discover current node paths before scoping.

### Tamper detection

Every mutation (create, refine, amend, add/remove node) recomputes `doc.proof_fingerprint` via `computeProofFingerprint()` (fingerprint.ts) — full SHA-256 of all strength-bearing fields from every concrete leaf, sorted by node ID for deterministic ordering: `command`, `predicate.type`, `predicate.value`, `timeout_ms`, `extract`, `category`, `min_replacement_ratio`, `max_function_lines`, `max_file_lines`, `max_line_length`, `max_complexity`, `baseline_value`, plus conditional `lower_is_better` and `advisory`. `dod_check` compares the stored fingerprint against the live tree. Mismatch = TAMPER DETECTED, overall forced to FAIL.

### Baseline enforcement (baseline.ts)

Company baseline from `standards/dod-baselines.md` is machine-enforced. `validateBaseline()` classifies category coverage; `baselineLockError()` is the hard gate.

- **`type: "minimal"`**: No baseline categories enforced — `validateBaseline` returns zero errors regardless of coverage (only advisory strength warnings still fire). Use for narrow-scope changes that legitimately skip the baseline.
- **`type: "bug"`**: Hard mandatory + optional + regression categories enforced. TDD warning mentions regression test.
- **`type: "general"`**: Full enforcement — hard mandatory + all optional-requiring-justification + all regression categories.

**Hard mandatory** for `bug` and `general`: `integration_wiring`, `integration_behavioral`, `test`
**Manual/review requirement** (S10, 2026-07-20): `type: "general"` and `type: "bug"` require at least one `manual` or `review` proof, or a `skip_reason["manual"]`. Enforced at lock gate.
**Optional requiring justification** (absent + no skip_reason → hard error): `tdd`, `mutation`, `streamline`, `observability`
**Regression categories** (same escalation): `performance`, `complexity`, `coverage`, `duplication`

Proof categories include `"regression"` (added 2026-07-13) to avoid confusion with the `regression` predicate type.

**Enforcement point — the lock gate (F1, 2026-07-13):** the baseline is a *hard block* the moment a DoD becomes "locked" (no draft nodes remain), because a locked tree claims to be complete. `baselineLockError()` runs at:
- `dod_create` when the tree is created fully-concrete (zero drafts), and
- `dod_refine` (concretize) when the last remaining draft is concretized.

If mandatory categories are missing (and not covered by `skip_reasons`), the operation is **rejected without persisting** — the author must add the proof, add a `skip_reason`, or switch to `type: "minimal"`. While draft nodes still remain, `dod_create` only shows the baseline as an advisory (categories get filled during refinement).

### File responsibilities

| File | Role |
|------|------|
| `index.ts` | MCP server: tool registration, Zod schemas, input→TaskNode tree construction, import gate, amend gate |
| `types.ts` | All types: `TaskNode`, `DodDocument`, `Predicate`, `CheckResult`, `LeafResult`, `ProofCategory`, `ManualResult` |
| `checker.ts` | Proof execution engine: VCS capture, snapshot wiring, leaf execution, predicate evaluation, tamper detection, amendment gate helpers (`detectStrengthReduction`, `checkAmendGate`) |
| `fingerprint.ts` | Canonical fingerprint: `computeProofFingerprint()` (full SHA-256, all strength fields, deterministic ordering) + `flattenConcreteLeaves()` |
| `snapshot.ts` | Ephemeral git worktree isolation: `createSnapshot()` (git worktree add → fallback git archive), `destroySnapshot()` (guaranteed cleanup) |
| `author.ts` | Markdown rendering: `renderMarkdown()` → `<claude_instructions>`, `<definition_of_done>`, XML-tagged sections. Emits `<!--p:JSON-->` metadata for lossless round-trip. |
| `parser.ts` | Reverse: parse DoD markdown → `DodDocument`. Uses explicit `<!--p:JSON-->` metadata; proofs without metadata → draft leaves. |
| `store.ts` | JSON file persistence in `~/.claude/dod-store/{uuid}.json` |
| `tree-utils.ts` | Tree utilities: ID-based path resolution (`findNodeById`), tree display (`formatTree`), node counting (`countAllNodes`), node ID generation (`nextNodeId`), tree construction (`buildTaskNodes`), OS command validation |
| `manual.ts` | Human verification: fingerprint caching, `resolveManual()` with confirmer callback. Review predicates require `review_verdict` + `reviewer` attestation. |
| `assertions.ts` | Static analysis: scan test files for trivial assertions (constant-on-constant, always-passing) |
| `observability.ts` | Static analysis: scan source files for log statements, error handler coverage, anti-patterns (empty catch, swallowed errors, bare static logs) |
| `brevity.ts` | Static analysis: scan source files for line/function/file length, cohesion (mixed selection+iteration), replacement ratio |
| `regression.ts` | Extract metric number from regression command output (last number or regex capture) |
| `baseline.ts` | Baseline category enforcement with two-tier (hard error / warn-with-skip_reason) |
| `notify.ts` | Jingle (PowerShell beep arpeggio) for manual verification attention chime |
| `command-check.ts` | Validate proof commands: OS tool availability, glob expansion (`expandGlobsInCommand()`), mutating flag detection (`detectMutatingFlags()`), placeholder no-op detection (`isPlaceholderCommand()`), ESM `node -e require()` detection (`usesNodeEvalRequire()` + `isEsmPackage()`), positive-evidence gate (`validatePositiveEvidence()` — behavioral categories must reference changed files, use tdd, or have skip_reason) |
| `evaluate-proof.ts` | Predicate-specific analysis: builders (`buildLineLenFail`, etc.) and handlers (`hAssertions`, `hObservability`, `hBrevity`, `hRegress`, `hManual`) that evaluate complex predicates against analysis reports. `resolveAnalysisTargets()` intersects command-referenced files with `git diff --name-only` to prevent targeting unchanged files. |

### Predicate evaluation in checkDocument()

After `executeProof()` runs the command:
- **mutation**: parse survivors, pass iff ≤ max allowed
- **regression**: first run captures baseline → returns `baseline_captured` (not `pass`). Subsequent runs compare against stored `baseline_value` (now in fingerprint — store edits → TAMPER).
- **streamline**: grep for old symbols, count matches, pass iff ≤ max allowed
- **assertions**: run command, then static-analyze test files — pass iff ≥ min non-trivial assertions. Targets resolved via `resolveAnalysisTargets()` (must overlap with `git diff` changed files, or skip_reason).
- **observability**: run command, then static-analyze source files — pass iff log counts + error handler coverage + zero anti-patterns. Targets resolved via `resolveAnalysisTargets()`.
- **brevity**: run command, then static-analyze source files — pass iff violations ≤ max allowed. Targets resolved via `resolveAnalysisTargets()`.
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
- **Placeholder detection**: `isPlaceholderCommand()` flags no-ops (`node -e "process.exit(0)"`, `echo ok`, `true`, `exit 0`, `exit /b 0`, `cmd /c exit 0`, `rem`, `:`) that always pass and verify nothing. Warns at both `dod_refine` (concretize) and `dod_amend`.
- **ESM `require()` detection**: `usesNodeEvalRequire()` flags `node -e "require(...)"` when the nearest `package.json` (`isEsmPackage()`) declares `"type": "module"` — those throw `ERR_REQUIRE_ESM`. Warns with OS-native / `--input-type` alternatives (friction S2).
- **Positive-evidence gate** (`validatePositiveEvidence()`, S05): for behavioral categories (`test`, `integration_behavioral`, `integration_wiring`), the command must reference files changed in git diff, or use a `tdd` predicate, or have a `skip_reason`. Enforced as HARD GATE at `dod_refine`/`dod_amend` — rejects concretization without evidence. `isPlaceholderCommand()` remains as secondary advisory warning.

### Adding a new predicate type — execution gate

When adding a new predicate type, check whether it needs a runnable command or is out-of-band (human-verified). Update `isExecutablePredicate()` in checker.ts — this single function gates OS tool validation across `dod_create`, `dod_refine`, `dod_add_node`, `dod_amend`, and `extractExecutableCommands`. Never inline `pred.type !== "manual"` checks — use the helper so both manual and review are covered.

### VCS binding (S03, 2026-07-20)

Full `dod_check` captures `git rev-parse HEAD` → `checked_commit` and `git status --porcelain` → `checked_dirty` on `CheckResult`. Dirty tree downgrades a would-be PASS to `PASS_DIRTY` unless `doc.allow_dirty_pass` is set. Non-git directories skip gracefully (`is_git_repo: false`). Scoped runs skip VCS capture.

### Snapshot isolation (S04, 2026-07-20)

Full `dod_check` creates an ephemeral git worktree of `checked_commit` via `createSnapshot()` (snapshot.ts). All proof commands run with `cwd` set to the snapshot — proofs can't dirty each other or the real tree. Guaranteed cleanup in `finally` block. Falls back from `git worktree add` to `git archive | tar -x`. Skipped for dirty trees with `allow_dirty_pass` set.

### Import gate (S09, 2026-07-20)

`dod_import` sets `execution_confirmed: false` on imported docs. First `dod_check` returns the command list without executing, instructing the user to review and pass `confirm_import: true`. Author-created docs (`dod_create`) set `execution_confirmed: true` unconditionally.

### Amendment gates (S08, 2026-07-20)

`dod_amend` requires `amend_justification` after 3 amends to the same node. Strength-reducing changes (threshold loosening, extract removal, `lower_is_better` flip, etc.) always require justification via `detectStrengthReduction()` + `checkAmendGate()`. Justifications are recorded in the amendment audit trail.

### Debug logging policy (S12, 2026-07-20)

Production `console.debug` calls are gated behind `process.env.DOD_DEBUG`. Top-level module-load side effects (`console.debug("module loaded")`) are removed entirely — they fire on every import. Set `DOD_DEBUG=1` for troubleshooting.

## Lessons

- [LESSON] `mock.module` + ESM dynamic import: `mock.module("node:child_process", ...)` MUST run before the module under test is imported (ESM caching caches the original dependency). Use dynamic `import()` in `before` hooks after `mock.module` registration to get a mock-wired instance. The `--experimental-test-module-mocks` flag is required on Node 22. `mock.method()` does NOT work on named ESM exports — use `mock.module` with `namedExports` instead. Discovered when adding behavioral tests for `notify.test.ts` that needed to intercept `child_process.spawn`.

- [LESSON] ESM mock isolation via separate test file: When a target module's existing test file has static `import` of the target (locking in unmocked dependency resolution via ESM cache), tests that need `mock.module` for the same target's transitive dependencies MUST live in a separate file. That file must have ZERO static imports from the target — use `import type` for types only, and dynamic `import()` in `before` hooks after `mock.module` registration. See `evaluate-proof-builders.test.ts` (needs mocked assertions/observability/brevity modules, separate from `evaluate-proof.test.ts` which statically imports evaluate-proof.js).

## Bundled Skills

The plugin ships eight skills in `skills/`:

| Skill | File | Purpose |
|-------|------|---------|
| `interview` | `skills/interview/SKILL.md` | Structured requirements gathering → DoD creation |
| `quality-upgrade` | `skills/quality-upgrade/SKILL.md` | Multi-phase orchestrator: baseline → fix cycles → coverage → commit |
| `test-verification` | `skills/test-verification/SKILL.md` | Score test files across 8 dimensions + source code quality analysis |
| `test-fixer` | `skills/test-fixer/SKILL.md` | Apply targeted fixes from test-verification findings |
| `ratchet` | `skills/ratchet/SKILL.md` | Unified ratcheting workflow combining dod-guard + gitevo + evomcp + obsidian-rag + code-review-graph |
| `clean-house` | `skills/clean-house/SKILL.md` | Hunt down duplicate/obsolete implementations via git archaeology and aggressively remove dead code |
| `step-by-step` | `skills/step-by-step/SKILL.md` | Execute multi-step plans by dispatching ONE fresh subagent per atomic step. Ships 2 specialized agents (step-implementer, step-fixer). |
| `cheap-step` | `skills/cheap-step/SKILL.md` | Step-by-step's atomic discipline but each step implemented by cheap-worker fanout (evomcp solve → DeepSeek) with host-model verification and fallback. ~80% cost reduction vs. all-host step-by-step. |

**Skill dependency chain**: `quality-upgrade` orchestrates `test-verification` and `test-fixer`. `test-fixer` requires `test-verification` manifest. `ratchet` orchestrates `interview` (requirements), `quality-upgrade`/`test-verification` (quality baseline), and delegates to gitevo/evomcp/obsidian-rag for branching/cascade/memory. `cheap-step` depends on evomcp's `solve` tool for cheap-worker fanout and reuses step-by-step's `step-implementer` agent for host-only steps.

**Skill references**: Skills reference each other via `Skill("name", ...)` using bare names. The plugin namespace (`dod-guard:`) is auto-prefixed by Claude Code at install time.

**Plugin agents**: agents ship from the plugin-root `agents/` directory (`agents/step-implementer.md`, `agents/step-fixer.md`) — NOT nested inside the skill. Claude Code only discovers plugin agents from `<plugin-root>/agents/*.md`, and each file MUST have YAML frontmatter (`name`, `description`) or it won't register. They are referenced by bare name (`step-implementer`, `step-fixer`) — the plugin namespace is auto-prefixed at install time. See each agent's `.md` for its prompt and role.

**Test-verification assets**: `skills/test-verification/assets/dashboard.html` (HTML dashboard template) and `skills/test-verification/references/scoring-rubric.md` (scoring formulas). Referenced via relative paths from the SKILL.md.

**When editing skills**: Skills are the canonical source — changes here ship to all plugin users. Skill behavior changes should be tested by invoking the skill against this repo's own test suite.
