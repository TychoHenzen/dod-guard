---
name: clean-house
description: >
  Aggressively hunts down and removes duplicate/obsolete implementations using git archaeology.
  Finds old versions of replaced features, traces authorship via git blame, migrates confused-model
  changes to the current version, then deletes dead code. Backwards compatibility is treated as
  irrelevant unless proven otherwise. Use when you find "v1"/"v2", "old"/"new", or "legacy"
  variants of the same thing, when code-review-graph flags dead symbols, or when jscpd shows
  high duplication. Trigger: "clean house", "dedupe", "clean up old versions", "remove dead
  implementations", "consolidate duplicates", "find stale code", "debloat", "what's redundant here".
compatibility: language-agnostic (uses git, grep, and structural analysis)
---

# Clean House

## Overview

LLMs constantly refuse to delete old code. They add new implementations alongside old ones — v2 next to v1, "new" handlers next to "old" ones, rewritten modules next to the originals. Then they get confused about which version is current and apply changes to the wrong one.

This skill hunts down every such duplicate, traces its history through git, and aggressively removes dead weight. The default answer to "should we keep the old version for backwards compatibility?" is **NO**. Code deleted is code in git history — it's never truly gone.

**Announce at start:** "Cleaning house — hunting duplicate and obsolete implementations. Assume nothing is sacred."

## When to Use vs Skip

### Use clean-house when:

- You find two functions/classes/files that do the same thing
- Versioned APIs coexist (`/api/v1/users` + `/api/v2/users`)
- Files named `*-old.*`, `*-legacy.*`, `*-new.*`, `*-v2.*`
- Directories like `compat/`, `shims/`, `legacy/`, `old/`
- jscpd or code-review-graph reports dead/duplicate code
- A rewrite shipped but the old code was never deleted
- You catch yourself or an LLM editing the WRONG version of a feature

### Skip clean-house when:

- You're in a public library/SDK where the old API has real consumers
- The old and new versions serve genuinely different use cases (not just "old way / new way")
- The "duplicate" is actually a facade/adapter with different semantics
- Trivial copy-paste in tests that test different behaviors

**When in doubt: run it anyway.** The skill won't delete without showing you what it found. Worst case you learn something about your codebase.

## The Problem: How Duplicates Happen

### Pattern 1: Rewrite Without Cleanup

```
1. Implement feature in src/auth/login.ts
2. Realize approach is wrong, create src/auth/login-v2.ts
3. Wire up v2, forget to delete v1
4. v1 sits there for 6 months, confusing every LLM that reads the codebase
```

### Pattern 2: Confused Model

```
1. Duplicate implementations exist (old + new)
2. LLM searches for "login handler", finds old one first
3. Implements the feature change on the OLD handler
4. Change never reaches production path, bug persists
5. Old version now has commits NEWER than the new version
```

### Pattern 3: Versioned APIs That Never Die

```
1. /api/v1/endpoint created
2. /api/v2/endpoint replaces it
3. v1 deprecated "temporarily" — never removed
4. Both maintained in parallel, doubling work
```

### Pattern 4: Refactor Leftovers

```
1. Extract helper function from large method
2. Original inline code deleted
3. But old helper from PREVIOUS refactor still exists
4. Now there are two helpers doing the same thing
```

## The Four Phases

### Phase 1: HUNT — Find the Duplicates

Cast a wide net. Every candidate found here goes to Phase 2 for analysis.

#### 1.1 Structural Name Scan

Search for files, functions, and classes with version/age markers.

**Use `rg` for every scan in this skill, including filename scans.** `rg` is
cross-platform and identical on Windows and POSIX; `find` with `\( -name ... \)`
is POSIX-only and silently fails or behaves differently under cmd.exe. See
Platform Notes.

