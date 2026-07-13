# Evaluation Report — obsidian-rag v0.1.16

**Evaluated**: 2026-07-13 10:06–10:18 CEST
**Verdict**: 🟢 **SHIP** — all findings fixed. 114/114 tests pass. 95% coverage.

## Fixed since initial evaluation

| Severity | Bug | Fix | File |
|----------|-----|-----|------|
| P0 | Path traversal — `writeNote(../../evil.md)` escapes vault | `resolveContained()` guard on `readNote`, `readNoteMeta`, `writeNote` | `vault.ts:9-18,52,62,75` |
| P1 | FTS5 operator crash — `search("OR")` → syntax error | `sanitizeQuery()` quotes boolean operators, handles empty string, strips bare `*` | `store.ts:17-33,262` |
| P2 | c8 coverage reported 0% | `--include="src/*.ts"` → `--src="src"` (glob mismatch with sourcemaps) | `package.json:23` |

## Tool matrix (13 tools) — post-fix

| # | Tool | Verdict |
|---|------|---------|
| 1 | `vault_list` | PASS |
| 2 | `vault_select` | PASS |
| 3 | `index_status` | PASS |
| 4 | `reindex` | PASS |
| 5 | `list_notes` | PASS |
| 6 | `read_note` | PASS (traversal guard added) |
| 7 | `search_notes` | PASS (FTS operators now safe, empty query handled) |
| 8 | `get_links` | PASS |
| 9 | `get_tags` | PASS |
| 10 | `create_note` | PASS (traversal guard added) |
| 11 | `memory_save` | PASS |
| 12 | `memory_recall` | PASS |
| 13 | `memory_list` | PASS |

## Tests added (coverage gaps closed)

| Gap | Tests |
|-----|-------|
| Path traversal | `rejects ../ traversal (write)`, `rejects ..\\ traversal`, `rejects nested ../ (read)`, `allows safe paths` — `vault.test.ts` |
| FTS operator sanitization | 9 tests: empty query, whitespace-only, AND, OR, NOT, NEAR, quotes, parentheses, mixed — `store.test.ts` |
| Empty query | `handles empty query without crashing`, `handles whitespace-only` — `store.test.ts` |

**Gaps deferred**: CLI fallback paths (needs Obsidian installed), embedding pipeline (needs `@xenova/transformers`), MCP-tool-level `overwrite: false` / `append` (needs full server integration test). These are integration-level gaps; unit coverage is solid.

## Coverage

```
File        | % Stmts | % Branch | % Funcs | % Lines
------------|---------|----------|---------|---------
 cli.ts     |   89.59 |    86.66 |   93.33 |   89.59
 store.ts   |   91.43 |    79.72 |      88 |   91.43
 vault.ts   |   97.63 |    78.26 |     100 |   97.63
 indexer.ts |   97.05 |    96.29 |     100 |   97.05
All files   |   95.04 |    87.89 |   91.11 |   95.04
```

Uncovered lines are legitimate: `loadBetterSqlite3` auto-bootstrap (only runs when native addon missing), `getVaultByPath` (same semantics as `getVault`), Obsidian CLI paths.

## Isolation proof

`~/.claude/obsidian-rag/obsidian-rag.db` — mtime and size unchanged. Zero writes during eval.
