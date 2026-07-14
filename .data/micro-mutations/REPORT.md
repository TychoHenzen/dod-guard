# Micro-Mutation Report

**Generated**: 2026-07-14 | **Commit**: `989799c`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 14397 |
| Killed | 4849 |
| Missed | 5380 |
| Timeout | 65 |
| No coverage | 4103 |
| Catch rate | 33.7% |
| Runs | 68 |
| Files tested | 68 |

**Last run**: 2026-07-14 — `packages/gitevo/src/operations.ts` → error

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 62% | packages/dod-guard/src/index.ts | 956 | 22 | 0d | 🟡 | 2026-07-14 | 0/0 killed | ❌ |
| 59% | packages/dod-guard/src/tree-utils.ts | 350 | 10 | 2d | 🟡 | 2026-07-12 | 0/164 killed | ⚠️ |
| 59% | packages/dod-guard/src/evaluate-proof.ts | 656 | 9 | 1d | 🟡 | 2026-07-13 | 0/0 killed | ❌ |
| 59% | packages/dod-guard/src/checker.ts | 446 | 11 | 0d | 🟡 | 2026-07-14 | 0/0 killed | ❌ |
| 59% | packages/obsidian-rag/src/store.ts | 344 | 11 | 1d | 🟡 | 2026-07-13 | 0/0 killed | ❌ |
| 59% | packages/evomcp/src/index.ts | 296 | 13 | 2d | 🟡 | 2026-07-12 | 0/218 killed | ⚠️ |
| 58% | packages/gitevo/src/operations.ts | 602 | 9 | 0d | 🟡 | 2026-07-14 | 0/0 killed | ❌ |
| 57% | packages/obsidian-rag/src/vault.ts | 185 | 12 | 2d | 🟡 | 2026-07-12 | 84/160 killed | ⚠️ |
| 57% | packages/gitevo/src/index.ts | 183 | 10 | 2d | 🟡 | 2026-07-12 | 26/124 killed | ⚠️ |
| 57% | packages/obsidian-rag/src/index.ts | 180 | 16 | 2d | 🟡 | 2026-07-12 | 0/162 killed | ⚠️ |
| 56% | packages/obsidian-rag/src/tools.ts | 487 | 8 | 2d | 🟡 | 2026-07-12 | 0/540 killed | ⚠️ |
| 56% | packages/evomcp/src/evolve.ts | 290 | 9 | 2d | 🟡 | 2026-07-12 | 94/244 killed | ⚠️ |
| 56% | packages/evomcp/src/solve.ts | 274 | 9 | 2d | 🟡 | 2026-07-12 | 48/177 killed | ⚠️ |
| 56% | packages/dod-guard/src/command-check.ts | 396 | 8 | 2d | 🟡 | 2026-07-12 | 146/300 killed | ⚠️ |
| 56% | packages/dod-guard/src/observability.ts | 656 | 7 | 2d | 🟡 | 2026-07-12 | 417/951 killed | ⚠️ |
| 52% | packages/dod-guard/src/author.ts | 286 | 7 | 2d | 🟡 | 2026-07-12 | 113/383 killed | ⚠️ |
| 52% | packages/evomcp/src/agent.ts | 458 | 6 | 2d | 🟡 | 2026-07-12 | 135/335 killed | ⚠️ |
| 49% | packages/dod-guard/src/baseline.ts | 207 | 6 | 2d | 🟡 | 2026-07-12 | 68/126 killed | ⚠️ |
| 48% | packages/dod-guard/src/assertions.ts | 172 | 6 | 2d | 🟡 | 2026-07-12 | 89/319 killed | ⚠️ |
| 48% | packages/dod-guard/src/tools/dod-refine.ts | 160 | 6 | 2d | 🟡 | 2026-07-12 | 0/143 killed | ⚠️ |
| 48% | packages/obsidian-rag/src/indexer.ts | 157 | 6 | 2d | 🟡 | 2026-07-12 | 58/121 killed | ⚠️ |
| 44% | packages/dod-guard/src/tools/dod-create.ts | 93 | 5 | 2d | 🟡 | 2026-07-12 | 0/47 killed | ⚠️ |
| 41% | packages/dod-guard/src/tools/dod-add-node.ts | 111 | 3 | 2d | 🟡 | 2026-07-12 | 0/124 killed | ⚠️ |
| 41% | packages/dod-guard/src/format-result.ts | 108 | 3 | 2d | 🟡 | 2026-07-12 | 145/191 killed | ⚠️ |
| 36% | packages/dod-guard/src/test-metrics.ts | 971 | 4 | 2d | — | 2026-07-12 | 298/1999 killed | ⚠️ |
| 35% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 2d | — | 2026-07-12 | 53/132 killed | ⚠️ |
| 32% | packages/dod-guard/src/store.ts | 181 | 5 | 2d | — | 2026-07-12 | 83/152 killed | ⚠️ |
| 31% | packages/dod-guard/src/parser.ts | 294 | 4 | 2d | — | 2026-07-12 | 358/556 killed | ⚠️ |
| 31% | packages/dod-guard/src/find-functions.ts | 474 | 3 | 2d | — | 2026-07-12 | 412/830 killed | ⚠️ |
| 31% | packages/dod-guard/src/brevity.ts | 399 | 3 | 2d | — | 2026-07-12 | 153/366 killed | ⚠️ |
| 28% | packages/obsidian-rag/src/retriever.ts | 134 | 4 | 2d | — | 2026-07-12 | 0/112 killed | ⚠️ |
| 25% | packages/evomcp/src/dedup.ts | 170 | 2 | 2d | — | 2026-07-12 | 77/167 killed | ⚠️ |
| 22% | packages/dod-guard/src/manual.ts | 72 | 2 | 2d | — | 2026-07-12 | 28/44 killed | ⚠️ |
| 19% | packages/dod-guard/src/notify.ts | 36 | 2 | 2d | — | 2026-07-12 | 0/29 killed | ⚠️ |
| 16% | packages/dod-guard/src/regression.ts | 25 | 1 | 2d | — | 2026-07-12 | 21/25 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
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
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/assertions.ts | 319 | 89 | 215 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/baseline.ts | 126 | 68 | 58 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/indexer.ts | 121 | 58 | 60 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/brevity.ts | 366 | 153 | 143 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/command-check.ts | 300 | 146 | 122 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/author.ts | 383 | 113 | 196 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/store.ts | 152 | 83 | 59 | ok |
| 2026-07-12 | `2f117f2` | packages/evomcp/src/solve.ts | 177 | 48 | 98 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/cli.ts | 132 | 53 | 64 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/test-metrics.ts | 1999 | 298 | 1323 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/checker.ts | 567 | 252 | 214 | ok |
| 2026-07-12 | `2f117f2` | packages/gitevo/src/index.ts | 124 | 26 | 42 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/tools.ts | 540 | 0 | 0 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/evaluate-proof.ts | 740 | 390 | 236 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/index.ts | 162 | 0 | 0 | ok |
| 2026-07-12 | `2f117f2` | packages/evomcp/src/index.ts | 218 | 0 | 0 | ok |
| 2026-07-12 | `2f117f2` | packages/obsidian-rag/src/vault.ts | 160 | 84 | 65 | ok |
| 2026-07-12 | `2f117f2` | packages/dod-guard/src/index.ts | 827 | 0 | 0 | ok |

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