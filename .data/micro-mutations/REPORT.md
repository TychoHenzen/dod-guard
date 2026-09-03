# Micro-Mutation Report

**Generated**: 2026-09-03 | **Commit**: `f71897e`

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 28386 |
| Killed | 11352 |
| Missed | 8663 |
| Timeout | 132 |
| No coverage | 8239 |
| Catch rate | 40.0% |
| Runs | 182 |
| Files tested | 182 |

**Last run**: 2026-09-03 — `packages/code-explorer/src/discovery/pipeline.ts` → ok

## File Inventory

| Prio | File | Lines | Churn | Stale | Dirty | Last Tested | Result | Status |
|------|------|-------|-------|-------|-------|-------------|--------|--------|
| 93% | packages/code-explorer/src/semantic/language-adapter.ts | 145 | 4 | 90d | 🟡 | — | — | ⬜ |
| 92% | packages/code-explorer/src/navigation/session.ts | 233 | 3 | 90d | 🟡 | — | — | ⬜ |
| 92% | packages/code-explorer/src/browser-server/lifecycle.ts | 228 | 3 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/quality-guard/src/commit-gate/snapshot.ts | 108 | 4 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/code-explorer/src/discovery/classification.ts | 176 | 3 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/code-explorer/src/browser-server/http-router.ts | 271 | 2 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/quality-guard/src/commit-gate/decision-core.ts | 162 | 3 | 90d | 🟡 | — | — | ⬜ |
| 91% | packages/quality-guard/src/commit-gate/dependency.ts | 155 | 3 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/code-explorer/src/semantic/adapter-selection.ts | 327 | 1 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/quality-guard/src/commit-gate/placement.ts | 118 | 3 | 90d | 🟡 | — | — | ⬜ |
| 90% | packages/code-explorer/src/browser/relations.ts | 113 | 3 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/code-explorer/src/navigation/focus-view.ts | 110 | 3 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/code-explorer/src/discovery/matcher.ts | 177 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/quality-guard/src/commit-gate/encapsulation.ts | 170 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/quality-guard/src/commit-gate/refactor-progress.ts | 157 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/code-explorer/src/browser/graph.ts | 146 | 2 | 90d | 🟡 | — | — | ⬜ |
| 89% | packages/quality-guard/src/commit-gate/responsibility-map.ts | 144 | 2 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/quality-guard/src/commit-gate/config.ts | 138 | 2 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/code-explorer/src/semantic/runtime-lsp-backend.ts | 132 | 2 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/code-explorer/src/semantic/native-backend-inspector.ts | 129 | 2 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/code-explorer/src/browser/discovery.ts | 127 | 2 | 90d | 🟡 | — | — | ⬜ |
| 88% | packages/code-explorer/src/semantic/backend-result-validator.ts | 125 | 2 | 90d | 🟡 | — | — | ⬜ |
| 87% | packages/code-explorer/src/navigation/error.ts | 109 | 2 | 90d | 🟡 | — | — | ⬜ |
| 87% | packages/code-explorer/src/browser/app.ts | 87 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/fossil/src/testing/performance.ts | 126 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/code-explorer/src/semantic/filtered-workspace.ts | 75 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/fossil/src/testing/fixtures.ts | 122 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/dod-guard/src/complete/task-guard.ts | 120 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/fossil/src/fossil-scoring-core.ts | 117 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/quality-guard/src/report.ts | 116 | 1 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/dod-guard/src/complete/stub-check.ts | 69 | 2 | 90d | 🟡 | — | — | ⬜ |
| 86% | packages/code-explorer/src/browser/freshness.ts | 111 | 1 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/code-explorer/src/browser/focus-navigation.ts | 65 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/code-explorer/src/semantic/root-access.ts | 62 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/code-explorer/src/browser/session.ts | 58 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/code-explorer/src/testing/fake-semantic-adapter.ts | 56 | 2 | 90d | 🟡 | — | — | ⬜ |
| 85% | packages/code-explorer/src/navigation/resource-limits.ts | 86 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/code-explorer/src/browser/source.ts | 85 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/code-explorer/src/freshness/project-generation-scheduler.ts | 44 | 2 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/code-explorer/src/browser/graph-navigation.ts | 69 | 1 | 90d | 🟡 | — | — | ⬜ |
| 84% | packages/quality-guard/src/commit-gate/acknowledgements.ts | 41 | 2 | 90d | 🟡 | — | — | ⬜ |
| 83% | packages/code-explorer/src/semantic/semantic-authority.ts | 56 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/quality-guard/src/commit-gate/facts.ts | 30 | 2 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/quality-guard/src/commit-gate/fingerprint.ts | 28 | 2 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/code-explorer/src/browser/history.ts | 46 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/code-explorer/src/discovery/sensitive-paths.ts | 42 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/code-explorer/src/semantic/file-analysis-state.ts | 42 | 1 | 90d | 🟡 | — | — | ⬜ |
| 82% | packages/fossil/src/fossil-report-table.ts | 41 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/code-explorer/src/browser/states.ts | 38 | 1 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/quality-guard/src/commit-gate/architecture-facts.d.ts | 22 | 2 | 90d | 🟡 | — | — | ⬜ |
| 81% | packages/code-explorer/src/semantic/native-lsp-process.ts | 34 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/complete/scenario-text.ts | 27 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/dod-guard/src/lock/run.ts | 27 | 1 | 90d | 🟡 | — | — | ⬜ |
| 80% | packages/code-explorer/src/semantic/backend-status.ts | 24 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/code-explorer/src/browser/client.ts | 21 | 1 | 90d | 🟡 | — | — | ⬜ |
| 79% | packages/quality-guard/src/commit-gate/current-architecture.ts | 21 | 1 | 90d | 🟡 | — | — | ⬜ |
| 78% | packages/code-explorer/src/discovery/config-path.ts | 18 | 1 | 90d | 🟡 | — | — | ⬜ |
| 76% | packages/fossil/src/analysis-error.ts | 9 | 1 | 90d | 🟡 | — | — | ⬜ |
| 63% | packages/code-explorer/src/index.ts | 834 | 17 | 3d | 🟡 | 2026-08-31 | 0/0 killed | ❌ |
| 61% | packages/dod-guard/src/cli.ts | 140 | 17 | 11d | 🟡 | 2026-08-23 | 61/75 killed | ⚠️ |
| 60% | packages/dod-guard/src/cover/run.ts | 109 | 11 | 11d | 🟡 | 2026-08-23 | 56/83 killed | ⚠️ |
| 57% | packages/dod-guard/src/index.ts | 50 | 42 | 11d | 🟡 | 2026-08-23 | 13/46 killed | ⚠️ |
| 53% | packages/quality-guard/src/index.ts | 177 | 6 | 10d | 🟡 | 2026-08-24 | 10/82 killed | ⚠️ |
| 52% | packages/dod-guard/src/openspec/tasks-parser.ts | 120 | 4 | 19d | 🟡 | 2026-08-15 | 129/184 killed | ⚠️ |
| 50% | packages/dod-guard/src/cover/markers.ts | 67 | 4 | 18d | 🟡 | 2026-08-16 | 31/37 killed | ⚠️ |
| 47% | packages/fossil/src/workspace-debris.ts | 294 | 10 | 9d | — | 2026-08-25 | 278/419 killed | ⚠️ |
| 41% | packages/dod-guard/src/cover/languages.ts | 221 | 7 | 10d | — | 2026-08-24 | 290/467 killed | ⚠️ |
| 40% | packages/dod-guard/src/cover/report.ts | 114 | 8 | 10d | — | 2026-08-24 | 35/43 killed | ⚠️ |
| 38% | packages/fossil/src/git-process.ts | 221 | 6 | 9d | — | 2026-08-25 | 148/235 killed | ⚠️ |
| 35% | packages/dod-guard/src/openspec/requirements.ts | 90 | 3 | 20d | — | 2026-08-14 | 45/94 killed | ⚠️ |
| 34% | packages/fossil/src/reference-analysis-core.ts | 871 | 1 | 9d | — | 2026-08-25 | 10/1462 killed | ⚠️ |
| 33% | packages/code-explorer/src/semantic/direct-lsp-semantic.ts | 433 | 4 | 2d | — | 2026-09-01 | 382/638 killed | ⚠️ |
| 33% | packages/dod-guard/src/cover/baseline.ts | 65 | 3 | 19d | — | 2026-08-15 | 39/46 killed | ⚠️ |
| 33% | packages/code-explorer/src/semantic/project-root.ts | 218 | 5 | 3d | — | 2026-08-31 | 133/253 killed | ⚠️ |
| 33% | packages/dod-guard/src/openspec/glob.ts | 70 | 3 | 18d | — | 2026-08-16 | 42/63 killed | ⚠️ |
| 33% | packages/code-explorer/src/semantic/direct-lsp.ts | 398 | 4 | 2d | — | 2026-09-01 | 393/605 killed | ⚠️ |
| 32% | packages/code-explorer/src/freshness/workspace-freshness.ts | 310 | 4 | 3d | — | 2026-08-31 | 86/248 killed | ⚠️ |
| 32% | packages/quality-guard/src/commit-gate/cli.ts | 339 | 4 | 2d | — | 2026-09-01 | 177/465 killed | ⚠️ |
| 31% | packages/dod-guard/src/openspec/fetch-instructions.ts | 50 | 3 | 17d | — | 2026-08-17 | 11/15 killed | ⚠️ |
| 31% | packages/fossil/src/git-history-core.ts | 492 | 1 | 8d | — | 2026-08-26 | 5/645 killed | ⚠️ |
| 30% | packages/code-explorer/src/semantic/contract.ts | 158 | 5 | 1d | — | 2026-09-02 | 29/68 killed | ⚠️ |
| 30% | packages/fossil/src/fossil-cli-core.ts | 268 | 2 | 8d | — | 2026-08-26 | 0/294 killed | ⚠️ |
| 30% | packages/dod-guard/src/complete/run.ts | 156 | 3 | 7d | — | 2026-08-27 | 46/140 killed | ⚠️ |
| 29% | packages/code-explorer/src/discovery/landmarks.ts | 204 | 4 | 1d | — | 2026-09-02 | 160/198 killed | ⚠️ |
| 29% | packages/fossil/src/repository-analysis.ts | 332 | 1 | 8d | — | 2026-08-26 | 72/270 killed | ⚠️ |
| 29% | packages/code-explorer/src/semantic/python-mirror-runtime.ts | 322 | 3 | 1d | — | 2026-09-02 | 213/360 killed | ⚠️ |
| 29% | packages/dod-guard/src/cover/enumerate.ts | 63 | 2 | 16d | — | 2026-08-18 | 26/29 killed | ⚠️ |
| 29% | packages/dod-guard/src/shell.ts | 51 | 2 | 17d | — | 2026-08-17 | 13/36 killed | ⚠️ |
| 28% | packages/code-explorer/src/semantic/runtime-bootstrap.ts | 183 | 4 | 0d | — | 2026-09-03 | 12/169 killed | ⚠️ |
| 28% | packages/code-explorer/src/semantic/backend-launch-policy.ts | 496 | 2 | 0d | — | 2026-09-03 | 410/721 killed | ⚠️ |
| 28% | packages/dod-guard/src/cover/package-dir.ts | 27 | 3 | 17d | — | 2026-08-17 | 7/17 killed | ⚠️ |
| 28% | packages/fossil/src/output.ts | 3 | 11 | 7d | — | 2026-08-27 | 0/0 killed | ⚠️ |
| 28% | packages/code-explorer/src/discovery/pipeline.ts | 160 | 4 | 0d | — | 2026-09-03 | 59/146 killed | ⚠️ |
| 28% | packages/dod-guard/src/testing/spec-fixtures.ts | 46 | 2 | 16d | — | 2026-08-18 | 11/43 killed | ⚠️ |
| 28% | packages/dod-guard/src/cover/plan-checks.ts | 84 | 1 | 15d | — | 2026-08-19 | 51/73 killed | ⚠️ |
| 27% | packages/quality-guard/src/scanner.ts | 68 | 1 | 15d | — | 2026-08-19 | 47/56 killed | ⚠️ |
| 27% | packages/fossil/src/fossil-output-core.ts | 201 | 1 | 7d | — | 2026-08-27 | 20/186 killed | ⚠️ |
| 26% | packages/dod-guard/src/cover/test-globs.ts | 38 | 2 | 14d | — | 2026-08-20 | 29/38 killed | ⚠️ |
| 26% | packages/fossil/src/fossil-grader.ts | 2 | 12 | 6d | — | 2026-08-28 | 0/0 killed | ⚠️ |
| 26% | packages/fossil/src/git-analyzer.ts | 2 | 24 | 6d | — | 2026-08-28 | 0/0 killed | ⚠️ |
| 26% | packages/fossil/src/index.ts | 2 | 10 | 6d | — | 2026-08-28 | 0/0 killed | ⚠️ |
| 26% | packages/fossil/src/ref-analyzer.ts | 2 | 20 | 5d | — | 2026-08-29 | 0/0 killed | ⚠️ |
| 25% | packages/dod-guard/src/complete/ollama.ts | 105 | 2 | 5d | — | 2026-08-29 | 30/76 killed | ⚠️ |
| 25% | packages/dod-guard/src/mcp-tools.ts | 94 | 2 | 5d | — | 2026-08-29 | 17/70 killed | ⚠️ |
| 24% | packages/quality-guard/src/skips.ts | 42 | 1 | 14d | — | 2026-08-20 | 33/41 killed | ⚠️ |
| 24% | packages/dod-guard/src/cover/test-runners.ts | 25 | 2 | 14d | — | 2026-08-20 | 4/29 killed | ⚠️ |
| 20% | packages/dod-guard/src/openspec/scenario-id.ts | 16 | 1 | 13d | — | 2026-08-21 | 2/2 killed | ✅ |
| 19% | packages/dod-guard/src/testing/capture-io.ts | 11 | 1 | 13d | — | 2026-08-21 | 10/11 killed | ⚠️ |
| 18% | packages/dod-guard/src/openspec/scenario-block.ts | 10 | 1 | 13d | — | 2026-08-21 | 0/0 killed | ⚠️ |
| 17% | packages/dod-guard/src/openspec/dependency.ts | 9 | 1 | 12d | — | 2026-08-22 | 0/0 killed | ⚠️ |
| 17% | packages/dod-guard/src/openspec/requirement-block.ts | 9 | 1 | 12d | — | 2026-08-22 | 0/0 killed | ⚠️ |
| 14% | packages/dod-guard/src/runtime-root.ts | 4 | 1 | 12d | — | 2026-08-22 | 2/2 killed | ✅ |

