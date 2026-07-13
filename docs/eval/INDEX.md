# Code Review — Full Monorepo Audit

**Date**: 2026-07-13  
**Scope**: All 4 packages, all source files (not limited to recent diffs)  
**Effort**: max  
**Total findings**: 15 (7 CRITICAL, 4 HIGH, 4 MEDIUM)

---

## By Package

| Package | CRITICAL | HIGH | MEDIUM | Total |
|---------|----------|------|--------|-------|
| [dod-guard](./dod-guard.md) | 2 | 2 | 0 | 4 |
| [evomcp](./evomcp.md) | 3 | 0 | 1 | 4 |
| [gitevo](./gitevo.md) | 2 | 0 | 1 | 3 |
| [obsidian-rag](./obsidian-rag.md) | 0 | 2 | 2 | 4 |

## By Severity

### CRITICAL (7)

1. **evomcp: evolution loop is a no-op** — `saveState` (git stash) reverts tree before `runCommand`, fitness measured on baseline, never on mutated code
2. **evomcp: elite stores fitness output as "code"** — test output injected as example source code in mutation prompts
3. **evomcp: captureDiff misses all changes** — `git diff` (unstaged) misses staged/committed changes; claude told to commit
4. **dod-guard: `require("node:fs")` in ESM** — `assertions.ts` line 149 throws ReferenceError, glob-based file discovery silently broken
5. **dod-guard: `require("node:fs")` in ESM** — `observability.ts` lines 562,569 same bug, same impact
6. **gitevo: dead tag before reset** — `evo_abandon` creates dead tag before `git reset --hard`, partial state if reset fails
7. **gitevo: filesRemovedByCheckout swallows all errors** — returns `[]` on any git failure, safety checks falsified

### HIGH (4)

8. **dod-guard: path-prefix bug** — `carryForwardDrafts` `startsWith` conflates `"0.children.1"` with `"0.children.10"`
9. **dod-guard: same path-prefix bug** — `updateDocFromCheckResult` corrupts persisted status for nodes outside scoped subtree
10. **obsidian-rag: vault_select re-throws** — error propagates as unhandled rejection instead of MCP `isError` response
11. **obsidian-rag: URI parsing breaks on "notes"** — `split("/notes/")` fails when path segment is literally "notes"

### MEDIUM (4)

12. **gitevo: evo_learn after destructive reset** — lesson lost if getRepo fails post-reset
13. **obsidian-rag: oversize chunks** — first section always appended whole regardless of length
14. **obsidian-rag: LIKE pattern overmatch** — directory filter matches unintended subdirectories
15. **evomcp: matchSimple incomplete escaping** — only escapes `.` and `*`, other regex metachars pass through

## Verification Method

All findings verified by reading actual source files and quoting exact lines. Verification agent results inline in per-package reports.
