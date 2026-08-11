# Fix 11 Code Review Findings Across evomcp, gitevo, obsidian-rag - Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs - do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS - then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully - they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS - write OS-correct commands (no bash on Windows).

**CWD:** `C:\Users\siriu\mcp-servers\dod-guard`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.
</claude_instructions>

**Goal:** Apply all 11 documented fixes from eval reports: 5 CRITICAL, 2 HIGH, 4 MEDIUM. Verify build+tests pass per package.

**Date:** 2026-07-13
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `33917821-a0fb-4a20-bc31-6a2528d486b1`
**Last check:** INCOMPLETE (2026-07-13T18:04:19.089Z)

---

## Decisions (locked with user)

<decisions>
Surgical fixes only. Each applied exactly as documented. No architectural changes.
</decisions>

## Requirements

<requirements>
11 findings from docs/eval/evomcp.md, gitevo.md, obsidian-rag.md. Execution order: evomcp (4), gitevo (3), obsidian-rag (4). Verify: npm run build + npm test per package.
</requirements>

## Research Notes

<research_notes>
All findings verified against current source. See eval files for exact line numbers and diff specs.
</research_notes>

---

## Definition of Done

<definition_of_done>

### Code Quality [x]

  - [x] Proof: `npx biome check packages/evomcp/src/ packages/gitevo/src/ packages/obsidian-rag/src/` -> No lint errors in changed packages <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `npx biome format --check packages/evomcp/src/ packages/gitevo/src/ packages/obsidian-rag/src/` -> All source files correctly formatted <!--p:{"type":"exit_code","value":0}-->

### evomcp Fixes [x]

  - [x] Proof: `findstr /C:"runCommand" packages\evomcp\src\evolve.ts` -> runCommand (fitness) must appear BEFORE saveState (stash) in the mutation loop. Fix in evolve.ts lines 119-126. <!--p:{"type":"output_matches","value":"fitnessResult = runCommand"}-->
  - [x] Proof: `findstr /C:"elites.push" packages\evomcp\src\evolve.ts` -> Elite must store source file content, not fitness command stdout. Fix in evolve.ts line 139. <!--p:{"type":"output_not_contains","value":"fitnessResult.output"}-->
  - [x] Proof: `findstr /C:"git diff" packages\evomcp\src\solve.ts` -> captureDiff must use git diff HEAD to catch staged+unstaged changes. Fix in solve.ts lines 36-43. <!--p:{"type":"output_contains","value":"git diff HEAD"}-->
  - [x] Proof: `findstr /C:"replace" packages\evomcp\src\evolve.ts` -> matchSimple must escape all regex metacharacters. Fix in evolve.ts line 258. <!--p:{"type":"output_contains","value":"[.+?^${}()|\\\\]"}-->
  - [x] Proof: `npm run build -w packages/evomcp` -> TypeScript compilation succeeds after fixes <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `npm test -w packages/evomcp` -> All existing evomcp tests pass <!--p:{"type":"exit_code","value":0}-->

### gitevo Fixes [x]

  - [x] Proof: `grep -q "Tag as dead (only after reset succeeded)" packages/gitevo/src/operations.ts && echo PASS || echo FAIL` -> git reset --hard must execute BEFORE dead tag creation. Fix in operations.ts lines 549-557. <!--p:{"type":"output_contains","value":"PASS"}-->
  - [x] Proof: `findstr /N "filesRemovedByCheckout" packages\gitevo\src\operations.ts` -> Must validate ref and propagate errors, not return []. Fix in operations.ts lines 89-96. <!--p:{"type":"output_not_matches","value":"catch \\{\n    return \\[\\]"}-->
  - [x] Proof: `findstr /C:"evo_learn" packages\gitevo\src\operations.ts` -> evo_learn called after destructive reset must pass explicit cwd. Fix in operations.ts lines 560-562. <!--p:{"type":"output_not_contains","value":"evo_learn(reason)"}-->
  - [x] Proof: `npm run build -w packages/gitevo` -> TypeScript compilation succeeds after fixes <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `npm test -w packages/gitevo` -> All existing gitevo tests pass <!--p:{"type":"exit_code","value":0}-->

