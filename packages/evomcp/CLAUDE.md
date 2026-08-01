# CLAUDE.md — evomcp

## Build & Test

```bash
npx tsc                          # compile TypeScript to dist/
npx tsc --watch                  # dev mode
npx tsc && node --test "dist/*.test.js"  # run tests
npm run bundle                   # esbuild bundle for distribution
```

## Architecture

evomcp is an MCP server that orchestrates cost-differentiated solve/evolve operations. Instead of calling DeepSeek API directly and emulating tools, it spawns `claude -p` subprocesses pointed at the deepclaude proxy (127.0.0.1:3200).

### Why this works
DeepSeek has an `/anthropic` endpoint that speaks the Anthropic Messages API. By pointing `claude -p` at a proxy that translates Anthropic ↔ DeepSeek, DeepSeek gets full Claude Code tool access (files, shell, MCPs) without building our own agent loop.

### Tools

| Tool | Purpose |
|------|---------|
| `solve` | Best-of-N + repair chains for binary fitness (feature work) |
| `evolve` | Population-based evolution for scalar fitness (optimization) |
| `orchestrate` | Full playbook driver: SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE |
| `status` | Check if deepclaude proxy is running |

### Files

| File | Role |
|------|------|
| `index.ts` | MCP server entry: tool registration (solve, evolve, orchestrate, status), Zod schemas, result formatters, auto-dispatch routing |
| `types.ts` | All TypeScript types/interfaces (includes GateResult, Diagnostic, OracleResult, JudgeVerdict, OrchestrateSpec) |
| `agent.ts` | Spawn `claude -p` subprocesses (prompt via stdin), proxy health, API key resolution, SHA-256 failure hashing, signal computation, memory bus integration |
| `solve.ts` | Best-of-N solver entry: checkpoint gate, session setup, budget summary. The work is split across `solve-plan`, `solve-loop`, `solve-attempt`, `solve-worker`, `solve-verify`, `solve-repair`, `solve-screen`, `solve-ledger`, `solve-select`, `solve-report` and `solve-finish`. Attempts run one at a time, because they share one working directory. |
| `evolve.ts` | Evolutionary optimizer: budget+escalation gates → context assembly → parallel mutations per generation → fitness → degenerate gate → elites. Per-lineage token tracking. |
| `orchestrate.ts` | Full playbook driver: walks SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE via orchestrator state machine. Human gates for SPEC/TEST_AUTHOR/REVIEW. |
| `git-helpers.ts` | Shared git utilities: `commitOrNoop` (guarded add+commit), `getRootBranch` (dynamic master/main/trunk/develop detection) |
| `dedup.ts` | Plan deduplication with token-overlap heuristic (>65% → duplicate). Runs pre-fanout in solve. |
| `gates.ts` | Multi-phase gate pipeline: lint → build → test (optional held-out tests at merge gate) |
| `judge.ts` | Multi-candidate judge: correctness, clarity, efficiency, maintainability scoring |
| `convergence.ts` | Convergence detection: staleness, improvement threshold, early stopping |
| `gitevo-integration.ts` | Bridge to gitevo memory bus: write failures, elites, and insights for cross-session learning. Threads cwd through all gitevo operations. |
| `prompts.ts` | Prompt templates: strategy, repair, mutation, judge, feedback-action. Accepts CuratedContext for 7-layer context assembly. |
| `feedback.ts` | Structured diagnostic compiler: parses TS/ESLint/Biome/Python/Rust/Go/Jest output, attaches 20-line context windows, token-budget capping. Wired into repair loop. |
| `degenerate.ts` | Goodhart-resistance detectors: hardcoded test outputs, deleted assertions, broadened catches, type-ignore density, disabled lint, commented-out code, empty tests, TODO bombs. Wired into winner selection. |
| `context.ts` | Deterministic 7-layer context curator: GOAL→STRATEGY→TARGETS→DEPS→CONSTRAINTS→ATTEMPTS→FAILURES. SHA-256 cache. Fact sheet distiller. Wired into prompt assembly. |
| `escalation.ts` | 5-rung escalation ladder: continue → resample → re-decompose → stronger-model → human. Trigger signals + per-rung budgets. Wired into solve/evolve repair loops. |
| `budget.ts` | Per-stage token/time budgets. Warnings at 50/80/95/100%. Primary metric: cost per verified graph edge. Wired into solve/evolve + orchestrator. |
| `orchestrator.ts` | Deterministic stage state machine: SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE. Per-stage entry/exit gates. Playbook loader. Wired as top-level `orchestrate` tool. |

