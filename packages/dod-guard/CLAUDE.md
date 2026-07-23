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

### Core principle

**Behavioral predicates only.** Every proof is a concrete, falsifiable claim about what the implementation should do. No mechanical quality metrics (line length, log count, assertion count) — those are noise that weak models game without fixing actual behavior.

### Predicate types (11 — 8 behavioral + 3 gate)

| Type | Behavior |
|------|----------|
| `exit_code` / `exit_code_not` | Pass/fail based on exit code |
| `output_contains` / `output_not_contains` | Substring match in combined stdout+stderr |
| `output_matches` / `output_not_matches` | Regex match |
| `tdd` | Test must fail first (RED), then pass (GREEN) |
| `manual` / `review` | Out-of-band human verification via MCP elicitation |
| `adversarial` | Checks DoD's `adversarial_gates[]` — gate for specified phase must be GO |
| `holdout` | Verifies holdout test fingerprint (SHA-256) hasn't changed |
| `convergence` | Checks convergence audit (Phase 4) reached GO |

### Proof categories (5)

`"behavioral"` | `"wiring"` | `"manual"` | `"other"` | `"test_audit"`

### Proof execution flow (checker.ts)

`checkDocument()` is the main entry point:
1. Flatten concrete leaves (skips drafts, recurses into groups)
2. For each leaf: `executeProof()` → runs command via `execFile()` with timeout (default 120s)
3. Manual/review proofs check cached fingerprint — skip until `dod_verify` is called
4. TDD proofs track `seen_failing` state across runs (must fail before passing)
5. `computeProofFingerprint()` hashes all concrete leaves → compared against stored hash for tamper detection
6. Any behavioral predicate fail → overall FAIL

### File responsibilities

| File | Role |
|------|------|
| `index.ts` | MCP server: tool registration, Zod schemas, import gate, amend gate, adversarial gate, manual elicitation |
| `types.ts` | All types: `TaskNode`, `DodDocument`, `Predicate`, `CheckResult`, `LeafResult`, `ProofCategory`, `ManualResult`, `AdversarialGate`, `AdversarialLensResult`, `AdversarialFinding` |
| `checker.ts` | Proof execution engine: VCS capture, leaf execution, predicate evaluation, tamper detection, amendment gate |
| `evaluate-proof.ts` | Single proof execution: command run, predicate eval, failure diagnosis |
| `fingerprint.ts` | Canonical fingerprint: `computeProofFingerprint()` (SHA-256 of command+type+value+options) |
| `author.ts` | Markdown rendering: `<claude_instructions>`, sections, proof tree, predicate metadata |
| `parser.ts` | Reverse: parse DoD markdown → `DodDocument` using `<!--p:JSON-->` metadata |
| `store.ts` | JSON file persistence in `~/.claude/dod-store/{uuid}.json` |
| `tree-utils.ts` | Tree utilities: ID-based path resolution, tree display, node counting, OS command validation |
| `manual.ts` | Human verification: fingerprint caching, `resolveManual()` with confirmer callback |
| `command-check.ts` | Validate proof commands: OS tool availability, glob expansion, placeholder detection |
| `format-result.ts` | Format `CheckResult` into human-readable output |
| `snapshot.ts` | Ephemeral git worktree isolation (kept for potential future use but checker no longer calls it) |
| `notify.ts` | Jingle (PowerShell beep arpeggio) for manual verification attention chime |
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
| `dod_verify` | MCP elicitation for manual/review proofs |
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
6. Update `predicate.type` enum in `index.ts` tool registrations
7. Write tests

## Bundled Skills

| Skill | Purpose |
|-------|---------|
| `interview` | Structured requirements gathering → behavioral predicates |
| `ratchet` | Multi-step problem solving with verification gates |
| `clean-house` | Hunt down duplicate/obsolete implementations |
| `step-by-step` | Execute multi-step plans one atomic step at a time |
| `cheap-step` | Step-by-step with evomcp cheap-worker fanout |
| `adversarial-workflow` | 4-phase adversarial choreography (spec review → test audit → implementation review → structural gates) |

## Lessons

- [LESSON] `mock.module` + ESM dynamic import: `mock.module("node:child_process", ...)` MUST run before the module under test is imported. Use dynamic `import()` in `before` hooks after `mock.module` registration. The `--experimental-test-module-mocks` flag is required on Node 22.
