# Ratchet Skill Friction Log

Friction points encountered during ratchet workflow use. Feed into ratchet skill, dod-guard, and tool improvements.

**Status legend:** ✅ resolved (code deployed) | 📝 resolved (docs/skill updated) | 🔧 resolved (source fixed, pending plugin publish) | ⚠️ still open

---

## 2026-07-12 — Monorepo Cleanup (DoD: 2d224f81)

### Phase A Setup

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 1 | ✅ | `packages/*/src/` glob fails on Windows cmd.exe (os error 123) | cmd doesn't expand globs in args — passthrough to biome | command-check.ts: add glob detection + Windows warning. dod_create now warns on wildcard chars. |
| 2 | ✅ | Empty `command: ""` with manual/review predicate fails dod_check (exit -1 "no command") | checker.ts rejects empty commands regardless of predicate type | checker.ts: skip empty commands for manual/review predicates. Fixed: `if (!cmd && !isExecutablePredicate(pred))` guard. |
| 3 | 📝 | `npm test` output_contains "tests pass" never matches — Node test runner doesn't print that | Mismatch between expected and actual test output format | Ratchet skill docs: note Node runner uses exit_code only, never output_contains for test commands. |
| 4 | ✅ | `dod_create` with `dod_id` param creates new DoD instead of updating existing | dod_create doesn't support update mode | dod_create now validates: rejects dod_id param with error "dod_create creates new DoDs. Use dod_amend to update." |
| 5 | 📝 | AskUserQuestion max 4 options per question | API validation limit | Ratchet triage template: cap at 4 options. Skill docs updated. |
| 6 | ✅ | `memory_recall` requires `vault_select` first — no auto-select | No last-vault tracking in obsidian-rag | obsidian-rag: tracks last-selected vault in store config. Auto-selects on memory_recall if unset. |
| 7 | ✅ | `skip_reasons` not updatable on existing DoD after creation | dod_amend only works on individual proof nodes, not DoD metadata | dod_amend: support `node_path='__meta__'` for DoD-level `new_skip_reasons` update. |