### Solve flow
1. Auto-dispatch. `strategy: "auto"` inspects verify_cmd for scalar fitness and routes to evolve. `"best-of-n"` routes to solve. `"evolve"` routes to evolve
2. Checkpoint first. A gitevo checkpoint that fails aborts the run before any attempt, with `failure_signature: "checkpoint_failed"`
3. Budget + escalation state initialized (budget_tokens honored)
4. Pre-fanout dedup: strategy descriptions deduplicated via token-overlap heuristic
5. Context assembly: CuratedContext per strategy, with the layers built once per spec
6. Attempts run **one at a time**. All attempts share one working directory, so two of them cannot each hold it checked out to their own branch
7. Each attempt: spawn a gitevo branch, check it out, spawnClaude (prompt via stdin), commitOrNoop, capture the diff against the root branch, verify. The token spend is measured exactly once per attempt, including attempts that timed out or produced nothing
8. Verification runs GateRunner (lint, then build, then test, then verify) when any gate command is set, otherwise verify_cmd alone
9. A failed candidate gets structured feedback via compileFeedback, then a repair loop driven by the escalation ladder. The budget stops retries, not first attempts
10. Stuck/oscillating detection via SHA-256 per-lineage signature history
11. Refusal filters after a pass: the degenerate gate, then the allowed_files check. Every refusal is reported
12. Every non-surviving attempt is checked out and abandoned, so the branch is reverted and the reason reaches the gitevo memory bus
13. One survivor is adopted directly. Several go through the judge, which scores on correctness, clarity, efficiency and maintainability
14. All attempts fail, so the run returns an escalation report with per-lineage diagnostics and degenerate rejections

### Evolve flow
1. Auto-dispatch: strategy: "auto" inspects verify_cmd for scalar fitness → routes here; "evolve" → here directly
2. Budget + escalation state initialized (budget_tokens honored)
3. Optional gates (lint_cmd → build_cmd → test_cmd) before baseline measurement
4. Measure baseline fitness via `fitness_cmd`
5. Context assembly: CuratedContext with goal + target files + constraints
6. Read target files (glob patterns, filtered by allowed_files)
7. Each generation: spawn population_size mutations (parallel, cap 4), measure fitness, degenerate gate, select elites
8. Apply best patch between generations (cumulative improvement)
9. Budget warnings at 50/80/95/100%; generation loop breaks on budget exhaustion
10. Optional mutation_cmd for mutation testing (HARDEN stage in orchestrator)
11. Convergence detection: early stop on staleness or below improvement threshold
12. Final verification with best patch applied + budget summary

### Important: evolution accumulation
Between generations, the best patch found so far is applied so mutations build on the best current state, not the baseline. Without this, each generation starts from scratch.

### Dedup strategy
Token overlap >65% → duplicate. Uses stopword filtering, Jaccard-like comparison. No embeddings needed — cheap and good enough for plan diversity enforcement.

### Prompt engineering (all in prompts.ts)
- 8 diverse strategy templates for solve: simplest, robust, performant, modular, defensive, functional, pragmatic, elegant
- Repair prompts include failure output (truncated to 3K chars)
- Mutation prompts include top 3 elites as examples
- Judge prompts use 4-dimension weighted rubric (correctness 0.4, clarity 0.2, efficiency 0.2, maintainability 0.2)
- Feedback-action prompts present structured diagnostics with severity-ordered fix instructions

## Bundled Skills

| Skill | File | Purpose |
|-------|------|---------|
| `cascade` | `skills/cascade/SKILL.md` | Cheap worker fanout with verified selection, escalating stuck sub-problems up a 4-rung ladder (worker repair → worker resample → host model → user). Worker-agnostic — backend model is deployment config, not skill concern. Ships 3 agents: spec-writer (spec + ambiguity check), patch-reviewer (degenerate detection + U2 flagging), escalation-handler (authority/capability classification + U3–U5 routing). |

**Plugin agents**: agents ship from the plugin-root `agents/` directory (`agents/spec-writer.md`, `agents/patch-reviewer.md`, `agents/escalation-handler.md`) — NOT nested inside the skill. Claude Code only discovers plugin agents from `<plugin-root>/agents/*.md`, and each file MUST have YAML frontmatter (`name`, `description`) or it won't register. They are referenced by bare name (`spec-writer`, `patch-reviewer`, `escalation-handler`) — the plugin namespace is auto-prefixed at install time. Each agent runs at a specific tier: spec-writer and escalation-handler at `host`, patch-reviewer at `host-light`. See each agent's `.md` for its prompt, tier, and U-point integration.

**Escalation ladder** (skill-level, not code-level):
- Rung 0: Worker repair loop (inside evomcp)
- Rung 1: Worker resample (inside evomcp)
- Rung 2: Host model (this session — solve only the stuck node)
- Rung 3: User (AskUserQuestion — authority gaps, budget gates, hard stops)

**U-points**: The skill defines 6 user decision points (U1–U6) with mandatory AskUserQuestion triggers. Agents reference these by number. See SKILL.md §User Decision Points for the full protocol.

**When editing skills**: Skills are the canonical source — changes here ship to all plugin users. Skill behavior changes should be tested by invoking the skill against this repo's own test suite.
