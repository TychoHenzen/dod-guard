# GitEvo Release-Gate Evaluation Report

**Date**: 2026-07-13
**Evaluator**: Claude Code (caveman mode)
**Package**: `packages/gitevo` v0.1.8
**Test environment**: Windows 11, Node 22, Git Bash

---

## 1. Verdict: **SHIP-WITH-FIXES**

One P0 data-loss bug (**filesRemovedByCheckout diff direction inverted**) must be fixed before release. The bug means `evo_spawn` and `evo_abandon` will NOT block when source files in HEAD would be deleted by a checkout/reset to the target ref. All other checks (untracked source, stale dist, auto-stash, force bypass, init guard, error handling) work correctly.

The fix is a one-line argument swap in `operations.ts:93`. After that + updating 2 stale tests + fixing the coverage script, the package is production-ready.

---

## 2. Tool Matrix

| # | Tool | Verdict | Evidence |
|---|------|---------|----------|
| 1 | `evo_init` | ✅ PASS | Creates `.evo/`, tags `evo-root`, idempotent re-run clears lessons. Verified in sandbox. |
| 2 | `evo_checkpoint` | ✅ PASS | Tags `evo-{name}` with annotation. Auto-stashes dirty tree, pops after. Verified. |
| 3 | `evo_checkpoints` | ✅ PASS | Lists all `evo-*` tags with descriptions. Verified. |
| 4 | `evo_spawn` | ⚠️ WARN | Core flow works. **P0 bug**: filesRemovedByCheckout preflight broken — won't block when source files would be deleted. Force bypass works. |
| 5 | `evo_branches` | ✅ PASS | Lists non-default branches. Verified. |
| 6 | `evo_learn` | ✅ PASS | Appends to `lessons.jsonl` with timestamp+branch. Verified. |
| 7 | `evo_lessons` | ✅ PASS | Returns numbered list newest-first. "No lessons" when empty. Verified. |
| 8 | `evo_export_lessons` | ✅ PASS | Valid JSON array, memory_save-compatible shape (id/title/description/content/type/metadata). Verified. |
| 9 | `evo_abandon` | ⚠️ WARN | Core flow works. Same P0 preflight bug as spawn. Auto-stashes dirty, tags `evo-dead-{branch}`, records reason as lesson. |
| 10 | `evo_adopt` | ⚠️ WARN | Merges branch, tags `evo-adopted`. **P1**: CLAUDE.md says auto-stash, code throws on dirty tree. |
| 11 | `evo_finish` | ✅ PASS | Cleans ALL artifacts (tags, branches, `.evo/`). Verified. |
| 12 | `evo_diff` | ✅ PASS | Returns git diff between checkpoints. "No differences" when identical. Errors on missing tags. |
| 13 | `evo_summary` | ✅ PASS | Shows active branch, checkpoint/lesson counts, dead branches, adopted state. Verified. |

---

## 3. Findings (severity-ranked)

### 🔴 P0-1: `filesRemovedByCheckout` diff direction inverted → silent data loss

**File**: `packages/gitevo/src/operations.ts`, line 93

**What**: `filesRemovedByCheckout` computes which source files in HEAD would be deleted by checking out `targetRef`, but the diff arguments are swapped.

```
// CURRENT (wrong):
const diff = git(["diff", "--name-only", "--diff-filter=D", targetRef, "HEAD"], cwd);
// Returns: files in targetRef NOT in HEAD (opposite of intent)

// FIX:
const diff = git(["diff", "--name-only", "--diff-filter=D", "HEAD", targetRef], cwd);
// Returns: files in HEAD NOT in targetRef (deleted by checkout)
```

**Repro** (verified in sandbox):
1. Commit file `new-source.ts` to master
2. Create checkpoint at initial commit (no `new-source.ts`)
3. `evo_spawn("initial-cp", "branch")` — proceeds without warning
4. `new-source.ts` is silently deleted by checkout

**Observed**: Spawn succeeds, `new-source.ts` gone from working tree.
**Expected**: `SAFETY CHECK FAILED — checkout to 'evo-initial-cp' would lose data: Source files in HEAD NOT in 'evo-initial-cp' — WILL BE DELETED: new-source.ts`

**Impact**: `evo_spawn` and `evo_abandon` both call `preflightCheckoutSafety` → `filesRemovedByCheckout`. Both are affected. The untracked-source and stale-dist checks still work — only the "files removed by checkout" check is broken.

**Fix**: Swap argument order on line 93.

---

### 🟡 P1-1: CLAUDE.md docs disagree with evo_adopt dirty-tree behavior

**File**: `packages/gitevo/CLAUDE.md` line 35

CLAUDE.md says: *"Auto-stash dirty tree: checkpoint, spawn, abandon, **adopt** all auto-stash before operating"*

Code (`operations.ts:637-639`):
```typescript
if (isDirty(cwd)) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
}
```

`evo_adopt` does NOT auto-stash — it throws. Either add auto-stash to adopt, or fix the docs. The throw is the safer option (adopt does merge, dirty tree could create merge conflicts).

