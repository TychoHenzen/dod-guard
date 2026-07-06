# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test

```bash
tsc                    # compile TypeScript to dist/
tsc --watch            # dev mode with live rebuild
npm test               # full tsc rebuild + run all tests
node --test "dist/*.test.js"           # run tests without rebuild
node --test "dist/checker.test.js"     # run a single test file
node --test --test-name-pattern="tdd*" # run tests matching pattern
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
| `exit_code` / `exit_code_not` | Pass/fail based on exit code |
| `output_contains` / `output_not_contains` | Substring match in combined stdout+stderr |
| `output_matches` / `output_not_matches` | Regex match |
| `tdd` | Test must fail first (RED), then pass (GREEN). Bakes in assertion quality check. |
| `manual` / `review` | Out-of-band human verification via popup or MCP elicitation |
| `mutation` | Parse surviving mutants from Stryker/mutmut/cargo-mutants output |
| `regression` | Capture baseline metric, compare subsequent runs with tolerance |
| `assertions` | Static analysis: count non-trivial assertions in test files |
| `streamline` | Grep for old symbol references — prove old code was removed |
| `observability` | Static analysis: log statement count, error handler coverage, anti-patterns |

### Proof execution flow (checker.ts)

`checkDocument()` is the main entry point:
1. Flatten concrete leaves via `flattenConcreteLeaves()` (skips drafts, recurses into groups)
2. For each leaf: `executeProof()` → runs command via `exec()`, evaluates predicate
3. Manual/review proofs check `manual_result` cache (fingerprint-match = reuse without re-prompting)
4. TDD proofs track `seen_failing` state across runs (must fail before passing)
5. `computeProofFingerprint()` hashes all concrete leaves → compared against stored hash for tamper detection

### MCP tools (index.ts)

| Tool | Purpose |
|------|---------|
| `dod_create` | Build a new DoD with roots tree, validate baseline, check OS tool availability |
| `dod_check` | Run all (or scoped) proofs, produce pass/fail/incomplete verdict |
| `dod_refine` | Turn a draft leaf into concrete (supply command + predicate + description) |
| `dod_add_node` / `dod_remove_node` | Add/remove nodes anywhere in the tree |
| `dod_amend` | Modify a concrete proof with audit trail. Blocks machine→manual conversion. |
| `dod_verify` | Popup/elicitation for one manual/review proof (must be called explicitly) |
| `dod_status` | Read cached check result without re-running |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing markdown DoD into canonical storage |

### Scoped runs

`dod_check` accepts optional `nodePath` (dot-separated, e.g. `"0.children.1"`). Only that subtree executes; others are carried forward from last state. Scoped runs always return `INCOMPLETE` — only a full run can return `PASS`.

### Tamper detection

Every mutation (create, refine, amend, add/remove node) recomputes `doc.proof_fingerprint` — SHA256 of all concrete leaf `command|type|value` lines. `dod_check` compares the stored fingerprint against the live tree. Mismatch = TAMPER DETECTED, overall forced to FAIL.

### Baseline enforcement (baseline.ts)

Company baseline from `standards/dod-baselines.md` is machine-enforced at `dod_create`:
- **Hard mandatory** for all work types: `integration_wiring`, `integration_behavioral`, `test`
- **Optional requiring justification** (absent + no skip_reason → hard error): `tdd`, `mutation`, `streamline`, `observability`
- **Regression categories** (same escalation): `performance`, `complexity`, `coverage`, `duplication`
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
| `regression.ts` | Extract metric number from regression command output (last number or regex capture) |
| `baseline.ts` | Baseline category enforcement with two-tier (hard error / warn-with-skip_reason) |
| `notify.ts` | Windows messagebox + jingle for manual verification popups |
| `command-check.ts` | Validate proof commands reference tools available on the current OS |

### Predicate evaluation in checkDocument()

After `executeProof()` runs the command:
- **mutation**: parse survivors, pass iff ≤ max allowed
- **regression**: capture baseline on first run, compare subsequent runs with tolerance
- **streamline**: grep for old symbols, count matches, pass iff ≤ max allowed
- **assertions**: run command, then static-analyze test files — pass iff ≥ min non-trivial assertions
- **observability**: run command, then static-analyze source files — pass iff log counts + error handler coverage + zero anti-patterns
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

Proof commands run on the host OS. `dod_create`/`dod_refine`/`dod_amend` validate that commands reference tools available on the current platform (Windows/Linux/macOS) via `findMissingTools()` in `command-check.ts`. On Windows, `exec()` uses `cmd.exe` shell.
