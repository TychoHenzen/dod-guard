# Evo Implementation Plan

**Goal**: Evolve evomcp + gitevo from lightweight MCP tools into the full weak-model SDLC machinery described in Evo_target.md, guided by principles from Evo-goals.md and proven patterns from ClaudeSeeker/EvoStudio.

**Status**: Draft plan — updated 2026-07-20 with user decisions.

---

## User Decisions (2026-07-20)

| Question | Decision |
|----------|----------|
| Spec Graph scope | Full typed graph — all 7 node types + 6 edge types |
| Sandbox isolation | **Neither worktrees nor Docker.** Single working copy, commit to branch, checkout another branch, continue. Sequential execution model. |
| Language | TypeScript (monorepo standard) |
| Agent implementation | Open question — see §Agent Hosting below |
| Playbooks | **Outline ALL 7 playbooks** in full detail |
| Migration path | Build spec-graph as **standalone MCP server first**, integrate with dod-guard/evomcp/gitevo later |

---

## Gap Summary

| Dimension | Current (evomcp + gitevo) | Target (Evo_target.md) | EvoStudio has |
|-----------|--------------------------|------------------------|---------------|
| Oracle stack | Single `verify_cmd` (exit 0/N) or `fitness_cmd` (scalar) | Multi-layer: typecheck → lint → test → mutation → property → differential → trace → judge | Build → test → lint → verify gates |
| Feedback | Raw stdout/stderr truncated to 3K chars | Structured, localized diagnostics (<300 tokens, file:line, repro window) | Normalized stderr hashing for stuck detection |
| Context assembly | LLM reads files via tools | Deterministic curator, fact sheets, minimal pinned context | 7-layer prompt assembly + SHA-256 cache |
| Memory | No cross-lineage communication | Memory bus: failure signatures, elite solutions, decisions | SQLite pub-sub with 5 message types |
| Branch management | Manual spawn/abandon/adopt | Population management, tournament selection, crossover | BranchJuggler: spawn → evaluate → compare → adopt/abandon → checkpoint |
| Winner selection | Manual (`evo_adopt`) | Automated composite scoring + LLM comparison | LLM judge + composite score ranking |
| Convergence detection | None | Stagnation/oscillation detection | `1.0 - (stdev/mean)` similarity + patience counter |
| Spec traceability | None (DoD proofs are closest) | Spec Graph with typed nodes/edges, drift queries | N/A (not in EvoStudio) |
| Agent roles | Single agent does everything | 8 role-isolated agents with restricted toolsets | Strategy templates only |
| Playbooks | solve/evolve are hardcoded loops | Versioned skills with fixed procedures + hard gates | N/A (not in EvoStudio) |
| Sandbox | None (runs in current dir) | Single working copy, sequential branch checkout | N/A (worktree-per-thread planned) |
| Visualization | Text output only | 4 graph views: wiring, health, drift diff, blast radius | FastAPI dashboard + SSE streaming |
| Budget management | Token tracking only | Cost caps per task, graduated escalation ladder | Proxy cost tracking |

---

## Execution Model: Sequential, Single Working Copy

**Constraint**: No git worktrees, no Docker containers. One working directory. One branch checked out at a time. Sequential only.

**Implication**: Cannot run parallel candidates. The orchestrator must:

1. Checkout branch A → run candidate → commit → evaluate → record score
2. Checkout branch B → run candidate → commit → evaluate → record score
3. ... (N candidates sequentially)
4. Rank all candidates by composite score
5. Checkout winner branch → merge to root → tag adopted
6. Tag losers as dead → delete loser branches

This is slower but simpler. The "parallelism as speed" argument from Evo-goals.md is deferred. EvoStudio's `asyncio.Semaphore` pool is replaced with a simple `for` loop.

**Benefit**: No file conflicts, no stash/pop dance, no worktree cleanup. Each branch gets a clean checkout. `evo_spawn` already does `git checkout` — this just makes it the only mode.

---

## Agent Hosting: `claude -p` on DeepSeek via OAuth

**Question**: Is `claude -p` allowed on Anthropic OAuth when pointed at DeepSeek backend?

**Answer** 🟢 `[VERIFIED]`:
- `claude -p` pointed at the deepclaude proxy (`127.0.0.1:3200`) never contacts Anthropic's servers
- The proxy translates Anthropic-format requests → DeepSeek's `/anthropic` endpoint
- DeepSeek API key authenticates the actual LLM calls
- Anthropic OAuth is only relevant when `claude -p` connects to `api.anthropic.com` — but with the proxy, it connects to `127.0.0.1:3200` instead
- **Result**: `claude -p` + deepclaude proxy + DeepSeek API key works regardless of OAuth status. The OAuth restriction only gates Anthropic's own API.

**Verification**: evomcp already does this today — `agent.ts` spawns `claude -p` with `ANTHROPIC_BASE_URL=http://127.0.0.1:3200` and `DEEPSEEK_API_KEY`. If it were blocked by OAuth, the existing `solve`/`evolve` tools would fail. They work.