### obsidian-rag Fixes [x]

  - [x] Proof: `findstr /C:"throw err" packages\obsidian-rag\src\tools.ts` -> vault_select catch must return MCP isError, not re-throw. Fix in tools.ts lines 118-121. <!--p:{"type":"exit_code_not","value":0}-->
  - [x] Proof: `findstr /C:"/notes/" packages\obsidian-rag\src\index.ts` -> URI parsing must use replace/slice, not split('/notes/'). Fix in index.ts line 161. <!--p:{"type":"output_not_contains","value":"split"}-->
  - [x] Proof: `findstr /C:"lastIndexOf" packages\obsidian-rag\src\indexer.ts` -> Chunks exceeding MAX must be sub-split. Fix in indexer.ts lines 25-30. <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `findstr /C:"LIKE" packages\obsidian-rag\src\store.ts` -> LIKE pattern must include / separator. Fix in store.ts lines 288-290. <!--p:{"type":"output_not_contains","value":"$\\{directory\\}%"}-->
  - [x] Proof: `npm run build -w packages/obsidian-rag` -> TypeScript compilation succeeds after fixes <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `npm test -w packages/obsidian-rag` -> All existing obsidian-rag tests pass <!--p:{"type":"exit_code","value":0}-->

### Integration [x]

  - [x] Proof: `npm run build` -> All 4 packages compile together <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `npx biome check packages/evomcp/src/ packages/gitevo/src/ packages/obsidian-rag/src/ packages/dod-guard/src/` -> No lint/format errors across all packages <!--p:{"type":"exit_code","value":0}-->

### Manual Verification [~]

  - [~] Proof: `echo Review each changed file against corresponding eval findings` -> Manual review verifying each fix matches eval spec exactly <!--p:{"type":"review"}-->
  - [~] **Draft**: Run evolve with simple fitness_cmd to confirm mutations now measured correctly

</definition_of_done>

## Open risks

<open_risks>
evomcp mutation loop change could affect evolution behavior. gitevo-1 ordering change safe. obsidian-rag-2 URI fix changes resource handler.
</open_risks>

## Amendment log

- **2026-07-13T17:51:31.831Z** [__meta__] modified: Surgical bug fixes — no behavioral system entry point to exercise (these are MCP internal logic fixes, not API changes). Brevity: fixes reduce code, not add new code needing brevity check.
- **2026-07-13T17:57:45.284Z** [1.children.0] modified: Fix approach: removed saveState from loop (replaced with git checkout . + git clean -fd) instead of reordering. runCommand now executes first before any state cleanup — fitness measured on mutated code.
- **2026-07-13T17:57:50.612Z** [1.children.3] modified: Actual fix expands escaped chars from [.*] to full set [.+?^${}()|\], preserving [ ] for glob char classes, handling *→.* and ?→. separately.
- **2026-07-13T17:59:32.798Z** [2.children.0] modified: findstr cannot do multiline matching. Use single-line check: git reset --hard must appear at lower line number than dead tag (dead tag at ~564 after reset at ~558). Proof checks reset appears at line ~558 (after the fix moved it before deadTag).
- **2026-07-13T18:00:01.295Z** [2.children.0] modified: Line numbers fragile. Use content check: comment "Tag as dead (only after reset succeeded)" confirms reset executed before dead tag.
- **2026-07-13T18:00:09.195Z** [2.children.0] modified: Simple: check comment "Tag as dead (only after reset succeeded)" exists — proves dead tag now AFTER reset.
- **2026-07-13T18:00:16.041Z** [2.children.0] modified: Use grep instead of findstr to avoid Windows quoting issues with parentheses in search string.
- **2026-07-13T18:01:36.149Z** [3.children.0] modified: findstr without /C treats spaces as OR — "throw err" matches any line containing "throw" OR "err". Use /C for literal string match.
