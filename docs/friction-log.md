# Ratchet Skill Friction Log

Friction points encountered during ratchet workflow use. Feed into ratchet skill, dod-guard, and tool improvements.

## 2026-07-12 — Monorepo Cleanup (DoD: 2d224f81)

### Phase A Setup

| # | Friction | Root Cause | Suggested Fix |
|---|----------|------------|---------------|
| 1 | `packages/*/src/` glob fails on Windows cmd.exe (os error 123) | cmd doesn't expand globs in args — passthrough to biome | Ratchet skill: warn about Windows globs. Use explicit paths. |
| 2 | Empty `command: ""` with manual/review predicate fails dod_check (exit -1 "no command") | checker.ts rejects empty commands regardless of predicate type | checker.ts: skip empty commands for manual/review predicates |
| 3 | `npm test` output_contains "tests pass" never matches — Node test runner doesn't print that | Mismatch between expected and actual test output format | Skill docs: note Node runner uses exit_code only |
| 4 | `dod_create` with `dod_id` param creates new DoD instead of updating existing | dod_create doesn't support update mode | Either support update or error on conflicting params |
| 5 | AskUserQuestion max 4 options per question | API validation limit | Ratchet triage template: use max 4 options |
| 6 | `memory_recall` requires `vault_select` first — no auto-select | No last-vault tracking in obsidian-rag | Consider auto-select or remember last vault |
| 7 | `skip_reasons` not updatable on existing DoD after creation | dod_amend only works on individual proof nodes, not DoD metadata | Extend dod_amend for DoD-level metadata updates |

### Phase B Loop

(to be filled during execution)

### Dod-Guard Issues Uncovered

| # | Issue | File | Fix Needed |
|---|-------|------|------------|
| 1 | `command-check.ts` validates commands exist on Windows but doesn't account for glob expansion differences | `packages/dod-guard/src/command-check.ts` | Add glob detection + Windows warning |
| 2 | `checker.ts`: empty string commands fail even for manual/review predicates | `packages/dod-guard/src/checker.ts` | Gate: `if (!cmd && pred.type !== "manual" && pred.type !== "review")` |
| 3 | `dod_create` ignores `dod_id` parameter — silently creates new DoD | `packages/dod-guard/src/index.ts` | Validate: either dod_id XOR creation params |

| 15 | `/loop` without prompt shows usage, doesn't enter dynamic mode — ratchet skill says "run `/loop`" but actual command requires `/loop <prompt>` | `/loop` expects a prompt argument; empty invocation prints help | Ratchet skill: update A.8 message to `/loop ratchet-phase-b` or similar. Or update /loop to enter dynamic mode with no prompt. |
| 16 | `handleDodCreate` return type mismatch — unwrapped `osError.content[0].text` but osError is MCP result `{content: [{type:"text", text: "..."}]}` | Handler extraction copied inline logic but return shape differs between inline return and wrapper function | Keep tool-specific return shapes in wrapper, not extracted handler |
| 17 | Biome `--write` skips "unsafe" fixes (unused imports) by default — unused import removal requires `--unsafe` flag | Biome classifies import removal as unsafe since it can cause side-effect losses | Add `--unsafe` or manually remove unused imports after extraction |

### Evomcp Issues

None yet.

### Gitevo Issues

| # | Issue | File | Fix Needed |
|---|-------|------|------------|
| 1 | `evo_spawn` rejects when tree dirty — must commit before spawning | `packages/gitevo/src/operations.ts` | Document or auto-stash in spawn |

### Obsidian-Rag Issues

| # | Issue | File | Fix Needed |
|---|-------|------|------------|
| 1 | No auto-select of last-used vault — `memory_recall` fails without explicit `vault_select` | `packages/obsidian-rag/src/index.ts` | Track last vault in store, auto-select on recall if unset |
