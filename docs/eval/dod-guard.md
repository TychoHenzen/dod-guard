# dod-guard — Code Review Findings

**Package**: `packages/dod-guard`  
**Scope**: All source files in `src/` (19 files)  
**Findings**: 2 CRITICAL, 2 HIGH

---

## dod-guard-1: CRITICAL — `require("node:fs")` in ESM module breaks glob-based file discovery

**File**: `packages/dod-guard/src/assertions.ts`  
**Line**: 149  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

Line 1 imports `existsSync` and `readFileSync` via ESM:
```typescript
import { existsSync, readFileSync } from "node:fs";
```

Line 149, inside `extractTestFilesFromCommand()`, uses `require()`:
```typescript
const { readdirSync } = require("node:fs");
```

The package is `"type": "module"` (package.json line 5), tsconfig uses `"module": "Node16"`. At runtime in ESM, `require` is `undefined` — this throws `ReferenceError: require is not defined` whenever the glob-handling branch (`pat.includes("*")`) executes.

### Impact

`extractTestFilesFromCommand()` is called during `assertions` predicate evaluation. Any assertion proof whose command uses a glob pattern (`*.test.ts`, `**/*.test.js`) triggers this branch. The try-catch at line 147 wraps it:

```typescript
try {
    const { readdirSync } = require("node:fs");
    const entries = readdirSync(segDir);
```

The catch block (line 155) logs "Cannot read directory" and returns an empty file list. The assertions static analyzer then finds zero test files to scan, reports zero assertions, and the proof **always passes** regardless of actual assertion quality.

### Fix

Remove the `require()` call. Add `readdirSync` to the top-level import:

```typescript
import { existsSync, readFileSync, readdirSync } from "node:fs";
```

---

## dod-guard-2: CRITICAL — Same `require("node:fs")` bug in observability.ts

**File**: `packages/dod-guard/src/observability.ts`  
**Lines**: 562, 569  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

Identical pattern to dod-guard-1. Top-level import on line 1:
```typescript
import { existsSync, readFileSync } from "node:fs";
```

Two `require()` calls in `extractSourceFilesFromCommand()`:

Line 562:
```typescript
const { readdirSync } = require("node:fs");
```

Line 569:
```typescript
const stat = require("node:fs").statSync(full);
```

### Impact

Same mechanism: glob-based source file discovery silently fails for `observability` predicate proofs. The observability analyzer finds zero source files, reports zero issues, proof always passes.

### Fix

Add `readdirSync` and `statSync` to top-level import:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
```

---

## dod-guard-3: HIGH — Path-prefix bug in `carryForwardDrafts`

**File**: `packages/dod-guard/src/checker.ts`  
**Lines**: 494, 496  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

`carryForwardDrafts` uses `String.startsWith()` to determine whether a node is in the scoped subtree. This conflates numeric path indexes:

Line 494 (ancestor-over-skip):
```typescript
if (targetPath.startsWith(currentPath)) continue; // in scope
```

When `currentPath = "0"` and `targetPath = "0.children.1"`:
`"0.children.1".startsWith("0")` → `true` → `continue` → **skips all children of root node 0**, including draft leaves outside the scoped subtree. Those drafts are silently dropped from output instead of being carried forward.

Line 496 (sibling confusion):
```typescript
} else if (node.refinement === "draft" && !targetPath.startsWith(currentPath)) {
```

When `currentPath = "0.children.1"` and `targetPath = "0.children.10"`:
`"0.children.10".startsWith("0.children.1")` → `true` → `!true` → `false` → **draft at `0.children.1` is NOT carried forward** even though it's a sibling of the target subtree, not an ancestor.

### Impact

Scoped `dod_check` runs (e.g., `--node-path=0.children.1`) miscount draft nodes, potentially showing incomplete/inaccurate draft counts and causing confusing carry-forward behavior when a sibling node's path index shares a numeric prefix with the target.

### Fix

Use strict path-boundary comparison. Split by `"."` and compare segment-by-segment, or use prefix+delimiter:

```typescript
const isUnderTarget = currentPath === targetPath || 
  currentPath.startsWith(targetPath + ".");
```

---

## dod-guard-4: HIGH — Same path-prefix bug in `updateDocFromCheckResult`

**File**: `packages/dod-guard/src/author.ts`  
**Lines**: 297-301  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

Same `startsWith` bug as dod-guard-3, in the markdown update logic:

```typescript
if (
  result.scoped &&
  leafResult.node_path !== result.ran_node_path &&
  !leafResult.node_path.startsWith(result.ran_node_path ?? "")
)
  continue;
```

When `ran_node_path = "0.children.1"` and `leafResult.node_path = "0.children.10"`:

`"0.children.10".startsWith("0.children.1")` → `true` → `!true` → `false` → the guard does **not** skip the leaf → the leaf at `0.children.10` gets its `last_status` overwritten by the scoped check result, corrupting persisted state.

### Impact

Scoped `dod_check` corrupts `last_status` on concrete leaves at sibling paths whose numeric indexes share a digit prefix. A leaf that previously passed can be overwritten to "skipped" or "pending".

### Fix

Same fix as dod-guard-3: use strict path-boundary comparison with `"."` delimiter.