**Fix**: Remove "adopt" from the auto-stash list in CLAUDE.md line 35. Change to: *"Auto-stash dirty tree: checkpoint, spawn, abandon all auto-stash before operating"*

---

### 🟡 P1-2: Integration tests stale — 2 failures from auto-stash behavior change

**File**: `packages/gitevo/src/operations.test.ts`, lines 139-144 and 376-380

Two tests expect `EvoError` on dirty tree for `evo_checkpoint` and `evo_abandon`, but both now auto-stash instead of throwing:

- Test "refuses dirty tree" in `evo_checkpoint` suite (line 139)
- Test "refuses dirty tree" in `evo_abandon` suite (line 376)

**Fix**: Rewrite these tests to verify auto-stash behavior: assert the op succeeds, dirty content is preserved after stash-pop, tree is still dirty. Or delete them — the "auto-stashes dirty tree and pops after checkout" test in `evo_spawn` already covers this.

---

### 🟡 P1-3: Coverage npm script broken — only tests index, 0% on operations.ts

**File**: `packages/gitevo/package.json`, `"coverage"` script

```json
"coverage": "c8 --include=\"src/*.ts\" --exclude=\"src/*.test.ts\" --reporter=text --reporter=html node --experimental-test-module-mocks --test \"dist/index.test.js\""
```

Only runs `index.test.js` (17 tests, zero operations coverage). Should include `operations.test.js` (42 tests, full operations coverage).

c8 also returns 0% for ESM modules — may need `--experimental-test-module-mocks` flag handling or an alternative coverage tool (v8, nyc with ESM loader).

**Fix**: Add `dist/operations.test.js` to the coverage command. Investigate c8 ESM compatibility separately.

---

### 🟢 P2-1: CRLF conversion causes false-dirty on Windows

After `evo_spawn` checkout on Windows with `core.autocrlf=true`, tracked files show as modified (`M file.txt`) due to LF→CRLF conversion. This causes the next operation to auto-stash unnecessarily.

**Mitigation**: `.gitattributes` with `* text=auto eol=lf` at sandbox creation, or document that sandbox repos should disable autocrlf.

---

### 🟢 P2-2: No `--` separator before user-supplied ref names

**Risk**: Low. `spawnSync` with array args prevents shell injection. Git's built-in ref format validation rejects metacharacters (confirmed: `; rm -rf .` rejected as invalid branch name, `--upload-pack=evil` rejected as unknown option).

However, `git checkout -b <new_branch> <tagName>` and `git reset --hard <targetRef>` don't use `--` to separate refs from options. A user-supplied name starting with `-` could theoretically confuse git flag parsing, though git ref validation catches most cases.

**Recommendation**: Document that checkpoint/branch names must conform to `git check-ref-format`. Add input validation if used in untrusted contexts.

---

### 🟢 P2-3: Stash leakage only on documented failure paths

Stashes are left in place only when stash-pop fails (merge conflict after checkout). Both `evo_spawn` and `evo_checkpoint` return a clear message: *"Auto-stash could not be reapplied — your changes are in the stash."* No silent stash drops. `evo_finish` cleans all tags, branches, and `.evo/`. No resource leak in normal operation.

---

## 4. Coverage Gaps Worth Testing

| Gap | Priority | Rationale |
|-----|----------|-----------|
| `filesRemovedByCheckout` with correct diff direction | **P0** | Currently untestable because the function returns empty when it should return files. Fix the bug, then add test. |
| `evo_adopt` with dirty tree | P1 | Verify error message, no partial mutation. |
| Stash-pop merge conflict recovery | P1 | Hard to test deterministically — requires crafting conflicting file states. Current tests only cover successful pop. |
| `preflightCheckoutSafety` integration (all 3 checks together) | P1 | Test with untracked + removed + stale simultaneously, verify all appear in error message. |
| Concurrency / re-entrancy | P2 | Two evo_spawn calls in rapid succession on same sandbox — does second one see stale state? Low priority. |
| `evo_export_lessons` with empty lessons file (not missing, but 0-byte) | P2 | Currently returns `[]`. Verify it doesn't throw on malformed JSONL. |

---

## 5. Cleanup Confirmation

- ✅ Sandbox `gitevo-eval-1783931886` deleted
- ✅ Sandbox `gitevo-eval-adv-1783931921` deleted
- ✅ Test script `gitevo-phase3.mjs` deleted
- ✅ No `evo-*` tags/branches/stashes in real repo
- ✅ `process.cwd()` restored to real repo

---

## 6. Summary

| Category | Count |
|----------|-------|
| P0 (data loss) | 1 |
| P1 (correctness) | 3 |
| P2 (UX/edge) | 3 |
| Tools PASS | 10/13 |
| Tools WARN | 3/13 (all affected by P0-1) |
| Tools FAIL | 0/13 |
| Tests pass (unit) | 17/17 |
| Tests pass (integration) | 40/42 (2 stale — known, not code bugs) |
| Fix effort | ~5 min (one-line swap + doc fix + test update) |
