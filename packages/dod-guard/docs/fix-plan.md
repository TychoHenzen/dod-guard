# dod-guard — Fix Plan

Derived from `shortcomings.md` (investigation 2026-07-20). Each step is atomic enough to hand to a single `/step-by-step` subagent. Steps are ordered so earlier ones unblock later ones. Findings addressed are noted as `(#N)`.

Root theme: the agent being verified retains write authority over the definition of "verified." The plan attacks that on two fronts — (a) close the tamper/fingerprint holes so store-side weakening is detectable, and (b) add positive-evidence + VCS-state binding so machine proofs can't be trivially satisfied.

---

## Step 1 — Unify the three fingerprint implementations into one (#9, #4, #10)

**Problem:** `store.migrateDoc` (store.ts:150-165) computes a 64-char sorted SHA-256; `computeProofFingerprint` (checker.ts:118-130) computes a 12-char unsorted hash over fewer fields. Migrated docs are bricked into permanent false-TAMPER FAIL.

**Change:**
- Delete the fingerprint computation inside `store.migrateDoc`; import and call `computeProofFingerprint` instead. There must be exactly one fingerprint function in the codebase.
- Expand `computeProofFingerprint` to hash **every strength-bearing field**, not just `command | type | value`: add `timeout_ms`, `extract`, `category`, `min_replacement_ratio`, `max_function_lines`, `max_file_lines`, `max_line_length`, `max_complexity`, `baseline_value`, and the existing conditional `lib:`/`adv:`.
- Stop truncating to 12 hex chars — use the full SHA-256.
- Keep field ordering deterministic (sort leaves by node id or path, then serialize fields in a fixed key order) so migrate and checker always agree.

**Verify:** migrate a legacy doc via `dod_store_migrate`, then `dod_check` — must NOT report TAMPER. Existing checker/store tests pass; add a test asserting migrate-then-check yields `tampered === false`.

**Files:** `store.ts`, `checker.ts`, `types.ts` (if a shared helper module is cleaner, create `fingerprint.ts` and re-export).

---

## Step 2 — Store-side weakening is now detected; add a regression test proving it (#4)

**Problem:** editing store JSON to set `max_function_lines: 9999`, loosen an `extract`, or overwrite `baseline_value` previously left `tampered === false`.

**Change:** No new production code beyond Step 1 — this step is the *proof* that Step 1 closed the hole.
- Add tests that mutate each newly-hashed field in a stored doc and assert `dod_check` reports TAMPER.
- One test per field family: threshold (`max_*`), `extract`, `baseline_value`, `timeout_ms`, `category`.

**Files:** `checker.test.ts` (or a new `fingerprint.test.ts`).

---

## Step 3 — Bind every full `dod_check` to captured VCS state (#3)

**Problem:** no `git status`/`rev-parse` anywhere. A PASS means "each command exited happily at some point," not "the current code satisfies all of them simultaneously." Proofs can pass against uncommitted/half-reverted state.

**Change:**
- At the start of a **full** `dod_check` (not scoped), capture `git rev-parse HEAD` and a dirty flag (`git status --porcelain` non-empty). Run in the DoD's working directory.
- Store `checked_commit` + `checked_dirty` on the `CheckResult`.
- If the tree is dirty, downgrade a would-be PASS to a new `PASS_DIRTY` verdict (or force INCOMPLETE with a "dirty tree" note) — a clean PASS requires a clean tree. Make the behavior configurable via a DoD-level flag (`allow_dirty_pass`) defaulting to strict.
- Handle non-git directories gracefully (skip binding, note "not a git repo").

**Verify:** run `dod_check` with a dirty tree → no clean PASS; commit → clean PASS. Add tests mocking `child_process` git calls.

**Files:** `checker.ts`, `types.ts` (CheckResult fields, verdict enum), `index.ts` (surface commit/dirty in output).

---

## Step 4 — Run proofs against a frozen snapshot so they can't dirty each other (#3)

**Problem:** proofs run sequentially in the live tree; `detectMutatingFlags` only *warns*. Proof N can dirty the tree proof N+1 reads → ordering-dependent verdicts.

