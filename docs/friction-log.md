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

| # | Friction | Root Cause | Suggested Fix |
|---|----------|------------|---------------|
| 8 | code-review-graph dead_code ~50% false positive (8 of 14 flagged are actually used) | Graph parser can't distinguish internal module use from export-only use. Flags file-level constants used within same file. | Ratchet doc: always verify graph dead_code with grep before deleting. |
| 9 | Deleting source files leaves stale dist/*.js — tsc doesn't clean | tsc compiler only writes new files, doesn't remove old outputs from deleted sources | Add `rm -rf dist/ && tsc` to clean build step, or use `--build --clean` |
| 10 | Biome format errors after code deletion (checker.ts empty whitespace gap) | Manual sed line deletion leaves misaligned whitespace | Run `biome check --write` after every structural edit |
| 11 | `dod_refine` on already-concrete node silently errors | Node was already refined to concrete. Multiple obsidian-rag removals needed separate nodes. | Use `dod_add_node` for additional proofs on same category |
| 12 | Test count dropped from 22 deleted hello.test.ts tests — placeholder "Test count not decreased" proof can't catch | Proof uses `node -e "process.exit(0)"` — always passes | Make real proof that parses test counts from npm test output |
| 13 | `dod_check` always fails "Biome lint clean" and "Biome format check" in full run but passes them in scoped run | Full run re-executes BIOME against dirty tree. Scoped re-uses cached results. | Run `biome check --write` BEFORE full dod_check regression |
| 14 | `memory_save` throws validation error when updating existing memory with same id | Append mode not clearly distinguished from creation | Obsidian-rag: add `append` parameter, or document idempotency behavior |

### Dod-Guard Issues Uncovered

| # | Issue | File | Fix Needed |
|---|-------|------|------------|
| 1 | `command-check.ts` validates commands exist on Windows but doesn't account for glob expansion differences | `packages/dod-guard/src/command-check.ts` | Add glob detection + Windows warning |
| 2 | `checker.ts`: empty string commands fail even for manual/review predicates | `packages/dod-guard/src/checker.ts` | Gate: `if (!cmd && pred.type !== "manual" && pred.type !== "review")` |
| 3 | `dod_create` ignores `dod_id` parameter — silently creates new DoD | `packages/dod-guard/src/index.ts` | Validate: either dod_id XOR creation params |

### Evomcp Issues

None yet.

### Gitevo Issues

None yet.

### Obsidian-Rag Issues

| # | Issue | File | Fix Needed |
|---|-------|------|------------|
| 1 | No auto-select of last-used vault — `memory_recall` fails without explicit `vault_select` | `packages/obsidian-rag/src/index.ts` | Track last vault in store, auto-select on recall if unset |