## Recent Runs

| Date | Commit | File | Mutants | Killed | Missed | Status |
|------|--------|------|---------|--------|--------|--------|
| 2026-09-03 | `f71897e` | packages/code-explorer/src/discovery/pipeline.ts | 146 | 59 | 63 | ok |
| 2026-09-03 | `f71897e` | packages/code-explorer/src/semantic/backend-launch-policy.ts | 721 | 410 | 217 | ok |
| 2026-09-03 | `f71897e` | packages/code-explorer/src/semantic/runtime-bootstrap.ts | 169 | 12 | 27 | ok |
| 2026-09-02 | `96551fe` | packages/code-explorer/src/semantic/python-mirror-runtime.ts | 360 | 213 | 110 | ok |
| 2026-09-02 | `96551fe` | packages/code-explorer/src/discovery/landmarks.ts | 198 | 160 | 22 | ok |
| 2026-09-02 | `96551fe` | packages/code-explorer/src/semantic/contract.ts | 68 | 29 | 34 | ok |
| 2026-09-01 | `14104b5` | packages/quality-guard/src/commit-gate/cli.ts | 465 | 177 | 155 | ok |
| 2026-09-01 | `14104b5` | packages/code-explorer/src/semantic/direct-lsp.ts | 605 | 393 | 165 | ok |
| 2026-09-01 | `14104b5` | packages/code-explorer/src/semantic/direct-lsp-semantic.ts | 638 | 382 | 192 | ok |
| 2026-08-31 | `ebdb26a` | packages/code-explorer/src/freshness/workspace-freshness.ts | 248 | 86 | 32 | ok |
| 2026-08-31 | `ebdb26a` | packages/code-explorer/src/semantic/project-root.ts | 253 | 133 | 61 | ok |
| 2026-08-31 | `ebdb26a` | packages/code-explorer/src/index.ts | 0 | 0 | 0 | error |
| 2026-08-29 | `939f04b` | packages/dod-guard/src/mcp-tools.ts | 70 | 17 | 29 | ok |
| 2026-08-29 | `939f04b` | packages/dod-guard/src/complete/ollama.ts | 76 | 30 | 24 | ok |
| 2026-08-29 | `939f04b` | packages/fossil/src/ref-analyzer.ts | 0 | 0 | 0 | ok |
| 2026-08-28 | `d1740ad` | packages/fossil/src/index.ts | 0 | 0 | 0 | ok |
| 2026-08-28 | `d1740ad` | packages/fossil/src/git-analyzer.ts | 0 | 0 | 0 | ok |
| 2026-08-28 | `d1740ad` | packages/fossil/src/fossil-grader.ts | 0 | 0 | 0 | ok |
| 2026-08-27 | `c7b6d86` | packages/fossil/src/fossil-output-core.ts | 186 | 20 | 7 | ok |
| 2026-08-27 | `c7b6d86` | packages/fossil/src/output.ts | 0 | 0 | 0 | ok |
| 2026-08-27 | `c7b6d86` | packages/dod-guard/src/complete/run.ts | 140 | 46 | 45 | ok |
| 2026-08-26 | `d9cea9a` | packages/fossil/src/repository-analysis.ts | 270 | 72 | 100 | ok |
| 2026-08-26 | `d9cea9a` | packages/fossil/src/fossil-cli-core.ts | 294 | 0 | 0 | ok |
| 2026-08-26 | `d9cea9a` | packages/fossil/src/git-history-core.ts | 645 | 5 | 5 | ok |
| 2026-08-25 | `1ca07c7` | packages/fossil/src/reference-analysis-core.ts | 1462 | 10 | 92 | ok |
| 2026-08-25 | `1ca07c7` | packages/fossil/src/git-process.ts | 235 | 148 | 48 | ok |
| 2026-08-25 | `1ca07c7` | packages/fossil/src/workspace-debris.ts | 419 | 278 | 105 | ok |
| 2026-08-24 | `5eb764e` | packages/quality-guard/src/index.ts | 82 | 10 | 41 | ok |
| 2026-08-24 | `5eb764e` | packages/dod-guard/src/cover/languages.ts | 467 | 290 | 172 | ok |
| 2026-08-24 | `5eb764e` | packages/dod-guard/src/cover/report.ts | 43 | 35 | 5 | ok |