**Open design choice**: Should agents run as:
- **(A)** `claude -p` subprocesses spawned by evomcp (current pattern — evomcp controls lifecycle, tool restrictions via system prompt)
- **(B)** Claude Code custom agents (markdown files in `.claude/agents/`) invoked by the parent Claude session via the `Agent` tool, with restricted `subagent_type`

**Recommendation**: **(A) for evomcp-managed agents** (Implementer, Test Author, Test Hardener, Refactorer) — these need to run inside the evolutionary loop with tight feedback. **(B) for human-facing agents** (Spec Architect, Reviewer, Reconciler, Cartographer) — these interact with the human and the Spec Graph at decision points.

---

## Phase 1: Strengthen the Core (evomcp + gitevo integration)

**Principle**: Before building new MCP servers, make the existing two work together as a coherent evolutionary engine. EvoStudio's BranchJuggler is the reference.

### 1.1 Multi-layer evaluation gates in evomcp

Currently evomcp runs a single `verify_cmd`. EvoStudio runs build → test → lint → verify sequentially with short-circuit on first failure.

**Changes**:
- Extend `SolveSpec` and `EvolveSpec` to accept optional `build_cmd`, `test_cmd`, `lint_cmd`
- Implement `GateRunner` that runs gates in cheapest-first order, short-circuits on failure
- Each gate returns `{gate: string, passed: boolean, diagnostics: string, elapsed_ms: number}`
- Structured diagnostics: extract file:line from compiler/linter output, trim to relevant window

**Files**: `packages/evomcp/src/gates.ts` (new), `packages/evomcp/src/types.ts` (extend)

### 1.2 Evolve loop uses gitevo checkpoints

Currently evomcp's `evolve` uses raw `git checkout` + `git clean -fd` to reset between candidates. It should use gitevo's checkpoint/spawn/abandon/adopt lifecycle for full audit trail.

**Changes**:
- evomcp imports gitevo's operations module directly (shared monorepo — no need for MCP-over-MCP)
- Every generation creates an `evo-evolve-gen{N}` checkpoint
- Elite branches get `evo-adopted-{branch}` tags
- Failed branches get `evo-dead-{branch}` tags
- Full genealogy traceable via git tag history
- Sequential execution: checkout branch → run → commit → next branch

**Files**: `packages/evomcp/src/evolve.ts` (refactor), extract shared git ops to `packages/gitevo/src/operations.ts` (already exists)

### 1.3 Automated winner comparison (LLM judge)

Currently evomcp's `solve` returns first passing candidate, gitevo requires manual `evo_adopt`. EvoStudio spawns `claude -p` to compare all passing branches and pick the best one.

**Changes**:
- Implement `compareBranches()`: build prompt with branch scores + diffs, spawn `claude -p` to judge
- Judge scores on: correctness (0.4), clarity (0.2), efficiency (0.2), maintainability (0.2)
- Fallback to highest composite score if LLM judge fails
- Only runs when 2+ branches pass all gates

**Files**: `packages/evomcp/src/judge.ts` (new)

### 1.4 Convergence & stagnation detection

EvoStudio detects when branches converge (similar scores) or stagnate (no improvement for N generations).

**Changes**:
- `detectConvergence(scores[])`: `similarity = 1.0 - (stdev / mean)`, threshold 0.95
- `detectStagnation(history[])`: no improvement for patience=10 generations
- On convergence → stop spawning, adopt best
- On stagnation → escalate (change strategy, re-decompose, or abort)

**Files**: `packages/evomcp/src/convergence.ts` (new)

### 1.5 Failure memory bus (cross-lineage)

EvoStudio's SQLite pub-sub makes failure signatures and elite solutions visible across branches. evomcp currently isolates lineages completely.

**Changes**:
- Shared `.evo/memory.db` SQLite database
- Message types: `ELITE_SOLUTION`, `FAILURE_SIGNATURE`, `INSIGHT`, `PROGRESS`
- Before spawning, inject relevant failure signatures into context
- After elite found, record for future lineages
- evomcp reads gitevo's lessons and writes back

**Files**: `packages/gitevo/src/memory.ts` (new, or extend operations.ts), `packages/evomcp/src/agent.ts` (extend prompt assembly)

---

## Phase 2: Oracle Stack (Unified Verification)

**Principle**: "One interface for everything so the orchestrator composes oracles freely" (Evo_target.md §3). Every tool speaks: `run(artifact, suite) → {pass, score, structured_diagnostics}`.

### 2.1 Oracle interface definition

Shared TypeScript interface for all oracles:

```typescript
interface OracleResult {
  pass: boolean;
  score: number;           // 0.0–1.0 normalized
  diagnostics: Diagnostic[]; // file:line, severity, message, context_window
  elapsed_ms: number;
  oracle_type: string;
}

interface Diagnostic {
  file: string;
  line: number;
  severity: "error" | "warning" | "info";
  message: string;
  context: string;  // relevant code window (~20 lines)
}
```

### 2.2 Feedback compiler

Evo-goals.md: "median repair-feedback size should not exceed a few hundred tokens of relevant material." Currently evomcp truncates raw output to 3K chars.

