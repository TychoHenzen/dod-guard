# evomcp — Code Review Findings

**Package**: `packages/evomcp`  
**Scope**: All source files in `src/` (10 files)  
**Findings**: 3 CRITICAL, 1 MEDIUM

---

## evomcp-1: CRITICAL — Evolution loop is a no-op (fitness measured on baseline)

**File**: `packages/evomcp/src/evolve.ts`  
**Lines**: 119-148  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

The evolution loop measures fitness on the **clean baseline**, not on mutated code. The sequence is:

```typescript
// Line 119-126 (inside the mutation loop)
saveState(spec.cwd);  // → git stash push --include-untracked → REVERTS to HEAD
try {
    // Run fitness command — runs on CLEAN HEAD, not mutated code!
    const fitnessResult = runCommand(spec.fitness_cmd, spec.cwd);
    const score = extractScore(fitnessResult.output);
```

`saveState` (line 120) calls `git stash push --include-untracked`, reverting the working tree to HEAD **before** `runCommand` (line 123). The fitness command always measures the baseline, never the mutations `claude -p` wrote.

Additionally, `bestPatch = captureState(...)` at line 136 runs **after** `saveState` cleaned the tree, so `captureState` (which does `git diff`) always returns empty. `bestPatch` stays null, and the per-generation patch application at lines 154-156 never fires.

The `finally` block (lines 148-150) calls `restoreState(spec.cwd)` which does `git checkout . && git clean -fd && git stash pop`, restoring the stashed changes — but fitness was never measured against those changes.

### Impact

- Every generation measures baseline fitness repeatedly
- No mutation ever improves the score
- Elites are selected at random (all identical baseline scores)
- Cross-generation patch accumulation has zero effect
- The entire `evolve` tool is a no-op — it runs N generations but produces no improvement

### Fix

Swap the two operations: run `runCommand` first (measure mutation), then `saveState` (preserve for next generation):

```typescript
// Correct order:
// 1. Measure fitness on mutated code
const fitnessResult = runCommand(spec.fitness_cmd, spec.cwd);
const score = extractScore(fitnessResult.output);
// 2. Save state (captures the mutation for elite)
bestPatch = captureState(spec.cwd);
saveState(spec.cwd);
```

---

## evomcp-2: CRITICAL — Elite stores fitness output as example source code

**File**: `packages/evomcp/src/evolve.ts`  
**Line**: 139  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

```typescript
// evolve.ts:139
elites.push({ code: fitnessResult.output.slice(0, 2000), score });
```

`fitnessResult.output` is the stdout of the fitness command — e.g., `"PASS 8/8"`, `"Benchmark: 42ms"`, or compilation errors. This gets injected into the next generation's mutation prompt as example code:

```typescript
// agent.ts:499-501
## Elite mutations (higher score = better)
\`\`\`
${e.code}
\`\`\`
```

Claude receives fitness command output wrapped in a codeblock and labeled as an elite example. The field should contain the actual mutated source file content.

### Impact

LLM sees garbage as "elite" examples. Combined with evomcp-1 (fitness always baseline), the evolution loop provides zero signal to the mutator. Each generation starts from scratch with misleading examples.

### Fix

Capture actual file content from `targetFiles` after mutation, not fitness output. Use `captureState` or read the target files directly:

```typescript
const targetContents = readTargetFiles(spec.targetFiles, spec.cwd);
elites.push({ code: targetContents.slice(0, 2000), score });
```

---

## evomcp-3: CRITICAL — `captureDiff` misses staged and committed changes

**File**: `packages/evomcp/src/solve.ts`  
**Lines**: 36-43, 162  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

Two contradictory instructions:

1. **Strategy prompt tells claude to commit** (agent.ts:474):
   ```
   Implement the changes needed. ... Commit when done.
   ```

2. **captureDiff only checks unstaged changes** (solve.ts:36-43):
   ```typescript
   function captureDiff(cwd: string): string | null {
       try {
           const diff = execSync("git diff", { cwd, encoding: "utf-8", timeout: 10_000 });
           //              ^^^^^^^^ unstaged only — no --cached, no HEAD~1
           return diff || null;
   ```

If claude stages (`git add`) without committing, `git diff` misses staged changes. If claude commits, `git diff` returns empty. Both paths cause `captureDiff` to return `null`, falling through to a useless text fallback:

```typescript
// solve.ts:162
patch: captureDiff(spec.cwd) ?? `claude -p output (${r.exitCode}):\n${r.output.slice(0, 500)}`,
```

### Impact

The returned patch is claude's text output, not a real diff. It cannot be applied with `git apply` or `patch`. The solve flow returns garbage patches that fail when the caller tries to apply them.

### Fix

Use `git diff HEAD` to catch both unstaged and staged changes relative to HEAD:

```typescript
const diff = execSync("git diff HEAD", { cwd, encoding: "utf-8", timeout: 10_000 });
```

Or `git diff HEAD~1..HEAD` if the expectation is always a commit:

```typescript
const diff = execSync("git diff HEAD~1..HEAD", { cwd, encoding: "utf-8", timeout: 10_000 });
```

---

## evomcp-4: MEDIUM — `matchSimple` incomplete regex escaping

**File**: `packages/evomcp/src/evolve.ts`  
**Line**: 258  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

```typescript
function matchSimple(pattern: string, str: string): boolean {
  const escaped = pattern.replace(/[.*]/g, "\\$&");
  const regex = new RegExp(escaped);
  return regex.test(str);
}
```

Only escapes `.` and `*`. Other regex metacharacters (`+`, `(`, `)`, `[`, `]`, `?`, `{`, `}`, `^`, `$`, `|`, `\`) pass through literally and are interpreted as regex operators.

### Impact

A glob pattern like `src/**/*.ts` → escaped to `src/\\*\\*/\\*\\.ts` → `RegExp("src/\\*\\*/\\*\\.ts")` → matches literal `*` characters, producing wrong file lists. A pattern with `+` or `(` would be interpreted as regex and could match unintended files or error.

### Fix

Escape all regex metacharacters or use a proper glob-to-regex library:

```typescript
const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
```
