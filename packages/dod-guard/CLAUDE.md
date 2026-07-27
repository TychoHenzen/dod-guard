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

The bundled output is `dist/bundle.js` — this is what ships as the package entry point.

## Architecture

**dod-guard** is an MCP server + Claude Code plugin that enforces Definition of Done verification with behavioral predicates. Proofs are stored canonically in `~/.claude/dod-store/` — the rendered markdown cannot influence verification.

### Two entry points, one binary

`dist/bundle.js` is both the MCP server and a CLI. `process.argv.slice(2)` decides:

| Invocation | Behavior |
|------------|----------|
| `dod-guard` (no args) | Starts the MCP stdio server |
| `dod-guard check --dod-id=<id> [--node-path=<p>] [--quiet]` | Runs proofs, exits `0` pass / `1` fail / `2` drafts remain / `3` usage error |
| `dod-guard status\|tree\|list` | Read-only inspection |

The CLI exists so `verify_cmd` / `fitness_cmd` in evomcp can gate on a DoD subtree — MCP tool names are not shell commands. Exit codes are a public contract; changing them breaks every cascade and cheap-step spec in the wild. A scoped run exits 0 when its subtree passes even though `checkDocument` reports `incomplete`; see `exitCodeFor` in `cli.ts`.

### Core principle

**Behavioral predicates only.** Every proof is a concrete, falsifiable claim about what the implementation should do. No mechanical quality metrics (line length, log count, assertion count) — those are noise that weak models game without fixing actual behavior.

### Predicate types (10 — 7 behavioral + 3 gate)

| Type | Behavior |
|------|----------|
| `exit_code` / `exit_code_not` | Pass/fail based on exit code |
| `output_contains` / `output_not_contains` | Substring match in combined stdout+stderr |
| `output_matches` / `output_not_matches` | Regex match |
| `tdd` | Test must fail first (RED), then pass (GREEN) |
| `adversarial` | Checks DoD's `adversarial_gates[]` — gate for specified phase must be GO |
| `holdout` | Verifies holdout test fingerprint (SHA-256) hasn't changed |
| `convergence` | Checks convergence audit (Phase 4) reached GO |

### Proof categories (4)

`"behavioral"` | `"wiring"` | `"other"` | `"test_audit"`

### Proof execution flow (checker.ts)

`checkDocument()` is the main entry point:
1. Flatten concrete leaves (skips drafts, recurses into groups)
2. For each leaf: `executeProof()` → runs command via `execFile()` with timeout (default 120s)
3. TDD proofs track `seen_failing` state across runs (must fail before passing)
4. `computeProofFingerprint()` hashes all concrete leaves → compared against stored hash for tamper detection
5. Any behavioral predicate fail → overall FAIL
6. Any node amended 3+ times triggers STUCK verdict (approach likely wrong; re-read requirements) — overrides PASS even if all proofs pass

### File responsibilities

| File | Role |
|------|------|
| `index.ts` | MCP server: tool registration, Zod schemas, import gate, amend gate, adversarial gate, manual elicitation |
| `types.ts` | All types: `TaskNode`, `DodDocument`, `Predicate`, `CheckResult`, `LeafResult`, `ProofCategory`, `AdversarialGate`, `AdversarialLensResult`, `AdversarialFinding` |
| `cli.ts` | Shell CLI: `dod-guard check\|status\|tree\|list`. Exit codes are the contract for evomcp `verify_cmd` — see `EXIT` and `exitCodeFor`. Bare `dod-guard` (no args) starts the MCP server instead |
| `import-gate.ts` | `buildImportGateInfo()` — blocks execution of imported DoDs until confirmed. Shared by the MCP tool and the CLI |
| `checker.ts` | Proof execution engine: VCS capture, leaf execution, predicate evaluation, tamper detection, amendment gate, STUCK verdict detection (node amended 3+ times) |
| `evaluate-proof.ts` | Single proof execution: command run, predicate eval, failure diagnosis |
| `fingerprint.ts` | Canonical fingerprint: `computeProofFingerprint()` (SHA-256 of command+type+value+options) |
| `author.ts` | Markdown rendering: `<claude_instructions>`, sections, proof tree, predicate metadata |
| `parser.ts` | Reverse: parse DoD markdown → `DodDocument` using `<!--p:JSON-->` metadata |
| `store.ts` | JSON file persistence in `~/.claude/dod-store/{uuid}.json` |
| `tree-utils.ts` | Tree utilities: ID-based path resolution, tree display, node counting, OS command validation |
| `command-check.ts` | Validate proof commands: OS tool availability, glob expansion, placeholder detection |
| `format-result.ts` | Format `CheckResult` into human-readable output |
| `snapshot.ts` | Ephemeral git worktree isolation (kept for potential future use but checker no longer calls it) |
| `schemas.ts` | Shared Zod schemas for Predicate and ProofCategory |
| `tools/dod-create.ts` | Build new DoD |
| `tools/dod-refine.ts` | Refine draft → concrete or subdivide |
| `tools/dod-add-node.ts` | Add nodes to tree |

### MCP tools

| Tool | Purpose |
|------|---------|
| `dod_create` | Build a new DoD with roots tree, validate OS tool availability |
| `dod_check` | Run all (or scoped) proofs, produce pass/fail/incomplete verdict |
| `dod_refine` | Turn draft leaf into concrete or subdivide into children |
| `dod_add_node` / `dod_remove_node` | Add/remove nodes |
| `dod_amend` | Modify a concrete proof with audit trail |
| `dod_status` | Read cached check result without re-running |
| `dod_list` | List all tracked DoDs |
| `dod_import` | Parse existing markdown DoD into canonical storage |
| `dod_tree` | Read-only structural dump of node tree |
| `dod_adversarial_gate` | Record adversarial gate verdict (GO/REVISE/STOP) for a DoD phase |

### Adding a new predicate type

1. Add type string to `Predicate.type` union in `types.ts`
2. Add case in `evaluate-proof.ts` → `evalPredicate()`
3. Add case in `evaluate-proof.ts` → `diagnoseFailure()`
4. Add rendering in `author.ts` → `renderLeaf()`
5. Update `PredicateSchema` in `schemas.ts`
6. Write tests

## Bundled Skills

| Skill | Purpose |
|-------|---------|
| `interview` | Structured requirements gathering → behavioral predicates |
| `ratchet` | Multi-step problem solving with verification gates |
| `clean-house` | Hunt down duplicate/obsolete implementations |
| `step-by-step` | Execute multi-step plans one atomic step at a time |
| `cheap-step` | Step-by-step with evomcp cheap-worker fanout |
| `adversarial-workflow` | 4-phase adversarial choreography (spec review → test audit → implementation review → structural gates) |
| `test-integrity-checker` | Audit tests for LLM-written patterns where tests bless production bugs instead of catching them |

## Lessons

- [LESSON] `mock.module` + ESM dynamic import: `mock.module("node:child_process", ...)` MUST run before the module under test is imported. Use dynamic `import()` in `before` hooks after `mock.module` registration. The `--experimental-test-module-mocks` flag is required on Node 22.