**Changes**:
- Parse compiler/linter output into structured `Diagnostic[]`
- Group by file, deduplicate, sort by severity
- Trim context to 20-line windows around each finding
- Cap total feedback at 300 tokens of relevant material
- Fall back to raw truncation for unparseable output

**Files**: `packages/evomcp/src/feedback.ts` (new)

### 2.3 Mutation testing integration

Evo_target.md: "Mutation testing is how you verify the verifier." Evo-goals.md: "A weak model writing weak tests → mutation score as fitness."

**Changes**:
- Add mutation-test oracle to evomcp's gate runner
- `mutation_cmd` in SolveSpec/EvolveSpec (e.g., `npx stryker run --mutate`)
- Parse mutation score from output
- Gate: `mutation_score >= threshold` (default 0.8)
- For test-harden playbook: fitness = mutation kill rate

**Files**: `packages/evomcp/src/gates.ts` (extend)

### 2.4 Property-based testing & fuzzing integration

**Changes**:
- Add `property_cmd` / `fuzz_cmd` to oracle config
- Runs after mutation gate
- Parse pass/fail + edge case count

**Files**: `packages/evomcp/src/gates.ts` (extend)

### 2.5 Differential/equivalence testing for refactoring

Evo-goals.md: "Run old and new implementations against the same inputs and diff behavior. This gives refactoring a near-perfect oracle."

**Changes**:
- New oracle type: `differential`
- Takes `baseline_cmd` and `candidate_cmd`
- Both must produce identical output for given inputs
- Integrated into refactor playbook (Phase 5)

**Files**: New oracle type in evomcp — `packages/evomcp/src/oracles/differential.ts`

### 2.6 Held-out test split (Goodhart resistance)

Evo_target.md: "A held-out slice of acceptance tests is never shown to any generating agent."

**Changes**:
- `SolveSpec.held_out_tests`: glob pattern for tests to hide from implementer
- These tests are run only at the merge gate
- If held-out tests fail → candidate rejected even if visible tests pass
- Detects hardcoded-output cheating

**Files**: `packages/evomcp/src/solve.ts` (extend), `packages/evomcp/src/types.ts` (extend)

### 2.7 Degenerate solution detectors

Evo_target.md §7: "Degenerate-solution detectors run on every candidate: hardcoded test inputs, deleted assertions, broadened exception swallowing, `type: ignore` density."

**Changes**:
- Post-generation static analysis pass:
  - `detectHardcodedTestInputs()`: regex for test inputs matching expected outputs exactly
  - `detectDeletedAssertions()`: git diff → count `assert*` / `expect*` deletions
  - `detectBroadenedCatches()`: diff shows `except Exception` or `catch (e)` replacing specific types
  - `detectTypeIgnoreDensity()`: count `type: ignore` / `@ts-ignore` / `@ts-expect-error` per diff
- Any detector fires → candidate rejected with structured reason

**Files**: `packages/evomcp/src/degenerate.ts` (new)

---

## Phase 3: Context & Memory

**Principle**: "Weak models degrade faster with long context, so retrieval precision matters more." Every generation call gets a curated, minimal context.

### 3.1 Deterministic context curator

EvoStudio's 7-layer prompt assembly:
1. GOAL (natural language)
2. STRATEGY (simplest / robust / performant / modular / …)
3. TARGET FILES (content of files to modify)
4. DEPENDENCY GRAPH (imports, callers, callees)
5. CONSTRAINTS (lint rules, conventions, type annotations)
6. PRIOR ATTEMPTS (what was tried, why it failed)
7. FAILURE SIGNATURES (from memory bus — what to avoid)

**Changes**:
- Refactor evomcp's prompt assembly from ad-hoc template strings to structured curator
- Use code-review-graph for dependency graph (already available as MCP)
- Read target files deterministically (not via LLM tool calls — saves tokens)
- SHA-256 cache of assembled context (EvoStudio pattern)

**Files**: `packages/evomcp/src/context.ts` (new)

### 3.2 Fact sheet distiller

Evo_target.md: "Compresses relevant conventions and interfaces into a small pinned block."

**Changes**:
- `generateFactSheet(scope)`: reads conventions (CLAUDE.md, biome.json, tsconfig.json), extracts relevant interfaces from scope
- Output: ~200 tokens of pinned context
- Generated once per session, cached

**Files**: `packages/evomcp/src/context.ts` (extend)

### 3.3 gitevo memory bus (SQLite)

Replace `.evo/lessons.jsonl` with structured SQLite store matching EvoStudio's memory models.

**Changes**:
- `.evo/memory.db` with tables: `messages`, `checkpoints`, `branches`
- Message types: ELITE_SOLUTION, FAILURE_SIGNATURE, INSIGHT, PROGRESS, CONSTRAINT_VIOLATION
- `evo_learn` writes structured messages with type + scope + metadata
- `evo_lessons` queries by type, scope, recency
- Backward compat: migrate existing `.evo/lessons.jsonl` on first read
- Export to obsidian-rag unchanged

**Files**: `packages/gitevo/src/memory.ts` (new), `packages/gitevo/src/operations.ts` (extend)

---

## Phase 4: Spec Graph (New MCP Server)

**Principle**: "The spec is a typed, queryable graph that the whole system reads and writes" (Evo_target.md §1). This is the biggest new component.