```bash
# Version suffixes in code
rg -l "v1|v2|v3|_v[0-9]" -g "*.{ts,js,py,rs,go,cs,java}"

# Old/new/legacy markers in FILENAMES (rg --files lists paths, then filter)
rg --files | rg -- "-(old|legacy|new|deprecated|compat|shim)|_(old|legacy|new)"

# Directories suggesting obsolete code
rg --files | rg -- "/(old|legacy|compat|shims|deprecated|v1)/"
```

#### 1.2 Near-Name Clusters

Find files whose names differ only by a suffix/prefix — strong duplicate signal:

```bash
# List all source files sorted by name, then scan for clusters
# e.g., auth.ts, auth-v2.ts, auth_new.ts, auth_old.ts
rg --files -g "*.{ts,js,py,rs,go,cs,java}" | sort
```

Never pipe to `less` here — it's an interactive pager and will hang a
non-interactive agent session waiting for a keypress that never comes.

Focus on clusters where names share a common stem but diverge with markers like `-v2`, `-new`, `_old`, `2`, `Compat`, `Legacy`, `Shim`, `Impl`, `Better`.

#### 1.3 Route Handler Duplication

For web/API projects, find duplicate endpoint registrations:

```bash
# Express-style
rg "router\.(get|post|put|delete|patch)\(" --no-heading

# Next.js App Router — duplicate route files
find app -name "route.ts" -o -name "route.js" | sort

# Fastify/Hono/etc — similar patterns
rg "\.(get|post|put|delete|patch)\(" --no-heading -g "*.ts" -g "*.js"
```

Group by URL path. Same path with different prefixes/handlers = candidate.

#### 1.4 Dead Code Detection

If code-review-graph is available:

```
mcp__code-review-graph__refactor_tool(mode="dead_code")
```

**Caveat**: ~50% false positive rate (flags file-level constants used within the same file). Always grep-verify before deleting anything flagged as dead.

#### 1.5 Literal Copy-Paste Detection (jscpd)

```bash
npx jscpd src --reporters json --silent --min-tokens 50 --min-lines 5
```

Parse the JSON output for duplicate blocks. Same code in two places = one of them is probably the wrong one.

#### 1.6 Export-Only Files

Files that export nothing new — just re-export from elsewhere:

```bash
# Files where every export is `export { X } from './other'`
rg "^export\s+\{" --no-heading -g "*.ts" -g "*.js"
```

These are often leftover barrel files for deleted modules.

#### Hunt Report

After all scans, produce a ranked table:

```markdown
| # | Old | New | Signal | Confidence |
|---|-----|-----|--------|------------|
| 1 | src/auth/login-old.ts | src/auth/login.ts | Name cluster + dead refs | HIGH |
| 2 | /api/v1/users handler | /api/v2/users handler | Versioned route | HIGH |
| 3 | legacyParser() in parse.ts | parseV2() in parse.ts | Near-name + same file | MEDIUM |
| 4 | compat/wrapper.ts | src/wrapper.ts | Legacy directory | MEDIUM |
```

Confidence:
- **HIGH**: Same author, old not referenced, new has tests
- **MEDIUM**: Different author, OR old has some references, OR unclear which is canonical
- **LOW**: Unclear relationship, might be genuinely different things

Only HIGH and MEDIUM proceed to Phase 2. LOW candidates are noted but skipped.

### Phase 2: BLAME — Git Archaeology

For each candidate pair, determine authorship and timeline. This is what turns "maybe dead" into "definitely dead."

#### 2.1 Timeline Analysis

```bash
# When was each file first created?
git log --diff-filter=A --follow --format="%H %ai %an" -- <file>

# When was each file last modified?
git log -1 --format="%H %ai %an" -- <file>

# Full commit history for each file (last 20 commits)
git log --oneline -20 -- <file>
```

Key question: **which file was created FIRST?** Usually old → new. But sometimes "new" was created first and "old" is actually a misnamed copy.

#### 2.2 Authorship Check

```bash
# Who wrote each file? (most recent commit per line)
git blame --line-porcelain <file> | grep "^author " | sort | uniq -c | sort -rn

# Who committed changes?
git shortlog -sn -- <file>
```

