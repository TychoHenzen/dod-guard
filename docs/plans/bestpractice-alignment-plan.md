# Plan: Strengthen dod-guard — Proof Quality, Check Cost, then Enforcement

**Status:** READY TO BUILD — feedback merged, workstreams re-sequenced, §8 decisions settled. This round: **WS-A + WS-B + WS-C + WS-E + WS-F**. Deferred: WS-D, WS-H. Dropped: WS-G.
**Owner:** Tycho
**Inputs merged:** (A) best-practice gap research 2026-06-26; (B) real-cycle evaluation `samples/review/dod-guard-evaluation.md` (PBI #31790, 2 sessions, 1582 JSONL lines).
**dod-guard version at planning time:** 1.4.0

---

## 0. How to use this document

Durable handoff: a fresh agent with zero prior context executes it cold. Two input streams were kept separate and have now been reconciled.

> **Headline correction from the merge.** The best-practice research (§3) said the gap was *enforcement delivery* — force `dod_check` to run via a Stop hook. The real-cycle evaluation (§2) **refuted that premise**: the agent called `dod_check` reliably (6×, 0 interventions, knew exactly when done). The actual pain was **proofs that caught zero bugs** and **re-checking that consumed 45% of session time**. Per the merge rule "prior-cycle evidence outranks best-practice theory," the Stop-hook gate is **demoted** and proof-strength + check-cost work is **promoted**. See §4.

Execution order:
1. Read §1 (context brief).
2. Read §2 (real-cycle evidence) and §3 (best-practice findings).
3. §4 is the **resolved merge** — it supersedes the raw findings and defines the final workstream order.
4. Resolve §8 open decisions with the user.
5. Execute §5 workstreams top-to-bottom (already in priority order). One at a time, each verified by its own DoD (§7).

---

## 1. Context brief (self-contained)

**What dod-guard is.** An anti-cheat "Definition of Done" verification MCP server + Claude Code plugin. Thesis: an agent that authors its own acceptance criteria in an editable file can quietly weaken them. dod-guard stores canonical proofs in MCP-side storage the agent can't see or edit, and runs them itself.

**Lifecycle:** `/interview → dod_create → [implement] → dod_check → PASS/FAIL`, with `dod_amend` for genuinely unreasonable proofs.

**Six MCP tools** (`src/index.ts`): `dod_create`, `dod_check`, `dod_status`, `dod_amend`, `dod_list`, `dod_import`.

**Proof model** (`src/types.ts`): `{command, predicate, description}`. Predicates: `exit_code`, `exit_code_not`, `output_contains`, `output_matches`, `output_not_contains`, `output_not_matches`, `tdd`, `manual`.

**Key files:**
| File | Role |
|---|---|
| `src/index.ts` | MCP tool defs + `main()` boot. **Boots stdio server immediately; no CLI argv dispatch.** |
| `src/checker.ts` | Enforcement: runs proof commands, evaluates predicates, TDD red-before-green gate, manual flow, fingerprint recompute. **Re-runs ALL proofs every call — no per-step scoping.** |
| `src/store.ts` | Canonical JSON at `~/.claude/dod-store/{uuid}.json`. Has `listAll`, `findByPath`, `save`, `remove`, `generateId`. |
| `src/manual.ts` | Out-of-band human verification; caches confirmed PASS keyed to per-proof fingerprint. |
| `src/notify.ts` | Jingle + Windows message-box fallback. |
| `src/command-check.ts` | OS-correctness pre-check; rejects DoDs whose commands invoke tools absent on host OS. Has `WINDOWS_EQUIVALENTS` incl. `grep→findstr`, `cat→type`. |
| `src/author.ts` | Renders markdown with semantic XML tags. |
| `src/parser.ts` | `dod_import` infers predicates from description text (heuristic, lossy). |
| `standards/dod-baselines.md` | Mandatory proof categories per work type; **mandatory two-layer integration** (wiring grep + behavioral entry point). |
| `standards/language-commands.md` | Category → command per language; brownfield/delta proofs. |
| `skills/interview/SKILL.md` | Requirements-gathering front end; refuses code until user confirms. |
| `.claude-plugin/plugin.json` | Plugin manifest (name/description/author only — **no `hooks` field yet**). |
| `package.json` | `bin: { "dod-guard": "dist/bundle.js" }`; esbuild bundle. |

**Boot shape (matters for WS-G):** `src/index.ts` ends with `main()` → `new StdioServerTransport()` → `server.connect(transport)`. **No `process.argv` branch.** Same `dist/bundle.js` is the MCP server (launched no-args by Claude Code) and host for any new CLI subcommands.

**Empirical baseline (from §2 — the numbers any change is judged against):**
- A real 17-file feature produced a 5-step DoD with **26 proofs**; check #6 ran all 26 to reach PASS.
- **Build+test inside `dod_check` = ~36 min = 45% of active session time.** Steps 1–2 were re-verified on checks 3–6 with unchanged code.
- **Bugs caught by proofs: 0.** 14/26 proofs were `findstr` string-presence (pass the moment any line contains the string).
- Enforcement (knowing when done, no premature stop, commit discipline, tamper resistance): worked well, listed as clear value.

---

## 2. Prior-cycle feedback — MERGED (from `samples/review/dod-guard-evaluation.md`)

Normalized from the PBI #31790 evaluation:

| id | observation (evidence) | failure_mode | freq | proposed_change | touches |
|---|---|---|---|---|---|
| PC-1 | 0 bugs caught across 26 proofs; 14 were bare `findstr` presence checks that "add almost no value beyond what compilation already verifies" | proofs too weak (structure, not correctness) | dominant | favor behavioral/integration proofs; discourage presence-only | WS-B, WS-C, WS-D |
| PC-2 | `dod_check` re-runs all 26 proofs every call incl. 16+ MSBuild + 3 full-suite runs; ~36 min = 45% of session | verification cost / redundant re-check | every check | `dod_check --step N` incremental; final full sweep | WS-A |
| PC-3 | All 26 proofs authored with `grep`/Unix paths; cmd.exe → 26 amends | platform mismatch at authoring | one-time batch | platform-aware generation | **already fixed** — verify `command-check.ts` |
| PC-4 | Interview never ran a baseline `dod_check` to confirm all-red + validate commands | missed early validation | per feature | baseline check after `dod_create` | WS-E |
| PC-5 | `findstr "TryStopTracking"` matched both old 1-arg and new 2-arg form → false positive, needed amend | proof imprecision (substring) | 1 here, latent everywhere | word-boundary / signature matching | WS-B |
| PC-6 | No proof verified end-to-end behavior (start→death-notify→only-partner-stops) | missing integration/behavioral coverage | per feature | require behavioral entry-point proof | WS-C; **verify** two-layer-integration mandate |
| PC-7 | `/next-ticket` explored 59 files; interview re-explored 22 (21 context resumptions) | duplicated research / context loss | per feature | context handoff artifact | WS-H |
| PC-8 | 3 clarifying questions for a 17-file / 6-project change | interview depth light for large scope | per large feature | min questions scaled to scope | WS-H |
| PC-9 | One-commit-per-step gave clean bisectable history; praised | (positive) | — | make step-commits the default | verify-&-document |

Positives confirmed (do not regress): unambiguous stop criteria, structured step progression, anti-regression full-suite, tamper resistance (MCP-stored canonical proofs), zero user intervention.

---

## 3. Best-practice findings (research session) — annotated with §2 verdict

| id | finding | §2 verdict |
|---|---|---|
| F1/F2 | `dod_check` voluntary; add deterministic Stop-hook gate (exit 2, `stop_hook_active`) | **Premise refuted** — agent never skipped the check. Demote. |
| F3 | Tamper detection advisory, not blocking | Not observed as pain (tamper resistance already "clear value"). Cheap hardening only. |
| F4 | No adversarial "fresh model refutes" / behavioral check | **Strongly confirmed** by PC-1, PC-6. Promote. |
| F5 | Test-quality stops at TDD; add mutation testing | **Confirmed** by PC-1 ("test content is agent-authored, proof strength depends on test quality"). Promote. |
| F6 | No domain-language acceptance/behavioral layer | **Confirmed** by PC-6. Folded into WS-B/WS-C + verify mandate. |

Net-new from §2 with **no** §3 equivalent: **PC-2 (check cost)** and **PC-4 (baseline check)** — the research missed both, and PC-2 is the single highest-impact item.

---

## 4. Merge result (resolved — this supersedes §3)

**Conflict resolved:** §3's headline (Stop-hook enforcement) loses to §2 evidence. Reprioritize around the two real bottlenecks: **proof strength** and **check cost**.

**Kill / demote:**
- **Stop-hook gate (F1/F2):** demoted to WS-G, **gated behind WS-A**. Rationale: no observed skip; and a gate that re-runs the full suite on every turn-end attempt would *multiply* the 45% cost problem (PC-2). It only becomes safe once `dod_check` is incremental and cheap.
- **Blocking tamper (F3):** demoted to WS-F — cheap, do it, but not urgent.

**Promote / add:**
- Proof strength (PC-1, PC-5, PC-6 + F4/F5/F6) → WS-B/WS-C/WS-D.
- Check cost (PC-2) → **WS-A, new top priority.**
- Baseline check (PC-4) → WS-E.

**Verify-and-close (don't rebuild what's already shipped):**
- PC-3 platform fix → `command-check.ts` already maps `grep→findstr` (v1.4.0); the eval's PBI plan (2026-06-17) predates it. Confirm coverage, then close. **Do not build "platform-aware generation" from scratch.**
- PC-6 integration → `standards/dod-baselines.md` already mandates two-layer integration (commit aecf90e). Confirm it's actually enforced at `dod_create`; the eval feature predates/bypassed it.
- PC-9 step-commits → already natural; document as `/goal` default.

**Stop-hook gate (F1/F2) — DROPPED, not just demoted.** Decision (user, settled): `/goal` already performs this role — it refuses to let the agent stop until its condition is met, and the condition is defined as "`dod_check` returns overall PASS." `/goal` *is* the deterministic stop gate, which is exactly why §2 observed no skip problem. No Stop hook needed; WS-G removed from the plan.

**Final priority order (this round):** WS-A → WS-B → WS-C → WS-E → WS-F. Deferred: WS-D, WS-H. Dropped: WS-G.

---

## 5. Workstreams (in execution order)

Dogfood: author a dod-guard DoD per workstream before coding (§7).

### WS-A — Incremental `dod_check --step N` (TOP PRIORITY, PC-2)

**Goal.** Stop re-running all proofs every check. Verify only the target step (plus an explicit final full sweep), cutting the ~45%-of-session verification cost.

**Approach.**
1. Add an optional `step` arg to the `dod_check` MCP tool (`src/index.ts`) and a `--step N` path through `checkDocument` (`src/checker.ts`): run only that step's proofs; mark others as "not re-checked this run" (carry forward their last result, don't fake PASS).
2. **Decision (settled): `--step N` scoping only this round.** Persist per-step results in the store so a later full `dod_check` shows prior step status. mtime/fingerprint-based auto-skip is **out of scope** — deferred to a fast-follow if measured savings justify it.
3. Overall PASS still requires every step green at least once with current proofs; a final unscoped `dod_check` remains the gate for "done." Never report overall PASS off stale per-step results without a final sweep.

