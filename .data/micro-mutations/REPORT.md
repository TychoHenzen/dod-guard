# Micro-Mutation Report

**Generated**: 2026-08-18 | **Commit**: `e60602e`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 19638 |
| Killed | 8008 |
| Missed | 6804 |
| Timeout | 94 |
| No coverage | 4732 |
| Catch rate | 40.8% |
| Runs | 137 |
| Files tested | 137 |

**Last run**: 2026-08-18 — `packages/evomcp/src/solve-attempt.ts` → ok

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 84% | packages/evomcp/src/solve-context.ts | 69 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/quality-guard/src/scanner.ts | 68 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/evomcp/src/solve-signals.ts | 40 | 2 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/evomcp/src/solve-select.ts | 64 | 1 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/evomcp/src/solve-verify.ts | 64 | 1 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/dod-guard/src/cover/test-globs.ts | 38 | 2 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-glob.ts | 51 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-run.ts | 49 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-ledger.ts | 48 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-lineage.ts | 47 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/git-helpers.ts | 43 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/quality-guard/src/skips.ts | 42 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/evomcp/src/solve-plan.ts | 41 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-loop.ts | 39 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-finish.ts | 36 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/evomcp/src/solve-git.ts | 35 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/gitevo/src/evo-config.ts | 32 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/solve-worker.ts | 29 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/evomcp/src/evolve.ts | 524 | 14 | 37d | 🟡 | 2026-07-12 | 94/244 killed | ⚠️ |
| 80% | packages/evomcp/src/agent.ts | 516 | 11 | 37d | 🟡 | 2026-07-12 | 135/335 killed | ⚠️ |
| 80% | packages/evomcp/src/solve-abandon.ts | 28 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/obsidian-rag/src/tools.ts | 506 | 11 | 37d | 🟡 | 2026-07-12 | 0/540 killed | ⚠️ |
| 80% | packages/evomcp/src/solve-screen.ts | 27 | 1 | 90d | 🟡 | — | — | ⬜ |
| 78% | packages/evomcp/src/solve-session.ts | 18 | 1 | 90d | 🟡 | — | — | ⬜ |
| 78% | packages/dod-guard/src/openspec/scenario-id.ts | 16 | 1 | 90d | 🟡 | — | — | ⬜ |
| 77% | packages/gitevo/src/index.ts | 235 | 14 | 37d | 🟡 | 2026-07-12 | 26/124 killed | ⚠️ |
| 77% | packages/gitevo/src/evo-error.ts | 12 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/testing/capture-io.ts | 11 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/openspec/scenario-block.ts | 10 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/openspec/dependency.ts | 9 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/dod-guard/src/openspec/requirement-block.ts | 9 | 1 | 90d | 🟡 | — | — | ⬜ |
| 75% | packages/obsidian-rag/src/index.ts | 159 | 19 | 37d | 🟡 | 2026-07-12 | 0/162 killed | ⚠️ |
| 75% | packages/obsidian-rag/src/store.ts | 427 | 13 | 30d | 🟡 | 2026-07-19 | 0/0 killed | ❌ |
| 75% | packages/evomcp/src/index.ts | 258 | 22 | 32d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 75% | packages/gitevo/src/operations.ts | 254 | 17 | 32d | 🟡 | 2026-07-17 | 0/0 killed | ❌ |
| 73% | packages/obsidian-rag/src/indexer.ts | 233 | 8 | 37d | 🟡 | 2026-07-12 | 58/121 killed | ⚠️ |
| 73% | packages/evomcp/src/solve.ts | 82 | 15 | 37d | 🟡 | 2026-07-12 | 48/177 killed | ⚠️ |
| 72% | packages/obsidian-rag/src/vault.ts | 187 | 13 | 29d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 67% | packages/obsidian-rag/src/retriever.ts | 149 | 6 | 37d | 🟡 | 2026-07-12 | 0/112 killed | ⚠️ |
| 66% | packages/dod-guard/src/index.ts | 46 | 39 | 29d | 🟡 | 2026-07-20 | 0/0 killed | ❌ |
| 60% | packages/dod-guard/src/cli.ts | 95 | 12 | 12d | 🟡 | 2026-08-06 | 89/204 killed | ⚠️ |
| 56% | packages/gitevo/src/memory.ts | 301 | 5 | 16d | 🟡 | 2026-08-02 | 0/0 killed | ❌ |
| 54% | packages/obsidian-rag/src/cli.ts | 144 | 7 | 37d | — | 2026-07-12 | 53/132 killed | ⚠️ |
| 49% | packages/dod-guard/src/cover/run.ts | 83 | 7 | 4d | 🟡 | 2026-08-14 | 28/43 killed | ⚠️ |
| 45% | packages/evomcp/src/dedup.ts | 170 | 2 | 37d | — | 2026-07-12 | 77/167 killed | ⚠️ |
| 44% | packages/dod-guard/src/cover/languages.ts | 167 | 4 | 2d | 🟡 | 2026-08-16 | 115/206 killed | ⚠️ |
| 44% | packages/quality-guard/src/index.ts | 125 | 2 | 10d | 🟡 | 2026-08-08 | 10/70 killed | ⚠️ |
| 44% | packages/dod-guard/src/openspec/tasks-parser.ts | 120 | 4 | 3d | 🟡 | 2026-08-15 | 129/184 killed | ⚠️ |
| 41% | packages/dod-guard/src/cover/report.ts | 58 | 4 | 4d | 🟡 | 2026-08-14 | 27/27 killed | ✅ |
| 41% | packages/dod-guard/src/cover/markers.ts | 67 | 4 | 2d | 🟡 | 2026-08-16 | 31/37 killed | ⚠️ |
| 37% | packages/evomcp/src/judge.ts | 301 | 3 | 16d | — | 2026-08-02 | 136/307 killed | ⚠️ |
| 37% | packages/evomcp/src/degenerate.ts | 461 | 2 | 16d | — | 2026-08-02 | 300/477 killed | ⚠️ |
| 36% | packages/evomcp/src/prompts.ts | 235 | 3 | 15d | — | 2026-08-03 | 59/169 killed | ⚠️ |
| 34% | packages/evomcp/src/gitevo-integration.ts | 100 | 4 | 15d | — | 2026-08-03 | 0/31 killed | ⚠️ |
| 34% | packages/evomcp/src/orchestrate.ts | 252 | 2 | 15d | — | 2026-08-03 | 121/215 killed | ⚠️ |
| 33% | packages/evomcp/src/convergence.ts | 244 | 2 | 14d | — | 2026-08-04 | 113/157 killed | ⚠️ |
| 33% | packages/evomcp/src/budget.ts | 238 | 2 | 14d | — | 2026-08-04 | 131/168 killed | ⚠️ |
| 33% | packages/evomcp/src/render.ts | 138 | 3 | 14d | — | 2026-08-04 | 130/171 killed | ⚠️ |
| 32% | packages/evomcp/src/context.ts | 331 | 1 | 13d | — | 2026-08-05 | 145/277 killed | ⚠️ |
| 32% | packages/evomcp/src/gates.ts | 199 | 2 | 13d | — | 2026-08-05 | 108/157 killed | ⚠️ |
| 32% | packages/evomcp/src/orchestrator.ts | 301 | 1 | 13d | — | 2026-08-05 | 128/175 killed | ⚠️ |
| 31% | packages/evomcp/src/feedback.ts | 281 | 1 | 12d | — | 2026-08-06 | 212/301 killed | ⚠️ |
| 30% | packages/gitevo/src/evo-safety.ts | 147 | 2 | 12d | — | 2026-08-06 | 127/176 killed | ⚠️ |
| 29% | packages/evomcp/src/escalation.ts | 217 | 1 | 11d | — | 2026-08-07 | 111/130 killed | ⚠️ |
| 26% | packages/evomcp/src/solve-repair.ts | 70 | 2 | 10d | — | 2026-08-08 | 34/40 killed | ⚠️ |
| 26% | packages/dod-guard/src/openspec/requirements.ts | 90 | 3 | 4d | — | 2026-08-14 | 45/94 killed | ⚠️ |
| 24% | packages/gitevo/src/evo-git.ts | 92 | 1 | 8d | — | 2026-08-10 | 99/129 killed | ⚠️ |
| 24% | packages/dod-guard/src/cover/baseline.ts | 65 | 3 | 3d | — | 2026-08-15 | 39/46 killed | ⚠️ |
| 24% | packages/dod-guard/src/openspec/glob.ts | 70 | 3 | 2d | — | 2026-08-16 | 42/63 killed | ⚠️ |
| 24% | packages/gitevo/src/evo-lessons.ts | 49 | 2 | 8d | — | 2026-08-10 | 26/39 killed | ⚠️ |
| 24% | packages/evomcp/src/solve-files.ts | 80 | 1 | 8d | — | 2026-08-10 | 56/71 killed | ⚠️ |
| 23% | packages/evomcp/src/attempt-result.ts | 75 | 1 | 7d | — | 2026-08-11 | 23/24 killed | ⚠️ |
| 23% | packages/evomcp/src/solve-report.ts | 75 | 1 | 7d | — | 2026-08-11 | 57/58 killed | ⚠️ |
| 22% | packages/dod-guard/src/openspec/fetch-instructions.ts | 50 | 3 | 1d | — | 2026-08-17 | 11/15 killed | ⚠️ |
| 20% | packages/dod-guard/src/cover/enumerate.ts | 63 | 2 | 0d | — | 2026-08-18 | 26/29 killed | ⚠️ |
| 20% | packages/dod-guard/src/shell.ts | 51 | 2 | 1d | — | 2026-08-17 | 13/36 killed | ⚠️ |
| 20% | packages/dod-guard/src/cover/package-dir.ts | 27 | 3 | 1d | — | 2026-08-17 | 7/17 killed | ⚠️ |
| 19% | packages/dod-guard/src/testing/spec-fixtures.ts | 46 | 2 | 0d | — | 2026-08-18 | 11/43 killed | ⚠️ |
| 19% | packages/evomcp/src/solve-attempt.ts | 72 | 1 | 0d | — | 2026-08-18 | 43/48 killed | ⚠️ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-08-18 | `e60602e` | packages/evomcp/src/solve-attempt.ts | 48 | 43 | 3 | ok |
| 2026-08-18 | `e60602e` | packages/dod-guard/src/testing/spec-fixtures.ts | 43 | 11 | 7 | ok |
| 2026-08-18 | `e60602e` | packages/dod-guard/src/cover/enumerate.ts | 29 | 26 | 2 | ok |
| 2026-08-17 | `ac9b0fd` | packages/dod-guard/src/cover/package-dir.ts | 17 | 7 | 10 | ok |
| 2026-08-17 | `ac9b0fd` | packages/dod-guard/src/shell.ts | 36 | 13 | 8 | ok |
| 2026-08-17 | `ac9b0fd` | packages/dod-guard/src/openspec/fetch-instructions.ts | 15 | 11 | 4 | ok |
| 2026-08-16 | `323eeeb` | packages/dod-guard/src/cover/languages.ts | 206 | 115 | 90 | ok |
| 2026-08-16 | `323eeeb` | packages/dod-guard/src/cover/markers.ts | 37 | 31 | 5 | ok |
| 2026-08-16 | `323eeeb` | packages/dod-guard/src/openspec/glob.ts | 63 | 42 | 20 | ok |
| 2026-08-15 | `dbfb616` | packages/dod-guard/src/openspec/tasks-parser.ts | 184 | 129 | 47 | ok |
| 2026-08-15 | `dbfb616` | packages/dod-guard/src/cover/baseline.ts | 46 | 39 | 7 | ok |
| 2026-08-15 | `dbfb616` | packages/dod-guard/src/cover/reachability.ts | 91 | 64 | 12 | ok |
| 2026-08-14 | `1111979` | packages/dod-guard/src/cover/report.ts | 27 | 27 | 0 | ok |
| 2026-08-14 | `1111979` | packages/dod-guard/src/openspec/requirements.ts | 94 | 45 | 43 | ok |
| 2026-08-14 | `1111979` | packages/dod-guard/src/cover/run.ts | 43 | 28 | 8 | ok |
| 2026-08-13 | `351072f` | packages/dod-guard/src/openspec/steps.ts | 43 | 31 | 8 | ok |
| 2026-08-13 | `351072f` | packages/dod-guard/src/openspec/checkability.ts | 38 | 31 | 6 | ok |
| 2026-08-13 | `351072f` | packages/dod-guard/src/openspec/trace.ts | 81 | 59 | 16 | ok |
| 2026-08-12 | `c7c4be1` | packages/dod-guard/src/openspec/import-dod.ts | 32 | 5 | 16 | ok |
| 2026-08-12 | `c7c4be1` | packages/dod-guard/src/openspec/regenerate-dod.ts | 134 | 87 | 40 | ok |
| 2026-08-12 | `c7c4be1` | packages/dod-guard/src/openspec/convert.ts | 31 | 22 | 9 | ok |
| 2026-08-11 | `db141f5` | packages/evomcp/src/solve-report.ts | 58 | 57 | 1 | ok |
| 2026-08-11 | `db141f5` | packages/evomcp/src/attempt-result.ts | 24 | 23 | 1 | ok |
| 2026-08-11 | `db141f5` | packages/dod-guard/src/snapshot.ts | 39 | 11 | 28 | ok |
| 2026-08-10 | `79bce43` | packages/evomcp/src/solve-files.ts | 71 | 56 | 13 | ok |
| 2026-08-10 | `79bce43` | packages/gitevo/src/evo-lessons.ts | 39 | 26 | 12 | ok |
| 2026-08-10 | `79bce43` | packages/gitevo/src/evo-git.ts | 129 | 99 | 20 | ok |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/checker-leaves.ts | 37 | 23 | 12 | ok |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/mcp/dod-store-migrate.ts | 0 | 0 | 0 | error |
| 2026-08-09 | `6b7a4b3` | packages/dod-guard/src/mcp/dod-check.ts | 46 | 0 | 0 | ok |