**Same-author rule**: If the same person (or same LLM session) wrote both old and new, the old version is likely safe to delete — the old one was the first attempt, the new one is the real one.

⚠️ **Check whether this heuristic can discriminate in this repo before using it.**
In a solo repo, or any repo where an agent commits under the human's identity
(the common setup — agent attribution lives in a `Co-Authored-By` trailer, not
the author field), `git blame` reports the same author for everything and this
rule returns "safe to delete" unconditionally. Test it:

```bash
git shortlog -sn | head
```

One dominant author → the rule carries no signal. Say so, drop it, and lean on
the checks that do discriminate: reference count (3.1), test coverage (3.2), and
which file the runtime actually reaches (3.3). A heuristic that always fires is
not evidence.

#### 2.3 Confused-Model Detection (CRITICAL)

This is the most important check in the entire skill. **If the old version has commits dated AFTER the new version was created, an LLM almost certainly got confused and edited the wrong file.**

```bash
# Get the creation date of the NEW version
NEW_CREATED=$(git log --diff-filter=A --follow --format="%ai" -- <new-file> | tail -1)

# List commits on the OLD version AFTER the new version was created
git log --oneline --after="$NEW_CREATED" -- <old-file>
```

**If commits exist after `$NEW_CREATED`:**

1. **Read those commits' diffs:**
   ```bash
   git log -p --after="$NEW_CREATED" -- <old-file>
   ```

2. **For each change, ask:**
   - Is this a bug fix that should apply to the NEW version?
   - Is this a feature addition that belongs in the NEW version?
   - Is this a refactoring that only makes sense on the old API?

3. **Migration decision:**
   - **Bug fixes / feature additions** → MIGRATE to new version before deleting old
   - **Old-API-specific changes** → safe to discard (the old API is going away)
   - **If unsure** → flag for manual review, show the diff to the user

4. **Apply migrations BEFORE deletion:**
   ```
   For each change to migrate:
     1. Read the diff from the old file
     2. Apply equivalent change to the new file
     3. Verify the new file's tests still pass
   ```

**Red flag**: If the old version has MORE recent commits than the new version, it's possible the "new" version was abandoned and the "old" version is actually current. Check:
- Which file is imported by the rest of the codebase?
- Which file has test coverage?
- Which file was most recently deployed?

#### 2.4 Divergence Analysis

```bash
# How different are the two files now? --no-index is REQUIRED — without it git
# treats both paths as pathspecs and diffs working tree vs index, which answers
# a completely different question.
git diff --no-index --stat <old-file> <new-file>

# If they're nearly identical, one is just a stale copy → delete
# If they've diverged significantly, check what diverged
git diff --no-index <old-file> <new-file> | head -200
```

`git diff --no-index` exits 1 when the files differ. That's expected, not an error.

#### Blame Report

For each pair:

```markdown
### src/auth/login-old.ts → src/auth/login.ts

- **Old created**: 2025-03-15 by Tycho
- **New created**: 2025-06-02 by Tycho
- **Same author**: YES → strong delete signal
- **Old modified after new created**: YES — 2 commits on 2025-07-01
  - `a1b2c3d`: "fix: handle null session" → **MIGRATE** (bug fix, applies to new version)
  - `d4e5f6g`: "add debug logging" → **MIGRATE** (general improvement)
- **New has tests**: YES (login.test.ts)
- **Old referenced by**: NOTHING (zero imports, zero calls)

**Verdict**: DELETE old. Migrate 2 commits to new first.
```

### Phase 3: VERIFY — Safety Check

Before deleting anything, prove it's safe.

#### 3.1 Reference Check