**Change:**
- Before executing leaves in a full `dod_check`, create an ephemeral checkout of `checked_commit` (git worktree in a temp dir, or `git archive | tar -x` into temp). Run all proof commands with `cwd` set to that snapshot.
- Tear down the worktree/temp dir after the run (guaranteed cleanup, even on throw).
- If the tree is dirty and `allow_dirty_pass` is set, fall back to running in-place (snapshot only reflects committed state) and note it.
- Windows: use `git worktree add` (works on win32); ensure temp path cleanup handles locked files.

**Verify:** a proof that runs `tsc` (writes dist) must not leave the real tree dirty after `dod_check`. Add an integration test.

**Files:** `checker.ts`, new `snapshot.ts` helper.

**Note:** depends on Step 3 (needs `checked_commit`). This is the largest step — if it must be split, do worktree creation first, then wire proof `cwd` into it.

---

## Step 5 — Replace the placeholder blocklist with positive-evidence requirements (#2)

**Problem:** `isPlaceholderCommand()` (command-check.ts:394-412) is a fixed regex blocklist. `echo PASS` + `output_contains: "PASS"` passes; a blocklist can never enumerate all always-zero commands, and it only warns.

**Change:**
- For behavioral categories (`test`, `integration_behavioral`, `integration_wiring`), require **positive evidence** rather than blocklisting negatives:
  - Require the command to reference at least one file that appears in the working-tree diff (`git diff --name-only` against the DoD's base), OR
  - Require a `tdd` predicate (RED→GREEN transition), OR
  - Require an explicit `skip_reason`.
- Make this a **hard gate** at `dod_refine`/`dod_amend` concretize time for those categories, not a runtime warning.
- Keep `isPlaceholderCommand` as a secondary advisory, but the positive-evidence gate is the real teeth.

**Verify:** refining a `test`-category leaf with `echo PASS` and no changed-file reference is rejected; a real `node --test dist/foo.test.js` where `foo.ts` changed is accepted. Tests for both.

**Files:** `command-check.ts`, `baseline.ts` (gate wiring), `index.ts` (rejection surfacing).

---

## Step 6 — Static analyzers target changed files, not the command string (#6)

**Problem:** `assertions`/`observability`/`brevity` derive target files by regex-scanning the proof command text (evaluate-proof.ts:217, 251, 309). Point the command at an already-clean file and the proof passes while the real change sits elsewhere.

**Change:**
- Add an `analysis_targets` resolution that intersects the files named in the command with the working-tree diff (`git diff --name-only` against base commit from Step 3).
- If the intersection is empty (command analyzes files that didn't change), fail the proof with "analyzer target does not overlap changed files."
- Allow an explicit `skip_reason` / explicit `targets` override for legitimate whole-repo checks.

**Verify:** an `observability` proof pointed at an unchanged file fails; pointed at the changed file passes. Tests for both.

**Files:** `evaluate-proof.ts`, `checker.ts` (pass base commit through), `command-check.ts`.

**Depends on Step 3** (needs the base commit for the diff).

---

## Step 7 — Protect the regression baseline (#5)

**Problem:** `hRegress` (evaluate-proof.ts:145-180) self-captures `baseline_value` on first run and returns `status: "pass"` for free; the agent picks the favorable capture moment, and (pre-Step-1) the baseline wasn't fingerprinted.

**Change:**
- First-run capture must NOT return `pass`. Return a new `status: "baseline_captured"` (neither pass nor a gate satisfaction) so a locked-tree PASS cannot be reached on the capture run.
- Once captured, `baseline_value` is now in the fingerprint (Step 1), so store edits to it are TAMPER.
- Optionally require the baseline to be captured against a committed HEAD (record `baseline_commit` alongside the value).

**Verify:** first regression run yields `baseline_captured`, not PASS; a full `dod_check` on that run is INCOMPLETE. Second run compares and can PASS. Editing stored `baseline_value` → TAMPER. Tests for all three.

**Files:** `regression.ts`, `evaluate-proof.ts`, `types.ts`, `checker.ts`.

---

## Step 8 — Turn amendment warnings into gates (#1)

**Problem:** `dod_amend` recomputes the fingerprint on every edit; the only friction is a machine→manual block and an "excessive amendment cycles" *warning* after >2 amends (checker.ts:379-381). A warning is not a gate.

**Change:**
- After N amendments to the same node (default 3), require an explicit `amend_justification` on further amends to that node; reject without it.
- Block strength-reducing amends outright unless justified: loosening a threshold (`max_* increased`, `min_* decreased`), widening a regression tolerance, or removing an `extract`. Detect by comparing old vs new predicate fields.
- Record justifications in the existing audit trail.

**Verify:** 4th unjustified amend to a node is rejected; loosening `max_function_lines` without justification is rejected; with justification it succeeds and is logged. Tests.

**Files:** `index.ts` (dod_amend handler), `checker.ts` (amend-count + strength-delta detection), `types.ts` (audit entry fields).

---

## Step 9 — Gate first execution of imported DoDs (#7)

**Problem:** `dod_import` + `dod_check` runs arbitrary shell via `exec()` with no consent step, allowlist, or sandbox.

**Change:**
- Mark imported docs with `import_source` + `execution_confirmed: false`.
- `dod_check` refuses to execute concrete leaves of an unconfirmed imported doc; returns the list of commands it *would* run and instructs the caller to confirm.
- Add `dod_confirm_import` (or a `confirm: true` param on the first `dod_check`) that flips `execution_confirmed` after the human has seen the commands.
- Author-created (non-imported) docs are unaffected.

**Verify:** `dod_import` then `dod_check` returns the command list without executing; after confirmation, execution proceeds. Tests.

**Files:** `index.ts` (dod_import, dod_check, new confirm path), `types.ts`, `store.ts`.

---

## Step 10 — Give manual/review predicates real teeth (#8)

**Problem:** a DoD can be authored with zero manual/review proofs; `blockedByManuals` only bites if manuals exist; the `review` predicate just tells the human to "run /code-review," delegating back into the agent ecosystem.

**Change:**
- Baseline (`baseline.ts`): for `type: "general"` and `type: "bug"`, require at least one `manual` **or** `review` proof, or an explicit `skip_reason`. Treat absence as a baseline hard error at lock time.
- Strengthen the `review` predicate: instead of only instructing "run /code-review," require the human confirmer to paste/attest a concrete artifact (review verdict text, reviewer identity) captured into `manual_result`, so a bare "yes" doesn't satisfy it.

**Verify:** a locked `general` DoD with no manual/review and no skip_reason is rejected at lock; a `review` proof cannot be satisfied without the attestation payload. Tests.

**Files:** `baseline.ts`, `manual.ts`, `index.ts`, `types.ts`.

---

## Step 11 — Remove markdown→predicate inference feedback into the canonical store (#10)

**Problem:** `dod_import` reconstructs a `DodDocument` by parsing markdown and *inferring* predicates (index.ts:872, parser.ts). Inference is lossy — an imported proof can silently land on a weaker predicate. A genuinely canonical store shouldn't have a lossy path feeding back into it.

**Change:**
- Require imported markdown to carry explicit predicate metadata (the format `author.ts` already emits round-trips exactly). If a proof's predicate can't be read explicitly, import it as a **draft leaf** (no command/predicate) requiring `dod_refine`, rather than guessing.
- Remove the lossy inference heuristics from `parser.ts` used only by the import feedback path (keep parsing of explicit metadata).

**Verify:** importing a doc rendered by `author.ts` round-trips predicates exactly; importing markdown without explicit predicate metadata yields drafts, not guessed concretes. Tests.

**Files:** `parser.ts`, `index.ts` (dod_import).

---

## Step 12 — Strip debug litter and fix mojibake (#10)

**Problem:** production `console.debug` calls, several as top-level module-load side effects (types.ts:4, find-functions.ts:1, manual.ts:28, regression.ts:1, evaluate-proof.ts:1, plus baseline.ts:200, author.ts:141, parser.ts:287, format-result.ts:4, observability.ts). Mojibake in committed source (checker.ts:196 `// â”€â”€`).

**Change:**
- Remove all top-level `console.debug` side-effect calls. For per-call debug logging that's genuinely useful, gate behind a `DOD_DEBUG` env check or delete.
- Fix the mojibake comment(s) — replace with plain ASCII separators.
- Run Biome check to confirm no new lint issues.

**Verify:** `grep -rn "console.debug" src/` returns nothing (or only env-gated); `npm test` green; Biome clean.

**Files:** all listed above.

---

## Suggested step grouping for `/step-by-step`

Steps 1→2 (fingerprint + its tests) are the foundation. Steps 3→4→6 form the VCS-binding chain (do in order). Steps 5, 7, 8, 9, 10, 11, 12 are largely independent and can be done in any order after 1–3. Step 12 (cleanup) can go first or last — it's isolated.