**Decision**: Build as standalone MCP server first. Integrate with dod-guard/evomcp/gitevo in later phases.

### 4.1 spec-graph MCP server scaffold

New package: `packages/spec-graph/`

**Node types** (full typed graph):

| Node | Properties | Example |
|------|-----------|---------|
| `Intent` | title, description (prose), status | "Users can reset passwords via email" |
| `Criterion` | description (checkable assertion), status, locked | "Reset link expires after 30 min" |
| `Contract` | signature, preconditions[], postconditions[], language | `reset_token(user) -> Token`, post: `token.ttl == 1800` |
| `Invariant` | rule (always-true statement), scope | "No plaintext tokens in logs" |
| `Test` | file_path, test_name, hash (source SHA-256), status | `auth/tests/test_token.py::test_expiry` |
| `Symbol` | file_path, symbol_name, kind (function/class/module), hash, language | `auth/tokens.py::issue_reset` |
| `Decision` | title, rationale, constraints[], date | "Chose HMAC over JWT because…" |

**Edge types**:

| Edge | From → To | Meaning |
|------|-----------|---------|
| `refines` | Intent → Criterion | "Done" means this criterion is met |
| `binds` | Criterion → Contract | This interface satisfies the criterion |
| `verifies` | Test → Criterion / Contract / Invariant | This test checks this requirement |
| `implements` | Symbol → Contract | This code fulfills the contract |
| `depends_on` | Symbol → Symbol | Runtime/import dependency |
| `constrains` | Decision → any node type | Why this design choice was made |

### 4.2 Core tools (v1)

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `add_node` | type, properties | Create typed node, returns node_id |
| `link` | from_id, to_id, edge_type | Create edge between two nodes |
| `query` | query_type, filters | Run named graph query (see §4.5) |
| `drift_report` | (none) | Find all stale nodes + broken edges |
| `lock_node` | node_id | Lock node (only orchestrator or human can unlock) |
| `unlock_node` | node_id | Unlock (orchestrator/human only) |
| `diff_since` | checkpoint_tag | Graph delta since a git checkpoint |
| `snapshot` | checkpoint_tag | Record current graph state linked to git tag |
| `get_node` | node_id | Full node details + incoming/outgoing edges |
| `search_nodes` | query_string, types[] | Free-text search across node properties |
| `delete_node` | node_id | Remove node + all its edges (journaled) |
| `delete_edge` | edge_id | Remove single edge (journaled) |

### 4.3 Storage

- SQLite backend: `packages/spec-graph/src/store.ts`
  - Tables: `nodes` (id, type, properties JSON, hash, status, locked, created_at, updated_at)
  - `edges` (id, from_id, to_id, type, created_at)
  - `journal` (id, operation, node_id/edge_id, old_state JSON, new_state JSON, timestamp)
- Hash-based staleness: `Symbol` nodes store SHA-256 of source file. Cartographer refreshes. If hash changes and `implements` edge exists → edge marked stale.
- Journal is append-only. Every mutation records before/after state.
- Follows same SQLite patterns as code-review-graph (better-sqlite3, WAL mode).

### 4.4 Integration points (future phases)

- dod-guard: DoD proofs become Criteria + Test nodes in the Spec Graph
- gitevo: Checkpoints snapshot the graph state via `evo_checkpoint` → `spec-graph snapshot`
- evomcp: Oracle runs reference graph nodes for verification; Implementer reads Contracts
- code-review-graph: Symbol nodes seeded from code-review-graph's function/class nodes (Cartographer's job)

### 4.5 Drift detection queries (Evo_target.md §1)

| Defect | Query | Playbook action |
|--------|-------|----------------|
| Orphan code | Symbol with no incoming `implements` edge | Propose delete OR propose spec node (Contract) |
| Uncovered criterion | Criterion with no incoming `verifies` edge | Flag — needs test |
| Dead spec | Contract with no incoming `implements` edge | Flag — planned but never built |
| Untraced test | Test with no outgoing `verifies` edge | Propose `verifies` edge OR flag for deletion |
| Stale node | Symbol hash changed since edge created | Edge needs re-verification |
| Dangling dep | `depends_on` into a deleted Symbol | Broken wiring from partial edit |
| Unrefined intent | Intent with no outgoing `refines` edges | Needs Spec Architect decomposition |

---

## Phase 5: Playbooks (Full Detail)

**Principle**: Each playbook = fixed procedure + hard gates. The orchestrator loads the playbook, enforces the shape, the model supplies only local decisions.

### 5.1 Bugfix Playbook (P0 — cleanest oracle)

Evo-goals.md: "Requiring a reproduction test first is the single most effective guardrail for weak-model debugging."

