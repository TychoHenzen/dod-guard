# Micro-Mutation Report

**Generated**: 2026-07-20 | **Commit**: `c526372`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 14397 |
| Killed | 4849 |
| Missed | 5380 |
| Timeout | 65 |
| No coverage | 4103 |
| Catch rate | 33.7% |
| Runs | 86 |
| Files tested | 86 |

**Last run**: 2026-07-20 — `packages/obsidian-rag/src/vault.ts` → error

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 62% | packages/dod-guard/src/index.ts | 956 | 22 | 0d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 60% | packages/gitevo/src/index.ts | 183 | 10 | 8d | 🟡 | 2026-07-12 | 26/124 killed | ⚠️ |
| 60% | packages/obsidian-rag/src/index.ts | 180 | 16 | 8d | 🟡 | 2026-07-12 | 0/162 killed | ⚠️ |
| 60% | packages/gitevo/src/operations.ts | 602 | 9 | 3d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 60% | packages/obsidian-rag/src/tools.ts | 487 | 8 | 8d | 🟡 | 2026-07-12 | 0/540 killed | ⚠️ |
| 60% | packages/evomcp/src/evolve.ts | 290 | 9 | 8d | 🟡 | 2026-07-12 | 94/244 killed | ⚠️ |
| 60% | packages/dod-guard/src/evaluate-proof.ts | 656 | 9 | 2d | 🟡 | 2026-07-18 | 0/0 killed | ❌ |
| 60% | packages/evomcp/src/solve.ts | 274 | 9 | 8d | 🟡 | 2026-07-12 | 48/177 killed | ⚠️ |
| 59% | packages/evomcp/src/index.ts | 296 | 13 | 3d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 59% | packages/dod-guard/src/checker.ts | 446 | 11 | 0d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 59% | packages/dod-guard/src/command-check.ts | 396 | 8 | 8d | 🟡 | 2026-07-12 | 146/300 killed | ⚠️ |
| 59% | packages/dod-guard/src/observability.ts | 656 | 7 | 8d | 🟡 | 2026-07-12 | 417/951 killed | ⚠️ |
| 59% | packages/dod-guard/src/tree-utils.ts | 350 | 10 | 1d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 59% | packages/obsidian-rag/src/store.ts | 344 | 11 | 1d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 56% | packages/dod-guard/src/author.ts | 286 | 7 | 8d | 🟡 | 2026-07-12 | 113/383 killed | ⚠️ |
| 56% | packages/evomcp/src/agent.ts | 458 | 6 | 8d | 🟡 | 2026-07-12 | 135/335 killed | ⚠️ |
| 56% | packages/obsidian-rag/src/vault.ts | 185 | 12 | 0d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 52% | packages/dod-guard/src/baseline.ts | 207 | 6 | 8d | 🟡 | 2026-07-12 | 68/126 killed | ⚠️ |
| 52% | packages/dod-guard/src/assertions.ts | 172 | 6 | 8d | 🟡 | 2026-07-12 | 89/319 killed | ⚠️ |
| 51% | packages/dod-guard/src/tools/dod-refine.ts | 160 | 6 | 8d | 🟡 | 2026-07-12 | 0/143 killed | ⚠️ |
| 51% | packages/obsidian-rag/src/indexer.ts | 157 | 6 | 8d | 🟡 | 2026-07-12 | 58/121 killed | ⚠️ |
| 47% | packages/dod-guard/src/tools/dod-create.ts | 93 | 5 | 8d | 🟡 | 2026-07-12 | 0/47 killed | ⚠️ |
| 44% | packages/dod-guard/src/tools/dod-add-node.ts | 111 | 3 | 8d | 🟡 | 2026-07-12 | 0/124 killed | ⚠️ |
| 44% | packages/dod-guard/src/format-result.ts | 108 | 3 | 8d | 🟡 | 2026-07-12 | 145/191 killed | ⚠️ |
| 40% | packages/dod-guard/src/test-metrics.ts | 971 | 4 | 8d | — | 2026-07-12 | 298/1999 killed | ⚠️ |
| 38% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 8d | — | 2026-07-12 | 53/132 killed | ⚠️ |
| 35% | packages/dod-guard/src/store.ts | 181 | 5 | 8d | — | 2026-07-12 | 83/152 killed | ⚠️ |
| 35% | packages/dod-guard/src/parser.ts | 294 | 4 | 8d | — | 2026-07-12 | 358/556 killed | ⚠️ |
| 35% | packages/dod-guard/src/find-functions.ts | 474 | 3 | 8d | — | 2026-07-12 | 412/830 killed | ⚠️ |
| 34% | packages/dod-guard/src/brevity.ts | 399 | 3 | 8d | — | 2026-07-12 | 153/366 killed | ⚠️ |
| 32% | packages/obsidian-rag/src/retriever.ts | 134 | 4 | 8d | — | 2026-07-12 | 0/112 killed | ⚠️ |
| 29% | packages/evomcp/src/dedup.ts | 170 | 2 | 8d | — | 2026-07-12 | 77/167 killed | ⚠️ |
| 25% | packages/dod-guard/src/manual.ts | 72 | 2 | 8d | — | 2026-07-12 | 28/44 killed | ⚠️ |
| 23% | packages/dod-guard/src/notify.ts | 36 | 2 | 8d | — | 2026-07-12 | 0/29 killed | ⚠️ |
| 19% | packages/dod-guard/src/regression.ts | 25 | 1 | 8d | — | 2026-07-12 | 21/25 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-07-20 | `c526372` | packages/obsidian-rag/src/vault.ts | 0 | 0 | 0 | error |
| 2026-07-20 | `c526372` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-20 | `c526372` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-19 | `30dfdd6` | packages/obsidian-rag/src/store.ts | 0 | 0 | 0 | error |
| 2026-07-19 | `30dfdd6` | packages/dod-guard/src/tree-utils.ts | 0 | 0 | 0 | error |
| 2026-07-19 | `30dfdd6` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-18 | `6492b54` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-18 | `6492b54` | packages/dod-guard/src/evaluate-proof.ts | 0 | 0 | 0 | error |
| 2026-07-18 | `6492b54` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-17 | `f1343d0` | packages/gitevo/src/operations.ts | 0 | 0 | 0 | error |
| 2026-07-17 | `f1343d0` | packages/evomcp/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-17 | `f1343d0` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-16 | `9eab038` | packages/obsidian-rag/src/store.ts | 0 | 0 | 0 | error |
| 2026-07-16 | `9eab038` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-16 | `9eab038` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-15 | `e2ad0b3` | packages/dod-guard/src/evaluate-proof.ts | 0 | 0 | 0 | error |
| 2026-07-15 | `e2ad0b3` | packages/dod-guard/src/tree-utils.ts | 0 | 0 | 0 | error |
| 2026-07-15 | `e2ad0b3` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-14 | `989799c` | packages/gitevo/src/operations.ts | 0 | 0 | 0 | error |
| 2026-07-14 | `989799c` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-14 | `989799c` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-13 | `ef271d3` | packages/obsidian-rag/src/store.ts | 0 | 0 | 0 | error |
| 2026-07-13 | `ef271d3` | packages/dod-guard/src/evaluate-proof.ts | 0 | 0 | 0 | error |
| 2026-07-13 | `ef271d3` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/regression.ts | 25 | 21 | 4 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/notify.ts | 29 | 0 | 8 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/tools/dod-add-node.ts | 124 | 0 | 0 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/tools/dod-refine.ts | 143 | 0 | 0 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/manual.ts | 44 | 28 | 12 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/retriever.ts | 112 | 0 | 0 | ok |

