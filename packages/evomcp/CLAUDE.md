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
| `status` | Check if deepclaude proxy is running |

### Files

| File | Role |
|------|------|
| `index.ts` | MCP server entry: tool registration, Zod schemas, formatting |
| `types.ts` | All TypeScript types/interfaces (includes GateResult, Diagnostic, OracleResult, JudgeVerdict) |
| `agent.ts` | Spawn `claude -p` subprocesses, proxy health, API key resolution, memory bus integration |
| `solve.ts` | Best-of-N solver: fanout → gates → verify → repair → escalate → judge |
| `evolve.ts` | Evolutionary optimizer: baseline → generations → elites → final. Build/test/lint/mutation gates. |
| `dedup.ts` | Plan deduplication with token-overlap heuristic |
| `gates.ts` | Multi-phase gate pipeline: lint → build → test (optional held-out tests at merge gate) |
| `judge.ts` | Multi-candidate judge: correctness, clarity, efficiency, maintainability scoring |
| `convergence.ts` | Convergence detection: staleness, improvement threshold, early stopping |
| `gitevo-integration.ts` | Bridge to gitevo memory bus: write failures, elites, and insights for cross-session learning |
| `prompts.ts` | Prompt templates: strategy, repair, mutation, judge, feedback-action (extracted from agent.ts) |
| `feedback.ts` | Structured diagnostic compiler: parses TS/ESLint/Biome/Python/Rust/Go/Jest output, attaches 20-line context windows, token-budget capping |
| `degenerate.ts` | Goodhart-resistance detectors: hardcoded test outputs, deleted assertions, broadened catches, type-ignore density, disabled lint, commented-out code, empty tests, TODO bombs |
| `context.ts` | Deterministic 7-layer context curator: GOAL→STRATEGY→TARGETS→DEPS→CONSTRAINTS→ATTEMPTS→FAILURES. SHA-256 cache. Fact sheet distiller. |
| `escalation.ts` | 5-rung escalation ladder: retry → resample → re-decompose → stronger-model → human. Trigger signals + per-rung budgets. |
| `budget.ts` | Per-stage token/time budgets. Warnings at 50/80/95/100%. Primary metric: cost per verified graph edge. |
| `orchestrator.ts` | Deterministic stage state machine: SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE. Per-stage entry/exit gates. Playbook loader. |

### Solve flow
1. Optional gates (lint_cmd → build_cmd → test_cmd) — fail fast before fanout
2. Spawn N parallel `claude -p` instances, each with different strategy prompt
3. Detect silent failures: no-output (proxy/API issue) and timed-out lineages → skip to diagnostics
4. Verify each result against `verify_cmd`
5. Failed candidates get up to 3 repair iterations with failure feedback
6. Stuck detection: same failure after repair → kill lineage, mark in diagnostics
7. Multi-candidate judge scores winners on correctness, clarity, efficiency, maintainability
8. Returns first passing patch + verification report + judge verdict
9. All lineages fail → escalation report with per-lineage diagnostics (strategy, exit codes, output samples, repair counts, failure status)

### Evolve flow
1. Optional gates (lint_cmd → build_cmd → test_cmd) before baseline measurement
2. Measure baseline fitness via `fitness_cmd`
3. Read target files (glob patterns)
4. Each generation: spawn population_size mutations, measure fitness, select elites
5. Apply best patch between generations (cumulative improvement)
6. Optional mutation_cmd for mutation testing (Phase 2)
7. Convergence detection: early stop on staleness or below improvement threshold
8. Final verification with best patch applied

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

**Skill agents**: `cascade` ships its own agents in `skills/cascade/agents/`. These are referenced by bare name (`spec-writer`, `patch-reviewer`, `escalation-handler`) — the plugin namespace is auto-prefixed at install time. Each agent runs at a specific tier: spec-writer and escalation-handler at `host`, patch-reviewer at `host-light`. See each agent's `.md` for its prompt, tier, and U-point integration.

**Escalation ladder** (skill-level, not code-level):
- Rung 0: Worker repair loop (inside evomcp)
- Rung 1: Worker resample (inside evomcp)
- Rung 2: Host model (this session — solve only the stuck node)
- Rung 3: User (AskUserQuestion — authority gaps, budget gates, hard stops)

**U-points**: The skill defines 6 user decision points (U1–U6) with mandatory AskUserQuestion triggers. Agents reference these by number. See SKILL.md §User Decision Points for the full protocol.

**When editing skills**: Skills are the canonical source — changes here ship to all plugin users. Skill behavior changes should be tested by invoking the skill against this repo's own test suite.