```bash
# Search entire repo for references to the old symbol/file
rg "<old-function-name>|<old-class-name>|<old-file-basename>" --no-heading

# Check imports specifically
rg "from.*<old-file>" --no-heading
rg "require.*<old-file>" --no-heading
rg "import.*<old-file>" --no-heading

# Check config files
rg "<old-symbol>" -g "*.{json,yaml,yml,toml,config.js,config.ts,env*}"

# Check documentation
rg "<old-symbol>" -g "*.md"

# Check build/CI scripts
rg "<old-symbol>" -g "*.{sh,bash,yml,yaml,ps1,cmake,Makefile,Dockerfile}"
```

#### 3.2 Test Coverage Check

```bash
# Does the NEW version have tests?
rg "<new-function-name>" -g "*.test.*" -g "*_test.*" -g "*Test*" -g "*Spec*"

# Do any tests reference the OLD version?
rg "<old-function-name>" -g "*.test.*" -g "*_test.*" -g "*Test*" -g "*Spec*"
```

If tests reference the old version: update them to test the new version instead. If the old tests cover behavior the new tests don't, port those test cases.

#### 3.3 Runtime Path Check

For route handlers, verify the old route isn't in the active request path:

```bash
# Find where routes are registered
rg "registerRoutes|app.use|Router\(\)|createRouter" --no-heading
```

For function calls, trace the call graph from entry points to verify the old function isn't on any active path.

#### Verify Report

```markdown
| # | Old Symbol | References Found | Action |
|---|-----------|-----------------|--------|
| 1 | login-old.ts | 0 imports, 0 calls, 0 config | DELETE |
| 2 | legacyParser | 2 test files reference it | UPDATE tests → DELETE |
| 3 | /api/v1/users | 1 config file, 0 runtime | UPDATE config → DELETE |
```

**Blocking conditions** (do NOT delete without resolution):
- Referenced by production config that can't be changed
- Imported by an external package (published API)
- Active route still receiving traffic (check logs)
- Documentation that users rely on (update docs first)

### Phase 3.5: APPROVAL GATE — Stop Here

**Deletion does not start until the user says so.** Everything up to this point
is read-only analysis. Everything after it runs `git rm` and `npm remove`.

Present the consolidated plan and **wait for an explicit yes**:

```markdown
## Clean House — Deletion Plan (awaiting approval)

**Delete (N files, ~M lines):**
- `src/auth/login-old.ts` (187 lines) — 0 refs, superseded by login.ts
- `legacyParser()` in `src/parse/utils.ts` (43 lines) — 2 test refs, will update

**Migrate first (confused-model changes):**
- `a1b2c3d` "fix: handle null session" → port to `src/auth/login.ts`

**Update (not delete):**
- `src/app.ts:42` — swap legacyAuth → authV2

**Blocked / needs your call:**
- `/api/v1/users` — still referenced in `deploy/prod.yaml`

Approve deletion?
```

Rules for this gate:

- **Silence is not approval.** No answer → do nothing.
- **Partial approval is normal.** The user may approve items 1 and 3 but not 2.
  Delete exactly what was approved; leave the rest and say so in the report.
- **Anything the user did not see in this plan does not get deleted.** If Phase 4
  uncovers another candidate, it goes on the next plan, not into this pass.
- **Re-gate after a plan change.** If migration reveals the plan was wrong,
  return here with a corrected plan rather than improvising.

This gate exists because the rest of this skill is deliberately aggressive, and
"git history is the safety net" is only true for work that was committed. It is
not true for uncommitted changes, untracked files, or a reader's memory of why
something existed.

### Phase 4: CLEAN — Aggressive Removal

Runs only on the approved subset from Phase 3.5.

#### 4.1 Migrate Confused-Model Changes First

For each change flagged in Phase 2.3:
1. Read the old file's diff
2. Apply equivalent logic to the new file
3. Run the new file's tests
4. Commit: `"migrate: port <change-description> from <old-file> to <new-file>"`

#### 4.2 Delete Old Files

```bash
git rm <old-file>
# or if not tracked by git in the same way:
rm <old-file>
```