## Survivor Reports

Per-file survivor JSON with mutator type, line number, and replacement.
Use these to identify weak tests and add targeted assertions.

| File | Survivors | Source |
|------|-----------|--------|
| [agent.json](.data/micro-mutations/survivors/agent.json) | 130 | packages/evomcp/src/agent.ts |
| [assertions.json](.data/micro-mutations/survivors/assertions.json) | 215 | packages/dod-guard/src/assertions.ts |
| [author.json](.data/micro-mutations/survivors/author.json) | 196 | packages/dod-guard/src/author.ts |
| [baseline.json](.data/micro-mutations/survivors/baseline.json) | 58 | packages/dod-guard/src/baseline.ts |
| [brevity.json](.data/micro-mutations/survivors/brevity.json) | 143 | packages/dod-guard/src/brevity.ts |
| [checker.json](.data/micro-mutations/survivors/checker.json) | 214 | packages/dod-guard/src/checker.ts |
| [cli.json](.data/micro-mutations/survivors/cli.json) | 64 | packages/obsidian-rag/src/cli.ts |
| [command-check.json](.data/micro-mutations/survivors/command-check.json) | 122 | packages/dod-guard/src/command-check.ts |
| [dedup.json](.data/micro-mutations/survivors/dedup.json) | 87 | packages/evomcp/src/dedup.ts |
| [evaluate-proof.json](.data/micro-mutations/survivors/evaluate-proof.json) | 236 | packages/dod-guard/src/evaluate-proof.ts |
| [evolve.json](.data/micro-mutations/survivors/evolve.json) | 118 | packages/evomcp/src/evolve.ts |
| [find-functions.json](.data/micro-mutations/survivors/find-functions.json) | 391 | packages/dod-guard/src/find-functions.ts |
| [format-result.json](.data/micro-mutations/survivors/format-result.json) | 44 | packages/dod-guard/src/format-result.ts |
| [index.json](.data/micro-mutations/survivors/index.json) | 42 | packages/gitevo/src/index.ts |
| [indexer.json](.data/micro-mutations/survivors/indexer.json) | 60 | packages/obsidian-rag/src/indexer.ts |
| [manual.json](.data/micro-mutations/survivors/manual.json) | 12 | packages/dod-guard/src/manual.ts |
| [notify.json](.data/micro-mutations/survivors/notify.json) | 8 | packages/dod-guard/src/notify.ts |
| [observability.json](.data/micro-mutations/survivors/observability.json) | 453 | packages/dod-guard/src/observability.ts |
| [operations.json](.data/micro-mutations/survivors/operations.json) | 185 | packages/gitevo/src/operations.ts |
| [parser.json](.data/micro-mutations/survivors/parser.json) | 179 | packages/dod-guard/src/parser.ts |
| [regression.json](.data/micro-mutations/survivors/regression.json) | 4 | packages/dod-guard/src/regression.ts |
| [solve.json](.data/micro-mutations/survivors/solve.json) | 98 | packages/evomcp/src/solve.ts |
| [store.json](.data/micro-mutations/survivors/store.json) | 59 | packages/dod-guard/src/store.ts |
| [test-metrics.json](.data/micro-mutations/survivors/test-metrics.json) | 1323 | packages/dod-guard/src/test-metrics.ts |
| [vault.json](.data/micro-mutations/survivors/vault.json) | 65 | packages/obsidian-rag/src/vault.ts |

## Exclusions

- `*.test.ts`
- `types.ts`
- `constants.ts`
- `schemas.ts`
— plus `skills/`, `standards/`, `dist/`, `node_modules/` directories

<!-- Generated by scripts/micro-mutations.mjs -->