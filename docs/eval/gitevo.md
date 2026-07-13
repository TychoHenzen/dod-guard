# gitevo — Code Review Findings

**Package**: `packages/gitevo`  
**Scope**: All source files in `src/` (4 files)  
**Findings**: 2 CRITICAL, 1 MEDIUM

---

## gitevo-1: CRITICAL — Dead tag created before hard reset; partial state on failure

**File**: `packages/gitevo/src/operations.ts`  
**Lines**: 549-557  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

`evo_abandon` creates the dead tag **before** executing the hard reset:

```typescript
// Line 550-557
const deadTag = `evo-dead-${branchName}`;
try {
  git(["tag", "-d", deadTag], cwd);
} catch {}
git(["tag", "-a", deadTag, "-m", `Abandoned branch '${branchName}'`], cwd);

// Hard reset to target
git(["reset", "--hard", targetRef], cwd);
```

If `git reset --hard targetRef` fails (invalid ref, permission error, locked files), the dead tag is already created but the branch was never actually reset. The branch appears dead in listings but still contains its original commits and working tree. If dirty changes were auto-stashed, they remain in the stash (never popped).

Trigger case: repo with exactly 1 commit, `evo_abandon()` with no checkpoint → `HEAD~1` is invalid → dead tag created → `git reset --hard HEAD~1` fails → EvoError thrown with git's raw error → user left with orphaned dead tag and stashed changes.

The `preflightCheckoutSafety` does not catch this because `filesRemovedByCheckout` (see gitevo-2) silently swallows errors and returns `[]`, so the safety check passes as if nothing is wrong.

### Impact

Data loss risk: user's stashed changes are orphaned, dead tag permanently marks branch as abandoned despite failed reset, manual cleanup required.

### Fix

Move dead tag creation **after** the hard reset succeeds, or wrap in try/catch that undoes the dead tag and restores the stash on failure:

```typescript
// Reset first, tag after success
git(["reset", "--hard", targetRef], cwd);
// Only tag if reset succeeded
const deadTag = `evo-dead-${branchName}`;
try { git(["tag", "-d", deadTag], cwd); } catch {}
git(["tag", "-a", deadTag, "-m", `Abandoned branch '${branchName}'`], cwd);
```

Or validate `targetRef` exists before starting side effects.

---

## gitevo-2: CRITICAL — `filesRemovedByCheckout` silently swallows all git errors

**File**: `packages/gitevo/src/operations.ts`  
**Lines**: 89-96  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

```typescript
function filesRemovedByCheckout(targetRef: string, cwd: string): string[] {
  try {
    const diff = git(["diff", "--name-only", "--diff-filter=D", "HEAD", targetRef], cwd);
    return diff.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
```

Lines 93-95 catch **any** error (invalid `targetRef`, ambiguous ref, permission errors, disk failures, git binary not found) and return an empty array `[]`. No logging, no diagnostic, no error propagation.

### Impact

`preflightCheckoutSafety` calls this function and treats `[]` as "zero files would be removed" — declaring the checkout safe. When git itself failed, the real answer is unknown, but the safety check reports false-confidence "safe." This directly enables gitevo-1 (the `HEAD~1` invalid-ref case) but also masks any other git failure mode.

### Security/safety concern

The function name `filesRemovedByCheckout` implies a definitive list. Returning `[]` on error is a **false negative** — it claims zero files lost when it didn't actually determine that. This is the worst possible error mode for a safety check.

### Fix

Only catch expected errors (ref not found). Validate the ref first, then propagate unexpected errors:

```typescript
function filesRemovedByCheckout(targetRef: string, cwd: string): string[] {
  // Validate ref exists first
  try {
    git(["rev-parse", "--verify", targetRef], cwd);
  } catch {
    throw new EvoError(`target ref '${targetRef}' does not exist`);
  }
  const diff = git(["diff", "--name-only", "--diff-filter=D", "HEAD", targetRef], cwd);
  return diff.split("\n").filter(Boolean);
}
```

---

## gitevo-3: MEDIUM — `evo_learn` called after destructive reset with no recovery

**File**: `packages/gitevo/src/operations.ts`  
**Lines**: 560-562  
**Category**: robustness  
**Verification**: CONFIRMED

### Problem

After `git reset --hard` (line 557), if a `reason` was provided, `evo_learn` is called to persist the lesson. `evo_learn` internally calls `getRepo()` which re-discovers `cwd` and the root branch via git commands:

```typescript
// Line 560-562
if (reason) {
  evo_learn(reason);  // calls getRepo() internally
}
```

If `getRepo()` fails for any reason post-reset (corrupt git state, process chdir, filesystem issues), the lesson is lost and the function throws **after** the destructive reset was already done. No safety net.

### Impact

Low probability but high consequence: the user's branch is already hard-reset, and the lesson (which may explain why the branch was abandoned) is silently lost.

### Fix

Capture `cwd` and `rootBranch` before the reset and pass them directly to `evo_learn`:

```typescript
if (reason) {
  evo_learn(reason, { cwd, rootBranch });
}
```