Delete the ENTIRE file. No "comment out just in case." No "add @deprecated comment." Delete it.

#### 4.3 Remove Old Imports and References

For each reference found in Phase 3:
- Remove import lines
- Update re-exports (barrel files)
- Update config entries
- Remove old route registrations

#### 4.4 Update Tests

- Delete test files that ONLY tested the old implementation
- If old tests had coverage the new tests lack: port those test cases to the new test file
- Remove old test fixtures, mocks, and test data

#### 4.5 Clean Dependencies

If the old code was the only consumer of a dependency:
```bash
# Check if package is still imported elsewhere
rg "<package-name>" --no-heading -g "*.{ts,js,py,rs,go}"

# If not: remove it
npm remove <package>  # or equivalent
```

#### 4.6 Verify Cleanup

```bash
# Build must pass
npm run build  # or equivalent

# Full test suite must pass
npm test  # or equivalent

# Lint must pass
npx biome check  # or equivalent

# Verify old symbols are GONE
rg "<old-symbol>" --no-heading  # should return nothing
```

#### 4.7 Report

```markdown
## Clean House — Complete

### Deleted
- `src/auth/login-old.ts` (187 lines) — replaced by `src/auth/login.ts`
- `legacyParser()` in `src/parse/utils.ts` (43 lines) — replaced by `parseV2()`
- `/api/v1/users` route + handler (92 lines) — replaced by `/api/v2/users`
- `compat/shims.ts` (34 lines) — no consumers

### Migrated
- 2 confused-model changes from `login-old.ts` → `login.ts`:
  - `a1b2c3d`: null session handling
  - `d4e5f6g`: debug logging

### Tests Updated
- `login-old.test.ts` → deleted (behavior now covered by `login.test.ts`)
- `parse.test.ts` → updated references from `legacyParser` to `parseV2`

### Before → After
- Lines removed: 356
- Files deleted: 4
- Confused-model changes rescued: 2
- Build: ✅  |  Tests: ✅  |  Lint: ✅
```

---

## The Confused-Model Pattern (Reference)

This pattern is so common it gets its own section. Learn to recognize it:

```
TIMELINE:
  Jan:  feature.ts created (version 1)
  Mar:  feature-v2.ts created (version 2, better approach)
  Mar:  All imports switched to feature-v2.ts
  Apr:  LLM tasked with "add error handling to feature"
  Apr:  LLM searches, finds feature.ts first, edits it
  Apr:  feature.ts now has NEWER commit than feature-v2.ts
  Apr:  Error handling never reaches production (wrong file)
  Jun:  You run clean-house, find the orphaned fix, migrate it
```

**Every time you find an old version with recent commits, assume this happened.** The fix isn't to keep the old version — it's to port those changes to the new version and delete the old one.

---

## Platform Notes

### Windows (cmd.exe / Git Bash)

**Prefer `rg` for every scan.** It behaves identically on both platforms, so the
commands in this skill work as written. The alternatives do not:

- `find` — Git Bash has Unix `find`; cmd.exe's `find` is a completely different
  program (it searches file *contents*). `find . -type f \( -name ... \)` fails
  under cmd.exe. Use `rg --files` and filter.
- `grep` — not present in cmd.exe. Use `rg`, or `findstr` if you must.
- `less` and other pagers — never in an agent session; they wait for input forever.
- `git blame` / `git log` / `git rm` — identical on all platforms, safe to use directly.
- Deletion: `git rm` when tracked. Untracked: `rm` in Git Bash, `del` in cmd.exe.
- Path separators: `/` in Git Bash, `\` in cmd.exe. `rg` accepts `/` on both.
- jscpd: `npx jscpd` is cross-platform; `--silent` suppresses progress output.

**Don't mix dialects mid-command.** Pick the shell you're actually in and write
native syntax for it. Translating one shell's quoting into another is the single
most common way these scans fail silently and return nothing — which reads
exactly like "no duplicates found."

### POSIX (Linux/macOS)

- All grep/rg/find commands work natively
- jscpd available via npm/npx

---

## Quick Reference: Commands

### Hunt
```bash
# Name clusters (rg is cross-platform; find is POSIX-only)
rg --files | rg -- "-(old|legacy|new|v2|deprecated)" | sort