```
PHASE 0: TRIAGE
  - Human states bug + expected behavior
  - Spec Architect creates/updates Criterion node (the violated expectation)
  - If Criterion already exists → link to bug, verify it's still correct
  - Gate: Criterion must be mechanically checkable

PHASE 1: REPRODUCTION (mandatory — NO code edits before this)
  - Test Author writes failing reproduction test
  - Test linked to Criterion via `verifies` edge
  - Test run → MUST fail (red-first check)
  - Gate: test fails, test is deterministic (10 runs, 0 flakes)
  - Test node locked

PHASE 2: FIX (search problem, not reasoning problem)
  - Orchestrator spawns k Implementer candidates (sequential branches)
  - Each candidate sees: Criterion + failing test + fact sheet + failure memory
  - Each candidate: edit code → run test → repair loop (max 3)
  - Verification gate: repro test flips green, NO other tests flip red
  - Held-out tests run at merge gate only (not shown to Implementer)

PHASE 3: HARDEN
  - Test Hardener runs mutation testing
  - If mutants survive → strengthen test or add new tests
  - Gate: mutation kill rate ≥ threshold (default 0.8)

PHASE 4: REVIEW
  - Reviewer sees diff + graph delta only
  - Checklist walk: does fix address root cause? edge cases covered? no regression?
  - Every finding cites file:line or graph defect

PHASE 5: MERGE
  - Winner adopted → branch merged → Cartographer refreshes graph
  - Reconciler runs drift report → fixes any defects while context is hot

HARD GATES:
  ✗ No code edits until repro test exists AND fails
  ✗ Cannot merge if any other test went red
  ✗ Cannot merge below mutation threshold
  ✗ Fix must link to Criterion via Spec Graph edge
```

### 5.2 Feature Playbook (P1)

```
PHASE 0: SPECIFICATION
  - Human states Intent (prose goal)
  - Spec Architect decomposes: Intent → Criteria → Contracts → Invariants
  - Spec-elicitation skill drives clarifying Q&A:
    examples → counterexamples → boundaries → invariants
  - Each answer becomes a graph node immediately
  - Human reviews rendered wiring view (Intent → Criteria → Contracts)
  - Gate: every Intent has ≥1 Criterion; every Criterion is mechanically checkable
  - All Criteria + Contracts locked

PHASE 1: TEST AUTHORING
  - Test Author writes tests from locked Criteria/Contracts ONLY (never sees implementation)
  - Each test linked to its Criterion/Contract via `verifies` edge
  - Oracle confirms: all tests fail (red-first — implementation doesn't exist yet)
  - Gate: all tests deterministic (10 runs), type-clean
  - Tests locked

PHASE 2: IMPLEMENTATION (evolutionary search)
  - Orchestrator spawns k Implementer candidates (sequential branches)
  - Each candidate: read Contracts + failing tests + fact sheet → implement → run oracle
  - Repair loop (max 3) with structured feedback
  - Composite scoring: tests passing (0.5) + mutation score (0.2) + llm judge (0.2) + simplicity (0.1)
  - Best candidate selected

PHASE 3: HARDEN
  - Test Hardener: mutation run → kill surviving mutants
  - Flakiness check: all tests run 10×
  - Gate: kill rate ≥ threshold, 0 new flakes

PHASE 4: REVIEW
  - Reviewer: graph delta + diff, checklist walk
  - Degenerate solution detectors run
  - Gate: no detectors fire, all checklist items pass

PHASE 5: MERGE
  - Winner adopted, Cartographer refreshes, Reconciler cleans drift

HARD GATES:
  ✗ No implementation before locked red tests
  ✗ No merge below mutation threshold
  ✗ Held-out tests must pass (never shown to Implementer)
  ✗ Degenerate solution detectors must be clean
```

### 5.3 Refactor Playbook (P1)

Evo-goals.md: "Refactoring is actually one of the safest tasks to hand a weak model, counterintuitively — because differential testing gives a near-perfect oracle."

```
PHASE 0: SCOPE
  - Human specifies scope: Symbol(s) to refactor + constraints (perf budget, complexity budget)
  - Cartographer maps blast radius: transitive closure of dependents
  - Scope locked in Spec Graph

PHASE 1: BEHAVIOR CORPUS
  - Trace tool records behavior of scoped symbols:
    inputs → outputs for existing test suite
  - Corpus stored as trace artifacts linked to Symbol nodes
  - Gate: corpus is non-empty, covers all public interfaces

PHASE 2: TRANSFORM
  - Refactorer agent transforms code within scope
  - Constraint: behavior_diff(old, new, corpus) MUST be empty
  - Complexity/perf budgets enforced
  - Repair on diff failure (max 2 attempts)

PHASE 3: VERIFY
  - Full test suite green
  - Complexity score ≤ before (or within budget)
  - Performance within budget
  - Gate: behavior_diff empty, suite green, budgets met

PHASE 4: MERGE
  - If behavior_diff empty → automatic merge (no human gate needed for pure refactors)
  - Cartographer refreshes symbol hashes + edges

HARD GATES:
  ✗ Any behavioral delta = automatic rollback (no repair attempts — refactor is safe BECAUSE it's reversible)
  ✗ Complexity/perf regression beyond budget
```

### 5.4 Test-Harden Playbook (P2)

