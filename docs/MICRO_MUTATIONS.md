# Micro-Mutation Report

**Generated**: 2026-07-12 | **Commit**: `90beeef`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 2291 |
| Killed | 869 |
| Missed | 846 |
| Timeout | 10 |
| No coverage | 566 |
| Catch rate | 37.9% |
| Runs | 27 |
| Files tested | 27 |

**Last run**: 2026-07-12 — `packages/evomcp/src/index.ts` → error

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 106% | packages/obsidian-rag/src/store.ts | 327 | 9 | 90d | 🟡 | — | — | ⬜ |
| 101% | packages/dod-guard/src/observability.ts | 657 | 5 | 90d | 🟡 | — | — | ⬜ |
| 99% | packages/gitevo/src/operations.ts | 457 | 5 | 90d | 🟡 | — | — | ⬜ |
| 99% | packages/evomcp/src/evolve.ts | 271 | 6 | 90d | 🟡 | — | — | ⬜ |
| 99% | packages/evomcp/src/agent.ts | 416 | 5 | 90d | 🟡 | — | — | ⬜ |
| 95% | packages/dod-guard/src/parser.ts | 294 | 4 | 90d | 🟡 | — | — | ⬜ |
| 95% | packages/dod-guard/src/find-functions.ts | 474 | 3 | 90d | 🟡 | — | — | ⬜ |
| 95% | packages/dod-guard/src/tree-utils.ts | 162 | 5 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/evomcp/src/dedup.ts | 170 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/dod-guard/src/tools/dod-create.ts | 86 | 3 | 90d | 🟡 | — | — | ⬜ |
| 87% | packages/dod-guard/src/format-result.ts | 101 | 2 | 90d | 🟡 | — | — | ⬜ |
| 61% | packages/dod-guard/src/index.ts | 780 | 16 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 55% | packages/obsidian-rag/src/vault.ts | 172 | 10 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 55% | packages/evomcp/src/index.ts | 270 | 9 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 55% | packages/obsidian-rag/src/index.ts | 161 | 15 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 55% | packages/dod-guard/src/evaluate-proof.ts | 654 | 7 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 53% | packages/obsidian-rag/src/tools.ts | 484 | 7 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 51% | packages/gitevo/src/index.ts | 178 | 8 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 51% | packages/dod-guard/src/checker.ts | 441 | 6 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 50% | packages/dod-guard/src/test-metrics.ts | 971 | 4 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 49% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 46% | packages/evomcp/src/solve.ts | 193 | 5 | 0d | 🟡 | 2026-07-12 | 0/177 killed | ⚠️ |
| 45% | packages/dod-guard/src/store.ts | 181 | 5 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 45% | packages/dod-guard/src/author.ts | 279 | 4 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 45% | packages/dod-guard/src/command-check.ts | 241 | 4 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 45% | packages/dod-guard/src/brevity.ts | 399 | 3 | 0d | 🟡 | 2026-07-12 | 147/366 killed | ⚠️ |
| 44% | packages/obsidian-rag/src/indexer.ts | 141 | 5 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 43% | packages/dod-guard/src/baseline.ts | 179 | 4 | 0d | 🟡 | 2026-07-12 | 68/126 killed | ⚠️ |
| 43% | packages/dod-guard/src/assertions.ts | 173 | 4 | 0d | 🟡 | 2026-07-12 | 89/319 killed | ⚠️ |
| 42% | packages/obsidian-rag/src/retriever.ts | 134 | 4 | 0d | 🟡 | 2026-07-12 | 0/112 killed | ⚠️ |
| 36% | packages/dod-guard/src/manual.ts | 72 | 2 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 36% | packages/dod-guard/src/tools/dod-refine.ts | 117 | 1 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 35% | packages/dod-guard/src/tools/dod-add-node.ts | 90 | 1 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 33% | packages/dod-guard/src/notify.ts | 36 | 2 | 0d | 🟡 | 2026-07-12 | 0/0 killed | ❌ |
| 30% | packages/dod-guard/src/regression.ts | 25 | 1 | 0d | 🟡 | 2026-07-12 | 21/25 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-07-12 | `90beeef` | packages/evomcp/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/evaluate-proof.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/manual.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/test-metrics.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/obsidian-rag/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/obsidian-rag/src/vault.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/command-check.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/tools/dod-refine.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/gitevo/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/tools/dod-add-node.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/obsidian-rag/src/tools.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/store.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/notify.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/dod-guard/src/author.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/obsidian-rag/src/cli.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `90beeef` | packages/obsidian-rag/src/indexer.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `031bcb5` | packages/dod-guard/src/assertions.ts | 319 | 89 | 215 | ok |
| 2026-07-12 | `031bcb5` | packages/dod-guard/src/baseline.ts | 126 | 68 | 58 | ok |
| 2026-07-12 | `031bcb5` | packages/dod-guard/src/command-check.ts | 300 | 147 | 123 | ok |
| 2026-07-12 | `031bcb5` | packages/obsidian-rag/src/retriever.ts | 112 | 0 | 0 | ok |
| 2026-07-12 | `031bcb5` | packages/dod-guard/src/brevity.ts | 366 | 147 | 149 | ok |
| 2026-07-12 | `d6b6b1c` | packages/gitevo/src/index.ts | 126 | 7 | 61 | ok |
| 2026-07-12 | `d6b6b1c` | packages/evomcp/src/solve.ts | 177 | 0 | 0 | ok |
| 2026-07-12 | `d6b6b1c` | packages/dod-guard/src/regression.ts | 25 | 21 | 4 | ok |
| 2026-07-12 | `d2bf00c` | packages/dod-guard/src/evaluate-proof.ts | 740 | 390 | 236 | ok |

## Exclusions

- `*.test.ts`
- `types.ts`
- `constants.ts`
- `schemas.ts`
— plus `skills/`, `standards/`, `dist/`, `node_modules/` directories

<!-- Generated by scripts/micro-mutations.mjs -->