# Version markers in code
rg -n "(v1|v2|v3|legacy|deprecated|old_|_old|compat)" --type-add 'src:*.{ts,js,py,rs,go}' --type src

# Dead code (code-review-graph)
mcp__code-review-graph__refactor_tool(mode="dead_code")

# Literal duplicates
npx jscpd src --reporters json --silent --min-tokens 50 --min-lines 5
```

### Blame
```bash
# Creation date
git log --diff-filter=A --follow --format="%ai %an" -- <file> | tail -1

# Last modification
git log -1 --format="%ai %an: %s" -- <file>

# Authorship breakdown
git blame --line-porcelain <file> | grep "^author " | sort | uniq -c | sort -rn

# Commits on old file after new file was created
git log --oneline --after="<new-file-creation-date>" -- <old-file>
```

### Verify
```bash
# All references to old symbol
rg "<symbol>" --no-heading -g "!.git"

# Import references specifically
rg "from.*<file-stem>" --no-heading
rg "import.*<file-stem>" --no-heading
rg "require.*<file-stem>" --no-heading

# Test coverage for new version
rg "<new-symbol>" -g "*test*" -g "*spec*" -g "*Test*" --no-heading
```

### Clean
```bash
# Delete
git rm <old-file>

# Verify gone
rg "<old-symbol>" --no-heading  # must return nothing

# Gate checks
npm run build && npm test
```

---

## Hard Rules

| Rule | Rationale |
|------|-----------|
| **Never delete without user approval** | Phase 3.5 is a hard stop. Showing a report is not the same as being told yes. |
| **Never keep old version "just in case"** | Git history IS your safety net — for committed work. Verify the deletion target is committed first. |
| **Same author = delete, IF that test discriminates** | In a single-author repo it always returns true and proves nothing. Check `git shortlog -sn` first. |
| **Migrate confused-model changes, don't discard them** | Those changes represent real work done on the wrong file. |
| **Grep before delete, every time** | code-review-graph dead_code has ~50% false positives. |
| **Full test suite after cleanup** | Catch regressions from over-aggressive deletion. |
| **Delete entire file, not just contents** | Empty files and commented-out code confuse LLMs just as much. |
| **One pair at a time** | Delete → verify → commit. Don't batch deletions. |
| **Never delete without showing the report** | User must see what's being removed and why. |
| **Port test coverage, don't lose it** | If old tests covered behavior new tests don't, port the test cases. |
| **Remove old deps** | `npm remove` / equivalent for packages only used by deleted code. |

---

## Integration with Other Skills

| Skill/Tool | How It Helps |
|------------|-------------|
| `code-review-graph` `refactor_tool(mode="dead_code")` | Primary dead-symbol scanner |
| `code-review-graph` `get_impact_radius_tool` | Verify old code isn't on active call paths |
| `dod-guard` `exit_code_not` predicate | Prove old symbols are gone — `rg "<old-symbol>"` with `exit_code_not: 0` passes when ripgrep finds nothing |
| `dod-guard` `output_not_contains` predicate | Prove a specific file or import no longer appears in build/lint output |
| `dod-guard:adversarial-workflow` (Phase 2) | Audit test coverage before and after migrating test cases |
| `gitevo` `evo_learn` | Record what was cleaned and why |

There is no `streamline`, `brevity`, or `duplication` predicate or category —
those were removed when dod-guard went behavioral-only. Valid predicates are the
7 behavioral (`exit_code`, `exit_code_not`, `output_contains`,
`output_not_contains`, `output_matches`, `output_not_matches`, `tdd`) plus
`adversarial`, `holdout`, `convergence`. Valid categories are `behavioral`,
`wiring`, `test_audit`, `other`.

---

## Example Run

```
User: "clean house"