```
PHASE 0: SCOPE
  - Input: existing test suite + source code
  - Cartographer maps which Criteria each test verifies
  - Gap analysis: uncovered Criteria, weakly-covered Contracts

PHASE 1: MUTATION RUN
  - Run mutation testing on scoped code
  - Per surviving mutant: is it equivalent (false positive) or does it reveal a test gap?

PHASE 2: KILL LOOP
  - For each non-equivalent surviving mutant:
    Test Hardener writes test that kills it
  - Each new test linked to relevant Criterion/Contract via `verifies` edge
  - Re-run mutation → confirm killed
  - Gate: mutation kill rate ≥ threshold

PHASE 3: FLAKINESS CHECK
  - All tests (existing + new) run 10×
  - Any flaky test → quarantined, reported as P0 toolkit bug
  - Gate: 0 new flakes

PHASE 4: ASSERTION QUALITY
  - Review existing tests for weak assertions (assertTrue, expect().toBeDefined(), etc.)
  - Strengthen: specific values, error messages, edge cases
  - Gate: assertion quality score maintained or improved

HARD GATES:
  ✗ Kill rate must improve or stay at threshold
  ✗ Zero new flakes
  ✗ No test may be deleted (only strengthened or added)
```

### 5.5 Reconcile Playbook (P2)

Evo_target.md: "Reconciler is your answer to 'weaker LLMs leave partial stuff.' It never reasons about why the mess exists; it pattern-matches defects to playbooks."

```
PHASE 0: DRIFT REPORT
  - Cartographer runs drift detection queries (see §4.5)
  - Output: list of defects with type, node IDs, context

PHASE 1: DEFECT DISPATCH
  - Per defect type, fixed playbook:

  | Defect | Playbook |
  |--------|----------|
  | Orphan code | If size < threshold: propose delete. If size ≥ threshold: propose create Contract node. Batch for human tie-break. |
  | Uncovered criterion | Flag → assign to Test Author in next cycle |
  | Dead spec | If old (stale > 30d): propose delete Contract. If recent: flag for implementation. |
  | Untraced test | Propose `verifies` edge (search Criteria for match). No match → flag test for deletion review. |
  | Stale node | Re-run verification for that edge. If passes → update hash. If fails → flag. |
  | Dangling dep | Trace git history for deleted Symbol. If moved → update edge. If truly deleted → remove edge. |

PHASE 2: BATCHED HUMAN TIE-BREAK
  - All "propose delete" actions grouped
  - All "propose create" actions grouped
  - Human approves/rejects in batch (not one at a time)
  - Gate: human sign-off on destructive actions

PHASE 3: EXECUTE
  - Reconciler applies approved changes to Spec Graph
  - Re-run drift report → confirm defects cleared
  - Gate: drift report shrinks; nothing green goes red

HARD GATES:
  ✗ May delete only orphans below size threshold; larger orphans become tickets
  ✗ Never delete a node with incoming edges without human approval
  ✗ Every destructive action is journaled
```

### 5.6 Review Playbook (P2)

```
PHASE 0: CONTEXT ASSEMBLY
  - Reviewer receives: diff + graph delta ONLY
  - NO access to Implementer's rationalizations or context
  - Checklist loaded from playbook (binary per-item)

PHASE 1: GRAPH DELTA REVIEW
  - New nodes: properly typed? linked correctly? no orphans?
  - New edges: correct type? correct direction?
  - Modified nodes: hash updated? stale edges flagged?
  - Deleted nodes: orphans created? dangling deps?

PHASE 2: DIFF REVIEW (checklist)
  - Correctness: does code match Contracts it `implements`?
  - Completeness: all Criteria have `verifies` edges?
  - Edge cases: null/empty/boundary handled?
  - Error handling: errors logged? messages actionable?
  - Observability: key paths have trace/log points?
  - Brevity: no dead code, no commented-out blocks, no unnecessary abstraction?
  - Degenerate patterns: hardcoded outputs? swallowed errors? type:ignore density?

PHASE 3: VERDICT
  - Every checklist item: PASS / FAIL with evidence (file:line or graph defect ID)
  - "Looks fine" is not a permitted verdict
  - Blocking findings → return to Implementer with findings in failure memory
  - Non-blocking → recorded as Decision nodes for future reference

HARD GATES:
  ✗ Every finding must cite evidence
  ✗ Reviewer context must be isolated from Implementer
  ✗ Checklist items are binary — no "mostly okay"
```

### 5.7 Spec-Elicitation Playbook (P2)

```
PHASE 0: INTENT CAPTURE
  - Human states goal in prose
  - Spec Architect creates Intent node
  - No decomposition yet — just capture

PHASE 1: QUESTION LADDER
  - Examples: "Give me 3 examples of correct behavior"
  - Counterexamples: "What should NOT happen?"
  - Boundaries: "What are the limits? Max/min values? Timeouts?"
  - Invariants: "What must always be true, no matter what?"
  - Each answer → immediate graph node (Criterion, Contract, or Invariant)

PHASE 2: COVERAGE CHECK
  - Spec Architect reviews: every Intent has ≥1 Criterion?
  - Every public interface has a Contract?
  - Cross-cutting concerns captured as Invariants?
  - Gate: completeness lints pass

PHASE 3: RENDER & LOCK
  - Viz renders wiring view: Intent → Criteria → Contracts
  - Human reviews (a graph with 6 criteria is reviewable in a minute)
  - Adjustments made → re-render
  - Human signs off → all nodes lock

HARD GATES:
  ✗ Session output must be graph nodes, never prose notes
  ✗ Every Criterion must be mechanically checkable (orchestrator validates)
  ✗ Human sign-off required before nodes lock (this is the one place to spend expensive judgment)
```