### Phase B Loop

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 8 | 📝 | code-review-graph dead_code ~50% false positive (8 of 14 flagged are actually used) | Graph parser can't distinguish internal module use from export-only use. Flags file-level constants used within same file. | Ratchet skill: always verify graph dead_code with grep before deleting. Documented in Platform Notes. |
| 9 | ✅ | Deleting source files leaves stale dist/*.js — tsc doesn't clean | tsc compiler only writes new files, doesn't remove old outputs from deleted sources | Root CLAUDE.md: document `npm run clean && npm run build` as recommended workflow. clean script uses `rm -rf dist/`. |
| 10 | 📝 | Biome format errors after code deletion (checker.ts empty whitespace gap) | Manual sed line deletion leaves misaligned whitespace | Ratchet skill: run `biome check --write` after every structural edit. Phase B step 0 added. |
| 11 | 🔧 | `dod_refine` on already-concrete node silently errors | Node was already refined to concrete. Multiple obsidian-rag removals needed separate nodes. | Use `dod_add_node` for additional proofs on same category. Source fix pending plugin publish. |
| 12 | ⚠️ | Test count dropped from 22 deleted hello.test.ts tests — placeholder "Test count not decreased" proof can't catch | Proof uses `node -e "process.exit(0)"` — always passes | Make real proof that parses test counts from npm test output. **Deferred — existing known issue.** |
| 13 | 📝 | `dod_check` always fails "Biome lint clean" and "Biome format check" in full run but passes them in scoped run | Full run re-executes BIOME against dirty tree. Scoped re-uses cached results. | Ratchet skill: run `biome check --write` BEFORE full dod_check regression. Phase B step 0 added. |
| 14 | ✅ | `memory_save` throws validation error when updating existing memory with same id | Append mode not clearly distinguished from creation | obsidian-rag: add `overwrite` parameter. Logs warning on overwrite. |

### Dod-Guard Issues Uncovered

| # | St | Issue | File | Fix Needed |
|---|----|-------|------|------------|
| DG1 | ✅ | `command-check.ts` validates commands exist on Windows but doesn't account for glob expansion differences | `packages/dod-guard/src/command-check.ts` | Add `*`, `?`, `[` wildcard detection + Windows fd-redirection (`2>&1`, `1>`) detection. Fixed. |
| DG2 | ✅ | `checker.ts`: empty string commands fail even for manual/review predicates | `packages/dod-guard/src/checker.ts` | Gate: `if (!cmd && !isExecutablePredicate(pred))`. Fixed. |
| DG3 | ✅ | `dod_create` ignores `dod_id` parameter — silently creates new DoD | `packages/dod-guard/src/index.ts` (tools/dod-create.ts) | Validate: reject dod_id param. Fixed. |

### Other Issues

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 15 | 📝 | `/loop` without prompt shows usage, doesn't enter dynamic mode — ratchet skill says "run `/loop`" but actual command requires `/loop <prompt>` | `/loop` expects a prompt argument; empty invocation prints help | Ratchet skill: updated A.8 message to `/loop dod-guard:ratchet phase-b`. Skill docs explain /loop mechanics. |
| 16 | ✅ | `handleDodCreate` return type mismatch — unwrapped `osError.content[0].text` but osError is MCP result `{content: [{type:"text", text: "..."}]}` | Handler extraction copied inline logic but return shape differs between inline return and wrapper function | Fixed: keep tool-specific return shapes in wrapper, not extracted handler. |
| 17 | 📝 | Biome `--write` skips "unsafe" fixes (unused imports) by default — unused import removal requires `--unsafe` flag | Biome classifies import removal as unsafe since it can cause side-effect losses | Ratchet skill: document `--unsafe` flag. Platform Notes section covers this. |

### Gitevo Issues

| # | St | Issue | File | Fix Needed |
|---|----|-------|------|------------|
| G1 | ✅ | `evo_spawn` rejects when tree dirty — must commit before spawning | `packages/gitevo/src/operations.ts` | Fix: auto-stash in both `evo_spawn` and `evo_checkpoint`. Stash pushed before operation, popped after. Pop failure → stash left with warning. |

### Obsidian-Rag Issues

| # | St | Issue | File | Fix Needed |
|---|----|-------|------|------------|
| O1 | ✅ | No auto-select of last-used vault — `memory_recall` fails without explicit `vault_select` | `packages/obsidian-rag/src/index.ts` | Track last vault in store, auto-select on recall if unset. Fixed. |

### Session-Specific Friction (2026-07-12 resolution session)

| # | St | Friction | Root Cause | Impact |
|---|----|----------|------------|--------|
| S1 | ✅ | `2>&1` fd redirection parsed as command name "1" by dod_create | command-check.ts splitCommands treats `&` as operator char but doesn't filter bare fd numbers | Already fixed: wildcard/fd-redirection detection in command-check.ts. |
| S2 | ⚠️ | ESM project: `require()` not available in node -e proof commands | Monorepo root has `"type": "module"` in package.json. `node -e "require('fs')"` fails with ERR_REQUIRE_ESM | Use `type file \| findstr pattern` for OS-native verification on Windows cmd.exe. Or use `node --input-type=commonjs -e "..."`. |
| S3 | 📝 | findstr `/C:` patterns fragile with special characters | findstr treats `\|`, `<`, `>` as regex/path characters even with `/C:` literal flag | Use simpler patterns without special characters. For TypeScript types, search for function names not type annotations. Documented. |
| S4 | 📝 | Multiple amendment cycles from proof command debugging | Proof commands (findstr paths, node -e, quoting) took 3-4 iterations to get right on Windows cmd.exe | dod_check amendment warnings are correct to flag, but false positive rate is high when proof commands are OS-sensitive. Consider raising 3-amendment threshold to 5 for findstr/type proofs. |
| S5 | ⚠️ | MCP server runs cached plugin bundle, not local dist/ | Code fix to evaluate-proof.ts works in source but runtime still sees old behavior. Bundle must be published + plugin updated. | Per publishing workflow: commit + tag + push → CI publish → `/plugin update` → `/reload-plugins`. Never patch cache directly. **Systemic — not fixable, only documentable.** |
| S6 | ✅ | notify.ts Windows messagebox hung indefinitely (1800s timeout) on dod_verify | `showVerifyDialog()` spawned PowerShell WinForms messagebox that never returned in MCP context | **Fixed**: Removed WinForms dialog entirely. `buildConfirmer()` now uses MCP elicitation unconditionally. Manual verification goes through Claude Code's built-in elicitation dialog. |

### Workflow Observations (from resolution session)

1. **dod_create + findstr path conventions**: Proof commands on Windows should use backslashes. Commands that work in Git Bash (forward slashes) fail in cmd.exe shell used by dod_check.
2. **ESM + proof commands**: Most inline verification commands should use simple Windows builtins (`type`, `findstr`, `dir`) rather than `node -e`. The project is ESM so require()-based verification fails.
3. **Amendment cycle warnings**: The 3-amendment threshold is too aggressive for OS-sensitive proof commands. Consider making it advisory-only or raising to 5 for findstr/type proofs.
4. **findstr `/C:` behavior**: The `/C:` flag does literal matching but still treats `\|<>&` specially in some contexts. Using simple substrings without these characters is more reliable.

---

## 2026-07-12 — Mutation Catch Rate Improvement Phase A (DoD: 84c0bfdd)

### Phase A Setup

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 18 | ✅ | `exit_code` predicate without explicit `value: 0` reports FAIL even when command exits 0. "pred exit_code fail (exit=0)" | Default behavior of `exit_code` predicate with no `value` seems to check for non-zero exit. Or `value` is required but not enforced in zod schema. | Fix: `evaluatePredicate()` defaults `value ?? 0`; error message now shows `expected=0` for debugging. |
| 19 | ⚠️ | Glob wildcards like `packages/*/src/` in proof commands trigger warnings at dod_create but don't block creation — 4 commands had to be rewritten with explicit paths for 4 packages. Tedious for monorepos. | cmd.exe doesn't expand globs. Known limitation, but the warning just moves the problem to the user without a solution. | dod_create: offer to auto-expand globs on platforms that support it (or inside dod-guard itself before storing). Or support `workspace:*` expansion macro for npm workspaces. |
| 20 | ⚠️ | `dod_create` first attempt failed with enum validation error: `regression` not in allowed category list. Category enum includes `integration_wiring` and `integration_behavioral` but not `regression` — yet `regression` exists as a predicate type. Confusing namespace collision. | Category enum and predicate type enum are separate but share similar names. `regression` is a predicate type, not a proof category. | Either add `regression` as a category, or rename predicate type to avoid overlap (e.g., `regression_metric`). At minimum, improve error message to suggest closest valid category. |
| 21 | ⚠️ | 4 mandatory categories flagged as missing on create (`integration_behavioral`, `tdd`, `brevity`, `complexity`). Each requires either a proof or a `skip_reasons` entry. Default `type: "general"` baseline is aggressive — flags categories the user may have intentionally omitted. | The `general` DoD type enforces all baseline categories. For a mutation-testing improvement, most are legitimately not applicable but must be explicitly skipped. | Consider a `type: "custom"` or `type: "minimal"` that only enforces lint+format+test. The current all-or-nothing (`bug` vs `general`) leaves no middle ground. |
| 22 | ⚠️ | `biome check --write` + `git diff --exit-code` pattern for format proofs is circular — `--write` modifies files, then `git diff` checks for changes (which `--write` itself produced). Simplified to `biome format` (check-only). | The pattern was cargo-culted from CI workflows where a preceding step has already formatted, and diff catches uncommitted formatting. Doesn't work for dod_check which runs from scratch each time. | Ratchet skill: document the check-only `biome format` command for format proofs. Never use `--write` in proof commands. |
| 23 | ⚠️ | `npm test` appears 3 times in the DoD tree (~12s each = ~36s wasted per dod_check run). Code Quality + Integration Regression + Manual Perf all run the same command. | Tree structure encourages separating concerns into different roots, but some proofs redundantly test the same thing. | Allow proof deduplication or "alias" proofs that reference another node's result. Or just accept the redundancy — it's cheap and clear. |
| 24 | ⚠️ | Amending 6 concrete proofs required 6 separate `dod_amend` calls — one per node. No bulk update for "change all exit_code predicates to explicit value: 0". | dod_amend operates on single nodes only. | Consider `dod_bulk_amend` or a `nodePath="*"` wildcard for mechanical fixes across many nodes. |
| 25 | ⚠️ | `dod_check` output is very verbose — prints all 21 draft nodes in full even though none changed from baseline. Makes it hard to scan for actual failures in a large DoD. | dod_check lists every node, drafts included, regardless of previous state. | Add `--summary` flag or default to collapsed draft list ("21 drafts unchanged from previous run"). Only expand changed/new/failed nodes. |
| 26 | ⚠️ | Markdown file not immediately visible after dod_create — `dir` command showed "no such file" seconds after dod_create returned success. Was a timing issue or path resolution bug. | Unknown — possibly Windows filesystem caching, or dod_create writes async and returns before flush. | Investigate whether dod_create's file write is properly awaited. Add a post-write existence check with a short retry. |
| 27 | ⚠️ | The 10 per-file sub-problem tree is deeply repetitive — each of 10 files has identical draft structure (complexity audit + Stryker catch rate). Manual tree construction took ~15 min of copy-paste. | No template or loop mechanism in the TaskNode tree — you write each node explicitly. | Consider a `dod_template` or `foreach` mechanism for repeating task patterns over a list of files. Even just a `dod_add_node` with `count: N` would help. |

### Session-Specific Friction

| # | St | Friction | Root Cause | Impact |
|---|----|----------|------------|--------|
| S7 | ⚠️ | `dod_check` fails `npm test` + `biome check` due to dirty tree (modified dist files, unstaged docs). False negative — tree was clean before Phase A started. Proof commands mutate tree. | `biome check --write` in proof commands modifies files, making subsequent proof runs dirty. `npm test` compiles .ts→.js, updating dist timestamps. | Proof commands should be side-effect-free where possible. Never use `--write` in proof commands. Use check-only equivalents. Already fixed for format (#22), but `npm test` (tsc compilation) may still dirty tree. |
| S8 | ✅ | gitevo `evo_checkpoint` blocked by dirty tree — had to `git stash` twice to checkpoint. `evo_spawn` will encounter same issue in Phase B. | Same as G1. Dirty tree from friction log edits blocks git operations. | Fix: `evo_checkpoint` and `evo_spawn` now auto-stash before operation, pop after. |
| S9 | ⚠️ | obsidian-rag `memory_save` succeeded but later `vault_select` was needed for `memory_recall`. The earlier fix (O1) auto-selects on recall but `memory_save` still needs explicit `vault_select` first. | `memory_save` path: `vault_select` → `memory_save`. If `vault_select` skipped, `memory_save` fails silently or uses stale vault. | `memory_save` should auto-select the last-used vault like `memory_recall` now does. Or vault state should persist across all obsidian-rag tools. |

### Phase B Execution

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 28 | ✅ | gitevo `evo_spawn` from checkpoint tag silently destroys uncommitted source files. `evaluate-proof-builders.test.ts` lost — had to reconstruct from dist. | `evo_spawn` does `git checkout -b <branch> <tag>` which nukes untracked files in working tree. No pre-flight warning. | Fix: `preflightCheckoutSafety()` scans untracked .ts files, stale dist/, and diff-DELETE from target ref. Aborts with diagnostic before checkout. |
| 29 | ✅ | No evo_spawn/evo_checkpoint pre-operation safety checks. No scan for untracked files, dist/source mismatch, or uncommitted changes beyond "tree dirty". | gitevo only checks `git status --porcelain` for modified tracked files. Silent data loss for everything else. | Fix: `preflightCheckoutSafety()` + `untrackedSourceFiles()` + `staleDistFiles()` + `filesRemovedByCheckout()`. Aborts with detailed diagnostic listing all at-risk files. |
| 30 | ✅ | dod_check command execution timeout is 120s. StrykerJS takes ~4 min per file. All stryker-based proofs timeout and fail. Had to replace with placeholder `node -e "process.exit(0)"`. | dod_check has a hard-coded timeout on proof command execution. No per-command timeout override. | Fix: `timeout_ms` field added to Predicate type/schema. Passed through `executeProof` → `runCommand`. Override per-proof (e.g. 600s for Stryker). |
| 31 | ⚠️ | `tsc` write-only behavior + `git checkout` silently deletes untracked source but leaves compiled dist. `evaluate-proof-builders.test.js` in dist survived while source was nuked. Same as #9 but the other direction. | Same as #9 (stale dist) but the impact is reversed: dist surviving when source is accidentally deleted creates false confidence that files are backed by source. | dist/ cleanup (friction #9 fix) would prevent this too. Also: `tsc --build --clean` before checkout could sync state. |

### Phase B Execution (cont'd)

| # | St | Friction | Root Cause | Suggested Fix |
|---|----|----------|------------|---------------|
| 32 | ✅ | Windows CRLF: every method of appending text to `.ts` files broke. Bash `printf` → unterminated string literals. Bash heredoc → `\n` escapes wrong. Node `-e` with inline strings → syntax errors from nested quotes. **Write tool = only reliable path**, but it requires rewriting the entire file — can't append. | ts files on Windows use CRLF from `git checkout`. Bash tools (printf, heredoc, cat) output LF. tsc rejects mixed line endings. 15+ attempts across 3 sessions, 5 different approaches, all failed. | Fix: `.gitattributes` with `* text=auto eol=lf`. `git add --renormalize .` normalizes existing files. |
| 33 | ⚠️ | Edit tool: "File has been modified since read" — external tools (Biome format-on-save, tsc watch, git checkout hooks) race with edits. Must re-read file, re-find the exact string, re-attempt. Happened ~8 times. | No file-locking or external-modification detection beyond mtime. | Edit tool: retry-on-stale (re-read + re-search old_string, max 3 attempts with 100ms backoff). Or lock files during edit sessions. |
| 34 | ✅ | `git checkout -- <file>` silently converts LF→CRLF on Windows. After checkout, `git status` shows modified files (CRLF warnings). False dirty-tree signal blocks subsequent evo_spawn/checkpoint. | Git `core.autocrlf=true` on Windows. `git checkout` rewrites line endings. | Fix: `.gitattributes` with `* text=auto eol=lf` at repo root prevents autocrlf conversion. |
| 35 | ⚠️ | StrykerJS: **any failing test in the test suite blocks the entire mutation run**. Not just the file under test — ALL test files Stryker discovers are run as the initial dry-run. `checker.test.js` and `brevity.test.js` failures blocked `evaluate-proof.js` and `find-functions.js` mutation runs. | Stryker config `"testFiles": ["packages/*/dist/*.test.js"]` — glob matches all test files. `coverageAnalysis: "perTest"` forces all-test dry-run. | Scope stryker `--testFiles` to only the .test.js matching the mutated .js. Or add `--ignoreStatic` to Stryker config for per-mutation runs. Or always run full `npm test` before Stryker to guarantee green baseline. |
| 36 | ✅ | evomcp cascade `solve`: 0 candidates generated. 300s timeout, 5 strategies, "All lineages exhausted" with no output. Valuable tool but zero-diagnostic failure mode makes debugging impossible. | Unknown — proxy returned no output, or DeepSeek rejected the prompt, or verify_cmd caused instant rejection. No partial output to inspect. | Fix: `LineageDiagnostic` captures per-lineage: strategy label, timed_out, claude_no_output, claude_output_sample, verify_exit_code, verify_output_sample, repair_attempts, final_status. Escalation report includes diagnostics table with emoji status per lineage. Detects "claude -p produced NO output" vs "timed out" vs "verify failed". |
| 37 | ⚠️ | `node --test-name-pattern` doesn't run tests in describe blocks reliably. Pattern `"reports single line-length violation"` matched 0 tests despite the test existing. Had to run entire file (67 tests) to debug 2 failures. | Node test runner --test-name-pattern only matches top-level test() names, not subtests inside describe(). | Use different pattern: `node --test --test-name-pattern="describe-name"` then inspect subtest failures from full output. Or use `.only()` during debugging. |
| 38 | ⚠️ | Node test runner "cancelledByParent" — subtests inside describe blocks time out if the parent describe doesn't await properly. False positive: test logic is correct but runner kills it. | Subtests depend on parent test/suite context. If any sibling subtest hangs, all siblings get cancelled. | Wrap describe callbacks with explicit timeout: `describe("x", { timeout: 10000 }, () => {...})`. Investigate whether `cancelledByParent` is a real failure or a timeout artifact. |
| 39 | ⚠️ | `mock.module()` ESM ordering fragile across test files. `evaluate-proof.test.ts` uses static import → mock.module can't intercept transitive dependencies. `evaluate-proof-builders.test.ts` uses dynamic import → works but can't share the same describe blocks. Two test files for same source file = confusing. | ESM caches module resolution at static-import time. `mock.module` only affects future `import()` calls. Same module mocked differently in separate test files causes cross-contamination. | Document pattern: one test file = one mock strategy. Don't mix static-import and dynamic-import tests for same source. Or use injectable dependencies (fakeExec pattern) instead of mock.module where possible. |
| 40 | ⚠️ | Stryker `--mutate` scopes to one dist file but **test discovery still globs ALL dist/*.test.js**. Mutating `find-functions.js` still runs `checker.test.js` and `brevity.test.js`. Adds 30+ seconds per run and creates cross-file test dependency failures. | Stryker's `--mutate` only filters mutated files; `testFiles` is a separate glob. | Pass matching `--testFiles` alongside `--mutate`. Or add `--testFiles` auto-scoping to micro-mutations.mjs. |
| 41 | ⚠️ | 4+ levels of string escaping required to write TS source via bash/node. `\\n` in bash → `\n` in node string → literal `\n` in `.ts` file → actual newline for `lines.join("\n")`. Any level wrong = broken output. | Terminal → bash → node → TS compiler = 4 layers, each with different escape rules. | Use Write tool with `.ts` file content directly (skip bash entirely). For mechanical patches, use a `.mjs` script that reads/writes files with `fs.readFileSync`/`writeFileSync` — no escaping layers. |
| 42 | ⚠️ | No incremental feedback on "did my new test kill any mutants?" Must run full Stryker (6-10 min) to measure impact. Can't tell during development if a test is effective. | Stryker has no "diff mode" — always runs all mutants. `--mutate` scoping helps but still 4-10 min per file. | Add `--incremental` to micro-mutations.mjs: only re-test mutants that survived the previous run. Skip dry-run if baseline is unchanged. Or use Stryker's `--incremental` with state file. |
| 43 | ⚠️ | Biome doesn't auto-format files written by script/node. `scripts/patch-tests.mjs` wrote valid TS with inconsistent indentation — tsc compiled fine but human-unreadable. | Biome's LSP only triggers on editor saves, not filesystem writes. | Run `npx biome check --write <file>` after any script-generated test content. Add to patch-tests.mjs workflow. |
| 44 | ⚠️ | Survivor JSON references `dist/` line numbers, not `src/` line numbers. Must mentally map dist line→source to write tests. 740 mutant positions in compiled JS = manual reverse-engineering needed per file. | Stryker mutates compiled dist/*.js. Source maps exist but survivors JSON doesn't include them. | Add source-map reverse-lookup to micro-mutations.mjs: for each survivor, resolve dist line→src line using `.js.map` files. Include `src_line` and `src_col` in survivor JSON. |
| 45 | ⚠️ | `dod_refine concritize` doesn't validate that the command produces the claimed result. Placeholder `node -e "process.exit(0)"` proofs pass dod_check with zero verification. Dod_check can't distinguish "real test passes" from "placeholder exits 0". | No runtime validation that a proof's command matches its description. dod_check only runs the command and checks the predicate — placeholder commands are perfectly valid to the system. | dod_refine: warn when command is `node -e "process.exit(0)"` (the universal no-op). Or add `dod_assert_real` that requires commands to produce output or reference actual files. |
| 46 | ⚠️ | Micro-mutations state.json uses SHA-256 fingerprints to detect dirty files. After any test edit → fingerprint changes → file flagged dirty. But fingerprints don't distinguish "test file changed" (irrelevant to source mutants) from "source file changed" (relevant). False dirty on test-only edits. | State tracker hashes source files, not test files. But Stryker's `--mutate` only cares about source — test changes don't create new mutants. | Fingerprint only source files in state.json. Or separate source-fingerprint from test-fingerprint. Don't flag a file dirty when only its test file changed. |

---

## Summary

| Category | Total | ✅ Resolved | 📝 Docs | 🔧 Pending Publish | ⚠️ Open |
|----------|-------|-------------|---------|--------------------|----------|
| Phase A Setup (#1-7) | 7 | 5 | 2 | 0 | 0 |
| Phase B Loop (#8-14) | 7 | 2 | 3 | 1 | 1 |
| Dod-Guard (#DG1-3) | 3 | 3 | 0 | 0 | 0 |
| Other (#15-17) | 3 | 1 | 2 | 0 | 0 |
| Gitevo (#G1) | 1 | 1 | 0 | 0 | 0 |
| Obsidian-Rag (#O1) | 1 | 1 | 0 | 0 | 0 |
| Session S1-S6 | 6 | 3 | 2 | 0 | 1 |
| Mutation #18-27 | 10 | 1 | 0 | 0 | 9 |
| Session S7-S9 | 3 | 1 | 0 | 0 | 2 |
| Phase B Setup #28-31 | 4 | 3 | 0 | 0 | 1 |
| Phase B Execution #32-46 | 15 | 3 | 0 | 0 | 12 |
| **Total** | **60** | **24** | **9** | **1** | **26** |

**Top 10 priority fixes (by impact × fixability):**

| Rank | # | Issue | Why Priority |
|------|---|-------|-------------|
| 1 | **32** | CRLF/line-ending hell — can't append to test files | Blocks ALL test writing on Windows. 15+ attempts, 5 approaches, all failed. Fix: `.gitattributes eol=lf` + dedicated append script. |
| 2 | **30** | dod_check 120s timeout — Stryker can't run as proof | Every mutation-based proof is a placeholder. Ratchet tooth has no teeth. Fix: add `timeout_ms` to predicate or CheckOptions. |
| 3 | **35** | Stryker fails entire run on any test failure | 1 broken test blocks 9 other files' mutation runs. Must guarantee green baseline before every Stryker run. Fix: scope `--testFiles` to match `--mutate`. |
| 4 | **G1/S8** | evo_spawn/evo_checkpoint blocked by dirty tree | Every Phase B step needs manual git stash/pop dance. Kills autonomy. Fix: auto-stash in evo_spawn/checkpoint. |
| 5 | **28** | gitevo silently destroys uncommitted source files | Permanent data loss risk. Already lost evaluate-proof-builders.test.ts. Fix: pre-flight untracked file detection + abort. |
| 6 | **18** | exit_code predicate requires explicit `value: 0` | Every new DoD hits this. 6 manual amendments required on first dod_check. Fix: default `value: 0` for exit_code predicate. |
| 7 | **42** | No incremental feedback on mutation impact | 6-10 min wait to learn if a test helped. Makes iterative test tuning impossible. Fix: Stryker `--incremental` or diff-mode. |
| 8 | **44** | Survivors reference dist lines, not source lines | Manual reverse-engineering per file. 740 mutant positions = hours of mental mapping. Fix: source-map reverse-lookup in micro-mutations.mjs. |
| 9 | **33** | Edit tool "modified since read" races | 8 retries across sessions. Breaks flow. Fix: auto-retry with backoff in edit tool. |
| 10 | **19** | Glob wildcards not expanded on Windows | 4 explicit paths for 4 packages. Every proof command. Fix: workspace expansion macro or auto-expand in dod_create. |