Agent: "Cleaning house — hunting duplicate and obsolete implementations."

=== PHASE 1: HUNT ===

Scanning name clusters... found 4 candidates.
Scanning route handlers... found 2 candidates.
Running jscpd... 3 duplicate blocks found (82% similarity threshold).
code-review-graph dead_code... 7 unreferenced symbols (verifying each).

Hunt Report:
| # | Old | New | Signal | Confidence |
|---|-----|-----|--------|------------|
| 1 | src/utils/format-old.ts | src/utils/format.ts | Name cluster | HIGH |
| 2 | legacyAuth middleware | authV2 middleware | Near-name + same dir | HIGH |
| 3 | /api/v1/health route | /api/v2/health route | Versioned route | MEDIUM |
| 4 | parseLegacy() in parse.ts | parseModern() in parse.ts | Same-file cluster | MEDIUM |

Proceeding to Phase 2 for all 4 candidates...

=== PHASE 2: BLAME ===

Candidate 1: src/utils/format-old.ts → src/utils/format.ts
  Old created: 2025-11-03 by Tycho
  New created: 2025-12-15 by Tycho
  Same author: YES
  Old modified after new created: NO
  Verdict: SAFE TO DELETE

Candidate 2: legacyAuth → authV2
  Old created: 2025-08-20 by Tycho
  New created: 2026-01-10 by Claude
  Same author: NO
  Old modified after new created: YES — 1 commit
    b7c8d9e (2026-03-05): "add rate limiting to auth"
  ⚠ CONFUSED MODEL DETECTED: rate limiting was added to OLD middleware.
  Diff shows it's a general feature — applicable to new middleware.
  Verdict: MIGRATE rate limiting to authV2, THEN delete legacyAuth

[... remaining candidates ...]

=== PHASE 3: VERIFY ===

Candidate 1: format-old.ts
  References: 0 imports, 0 calls, 0 config
  Test coverage: format.ts has format.test.ts (89% coverage)
  ✅ SAFE

Candidate 2: legacyAuth
  References: 1 import in src/app.ts (line 42)
  Test coverage: authV2 has authV2.test.ts
  ⚠ MUST update src/app.ts line 42 before deleting

=== PHASE 3.5: APPROVAL GATE ===

Deletion plan: 3 files (~423 lines), 1 migration, 1 reference update.
  DELETE  src/utils/format-old.ts (187 lines, 0 refs)
  DELETE  legacyAuth middleware (src/auth/legacy.ts, 1 ref — will update)
  DELETE  parseLegacy() from src/parse.ts
  MIGRATE b7c8d9e "add rate limiting to auth" → authV2
  UPDATE  src/app.ts:42 legacyAuth → authV2

Approve deletion?

User: "yes, but keep parseLegacy for now"

Approved: format-old.ts, legacyAuth (+ migration + reference update).
Skipped by user: parseLegacy.

=== PHASE 4: CLEAN ===

Migrating confused-model changes:
  ✅ "add rate limiting to auth" ported from legacyAuth → authV2

Deleting (approved subset only):
  ✅ git rm src/utils/format-old.ts
  ✅ Removed legacyAuth middleware (src/auth/legacy.ts)
  ⊘ parseLegacy() — SKIPPED per user

Updating references:
  ✅ src/app.ts line 42: legacyAuth → authV2

Verifying:
  ✅ Build: PASS
  ✅ Tests: 142/142 PASS
  ✅ Lint: PASS
  ✅ rg "format-old|legacyAuth": NO RESULTS
  (parseLegacy still present — intentional, user deferred)

=== CLEAN HOUSE COMPLETE ===
Lines removed: 230
Files deleted: 2
Confused-model changes rescued: 1 (rate limiting)
Deferred by user: 1 (parseLegacy)
All gates green.
```