---

## Phase 6: Orchestrator & Escalation

### 6.1 Deterministic orchestrator state machine

Evo_target.md: "The orchestrator is code, not a model." Currently evomcp's solve/evolve loops are hardcoded in TypeScript. This is correct — keep it that way. Extend to enforce stage transitions across all playbooks.

**Changes**:
- `Orchestrator` class with stage enum: SPEC → TEST → IMPLEMENT → HARDEN → REVIEW → MERGE
- Each stage has `can_proceed()` gate (checks Spec Graph locks, test status, mutation score)
- `escalate(reason)`: resample → re-decompose → strong model → human
- Budget tracking per stage: token cost, wall time, attempt count
- Stuck detection: oscillation, repeated errors, edit distance collapse
- Playbook loader: loads playbook definition → enforces stage order → calls agents at each stage

**Files**: `packages/evomcp/src/orchestrator.ts` (new)

### 6.2 Escalation ladder

Evo-goals.md: "retry → resample → re-decompose → re-plan → stronger model → human"

**Implementation**:
- `EscalationLadder` class with rung definitions + trigger conditions + budgets
- Rung 1 (retry): same strategy, fresh attempt, max 3
- Rung 2 (resample): different strategy, max 5
- Rung 3 (re-decompose): split task into smaller subtasks, max 2
- Rung 4 (strong model): switch from DeepSeek to Sonnet/Opus, max 1
- Rung 5 (human): structured escalation report with all diagnostics

**Trigger conditions**:
- Stuck detection fires (same failure hash 2+ consecutive attempts)
- Oscillation detected (alternating between 2 states)
- Edit distance collapses to 0 across retries
- Budget exhausted at current rung

**Files**: `packages/evomcp/src/escalation.ts` (new)

### 6.3 Budget management

Evo-goals.md: "Budget caps per task with automatic escalation when exceeded."

**Implementation**:
- `BudgetTracker` class: token budget + wall-time budget per playbook stage
- Token tracking via deepclaude proxy cost endpoint (already in evomcp)
- Wall-time tracking via `performance.now()` / `Date.now()`
- Budget warnings at 50%/80%/95%
- Budget exceeded → auto-escalate to next rung
- Primary metric logged: cost per verified graph edge

**Files**: `packages/evomcp/src/budget.ts` (new)

---

## Phase 7: Agent Definitions

Each agent = system prompt + restricted MCP toolset + isolated context.

### 7.1 Agent hosting model

**evomcp-managed agents** (run inside evolutionary loop via `claude -p`):
- Implementer, Test Author, Test Hardener, Refactorer
- Spawned by evomcp's orchestrator with curated context
- Tool restrictions enforced via system prompt (not MCP-level yet — future)
- Tight feedback loop: run → verify → repair

**Human-facing agents** (Claude Code custom agents or skills):
- Spec Architect, Reviewer, Reconciler, Cartographer
- Invoked at decision points by the parent Claude session
- Interact with Spec Graph + human
- Can be Claude Code custom agents (`.claude/agents/*.md`) or skills

### 7.2 Agent specifications

| Agent | Hosting | Consumes | Produces | Success oracle | MCP access |
|-------|---------|----------|----------|----------------|------------|
| **Spec Architect** | Human-facing (skill) | Intent prose, fact sheets | Criterion, Contract, Invariant, Decision nodes | Human sign-off; completeness lints | spec-graph (rw), repo (r) |
| **Test Author** | evomcp-managed | Locked Criteria + Contracts (never implementation) | Tests + `verifies` edges | Tests fail before impl exists (red-first); deterministic (10 runs) | spec-graph (r), oracle, gitevo (checkpoint) |
| **Implementer** | evomcp-managed | Locked Contracts, failing tests, fact sheet, failure memory | Symbols + `implements` edges | Oracle stack green; held-out tests pass; no degenerate patterns | repo (r), oracle, gitevo (spawn/commit), memory |
| **Reviewer** | Human-facing (skill) | Diff + graph delta only (no implementer context) | Per-checklist verdicts, blocking findings | Every finding cites file:line or graph defect | repo (r), judge, spec-graph (r) |
| **Test Hardener** | evomcp-managed | Green suite + mutation report | Strengthened tests | Kill rate ≥ threshold; 0 new flakes | oracle, spec-graph (r) |
| **Refactorer** | evomcp-managed | Symbol scope + behavior corpus | Behavior-preserving diff | behavior_diff empty; suite green; budgets met | repo, oracle, gitevo (spawn/commit) |
| **Reconciler** | Human-facing (skill) | drift_report output | Per-defect fixes (link/delete/ticket/quarantine) | Drift report shrinks; nothing green goes red | spec-graph (rw), repo (r) |
| **Cartographer** | Human-facing (background) | Repo + graph on every merge | Refreshed indexes, dep edges, stale-marks, rendered views | Graph hash-consistent with repo HEAD | repo (r), spec-graph (rw), code-review-graph (r) |