**Files:** `src/index.ts`, `src/checker.ts`, `src/store.ts` (persist per-step results), `skills/interview/SKILL.md` + `standards/` (document the step-then-sweep workflow), tests.

**Risks:** stale carry-forward masking a regression (mitigate: final full sweep mandatory before PASS; document loudly). Per-step result persistence must not let the agent fake a step PASS (results come only from real runs).

**Verification (DoD):** unit — `--step 2` runs only step 2's proofs, leaves others' prior results intact, overall stays "incomplete" until a full sweep. Integration (behavioral) — run a real multi-step DoD, assert wall-clock drop vs full check and correct final PASS.

### WS-B — Proof-strength standards + precision + baseline enforcement (PC-1, PC-5, PC-6)

**Goal.** Make the default proof catch correctness, not presence. Kill the bare-`findstr` pattern; fix substring imprecision. **And close PC-6: enforce the mandatory baseline proof categories at `dod_create` instead of trusting the agent to follow `standards/` — the integration two-layer mandate currently relies entirely on agent compliance, the exact thing dod-guard exists to remove.**

**Approach.**
1. `standards/dod-baselines.md` + `language-commands.md`: demote presence-only proofs — a `findstr "Name" file` proof is allowed only as a *wiring* sub-check, never as a step's primary acceptance. Require each step's correctness to rest on a behavioral/test/compilation proof.
2. Precision guidance: presence/removal proofs must match signatures/word boundaries, not bare substrings (PC-5: `TryStopTracking(dossierId)` vs `TryStopTracking(dossierId, clientId)`). Provide cmd.exe/PowerShell-correct patterns (`findstr /R`, regex anchors).
3. Update `skills/interview/SKILL.md` so generated proofs follow this — the interview is where weak proofs originate.
4. **Create-time baseline enforcement (PC-6).** Add a `type: "bug" | "general"` field to `dod_create` (Enforcement Rule #1 already assumes a declared type; the schema doesn't capture it yet). On create, validate the DoD contains the mandatory machine-checkable categories for its type: **integration two-layer (wiring + behavioral), TDD, full-suite**. Missing mandatory category ⇒ reject (hard) or warn (soft) — decision below. Detection is heuristic (categorize proofs by predicate + command shape); accept false-negative risk over blocking legit authoring, but always surface what's missing.
   - **Decision (settled): hard-reject** missing integration two-layer + full-suite; warn for the rest. Rationale: these are the categories the eval proved were skipped, and the anti-cheat thesis favors enforcement over trust. Revisit if it proves too rigid for brownfield.
5. Lint: warn when a step's only non-compile proof is a presence check.

**Files:** `standards/dod-baselines.md`, `standards/language-commands.md`, `skills/interview/SKILL.md`, `src/index.ts` (`type` field + create-time category validation + presence-proof lint), `src/types.ts` (`type` on `DodDocument`), tests.

**Risks:** over-tightening makes authoring harder — keep presence proofs legal as *supplementary* wiring; category detection is heuristic so make the reject message list exactly what's missing and how to satisfy it. Brownfield: a project may legitimately lack a runnable entry point — provide a documented escape (declare + amend with reason), never a silent bypass. Coordinate with WS-C/WS-D so guidance points at the new proof types.

**Verification (DoD):** unit — `dod_create` rejects a `general` DoD lacking a behavioral integration proof; accepts one that has both layers; presence-only lint fires. Standards docs updated. Manual — review sign-off that examples follow new rules.

### WS-C — Adversarial / behavioral reviewer proof (PC-1, PC-6, F4/F6)

**Goal.** A proof type that checks logic/behavior commands can't assert: a fresh-context reviewer judges the diff against the DoD `requirements`, and/or an end-to-end behavioral run through the real entry point.

**Approach.** New predicate `review` (extend `PredicateSchema` in `src/index.ts:22` + `src/types.ts`). **Dispatch (settled): bundled `/code-review` skill** — reuse the existing fresh-context reviewer; least new code, consistent with Claude Code patterns. Define a clear verdict→PASS/FAIL mapping (reviewer must return a structured "gaps affecting correctness/requirements" list; empty ⇒ PASS, non-empty ⇒ FAIL with the gaps as reason). Prompt scoped per Anthropic's caveat — "flag only gaps affecting correctness or stated requirements." Additive to command proofs, never a replacement. Pair with the existing mandated behavioral integration proof so PC-6's "start→death-notify→only-partner-stops" class of check is required, not optional.

**Files:** `src/types.ts`, `src/index.ts`, `src/checker.ts`, `standards/dod-baselines.md`, tests (mock the reviewer verdict).

**Risks:** non-determinism (verdict can flip); cost/latency; deriving crisp PASS/FAIL from prose. Keep it gating only on correctness-class gaps to avoid reviewer-invents-findings over-engineering.

**Verification (DoD):** unit — predicate passes on a mocked PASS verdict, fails on a gaps verdict with gaps as reason. E2E dispatch validated manually (non-deterministic).

### WS-D — Mutation-testing predicate (PC-1, F5) — DEFERRED (not this round)

**Goal.** Prove agent-authored tests actually catch bugs (stronger than red-before-green).

**Approach.** Documented proof pattern (likely not a new predicate) running a mutation tool scoped to changed functions — Stryker (JS), mutmut (Python), cargo-mutants (Rust). Brownfield-scope to changed code (consistent with `language-commands.md` delta philosophy). Add to `standards/` as the test-quality proof for critical logic.

**Files:** `standards/language-commands.md`, `standards/dod-baselines.md`, possibly `src/checker.ts`. Build after WS-C; reassess demand if time-boxed.

**Risks:** slow; per-language tooling. Keep optional / for critical modules to avoid blowing up WS-A's cost wins.

**Verification (DoD):** documented pattern with a worked example; one real module shows a surviving mutant → proof fails → test added → passes.

### WS-E — Interview baseline `dod_check` (PC-4)

**Goal.** After `dod_create`, run `dod_check` once to confirm all proofs fail (feature absent) and that every command actually executes on the host — catching platform/precision errors before implementation, not during.

**Approach.** Update `skills/interview/SKILL.md` to mandate a baseline check immediately after create. Optionally surface a `dod_create` response hint nudging it. With WS-A landed, a baseline full check is cheap.

**Files:** `skills/interview/SKILL.md`, optionally `src/index.ts` (response text), README.

**Risks:** TDD proofs are *expected* red at baseline — baseline check must interpret all-red as success, not failure. Document.

**Verification (DoD):** manual/workflow — interview transcript shows a baseline check; behavioral — a deliberately broken command is caught at baseline.

### WS-F — Blocking tamper detection (F3)

**Goal.** Fingerprint mismatch without a logged `dod_amend` → FAIL, not warning.

**Approach.** `src/checker.ts` / `src/index.ts:277-282`: mismatch + no amendment ⇒ overall FAIL, keep warning text as the reason. Legit edits go through `dod_amend` (updates fingerprint).

**Files:** `src/checker.ts`, `src/index.ts`, tests.

**Risks:** legit manual edits now hard-fail until amended (intended — say so loudly in the error).

**Verification (DoD):** unit — tamper a stored proof → FAIL + reason; amend → PASS restored.

### WS-G — Stop-hook gate (F1/F2) — DROPPED

**Decision (settled):** not built, removed from scope. `/goal` already provides the deterministic stop gate — it refuses to let the agent stop until its condition is met, and the project defines that condition as "`dod_check` returns overall PASS." A Stop hook would duplicate this. §2's real-cycle data confirms the absence of any skip problem (agent called `dod_check` reliably, knew exactly when done). The original Stop-hook design is preserved in git history of this plan if ever needed.

### WS-H — Interview efficiency (PC-7, PC-8) — DEFERRED (not this round)

**Goal.** Cut duplicated research; scale clarifying-question depth to feature size.

**Approach.** Context handoff: let `/next-ticket` pass an exploration summary artifact the interview reuses instead of re-exploring (PC-7: 22 re-explored files, 21 context resumptions). Question depth: `skills/interview/SKILL.md` sets a minimum question count scaled to estimated scope (files/projects) — PC-8: 3 was light for 17 files / 6 projects.

**Files:** `skills/interview/SKILL.md`, possibly `/next-ticket` skill (cross-skill — confirm scope with user).

**Risks:** cross-skill coupling; partly outside dod-guard core. May split out.

**Verification (DoD):** manual — interview reuses a handoff summary; question count scales with scope on a large sample.

### Verify-and-close (not workstreams — confirmations)

- **PC-3 platform fix:** confirm `command-check.ts` rejects the grep-on-Windows case the eval hit; add a regression test; close. Do not build rec #1.
- **PC-6 mandate:** confirm two-layer integration is enforced at `dod_create` (not just documented); if bypassed, that's a WS-C/WS-B tie-in.
- **PC-9 step-commits:** document one-commit-per-step as the `/goal` default.

---

## 6. Dependency graph & sequencing

```
THIS ROUND:
WS-A (incremental check) ──► makes WS-E (baseline check) cheap
WS-B (proof-strength std) ─► informs WS-C (points authors at the new proof type)
WS-C (behavioral/review) ──► after WS-B
WS-E (baseline) ──────────► best after WS-A
WS-F (blocking tamper) ───► independent, cheap, drop in anytime

DEFERRED: WS-D (mutation, builds on WS-C test-quality theme), WS-H (interview efficiency)
DROPPED:  WS-G (Stop hook — /goal already gates on dod_check PASS)
```

- **First commit: WS-A** — biggest measured win, unblocks WS-E.
- **WS-B + WS-C** are the proof-quality core that fixes the "0 bugs caught" headline.
- **WS-F** is a cheap parallel drop-in.

---

## 7. Per-workstream DoD (dogfood)

Author a dod-guard DoD per workstream (`dod_create`) before coding. Each must include (per `standards/dod-baselines.md`): scoped lint + `tsc`; unit `node --test` (TDD red-before-green for new behavior); **two-layer integration** — a wiring grep **and** a behavioral run (e.g. `dod_check --step 2` exercised end-to-end for WS-A). Apply WS-B precision rules to the proofs themselves (no bare-substring presence checks). Manual proof only where unavoidable.

---

## 8. Decisions — SETTLED (2026-06-26)

1. **Overall round scope:** WS-A + WS-B + WS-C + WS-E + WS-F. Defer WS-D, WS-H. Drop WS-G.
2. **WS-A invalidation:** `--step N` scoping only. mtime/fingerprint auto-skip deferred to a fast-follow if savings justify.
3. **WS-C reviewer dispatch:** bundled `/code-review` skill, with a structured gaps-list → PASS/FAIL mapping.
4. **WS-G (Stop hook):** dropped — `/goal` already gates on `dod_check` overall PASS; no duplicate hook.
5. **WS-D scope (mutation):** deferred; revisit scope (all-logic vs critical-only) when built.
6. **WS-H scope (interview efficiency):** deferred; possibly a separate `/next-ticket` + interview effort.

---

## 9. Execution checklist

- [x] §2 populated from real-cycle evaluation.
- [x] §4 merge run; workstreams re-sequenced (proof-quality + cost up, Stop hook down).
- [x] §8 decisions settled (scope A+B+C+E+F; WS-G dropped; WS-D/H deferred).
- [x] Verify-and-close: PC-3 (command-check rejects grep-on-Windows; regression test added) and PC-9 (one-commit-per-step added to rendered `<claude_instructions>`) CLOSED. PC-6 (integration mandate not code-enforced) → folded into WS-B as create-time enforcement.
- [x] WS-A implemented (`dod_check` `step` param; scoped run → INCOMPLETE, carries other steps unrun; `last_check` untouched by scoped runs; docs updated). 33 tests green. **Not yet committed.**
- [ ] WS-B implemented, DoD green, committed.
- [ ] WS-C implemented, DoD green, committed.
- [ ] WS-E implemented, DoD green, committed.
- [ ] WS-F implemented, DoD green, committed.
- [ ] README + `standards/` + `skills/interview/SKILL.md` updated.
- [ ] Version bump + changelog.

---

## Sources

**Real-cycle (§2):** `samples/review/dod-guard-evaluation.md` — PBI #31790, sessions `0279d61a` (interview) + `466baf3b` (implementation).

**Best-practice (§3):**
1. Anthropic — *Best practices for Claude Code*: https://code.claude.com/docs/en/best-practices
2. *How to Build a Self-Verification Loop in Claude Code (3 Layers)*: https://dev.to/shipwithaiio/how-to-build-a-self-verification-loop-in-claude-code-3-layers-20-minutes-m1p
3. *disciplined-agentic-engineering* (ATDD): https://github.com/swingerman/disciplined-agentic-engineering