## Survivor Reports

Per-file survivor JSON with mutator type, line number, and replacement.
Use these to identify weak tests and add targeted assertions.

| File | Survivors | Source |
|------|-----------|--------|
| [agent.json](.data/micro-mutations/survivors/agent.json) | 130 | packages/evomcp/src/agent.ts |
| [assertions.json](.data/micro-mutations/survivors/assertions.json) | 215 | packages/dod-guard/src/assertions.ts |
| [attempt-result.json](.data/micro-mutations/survivors/attempt-result.json) | 1 | packages/evomcp/src/attempt-result.ts |
| [author.json](.data/micro-mutations/survivors/author.json) | 196 | packages/dod-guard/src/author.ts |
| [backend-launch-policy.json](.data/micro-mutations/survivors/backend-launch-policy.json) | 217 | packages/code-explorer/src/semantic/backend-launch-policy.ts |
| [baseline.json](.data/micro-mutations/survivors/baseline.json) | 7 | packages/dod-guard/src/cover/baseline.ts |
| [brevity.json](.data/micro-mutations/survivors/brevity.json) | 143 | packages/dod-guard/src/brevity.ts |
| [budget.json](.data/micro-mutations/survivors/budget.json) | 36 | packages/evomcp/src/budget.ts |
| [capture-io.json](.data/micro-mutations/survivors/capture-io.json) | 1 | packages/dod-guard/src/testing/capture-io.ts |
| [checkability.json](.data/micro-mutations/survivors/checkability.json) | 6 | packages/dod-guard/src/openspec/checkability.ts |
| [checker-leaves.json](.data/micro-mutations/survivors/checker-leaves.json) | 12 | packages/dod-guard/src/checker-leaves.ts |
| [checker.json](.data/micro-mutations/survivors/checker.json) | 214 | packages/dod-guard/src/checker.ts |
| [cli.json](.data/micro-mutations/survivors/cli.json) | 155 | packages/quality-guard/src/commit-gate/cli.ts |
| [command-check.json](.data/micro-mutations/survivors/command-check.json) | 122 | packages/dod-guard/src/command-check.ts |
| [context.json](.data/micro-mutations/survivors/context.json) | 123 | packages/evomcp/src/context.ts |
| [contract.json](.data/micro-mutations/survivors/contract.json) | 34 | packages/code-explorer/src/semantic/contract.ts |
| [convergence.json](.data/micro-mutations/survivors/convergence.json) | 38 | packages/evomcp/src/convergence.ts |
| [convert.json](.data/micro-mutations/survivors/convert.json) | 9 | packages/dod-guard/src/openspec/convert.ts |
| [dedup.json](.data/micro-mutations/survivors/dedup.json) | 87 | packages/evomcp/src/dedup.ts |
| [degenerate.json](.data/micro-mutations/survivors/degenerate.json) | 160 | packages/evomcp/src/degenerate.ts |
| [direct-lsp-semantic.json](.data/micro-mutations/survivors/direct-lsp-semantic.json) | 192 | packages/code-explorer/src/semantic/direct-lsp-semantic.ts |
| [direct-lsp.json](.data/micro-mutations/survivors/direct-lsp.json) | 165 | packages/code-explorer/src/semantic/direct-lsp.ts |
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
| [fossil-output-core.json](.data/micro-mutations/survivors/fossil-output-core.json) | 7 | packages/fossil/src/fossil-output-core.ts |
| [gates.json](.data/micro-mutations/survivors/gates.json) | 49 | packages/evomcp/src/gates.ts |
| [git-history-core.json](.data/micro-mutations/survivors/git-history-core.json) | 5 | packages/fossil/src/git-history-core.ts |
| [git-process.json](.data/micro-mutations/survivors/git-process.json) | 48 | packages/fossil/src/git-process.ts |
| [glob.json](.data/micro-mutations/survivors/glob.json) | 20 | packages/dod-guard/src/openspec/glob.ts |
| [import-dod.json](.data/micro-mutations/survivors/import-dod.json) | 16 | packages/dod-guard/src/openspec/import-dod.ts |
| [index.json](.data/micro-mutations/survivors/index.json) | 41 | packages/quality-guard/src/index.ts |
| [indexer.json](.data/micro-mutations/survivors/indexer.json) | 60 | packages/obsidian-rag/src/indexer.ts |
| [judge.json](.data/micro-mutations/survivors/judge.json) | 91 | packages/evomcp/src/judge.ts |
| [landmarks.json](.data/micro-mutations/survivors/landmarks.json) | 22 | packages/code-explorer/src/discovery/landmarks.ts |
| [languages.json](.data/micro-mutations/survivors/languages.json) | 172 | packages/dod-guard/src/cover/languages.ts |
| [manual.json](.data/micro-mutations/survivors/manual.json) | 12 | packages/dod-guard/src/manual.ts |
| [markers.json](.data/micro-mutations/survivors/markers.json) | 5 | packages/dod-guard/src/cover/markers.ts |
| [mcp-tools.json](.data/micro-mutations/survivors/mcp-tools.json) | 29 | packages/dod-guard/src/mcp-tools.ts |
| [notify.json](.data/micro-mutations/survivors/notify.json) | 8 | packages/dod-guard/src/notify.ts |
| [observability.json](.data/micro-mutations/survivors/observability.json) | 453 | packages/dod-guard/src/observability.ts |
| [ollama.json](.data/micro-mutations/survivors/ollama.json) | 24 | packages/dod-guard/src/complete/ollama.ts |
| [operations.json](.data/micro-mutations/survivors/operations.json) | 185 | packages/gitevo/src/operations.ts |
| [orchestrate.json](.data/micro-mutations/survivors/orchestrate.json) | 85 | packages/evomcp/src/orchestrate.ts |
| [orchestrator.json](.data/micro-mutations/survivors/orchestrator.json) | 35 | packages/evomcp/src/orchestrator.ts |
| [package-dir.json](.data/micro-mutations/survivors/package-dir.json) | 10 | packages/dod-guard/src/cover/package-dir.ts |
| [parser.json](.data/micro-mutations/survivors/parser.json) | 179 | packages/dod-guard/src/parser.ts |
| [pipeline.json](.data/micro-mutations/survivors/pipeline.json) | 63 | packages/code-explorer/src/discovery/pipeline.ts |
| [plan-checks.json](.data/micro-mutations/survivors/plan-checks.json) | 21 | packages/dod-guard/src/cover/plan-checks.ts |
| [project-root.json](.data/micro-mutations/survivors/project-root.json) | 61 | packages/code-explorer/src/semantic/project-root.ts |
| [prompts.json](.data/micro-mutations/survivors/prompts.json) | 105 | packages/evomcp/src/prompts.ts |
| [python-mirror-runtime.json](.data/micro-mutations/survivors/python-mirror-runtime.json) | 110 | packages/code-explorer/src/semantic/python-mirror-runtime.ts |
| [reachability.json](.data/micro-mutations/survivors/reachability.json) | 12 | packages/dod-guard/src/cover/reachability.ts |
| [reference-analysis-core.json](.data/micro-mutations/survivors/reference-analysis-core.json) | 92 | packages/fossil/src/reference-analysis-core.ts |
| [regenerate-dod.json](.data/micro-mutations/survivors/regenerate-dod.json) | 40 | packages/dod-guard/src/openspec/regenerate-dod.ts |
| [regression.json](.data/micro-mutations/survivors/regression.json) | 4 | packages/dod-guard/src/regression.ts |
| [render.json](.data/micro-mutations/survivors/render.json) | 41 | packages/evomcp/src/render.ts |
| [report.json](.data/micro-mutations/survivors/report.json) | 5 | packages/dod-guard/src/cover/report.ts |
| [repository-analysis.json](.data/micro-mutations/survivors/repository-analysis.json) | 100 | packages/fossil/src/repository-analysis.ts |
| [requirements.json](.data/micro-mutations/survivors/requirements.json) | 43 | packages/dod-guard/src/openspec/requirements.ts |
| [run.json](.data/micro-mutations/survivors/run.json) | 45 | packages/dod-guard/src/complete/run.ts |
| [runtime-bootstrap.json](.data/micro-mutations/survivors/runtime-bootstrap.json) | 27 | packages/code-explorer/src/semantic/runtime-bootstrap.ts |
| [scanner.json](.data/micro-mutations/survivors/scanner.json) | 8 | packages/quality-guard/src/scanner.ts |
| [shell.json](.data/micro-mutations/survivors/shell.json) | 8 | packages/dod-guard/src/shell.ts |
| [skips.json](.data/micro-mutations/survivors/skips.json) | 7 | packages/quality-guard/src/skips.ts |
| [snapshot.json](.data/micro-mutations/survivors/snapshot.json) | 28 | packages/dod-guard/src/snapshot.ts |
| [solve-attempt.json](.data/micro-mutations/survivors/solve-attempt.json) | 3 | packages/evomcp/src/solve-attempt.ts |
| [solve-context.json](.data/micro-mutations/survivors/solve-context.json) | 11 | packages/evomcp/src/solve-context.ts |
| [solve-files.json](.data/micro-mutations/survivors/solve-files.json) | 13 | packages/evomcp/src/solve-files.ts |
| [solve-repair.json](.data/micro-mutations/survivors/solve-repair.json) | 2 | packages/evomcp/src/solve-repair.ts |
| [solve-report.json](.data/micro-mutations/survivors/solve-report.json) | 1 | packages/evomcp/src/solve-report.ts |
| [solve.json](.data/micro-mutations/survivors/solve.json) | 98 | packages/evomcp/src/solve.ts |
| [spec-fixtures.json](.data/micro-mutations/survivors/spec-fixtures.json) | 7 | packages/dod-guard/src/testing/spec-fixtures.ts |
| [steps.json](.data/micro-mutations/survivors/steps.json) | 8 | packages/dod-guard/src/openspec/steps.ts |
| [store.json](.data/micro-mutations/survivors/store.json) | 59 | packages/dod-guard/src/store.ts |
| [tasks-parser.json](.data/micro-mutations/survivors/tasks-parser.json) | 47 | packages/dod-guard/src/openspec/tasks-parser.ts |
| [test-globs.json](.data/micro-mutations/survivors/test-globs.json) | 7 | packages/dod-guard/src/cover/test-globs.ts |
| [test-metrics.json](.data/micro-mutations/survivors/test-metrics.json) | 1323 | packages/dod-guard/src/test-metrics.ts |
| [test-runners.json](.data/micro-mutations/survivors/test-runners.json) | 7 | packages/dod-guard/src/cover/test-runners.ts |
| [trace.json](.data/micro-mutations/survivors/trace.json) | 16 | packages/dod-guard/src/openspec/trace.ts |
| [vault.json](.data/micro-mutations/survivors/vault.json) | 65 | packages/obsidian-rag/src/vault.ts |
| [workspace-debris.json](.data/micro-mutations/survivors/workspace-debris.json) | 105 | packages/fossil/src/workspace-debris.ts |
| [workspace-freshness.json](.data/micro-mutations/survivors/workspace-freshness.json) | 32 | packages/code-explorer/src/freshness/workspace-freshness.ts |

## Exclusions

- `*.test.ts`
- `types.ts`
- `constants.ts`
- `schemas.ts`
— plus `skills/`, `standards/`, `dist/`, `node_modules/` directories

<!-- Generated by scripts/micro-mutations.mjs -->