---

## Phase 8: Trace & Visualization

### 8.1 Trace capabilities (integrated into oracle)

No separate MCP server. Trace is an oracle type + append-only storage.

**Tools** (added to evomcp's oracle):
- `record_trace(symbol, inputs, outputs)`: store execution trace
- `behavior_diff(old_symbol, new_symbol, corpus)`: run both against recorded inputs, diff outputs
- `coverage_gap(diff)`: which changed lines aren't exercised by tests?

**Storage**: `.evo/traces/` directory — JSON files keyed by Symbol hash. Append-only.

### 8.2 Viz MCP server

New package: `packages/viz/`.

**Four views** (Evo_target.md §3):
1. **Wiring**: Intent → Criteria → Contracts → Symbols with `depends_on` edges. Rendered as Mermaid or D3 force graph.
2. **Health overlay**: same graph, colored — green (verified, fresh), yellow (stale edge), red (defect). One glance shows where the weak model left a mess.
3. **Drift diff**: graph state at checkpoint A vs now — nodes/edges added, orphaned, broken. Code-review artifact for agent work.
4. **Blast radius**: given a proposed change to a Symbol or Contract, transitive closure of affected criteria and tests. Feeds test selection.

**Implementation**:
- Read-only over spec-graph + oracle history
- Renders SVG/HTML via MCP resources
- Static HTML generation (no server needed — MCP resources serve generated files)

---

## Dependency Graph (Revised)

```
Phase 1 (Core Integration) ───────────────────────────┐
  ├── 1.1 Multi-layer gates                            │
  ├── 1.2 gitevo integration (evolve uses checkpoints) │
  ├── 1.3 LLM judge                                    │
  ├── 1.4 Convergence detection                        │
  └── 1.5 Memory bus ──────────────────────────────────┤
                                                        │
Phase 2 (Oracle Stack) ────────────────────────────────┤
  ├── 2.1 Oracle interface                              │
  ├── 2.2 Feedback compiler                             │
  ├── 2.3 Mutation testing                              │
  ├── 2.4 Property testing                              │
  ├── 2.5 Differential testing                          │
  ├── 2.6 Held-out tests                                │
  └── 2.7 Degenerate detectors                          │
                                                        │
Phase 3 (Context & Memory) ────────────────────────────┤
  ├── 3.1 Context curator ← depends on 1.5 (memory)     │
  ├── 3.2 Fact sheet distiller                          │
  └── 3.3 gitevo memory bus ← extends 1.5               │
                                                        │
Phase 4 (Spec Graph) ← depends on 2.1 (oracle iface)    │
  Standalone MCP server. Zero dependencies on other      │
  packages. First integration target: Phase 6 playbooks. │
                                                        │
Phase 5 (Playbooks) ← depends on 4 (spec-graph)         │
  All 7 playbooks fully specified above.                 │
  Implementation = skills + orchestrator stages.         │
                                                        │
Phase 6 (Orchestrator) ← depends on 1, 2, 5             │
  State machine, escalation ladder, budget tracking.     │
                                                        │
Phase 7 (Agent Definitions) ← depends on 4, 5, 6        │
  Agent host specs + system prompts.                     │
                                                        │
Phase 8 (Trace & Viz) ← depends on 2.5, 4               │
  Trace integrated into oracle. Viz = new MCP server.    │
```

---

## Key Design Decisions (from EvoStudio lessons)

1. **LLMs should ONLY write code.** Everything else (git, file reading, comparison, scoring, lifecycle) is deterministic code. EvoStudio proves this works at scale.

2. **Deterministic orchestrator, not LLM-driven.** Stage transitions, budgets, and escalation live in TypeScript, not in prompts.

3. **Repair loops need stuck detection with normalization.** Hashing raw stderr is useless (line numbers change). Normalize then hash.

4. **Always checkpoint winners and tag losers.** Git tags create an indelible audit trail that survives even if databases are lost.

5. **Exploit/explore balance in branch strategies.** 70% exploit known-good strategies, 30% explore diversity. Prevents premature convergence.

6. **Fail gracefully per-branch.** Individual branch failures never crash the pipeline. Catch per-candidate, continue with remaining.

7. **Cost per verified graph edge is the primary metric.** Not tokens, not tasks "completed." Every artifact must land in the Spec Graph or it doesn't exist.

8. **Sequential execution is acceptable.** "We're not in a rush." Single working copy, checkout branches one at a time. Simpler, safer, no worktree cleanup.

---

## Success Metrics (from Evo-goals.md + Evo_target.md)

1. **Cost per verified graph edge** — not tokens, not "tasks completed"
2. **Repair success rate** — % of failed candidates repaired within 3 attempts
3. **Stuck detection precision** — % of detected stuck states that were genuine loops
4. **Goodhart resistance** — % of degenerate solutions caught before merge
5. **Feedback locality** — median repair-feedback size in tokens of relevant material
6. **Iteration latency** — wall time per candidate evaluation cycle
7. **Escalation rate** — % of tasks that reach strong-model or human rungs
