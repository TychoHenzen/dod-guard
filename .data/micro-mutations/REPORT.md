# Micro-Mutation Report

**Generated**: 2026-08-03 | **Commit**: `5f262ba`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 15596 |
| Killed | 5465 |
| Missed | 5821 |
| Timeout | 71 |
| No coverage | 4239 |
| Catch rate | 35.0% |
| Runs | 92 |
| Files tested | 92 |

**Last run**: 2026-08-03 — `packages/evomcp/src/orchestrate.ts` → ok

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 91% | packages/evomcp/src/convergence.ts | 244 | 2 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/evomcp/src/budget.ts | 238 | 2 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/evomcp/src/render.ts | 138 | 3 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/evomcp/src/context.ts | 331 | 1 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/evomcp/src/gates.ts | 199 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/evomcp/src/orchestrator.ts | 301 | 1 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/evomcp/src/feedback.ts | 281 | 1 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/dod-guard/src/cli.ts | 222 | 1 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/evomcp/src/escalation.ts | 217 | 1 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/dod-guard/src/mcp/dod-amend.ts | 125 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/dod-guard/src/fingerprint.ts | 50 | 3 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/dod-guard/src/mcp/dod-adversarial-gate.ts | 73 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/evomcp/src/solve-repair.ts | 70 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/quality-guard/src/index.ts | 116 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/dod-guard/src/mcp/dod-check.ts | 68 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/dod-guard/src/mcp/dod-store-migrate.ts | 61 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/dod-guard/src/checker-leaves.ts | 60 | 2 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-files.ts | 80 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/dod-guard/src/snapshot.ts | 78 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/attempt-result.ts | 75 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-report.ts | 75 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-attempt.ts | 72 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/dod-guard/src/mcp/resolve.ts | 43 | 2 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-context.ts | 69 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/quality-guard/src/scanner.ts | 68 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/dod-guard/src/checker-tree.ts | 67 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-signals.ts | 40 | 2 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/evomcp/src/solve-select.ts | 64 | 1 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/evomcp/src/solve-verify.ts | 64 | 1 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/dod-guard/src/mcp/dod-list.ts | 34 | 2 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-glob.ts | 51 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/dod-guard/src/mcp/dod-import.ts | 49 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-run.ts | 49 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/dod-guard/src/mcp/dod-remove-node.ts | 48 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-ledger.ts | 48 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-lineage.ts | 47 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/dod-guard/src/mcp/dod-status.ts | 28 | 2 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/git-helpers.ts | 43 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/quality-guard/src/skips.ts | 42 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-plan.ts | 41 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-loop.ts | 39 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-finish.ts | 36 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-git.ts | 35 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/mcp/locate-node.ts | 30 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/import-gate.ts | 29 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-worker.ts | 29 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-abandon.ts | 28 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-screen.ts | 27 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/checker-vcs.ts | 23 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/mcp/dod-tree.ts | 22 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/checker-verdict.ts | 21 | 1 | 90d | 🟡 | — | — | ⬜ |
| 78% | packages/evomcp/src/solve-session.ts | 18 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/checker-summary.ts | 6 | 2 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/checker-result.ts | 9 | 1 | 90d | 🟡 | — | — | ⬜ |
| 72% | packages/evomcp/src/evolve.ts | 524 | 14 | 22d | 🟡 | 2026-07-12 | 94/244 killed | ⚠️ |
| 72% | packages/evomcp/src/agent.ts | 516 | 11 | 22d | 🟡 | 2026-07-12 | 135/335 killed | ⚠️ |
| 72% | packages/obsidian-rag/src/tools.ts | 506 | 11 | 22d | 🟡 | 2026-07-12 | 0/540 killed | ⚠️ |
| 70% | packages/gitevo/src/operations.ts | 715 | 16 | 17d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 70% | packages/dod-guard/src/command-check.ts | 297 | 11 | 22d | 🟡 | 2026-07-12 | 146/300 killed | ⚠️ |
| 69% | packages/dod-guard/src/author.ts | 229 | 12 | 22d | 🟡 | 2026-07-12 | 113/383 killed | ⚠️ |
| 69% | packages/gitevo/src/index.ts | 226 | 13 | 22d | 🟡 | 2026-07-12 | 26/124 killed | ⚠️ |
| 67% | packages/obsidian-rag/src/store.ts | 427 | 13 | 15d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 67% | packages/obsidian-rag/src/index.ts | 150 | 18 | 22d | 🟡 | 2026-07-12 | 0/162 killed | ⚠️ |
| 66% | packages/dod-guard/src/evaluate-proof.ts | 297 | 18 | 16d | 🟡 | 2026-07-18 | 0/0 killed | ❌ |
| 66% | packages/evomcp/src/index.ts | 249 | 21 | 17d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 65% | packages/dod-guard/src/tree-utils.ts | 249 | 14 | 15d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 65% | packages/dod-guard/src/tools/dod-refine.ts | 143 | 9 | 22d | 🟡 | 2026-07-12 | 0/143 killed | ⚠️ |
| 65% | packages/dod-guard/src/index.ts | 264 | 35 | 14d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 65% | packages/obsidian-rag/src/indexer.ts | 233 | 8 | 22d | 🟡 | 2026-07-12 | 58/121 killed | ⚠️ |
| 65% | packages/evomcp/src/solve.ts | 82 | 15 | 22d | 🟡 | 2026-07-12 | 48/177 killed | ⚠️ |
| 63% | packages/obsidian-rag/src/vault.ts | 187 | 13 | 14d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 61% | packages/dod-guard/src/checker.ts | 100 | 19 | 14d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 60% | packages/dod-guard/src/parser.ts | 221 | 6 | 22d | 🟡 | 2026-07-12 | 358/556 killed | ⚠️ |
| 60% | packages/dod-guard/src/tools/dod-create.ts | 78 | 8 | 22d | 🟡 | 2026-07-12 | 0/47 killed | ⚠️ |
| 60% | packages/dod-guard/src/tools/dod-add-node.ts | 105 | 7 | 22d | 🟡 | 2026-07-12 | 0/124 killed | ⚠️ |
| 59% | packages/dod-guard/src/store.ts | 168 | 6 | 22d | 🟡 | 2026-07-12 | 83/152 killed | ⚠️ |
| 59% | packages/obsidian-rag/src/retriever.ts | 149 | 6 | 22d | 🟡 | 2026-07-12 | 0/112 killed | ⚠️ |
| 59% | packages/dod-guard/src/format-result.ts | 87 | 7 | 22d | 🟡 | 2026-07-12 | 145/191 killed | ⚠️ |
| 48% | packages/gitevo/src/memory.ts | 301 | 5 | 1d | 🟡 | 2026-08-02 | 0/0 killed | ❌ |
| 46% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 22d | — | 2026-07-12 | 53/132 killed | ⚠️ |
| 36% | packages/evomcp/src/dedup.ts | 170 | 2 | 22d | — | 2026-07-12 | 77/167 killed | ⚠️ |
| 29% | packages/evomcp/src/judge.ts | 301 | 3 | 1d | — | 2026-08-02 | 136/307 killed | ⚠️ |
| 29% | packages/evomcp/src/degenerate.ts | 461 | 2 | 1d | — | 2026-08-02 | 300/477 killed | ⚠️ |
| 27% | packages/evomcp/src/prompts.ts | 235 | 3 | 0d | — | 2026-08-03 | 59/169 killed | ⚠️ |
| 26% | packages/evomcp/src/gitevo-integration.ts | 100 | 4 | 0d | — | 2026-08-03 | 0/31 killed | ⚠️ |
| 26% | packages/evomcp/src/orchestrate.ts | 252 | 2 | 0d | — | 2026-08-03 | 121/215 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-08-03 | `5f262ba` | packages/evomcp/src/orchestrate.ts | 215 | 121 | 85 | ok |
| 2026-08-03 | `5f262ba` | packages/evomcp/src/gitevo-integration.ts | 31 | 0 | 0 | ok |
| 2026-08-03 | `5f262ba` | packages/evomcp/src/prompts.ts | 169 | 59 | 105 | ok |
| 2026-08-02 | `1136c40` | packages/evomcp/src/degenerate.ts | 477 | 300 | 160 | ok |
| 2026-08-02 | `1136c40` | packages/evomcp/src/judge.ts | 307 | 136 | 91 | ok |
| 2026-08-02 | `1136c40` | packages/gitevo/src/memory.ts | 0 | 0 | 0 | error |
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
| [degenerate.json](.data/micro-mutations/survivors/degenerate.json) | 160 | packages/evomcp/src/degenerate.ts |
| [evaluate-proof.json](.data/micro-mutations/survivors/evaluate-proof.json) | 236 | packages/dod-guard/src/evaluate-proof.ts |
| [evolve.json](.data/micro-mutations/survivors/evolve.json) | 118 | packages/evomcp/src/evolve.ts |
| [find-functions.json](.data/micro-mutations/survivors/find-functions.json) | 391 | packages/dod-guard/src/find-functions.ts |
| [format-result.json](.data/micro-mutations/survivors/format-result.json) | 44 | packages/dod-guard/src/format-result.ts |
| [index.json](.data/micro-mutations/survivors/index.json) | 42 | packages/gitevo/src/index.ts |
| [indexer.json](.data/micro-mutations/survivors/indexer.json) | 60 | packages/obsidian-rag/src/indexer.ts |
| [judge.json](.data/micro-mutations/survivors/judge.json) | 91 | packages/evomcp/src/judge.ts |
| [manual.json](.data/micro-mutations/survivors/manual.json) | 12 | packages/dod-guard/src/manual.ts |
| [notify.json](.data/micro-mutations/survivors/notify.json) | 8 | packages/dod-guard/src/notify.ts |
| [observability.json](.data/micro-mutations/survivors/observability.json) | 453 | packages/dod-guard/src/observability.ts |
| [operations.json](.data/micro-mutations/survivors/operations.json) | 185 | packages/gitevo/src/operations.ts |
| [orchestrate.json](.data/micro-mutations/survivors/orchestrate.json) | 85 | packages/evomcp/src/orchestrate.ts |
| [parser.json](.data/micro-mutations/survivors/parser.json) | 179 | packages/dod-guard/src/parser.ts |
| [prompts.json](.data/micro-mutations/survivors/prompts.json) | 105 | packages/evomcp/src/prompts.ts |
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