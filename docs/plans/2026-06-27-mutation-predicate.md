# Mutation-testing predicate (WS-D) — Requirements Spec

<claude_instructions>
**For Claude (/goal):** Work through each incomplete step below.
1. Mark a step `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs — do NOT mark proofs manually.
   While iterating on one step, pass `step: N` to verify just that step fast (other steps are carried, not re-run). A scoped run returns INCOMPLETE, never PASS.
3. A step is complete when ALL its proofs pass via `dod_check`.
4. If a proof cannot be met, use `dod_amend` to modify it with a reason.
4b. Proof commands run on the HOST OS — write OS-correct commands (no bash on Windows).
4c. After a step's proofs all pass, commit that step before starting the next — one commit per step (clean, bisectable history).
5. Continue until `dod_check` returns PASS — then stop and report done.

**Self-contained.** All commands run from `C:\Users\siriu\mcp-servers\dod-guard` unless noted.

**🔒 Anti-cheat:** Proofs are stored canonically in MCP storage (dod-guard).
`dod_check` executes commands from the canonical copy, not this markdown file.
Editing proof text here has no effect on verification.
Store tampering is **logged and detectable** — each check prints a proof-set fingerprint.
Manual proofs are confirmed by the human directly (elicitation / dialog) during `dod_check` —
Claude cannot self-confirm them. A confirmed PASS is cached until the proof changes.
</claude_instructions>

**Goal:** Add a `mutation` proof predicate that asserts agent-authored tests kill mutants (survivors ≤ N) via built-in per-tool parsers, closing the WS-D / PC-1 "0 bugs caught" gap.

**Date:** 2026-06-27
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `6be1ef9b-7851-4d06-85a8-57667bfa139d`
**Last check:** FAIL (2026-06-27T10:26:21.195Z)

---

## Decisions (locked with user)

<decisions>
Settled in interview 2026-06-27:
1. Scope: FEATURE ONLY — add mutation as a usable predicate to dod-guard. No mutation run on dod-guard's own suite (no dogfood).
2. Form: NEW PREDICATE TYPE `mutation` (not docs-only, not just a category) — the checker parses survivor counts.
3. Metric: SURVIVOR COUNT ≤ N. `value` = max allowed surviving mutants, default 0. (Robust for small changed-functions diffs; percentage would be noisy.)
4. Parsing: BUILT-IN PER-TOOL PATTERNS for the three plan tools — Stryker (JS/TS), mutmut (Python), cargo-mutants (Rust). No author-supplied regex override this round.
5. Parse failure: FAIL-SAFE — unparseable output → proof FAILS with an explicit reason. Never passes on output it cannot parse.
6. Run scope guidance: CHANGED FUNCTIONS ONLY (git-diff scoped), consistent with the delta/brownfield philosophy in language-commands.md.
7. Enforcement: WARNING IF ABSENT — validateBaseline emits a soft, non-blocking warning (like the tdd warning) when no mutation proof is present; worded toward critical logic. Never hard-blocks dod_create.
</decisions>

## Current state

<current_state>
dod-guard v1.5.0. WS-A..WS-F shipped (commit eaa3075). Predicate union in src/types.ts:2 has no `mutation`. ProofCategory in src/types.ts:11-20 has no `mutation`. evaluatePredicate switch in src/checker.ts:11-40 has cases for exit_code/output_*/tdd/manual/review only. index.ts ProofCategorySchema (src/index.ts:30) and PredicateSchema enum lack mutation. baseline.ts validateBaseline (src/baseline.ts:46-77) warns on missing tdd and presence-only steps; no mutation awareness. No mutation references anywhere in src/, standards/, skills/, README (grep clean). Tests run from COMPILED output: `npm test` = `tsc && node --test "dist/*.test.js"`. Existing suites: checker.test.ts, baseline.test.ts, author.test.ts, manual.test.ts, command-check.test.ts (45 tests green at v1.5.0).
</current_state>

## Requirements

<requirements>
Add a `mutation` predicate so a DoD proof can assert that a mutation-testing tool reports at most N surviving mutants.

BEHAVIOR:
- Predicate shape `{type: "mutation", value?: number}`; `value` = max allowed surviving mutants, default 0.
- Runs IN-BAND like a normal command proof (NOT out-of-band like manual/review): the checker executes proof.command, then parses combined stdout+stderr for the survivor count.
- A `parseSurvivors(output): number | null` helper tries built-in patterns for Stryker (JS/TS), mutmut (Python), cargo-mutants (Rust), in order. Returns the survivor/missed count, or null if no recognized summary matched.
- PASS iff parseSurvivors(output) !== null AND survivors <= value.
- FAIL-SAFE: parseSurvivors returns null → proof FAILS with reason 'could not parse mutation results (no recognized Stryker/mutmut/cargo-mutants summary)'. Never pass on unparseable output.
- Tool-not-found / timeout reuse existing notFound + killed FAIL paths in runCommand (no special-casing needed).

TYPES + SCHEMA:
- Add `mutation` to the Predicate.type union (src/types.ts) and to PredicateSchema enum (src/index.ts).
- Add `mutation` to ProofCategory (src/types.ts) and to ProofCategorySchema (src/index.ts).

BASELINE:
- validateBaseline emits a soft WARNING (non-blocking) when no proof across the DoD carries category `mutation`. Wording nudges toward critical logic. Mirrors the existing tdd-absent warning. Must NOT be added to HARD_MANDATORY.

STANDARDS + DOCS:
- standards/language-commands.md: a 'Mutation (test quality)' row per language with CHANGED-FUNCTIONS-scoped commands (cargo-mutants --in-diff for Rust; mutmut on git-diff changed paths for Python; Stryker scoped to changed files/since for JS/TS).
- standards/dod-baselines.md: document mutation as the strongest test-quality proof, optional/warned, scoped to critical logic.
- skills/interview/SKILL.md predicate table + README + dod_create tool description: add the `mutation` predicate row.

EXPLICIT EXCLUSIONS: no dogfood mutation run on dod-guard itself; not hard-mandatory; no all-codebase mutation; no author-supplied regex override.
</requirements>

## Research Notes

<research_notes>
Checker integration point: src/checker.ts evaluatePredicate(predicate, exitCode, stdout) returns boolean — mutation needs the stdout (it has it) plus a good FAIL reason, so handle it in executeProof similar to the tdd branch (src/checker.ts:118-149) to surface 'could not parse' rather than a bare boolean. runCommand returns {exitCode, combined} where combined = stdout+stderr (src/checker.ts:53).
Baseline: add warning in src/baseline.ts validateBaseline after the tdd-warning block (~line 58-64). STRONG/WEAK arrays at src/baseline.ts:43-44 — do NOT add mutation to WEAK (it is a strong test-quality proof); leaving it out of both arrays is fine for the presence-only check.
Schemas to update in src/index.ts: ProofCategorySchema (line ~30) and the PredicateSchema type enum.
Tests compile to dist/ — target with `node --test --test-name-pattern="..." "dist/*.test.js"` AFTER `npx tsc`.
TOOL OUTPUT PATTERNS [INFERRED ~65% — MUST be validated against captured real output committed as test fixtures before finalizing regexes]:
- cargo-mutants: summary line reports 'N missed' (missed == survived); e.g. 'X mutants tested ... N missed, M caught'.
- Stryker: text report 'Survived' count / JSON reporter survived field; mutation-score line present.
- mutmut: results legend; survived count from `mutmut results` summary.
The parser unit tests use FIXTURE strings (mocked) so tests stay fast/deterministic — do NOT run real mutation tools in the suite.
</research_notes>

## Open Questions

<open_questions>
None — all design points settled in the interview.
</open_questions>

---

## Definition of Done

<definition_of_done>

### Step 1: Step 1 — Survivor-count parser + type/schema additions (TDD). Implement parseSurvivors(output): number|null with built-in patterns for Stryker, mutmut, cargo-mutants (validated against committed fixture samples); add `mutation` to the Predicate union, ProofCategory, and both index.ts schemas so the project compiles. [x]

- [x] Proof (TDD 🟢 GREEN): `npx tsc && node --test --test-name-pattern="parseSurvivors" "dist/*.test.js"` → TDD: parseSurvivors tests fail first (function missing → compile/run red), pass after implementation (GREEN). Cover each tool fixture + the null/unparseable case.
- [x] Proof: `findstr /R "assert" src\checker.test.ts` → parseSurvivors tests carry real assertions (not assert(true)).
- [x] Proof: `findstr /C:"mutation" src\types.ts` → `mutation` added to the Predicate type union and ProofCategory in types.ts.
- [x] Proof: `npx tsc --noEmit` → Type-check clean after type/schema additions.

### Step 2: Step 2 — Mutation predicate evaluation + fail-safe in checker (TDD). Wire parseSurvivors into proof execution: PASS iff survivors <= value (default 0); unparseable output → FAIL with reason 'could not parse mutation results'. Runs in-band via runCommand. [x]

- [x] Proof (TDD 🟢 GREEN): `npx tsc && node --test --test-name-pattern="mutation predicate" "dist/*.test.js"` → TDD: mutation-predicate eval tests fail first, pass after implementation. Cover survivors<=value PASS, survivors>value FAIL, unparseable FAIL.
- [x] Proof: `findstr /C:"could not parse mutation" src\checker.ts` → Fail-safe reason string present in checker for unparseable mutation output.
- [x] Proof: `npm test` → Full test suite green — no regressions across all existing + new tests.

### Step 3: Step 3 — Baseline soft-warning when mutation absent (TDD). validateBaseline emits a non-blocking warning when no proof carries category `mutation`; must NOT be added to HARD_MANDATORY (never blocks dod_create). [x]

- [x] Proof (TDD 🟢 GREEN): `npx tsc && node --test --test-name-pattern="mutation baseline" "dist/baseline.test.js"` → TDD: test asserting validateBaseline warns (in warnings, not errors) when mutation absent, and does NOT warn when present — fails first, passes after.
- [x] Proof: `findstr /C:"mutation" src\baseline.ts` → Mutation-absent warning wired into validateBaseline.
- [x] Proof: `findstr /C:"mutation" src\baseline.ts | findstr /C:"HARD_MANDATORY"` → Mutation is NOT on the same line as HARD_MANDATORY — exit 1 (no match) confirms it stays a warning, not a hard block.

### Step 4: Step 4 — Integration: predicate registered in MCP schema (wiring) and exercised end-to-end through checkDocument (behavioral). [ ]

- [ ] Proof: `findstr /C:"mutation" src\index.ts` → Wiring: `mutation` present in index.ts PredicateSchema + ProofCategorySchema — the predicate is registered in the MCP tool surface, not just defined in types.
- [x] Proof: `npx tsc && node --test --test-name-pattern="mutation end-to-end" "dist/*.test.js"` → Behavioral: a test builds a DoD with a mutation proof and runs checkDocument (the real dod_check entry point) against a fixture command echoing tool output — asserts PASS when survivors<=value and FAIL when survivors>value. Exercises the genuine command-execution path, not a mock.

### Step 5: Step 5 — Standards + docs. Document the mutation predicate and changed-functions-scoped commands per language. [ ]

- [ ] Proof: `findstr /C:"cargo-mutants" standards\language-commands.md` → language-commands.md documents the per-tool changed-functions-scoped mutation command (cargo-mutants for Rust; mutmut/Stryker rows alongside).
- [ ] Proof: `findstr /C:"mutation" standards\dod-baselines.md` → dod-baselines.md documents mutation as the strongest test-quality proof (optional/warned, critical logic).
- [ ] Proof: `findstr /C:"mutation" README.md skills\interview\SKILL.md` → README and interview SKILL predicate table document the new `mutation` predicate.
- [x] Proof: Manual — Human review: docs accurately describe the predicate, value semantics, fail-safe behavior, and changed-functions scoping. _(human-confirmed PASS at 2026-06-27T10:26:21.195Z via messagebox)_

</definition_of_done>

## Open risks

<open_risks>
Per-tool regexes are the main risk (plan flagged tool-coupling). Mitigate: capture a representative real output sample for each tool from its docs/a real run, commit as a fixture, and write the parser test against it. If a tool's format can't be parsed reliably, fail-safe FAIL is the correct conservative behavior and the author can fall back to an exit_code proof + amend.
</open_risks>
