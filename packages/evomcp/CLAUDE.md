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
| `types.ts` | All TypeScript types/interfaces |
| `agent.ts` | Spawn `claude -p` subprocesses, proxy health, prompt templates |
| `solve.ts` | Best-of-N solver: fanout → verify → repair → escalate |
| `evolve.ts` | Evolutionary optimizer: baseline → generations → elites → final |
| `dedup.ts` | Plan deduplication with token-overlap heuristic |

### Solve flow
1. Spawn N parallel `claude -p` instances, each with different strategy prompt
2. Verify each result against `verify_cmd`
3. Failed candidates get up to 3 repair iterations with failure feedback
4. Stuck detection: same failure after repair → kill lineage
5. Returns first passing patch + verification report
6. All lineages fail → escalation report for parent Claude

### Evolve flow
1. Measure baseline fitness via `fitness_cmd`
2. Read target files (glob patterns)
3. Each generation: spawn population_size mutations, measure fitness, select elites
4. Apply best patch between generations (cumulative improvement)
5. Final verification with best patch applied

### Important: evolution accumulation
Between generations, the best patch found so far is applied so mutations build on the best current state, not the baseline. Without this, each generation starts from scratch.

### Dedup strategy
Token overlap >65% → duplicate. Uses stopword filtering, Jaccard-like comparison. No embeddings needed — cheap and good enough for plan diversity enforcement.

### Prompt engineering
- 8 diverse strategy templates for solve: simplest, robust, performant, modular, defensive, functional, pragmatic, elegant
- Repair prompts include failure output (truncated to 3K chars)
- Mutation prompts include top 3 elites as examples