## Survivor Reports

Per-file survivor JSON with mutator type, line number, and replacement.
Use these to identify weak tests and add targeted assertions.

| File | Survivors | Source |
|------|-----------|--------|
| [agent.json](.data/micro-mutations/survivors/agent.json) | 130 | packages/evomcp/src/agent.ts |
| [assertions.json](.data/micro-mutations/survivors/assertions.json) | 215 | packages/dod-guard/src/assertions.ts |
| [attempt-result.json](.data/micro-mutations/survivors/attempt-result.json) | 1 | packages/evomcp/src/attempt-result.ts |
| [author.json](.data/micro-mutations/survivors/author.json) | 196 | packages/dod-guard/src/author.ts |
| [baseline.json](.data/micro-mutations/survivors/baseline.json) | 7 | packages/dod-guard/src/cover/baseline.ts |
| [brevity.json](.data/micro-mutations/survivors/brevity.json) | 143 | packages/dod-guard/src/brevity.ts |
| [budget.json](.data/micro-mutations/survivors/budget.json) | 36 | packages/evomcp/src/budget.ts |
| [checkability.json](.data/micro-mutations/survivors/checkability.json) | 6 | packages/dod-guard/src/openspec/checkability.ts |
| [checker-leaves.json](.data/micro-mutations/survivors/checker-leaves.json) | 12 | packages/dod-guard/src/checker-leaves.ts |
| [checker.json](.data/micro-mutations/survivors/checker.json) | 214 | packages/dod-guard/src/checker.ts |
| [cli.json](.data/micro-mutations/survivors/cli.json) | 18 | packages/dod-guard/src/cli.ts |
| [command-check.json](.data/micro-mutations/survivors/command-check.json) | 122 | packages/dod-guard/src/command-check.ts |
| [context.json](.data/micro-mutations/survivors/context.json) | 123 | packages/evomcp/src/context.ts |
| [convergence.json](.data/micro-mutations/survivors/convergence.json) | 38 | packages/evomcp/src/convergence.ts |
| [convert.json](.data/micro-mutations/survivors/convert.json) | 9 | packages/dod-guard/src/openspec/convert.ts |
| [dedup.json](.data/micro-mutations/survivors/dedup.json) | 87 | packages/evomcp/src/dedup.ts |
| [degenerate.json](.data/micro-mutations/survivors/degenerate.json) | 160 | packages/evomcp/src/degenerate.ts |
| [enumerate.json](.data/micro-mutations/survivors/enumerate.json) | 2 | packages/dod-guard/src/cover/enumerate.ts |
| [escalation.json](.data/micro-mutations/survivors/escalation.json) | 13 | packages/evomcp/src/escalation.ts |
| [evaluate-proof.json](.data/micro-mutations/survivors/evaluate-proof.json) | 236 | packages/dod-guard/src/evaluate-proof.ts |
| [evo-git.json](.data/micro-mutations/survivors/evo-git.json) | 20 | packages/gitevo/src/evo-git.ts |
| [evo-lessons.json](.data/micro-mutations/survivors/evo-lessons.json) | 12 | packages/gitevo/src/evo-lessons.ts |
| [evo-safety.json](.data/micro-mutations/survivors/evo-safety.json) | 39 | packages/gitevo/src/evo-safety.ts |
| [evolve.json](.data/micro-mutations/survivors/evolve.json) | 118 | packages/evomcp/src/evolve.ts |
| [feedback.json](.data/micro-mutations/survivors/feedback.json) | 87 | packages/evomcp/src/feedback.ts |
| [fetch-instructions.json](.data/micro-mutations/survivors/fetch-instructions.json) | 4 | packages/dod-guard/src/openspec/fetch-instructions.ts |
| [find-functions.json](.data/micro-mutations/survivors/find-functions.json) | 391 | packages/dod-guard/src/find-functions.ts |
| [fingerprint.json](.data/micro-mutations/survivors/fingerprint.json) | 19 | packages/dod-guard/src/fingerprint.ts |
| [format-result.json](.data/micro-mutations/survivors/format-result.json) | 44 | packages/dod-guard/src/format-result.ts |
| [gates.json](.data/micro-mutations/survivors/gates.json) | 49 | packages/evomcp/src/gates.ts |
| [glob.json](.data/micro-mutations/survivors/glob.json) | 20 | packages/dod-guard/src/openspec/glob.ts |
| [import-dod.json](.data/micro-mutations/survivors/import-dod.json) | 16 | packages/dod-guard/src/openspec/import-dod.ts |
| [index.json](.data/micro-mutations/survivors/index.json) | 35 | packages/quality-guard/src/index.ts |
| [indexer.json](.data/micro-mutations/survivors/indexer.json) | 60 | packages/obsidian-rag/src/indexer.ts |
| [judge.json](.data/micro-mutations/survivors/judge.json) | 91 | packages/evomcp/src/judge.ts |
| [languages.json](.data/micro-mutations/survivors/languages.json) | 90 | packages/dod-guard/src/cover/languages.ts |
| [manual.json](.data/micro-mutations/survivors/manual.json) | 12 | packages/dod-guard/src/manual.ts |
| [markers.json](.data/micro-mutations/survivors/markers.json) | 5 | packages/dod-guard/src/cover/markers.ts |
| [notify.json](.data/micro-mutations/survivors/notify.json) | 8 | packages/dod-guard/src/notify.ts |
| [observability.json](.data/micro-mutations/survivors/observability.json) | 453 | packages/dod-guard/src/observability.ts |
| [operations.json](.data/micro-mutations/survivors/operations.json) | 185 | packages/gitevo/src/operations.ts |
| [orchestrate.json](.data/micro-mutations/survivors/orchestrate.json) | 85 | packages/evomcp/src/orchestrate.ts |
| [orchestrator.json](.data/micro-mutations/survivors/orchestrator.json) | 35 | packages/evomcp/src/orchestrator.ts |
| [package-dir.json](.data/micro-mutations/survivors/package-dir.json) | 10 | packages/dod-guard/src/cover/package-dir.ts |
| [parser.json](.data/micro-mutations/survivors/parser.json) | 179 | packages/dod-guard/src/parser.ts |
| [prompts.json](.data/micro-mutations/survivors/prompts.json) | 105 | packages/evomcp/src/prompts.ts |
| [reachability.json](.data/micro-mutations/survivors/reachability.json) | 12 | packages/dod-guard/src/cover/reachability.ts |
| [regenerate-dod.json](.data/micro-mutations/survivors/regenerate-dod.json) | 40 | packages/dod-guard/src/openspec/regenerate-dod.ts |
| [regression.json](.data/micro-mutations/survivors/regression.json) | 4 | packages/dod-guard/src/regression.ts |
| [render.json](.data/micro-mutations/survivors/render.json) | 41 | packages/evomcp/src/render.ts |
| [requirements.json](.data/micro-mutations/survivors/requirements.json) | 43 | packages/dod-guard/src/openspec/requirements.ts |
| [run.json](.data/micro-mutations/survivors/run.json) | 8 | packages/dod-guard/src/cover/run.ts |
| [shell.json](.data/micro-mutations/survivors/shell.json) | 8 | packages/dod-guard/src/shell.ts |
| [snapshot.json](.data/micro-mutations/survivors/snapshot.json) | 28 | packages/dod-guard/src/snapshot.ts |
| [solve-attempt.json](.data/micro-mutations/survivors/solve-attempt.json) | 3 | packages/evomcp/src/solve-attempt.ts |
| [solve-files.json](.data/micro-mutations/survivors/solve-files.json) | 13 | packages/evomcp/src/solve-files.ts |
| [solve-repair.json](.data/micro-mutations/survivors/solve-repair.json) | 2 | packages/evomcp/src/solve-repair.ts |
| [solve-report.json](.data/micro-mutations/survivors/solve-report.json) | 1 | packages/evomcp/src/solve-report.ts |
| [solve.json](.data/micro-mutations/survivors/solve.json) | 98 | packages/evomcp/src/solve.ts |
| [spec-fixtures.json](.data/micro-mutations/survivors/spec-fixtures.json) | 7 | packages/dod-guard/src/testing/spec-fixtures.ts |
| [steps.json](.data/micro-mutations/survivors/steps.json) | 8 | packages/dod-guard/src/openspec/steps.ts |
| [store.json](.data/micro-mutations/survivors/store.json) | 59 | packages/dod-guard/src/store.ts |
| [tasks-parser.json](.data/micro-mutations/survivors/tasks-parser.json) | 47 | packages/dod-guard/src/openspec/tasks-parser.ts |
| [test-metrics.json](.data/micro-mutations/survivors/test-metrics.json) | 1323 | packages/dod-guard/src/test-metrics.ts |
| [trace.json](.data/micro-mutations/survivors/trace.json) | 16 | packages/dod-guard/src/openspec/trace.ts |
| [vault.json](.data/micro-mutations/survivors/vault.json) | 65 | packages/obsidian-rag/src/vault.ts |

## Exclusions

- `*.test.ts`
- `types.ts`
- `constants.ts`
- `schemas.ts`
— plus `skills/`, `standards/`, `dist/`, `node_modules/` directories

<!-- Generated by scripts/micro-mutations.mjs -->