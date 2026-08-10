# Micro-Mutation Report

**Generated**: 2026-08-10 | **Commit**: `79bce43`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 18179 |
| Killed | 7051 |
| Missed | 6413 |
| Timeout | 85 |
| No coverage | 4630 |
| Catch rate | 38.8% |
| Runs | 113 |
| Files tested | 113 |

**Last run**: 2026-08-10 — `packages/evomcp/src/solve-files.ts` → ok

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
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
| 81% | packages/gitevo/src/evo-config.ts | 32 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/mcp/locate-node.ts | 30 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/import-gate.ts | 29 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-worker.ts | 29 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-abandon.ts | 28 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-screen.ts | 27 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/checker-vcs.ts | 23 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/mcp/dod-tree.ts | 22 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/dod-guard/src/checker-verdict.ts | 21 | 1 | 90d | 🟡 | — | — | ⬜ |
| 78% | packages/evomcp/src/solve-session.ts | 18 | 1 | 90d | 🟡 | — | — | ⬜ |
| 77% | packages/gitevo/src/evo-error.ts | 12 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/checker-summary.ts | 6 | 2 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/evomcp/src/evolve.ts | 524 | 14 | 29d | 🟡 | 2026-07-12 | 94/244 killed | ⚠️ |
| 76% | packages/evomcp/src/agent.ts | 516 | 11 | 29d | 🟡 | 2026-07-12 | 135/335 killed | ⚠️ |
| 76% | packages/dod-guard/src/checker-result.ts | 9 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/obsidian-rag/src/tools.ts | 506 | 11 | 29d | 🟡 | 2026-07-12 | 0/540 killed | ⚠️ |
| 74% | packages/dod-guard/src/command-check.ts | 297 | 11 | 29d | 🟡 | 2026-07-12 | 146/300 killed | ⚠️ |
| 72% | packages/dod-guard/src/author.ts | 229 | 12 | 29d | 🟡 | 2026-07-12 | 113/383 killed | ⚠️ |
| 72% | packages/gitevo/src/index.ts | 226 | 13 | 29d | 🟡 | 2026-07-12 | 26/124 killed | ⚠️ |
| 71% | packages/obsidian-rag/src/store.ts | 427 | 13 | 22d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 71% | packages/obsidian-rag/src/index.ts | 150 | 18 | 29d | 🟡 | 2026-07-12 | 0/162 killed | ⚠️ |
| 70% | packages/dod-guard/src/evaluate-proof.ts | 297 | 18 | 23d | 🟡 | 2026-07-18 | 0/0 killed | ❌ |
| 70% | packages/gitevo/src/operations.ts | 254 | 17 | 24d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 70% | packages/evomcp/src/index.ts | 249 | 21 | 24d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 69% | packages/dod-guard/src/tree-utils.ts | 249 | 15 | 22d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 69% | packages/dod-guard/src/tools/dod-refine.ts | 143 | 9 | 29d | 🟡 | 2026-07-12 | 0/143 killed | ⚠️ |
| 69% | packages/dod-guard/src/index.ts | 264 | 35 | 21d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 69% | packages/obsidian-rag/src/indexer.ts | 233 | 8 | 29d | 🟡 | 2026-07-12 | 58/121 killed | ⚠️ |
| 68% | packages/evomcp/src/solve.ts | 82 | 15 | 29d | 🟡 | 2026-07-12 | 48/177 killed | ⚠️ |
| 67% | packages/obsidian-rag/src/vault.ts | 187 | 13 | 21d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 65% | packages/dod-guard/src/checker.ts | 100 | 19 | 21d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 64% | packages/dod-guard/src/parser.ts | 221 | 6 | 29d | 🟡 | 2026-07-12 | 358/556 killed | ⚠️ |
| 64% | packages/dod-guard/src/tools/dod-create.ts | 78 | 8 | 29d | 🟡 | 2026-07-12 | 0/47 killed | ⚠️ |
| 63% | packages/dod-guard/src/tools/dod-add-node.ts | 105 | 7 | 29d | 🟡 | 2026-07-12 | 0/124 killed | ⚠️ |
| 63% | packages/dod-guard/src/store.ts | 168 | 6 | 29d | 🟡 | 2026-07-12 | 83/152 killed | ⚠️ |
| 63% | packages/obsidian-rag/src/retriever.ts | 149 | 6 | 29d | 🟡 | 2026-07-12 | 0/112 killed | ⚠️ |
| 63% | packages/dod-guard/src/format-result.ts | 87 | 7 | 29d | 🟡 | 2026-07-12 | 145/191 killed | ⚠️ |
| 52% | packages/gitevo/src/memory.ts | 301 | 5 | 8d | 🟡 | 2026-08-02 | 0/0 killed | ❌ |
| 50% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 29d | — | 2026-07-12 | 53/132 killed | ⚠️ |
| 40% | packages/evomcp/src/dedup.ts | 170 | 2 | 29d | — | 2026-07-12 | 77/167 killed | ⚠️ |
| 36% | packages/dod-guard/src/mcp/dod-store-migrate.ts | 61 | 2 | 1d | 🟡 | 2026-08-09 | 0/0 killed | ❌ |
| 33% | packages/evomcp/src/judge.ts | 301 | 3 | 8d | — | 2026-08-02 | 136/307 killed | ⚠️ |
| 33% | packages/evomcp/src/degenerate.ts | 461 | 2 | 8d | — | 2026-08-02 | 300/477 killed | ⚠️ |
| 31% | packages/evomcp/src/prompts.ts | 235 | 3 | 7d | — | 2026-08-03 | 59/169 killed | ⚠️ |
| 30% | packages/evomcp/src/gitevo-integration.ts | 100 | 4 | 7d | — | 2026-08-03 | 0/31 killed | ⚠️ |
| 30% | packages/evomcp/src/orchestrate.ts | 252 | 2 | 7d | — | 2026-08-03 | 121/215 killed | ⚠️ |
| 29% | packages/evomcp/src/convergence.ts | 244 | 2 | 6d | — | 2026-08-04 | 113/157 killed | ⚠️ |
| 29% | packages/evomcp/src/budget.ts | 238 | 2 | 6d | — | 2026-08-04 | 131/168 killed | ⚠️ |
| 29% | packages/evomcp/src/render.ts | 138 | 3 | 6d | — | 2026-08-04 | 130/171 killed | ⚠️ |
| 28% | packages/evomcp/src/context.ts | 331 | 1 | 5d | — | 2026-08-05 | 145/277 killed | ⚠️ |
| 28% | packages/evomcp/src/gates.ts | 199 | 2 | 5d | — | 2026-08-05 | 108/157 killed | ⚠️ |
| 27% | packages/evomcp/src/orchestrator.ts | 301 | 1 | 5d | — | 2026-08-05 | 128/175 killed | ⚠️ |
| 26% | packages/evomcp/src/feedback.ts | 281 | 1 | 4d | — | 2026-08-06 | 212/301 killed | ⚠️ |
| 26% | packages/gitevo/src/evo-safety.ts | 147 | 2 | 4d | — | 2026-08-06 | 127/176 killed | ⚠️ |
| 25% | packages/dod-guard/src/cli.ts | 222 | 1 | 4d | — | 2026-08-06 | 89/204 killed | ⚠️ |
| 25% | packages/evomcp/src/escalation.ts | 217 | 1 | 3d | — | 2026-08-07 | 111/130 killed | ⚠️ |
| 25% | packages/dod-guard/src/mcp/dod-amend.ts | 125 | 2 | 3d | — | 2026-08-07 | 0/97 killed | ⚠️ |
| 23% | packages/dod-guard/src/fingerprint.ts | 50 | 3 | 3d | — | 2026-08-07 | 44/65 killed | ⚠️ |
| 22% | packages/dod-guard/src/mcp/dod-adversarial-gate.ts | 73 | 2 | 2d | — | 2026-08-08 | 0/73 killed | ⚠️ |
| 22% | packages/evomcp/src/solve-repair.ts | 70 | 2 | 2d | — | 2026-08-08 | 34/40 killed | ⚠️ |
| 22% | packages/quality-guard/src/index.ts | 116 | 1 | 2d | — | 2026-08-08 | 10/70 killed | ⚠️ |
| 21% | packages/dod-guard/src/mcp/dod-check.ts | 68 | 2 | 1d | — | 2026-08-09 | 0/46 killed | ⚠️ |
| 21% | packages/dod-guard/src/checker-leaves.ts | 60 | 2 | 1d | — | 2026-08-09 | 23/37 killed | ⚠️ |
| 20% | packages/gitevo/src/evo-git.ts | 92 | 1 | 0d | — | 2026-08-10 | 99/129 killed | ⚠️ |
| 19% | packages/gitevo/src/evo-lessons.ts | 49 | 2 | 0d | — | 2026-08-10 | 26/39 killed | ⚠️ |
| 19% | packages/evomcp/src/solve-files.ts | 80 | 1 | 0d | — | 2026-08-10 | 56/71 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-08-10 | `79bce43` | packages/evomcp/src/solve-files.ts | 71 | 56 | 13 | ok |
| 2026-08-10 | `79bce43` | packages/gitevo/src/evo-lessons.ts | 39 | 26 | 12 | ok |
| 2026-08-10 | `79bce43` | packages/gitevo/src/evo-git.ts | 129 | 99 | 20 | ok |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/checker-leaves.ts | 37 | 23 | 12 | ok |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/mcp/dod-store-migrate.ts | 0 | 0 | 0 | error |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/mcp/dod-check.ts | 46 | 0 | 0 | ok |
| 2026-08-08 | `c33ec5d` | packages/quality-guard/src/index.ts | 70 | 10 | 35 | ok |
| 2026-08-08 | `c33ec5d` | packages/evomcp/src/solve-repair.ts | 40 | 34 | 2 | ok |
| 2026-08-08 | `c33ec5d` | packages/dod-guard/src/mcp/dod-adversarial-gate.ts | 73 | 0 | 0 | ok |
| 2026-08-07 | `bb2e024` | packages/dod-guard/src/fingerprint.ts | 65 | 44 | 19 | ok |
| 2026-08-07 | `bb2e024` | packages/dod-guard/src/mcp/dod-amend.ts | 97 | 0 | 0 | ok |
| 2026-08-07 | `bb2e024` | packages/evomcp/src/escalation.ts | 130 | 111 | 13 | ok |
| 2026-08-06 | `1789f48` | packages/dod-guard/src/cli.ts | 204 | 89 | 18 | ok |
| 2026-08-06 | `1789f48` | packages/gitevo/src/evo-safety.ts | 176 | 127 | 39 | ok |
| 2026-08-06 | `1789f48` | packages/evomcp/src/feedback.ts | 301 | 212 | 87 | ok |
| 2026-08-05 | `1424d3c` | packages/evomcp/src/orchestrator.ts | 175 | 128 | 35 | ok |
| 2026-08-05 | `1424d3c` | packages/evomcp/src/gates.ts | 157 | 108 | 49 | ok |
| 2026-08-05 | `1424d3c` | packages/evomcp/src/context.ts | 277 | 145 | 123 | ok |
| 2026-08-04 | `f7ed3e1` | packages/evomcp/src/render.ts | 171 | 130 | 41 | ok |
| 2026-08-04 | `f7ed3e1` | packages/evomcp/src/budget.ts | 168 | 131 | 36 | ok |
| 2026-08-04 | `f7ed3e1` | packages/evomcp/src/convergence.ts | 157 | 113 | 38 | ok |
| 2026-08-03 | `5f262ba` | packages/evomcp/src/orchestrate.ts | 215 | 121 | 85 | ok |
| 2026-08-03 | `5f262ba` | packages/evomcp/src/gitevo-integration.ts | 31 | 0 | 0 | ok |
| 2026-08-03 | `5f262ba` | packages/evomcp/src/prompts.ts | 169 | 59 | 105 | ok |
| 2026-08-02 | `1136c40` | packages/evomcp/src/degenerate.ts | 477 | 300 | 160 | ok |
| 2026-08-02 | `1136c40` | packages/evomcp/src/judge.ts | 307 | 136 | 91 | ok |
| 2026-08-02 | `1136c40` | packages/gitevo/src/memory.ts | 0 | 0 | 0 | error |
| 2026-07-20 | `c526372` | packages/obsidian-rag/src/vault.ts | 0 | 0 | 0 | error |
| 2026-07-20 | `c526372` | packages/dod-guard/src/checker.ts | 0 | 0 | 0 | error |
| 2026-07-20 | `c526372` | packages/dod-guard/src/index.ts | 0 | 0 | 0 | error |

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
| [budget.json](.data/micro-mutations/survivors/budget.json) | 36 | packages/evomcp/src/budget.ts |
| [checker-leaves.json](.data/micro-mutations/survivors/checker-leaves.json) | 12 | packages/dod-guard/src/checker-leaves.ts |
| [checker.json](.data/micro-mutations/survivors/checker.json) | 214 | packages/dod-guard/src/checker.ts |
| [cli.json](.data/micro-mutations/survivors/cli.json) | 18 | packages/dod-guard/src/cli.ts |
| [command-check.json](.data/micro-mutations/survivors/command-check.json) | 122 | packages/dod-guard/src/command-check.ts |
| [context.json](.data/micro-mutations/survivors/context.json) | 123 | packages/evomcp/src/context.ts |
| [convergence.json](.data/micro-mutations/survivors/convergence.json) | 38 | packages/evomcp/src/convergence.ts |
| [dedup.json](.data/micro-mutations/survivors/dedup.json) | 87 | packages/evomcp/src/dedup.ts |
| [degenerate.json](.data/micro-mutations/survivors/degenerate.json) | 160 | packages/evomcp/src/degenerate.ts |
| [escalation.json](.data/micro-mutations/survivors/escalation.json) | 13 | packages/evomcp/src/escalation.ts |
| [evaluate-proof.json](.data/micro-mutations/survivors/evaluate-proof.json) | 236 | packages/dod-guard/src/evaluate-proof.ts |
| [evo-git.json](.data/micro-mutations/survivors/evo-git.json) | 20 | packages/gitevo/src/evo-git.ts |
| [evo-lessons.json](.data/micro-mutations/survivors/evo-lessons.json) | 12 | packages/gitevo/src/evo-lessons.ts |
| [evo-safety.json](.data/micro-mutations/survivors/evo-safety.json) | 39 | packages/gitevo/src/evo-safety.ts |
| [evolve.json](.data/micro-mutations/survivors/evolve.json) | 118 | packages/evomcp/src/evolve.ts |
| [feedback.json](.data/micro-mutations/survivors/feedback.json) | 87 | packages/evomcp/src/feedback.ts |
| [find-functions.json](.data/micro-mutations/survivors/find-functions.json) | 391 | packages/dod-guard/src/find-functions.ts |
| [fingerprint.json](.data/micro-mutations/survivors/fingerprint.json) | 19 | packages/dod-guard/src/fingerprint.ts |
| [format-result.json](.data/micro-mutations/survivors/format-result.json) | 44 | packages/dod-guard/src/format-result.ts |
| [gates.json](.data/micro-mutations/survivors/gates.json) | 49 | packages/evomcp/src/gates.ts |
| [index.json](.data/micro-mutations/survivors/index.json) | 35 | packages/quality-guard/src/index.ts |
| [indexer.json](.data/micro-mutations/survivors/indexer.json) | 60 | packages/obsidian-rag/src/indexer.ts |
| [judge.json](.data/micro-mutations/survivors/judge.json) | 91 | packages/evomcp/src/judge.ts |
| [manual.json](.data/micro-mutations/survivors/manual.json) | 12 | packages/dod-guard/src/manual.ts |
| [notify.json](.data/micro-mutations/survivors/notify.json) | 8 | packages/dod-guard/src/notify.ts |
| [observability.json](.data/micro-mutations/survivors/observability.json) | 453 | packages/dod-guard/src/observability.ts |
| [operations.json](.data/micro-mutations/survivors/operations.json) | 185 | packages/gitevo/src/operations.ts |
| [orchestrate.json](.data/micro-mutations/survivors/orchestrate.json) | 85 | packages/evomcp/src/orchestrate.ts |
| [orchestrator.json](.data/micro-mutations/survivors/orchestrator.json) | 35 | packages/evomcp/src/orchestrator.ts |
| [parser.json](.data/micro-mutations/survivors/parser.json) | 179 | packages/dod-guard/src/parser.ts |
| [prompts.json](.data/micro-mutations/survivors/prompts.json) | 105 | packages/evomcp/src/prompts.ts |
| [regression.json](.data/micro-mutations/survivors/regression.json) | 4 | packages/dod-guard/src/regression.ts |
| [render.json](.data/micro-mutations/survivors/render.json) | 41 | packages/evomcp/src/render.ts |
| [solve-files.json](.data/micro-mutations/survivors/solve-files.json) | 13 | packages/evomcp/src/solve-files.ts |
| [solve-repair.json](.data/micro-mutations/survivors/solve-repair.json) | 2 | packages/evomcp/src/solve-repair.ts |
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