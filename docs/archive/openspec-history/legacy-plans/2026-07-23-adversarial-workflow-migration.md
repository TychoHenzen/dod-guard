# Adversarial Workflow Migration Plan

**Date:** 2026-07-23
**Context:** Post-e973fc6 (static analysis predicates removed, behavioral-only DoD verification)

## Executive Summary

Encode adversarial feedback as a first-class workflow in dod-guard, replacing the primitive "Contrarian Agent" (interview Phase 3.6) with a rigorous 4-phase adversarial choreography. Each phase has its own adversary with a specific mandate, enforced by dod-guard's verification gates. The key insight from research: **adversarial review is structurally superior to self-critique** (7.3% false positive rate vs 30-60%), but only when the adversary has clean context, mandatory findings, and execution-based evidence requirements.

## Research Findings Summary

### What works (proven patterns, multiple independent sources)

1. **Clean-context review** — Adversary sees only the artifact + spec, never the author's reasoning. Devin reports ~10x quality improvement from context isolation alone. `[VERIFIED]` — Claude Code #72206, Correctless, Devin Review architecture docs

2. **Mandatory findings per reviewer role** — Each adversarial reviewer must find at least 1 issue, or the verdict is invalid (anti-rubber-stamp). Three proven roles: Saboteur (worst-case inputs/concurrency), New Hire (understandability without author context), Security Auditor (trust boundaries). `[VERIFIED]` — Claude Code #72206 five-layer quality gating

3. **Execution-based verification** — Critics must cite concrete, executable evidence (`file:line` + failing command). Abstract objections are rejected. This prevents Critique-Induced Confusion (CIC) which degrades accuracy by up to 15.5pp in generation tasks. `[VERIFIED]` — "When help becomes harm" paper (Nature 2026), Kraidia et al.

4. **RED isolation** — Test authors see spec but never implementation plan. Prevents tests that mirror code structure (tests that pass trivially because they test the implementation, not the requirement). `[VERIFIED]` — Correctless, specverify, Pantheon skills

5. **GO/REVISE/STOP gates** — Numeric severity thresholds (0 critical + 0-2 major = GO, 1+ critical or 3+ major = REVISE, 1+ blocker = STOP). Prevents "close enough" approvals. `[VERIFIED]` — OpenSpec adversarial multi-agent, Correctless

6. **Cross-model verification** — Use different model for verification than generation (e.g., DeepSeek for implementation, Claude for review). Each model has different blind spots; overlap eliminates them. `[VERIFIED]` — Claude Code #72206, adversarial AI review benchmarks

### What fails (patterns to avoid)

1. **Self-critique** — Same model reviewing its own output has ~30-60% false positive rate. Root cause: commitment effect (model tolerates gaps in its own output) + shared blind spots (same context misses same edge cases). `[VERIFIED]` — Huang et al. "LLMs Cannot Self-Correct Reasoning", adversarial AI review benchmarks

2. **Single-reviewer rubber-stamping** — One reviewer with no mandatory-finding requirement produces ~0 meaningful findings. The model defaults to approval. `[VERIFIED]` — Claude Code #72206 five-layer gating design rationale

3. **Adversarial debate without execution evidence** — Critics generating hallucinated feedback, generator uncritically accepting it. Accuracy drops 10-40% in adversarial persuasion scenarios. `[VERIFIED]` — Kraidia et al. Nature 2026, Amayuelas et al. EMNLP 2024

4. **Consensus as quality signal** — Multi-agent agreement can reflect adversarial influence, not genuine consensus. Downstream judges achieve >60% deception rate on compromised pipeline output. `[VERIFIED]` — Cognitive collusion paper (ACL 2026)

## Improved 4-Phase Workflow

### Phase 1: INTERVIEW — Requirements with Adversarial Spec Review

**Current state:** Interview skill Phase 3.6 has a "Contrarian Agent" but it's broken post-e973fc6 — references removed predicate categories (mutation, streamline, observability, performance, complexity, coverage, duplication). Single agent, no structured verdict, no enforcement.

**Target state:**

```
User describes task
  → Research codebase (Phase 1)
  → Structured questioning (Phase 2)
  → Requirements summary confirmed (Phase 3)
  → TaskNode tree built (Phase 3.4)
  → Baseline proofs applied (Phase 3.5)
  → MULTI-LENS ADVERSARIAL SPEC REVIEW (new Phase 3.6) ← REDESIGNED
  → User resolves findings
  → dod_create with locked proofs (Phase 4)
```

**Adversarial spec review — 5 parallel lenses:**

| Lens | Question | Severity if violated |
|------|----------|---------------------|
| **Security** | What STRIDE risks exist? Trust boundaries? AuthZ? | critical |
| **Assumptions** | What implicit assumptions does the spec make? Are they documented? | major |
| **Testability** | Can each requirement produce a falsifiable test? Are any untestable? | major |
| **Consistency** | Do all requirements align? Any contradictions? Scope drift? | major |
| **Implementability** | Can this be built with the existing architecture? Missing dependencies? | minor |

Each lens is a separate subagent dispatched in parallel. Each must find at least 1 issue or report "no findings with justification." Verdict is computed:

- **GO**: 0 critical, 0-2 major, any minor
- **REVISE**: 1+ critical OR 3+ major → return to Phase 2 questioning
- **STOP**: 1+ blocker (fundamentally infeasible, security showstopper) → abort

**dod-guard encoding:** The spec review produces a `dod_adversarial_gate` checkpoint stored in the DoD's amendments array. The DoD cannot transition to Phase 2 until the gate is GO.

**Implementation:**
- Rewrite interview Phase 3.6 with behavioral-only adversary prompt (no static analysis categories)
- Add GO/REVISE/STOP verdict computation
- Store adversarial gate result in DoD metadata (new field: `adversarial_gates: AdversarialGate[]`)
- Fix stale predicate type/category lists in interview SKILL.md (still lists `mutation`, `regression`, `assertions`, etc. — these were removed)

### Phase 2: TEST — Adversarial Test Verification

**Current state:** No dedicated test verification. dod-guard has `tdd` predicate but test quality is unverified. The `test-verification` and `test-fixer` skills were removed in e973fc6.

**Target state:**

```
Spec locked (Phase 1 GO verdict)
  → RED: Test author writes tests (sees spec, NOT implementation plan)
  → Test audit gate: Adversary verifies tests match requirements
  → REVISE loop until GO
  → Tests committed as frozen holdout contracts
  → GREEN gate unlocked
```

**RED isolation rule:** The test author subagent gets the requirements spec + TaskNode tree but NOT the implementation plan. Its prompt explicitly forbids reading implementation files. The orchestrator enforces this by only providing spec-relevant context.

**Test audit — 3 parallel lenses:**

| Lens | Question | Evidence required |
|------|----------|-------------------|
| **Coverage** | Does every requirement have at least one test? | Map each requirement → test file:line |
| **Falsifiability** | Would each test fail if the requirement was implemented wrong? | For each test, describe a bug that WOULD make it fail |
| **Gap detection** | What edge cases are untested? What assumptions are unverified? | List specific missing test scenarios |

**Test audit gate — mandatory findings:** Each lens must find at least 1 issue. Zero findings = invalid verdict (rubber-stamp detection). Severity:

- **critical**: Untested security boundary, missing authZ test, untested data integrity
- **major**: Untested edge case, missing error path test, ambiguous assertion
- **minor**: Test naming, missing test docstring, redundant test

Verdict: same GO/REVISE/STOP thresholds as Phase 1.

**Frozen holdout contracts:** After GO, key behavioral tests are tagged as `<!-- @dod-holdout -->` in a comment. dod_check verifies these tests exist and haven't been weakened (fingerprint check). Implementation cannot modify holdout tests — only add new ones.

**dod-guard encoding:**
- New predicate type: `holdout` — verifies a holdout test file exists and its fingerprint matches
- New TaskNode category: `test_audit` — gates the transition from Phase 2 to Phase 3
- New `AdversarialGate` entry in DoD metadata recording the test audit verdict

### Phase 3: IMPLEMENT — Adversarial Implementation Review

**Current state:** step-by-step skill dispatches step-implementer subagents with verification (test pass + build clean). No adversarial review of implementation quality or spec adherence.

**Target state:**

```
Tests locked (Phase 2 GO verdict)
  → Implementer writes code (sees spec, tests, implementation context)
  → Per-step verification: tests pass, build clean
  → ALL STEPS COMPLETE
  → ADVERSARIAL IMPLEMENTATION REVIEW (3 mandatory-finding roles)
  → REVISE loop until GO
  → Full dod_check PASS
```

**Implementation review — 3 mandatory-finding roles:**

| Role | Perspective | Must find at least |
|------|-------------|-------------------|
| **Saboteur** | "How do I break this?" — worst-case inputs, concurrency races, resource exhaustion, external call failures | 2 issues |
| **New Hire** | "Can I understand this without the author's context?" — unclear names, missing comments, confusing control flow | 1 issue |
| **Spec Auditor** | "Does this actually implement what was asked?" — compares implementation against original spec, not against implementation plan | 1 issue |

Each role is a clean-context subagent — sees only the diff + spec (saboteur/spec auditor) or diff alone (new hire). Never sees the implementer's reasoning, plan, or intermediate steps.

**Critical constraint — execution-based evidence:** Every finding must cite:
1. `file:line` of the issue
2. A command that demonstrates the problem (failing test, curl, grep)
3. A concrete fix suggestion

Findings without all three are rejected as CIC (Critique-Induced Confusion).

**Verdict computation:**
- Each role's findings are categorized (critical/major/minor)
- **GO**: 0 critical, 0-3 major, any minor — all mandatory minimums met
- **REVISE**: 1+ critical OR 4+ major OR any role's mandatory minimum unmet → return to implementation
- **STOP**: design-level flaw (not fixable without spec change) → return to Phase 1

**dod-guard encoding:**
- New predicate type: `adversarial` — runs a review subagent, parses structured verdict, checks against GO/REVISE/STOP
- New tool: `dod_adversarial_gate` — dispatches N review agents, collects verdicts, computes majority, stores gate result
- Adversarial gate results stored in DoD metadata
- dod_check skips implementation proofs until Phase 2 gate is GO
- dod_check skips cleanup proofs until Phase 3 gate is GO

### Phase 4: CLEANUP — Harsh Structural Gates

**Current state:** No structural enforcement. Static analysis predicates (brevity, complexity, cohesion, assertions, observability) were removed in e973fc6 because they used mechanical metrics that weak models game.

**Target state:**

```
Implementation reviewed (Phase 3 GO verdict)
  → Structural audit (behavioral predicates for structure)
  → Convergence audit (repeat until no new findings)
  → Full dod_check PASS (all phases)
  → Postmortem capture (lessons → future gates)
```

**Structural gates — behavioral, not static analysis:**

Static analysis was removed because it measures proxy metrics (line count, log count) that don't correlate with quality. The replacement: behavioral structural predicates that verify actual structural properties.

| Gate | Behavioral predicate | Threshold |
|------|---------------------|-----------|
| **Function size** | `find src/ -name "*.ts" \| xargs grep -c "^export function"` → count functions. Then `grep -c "^}" src/*.ts` → doesn't prove size. **Better:** `npx biome lint --rule complexity/noExcessiveCognitiveComplexity` → exit_code:0 | max CC 10 per function |
| **File size** | `find src/ -name "*.ts" -exec wc -l {} + \| awk '$1 > 300 {print $2, $1}'` → output_not_contains regex matching any file path | max 300 lines |
| **Dead code** | `npx ts-prune \| wc -l` → exit_code:0 with output_matches: "0" | zero unused exports |
| **Duplicate logic** | `npx jscpd src/ --min-lines 10 --min-tokens 50` → exit_code_not:0 means duplicates found | zero clones > 10 lines |
| **Error swallowing** | `grep -r "catch\s*(" src/ \| grep -v "console\.\|logger\.\|throw\|reject"` → output_not_contains regex (empty catches without log/re-throw) | every catch logs or re-throws |

These use real tools (Biome, ts-prune, jscpd) with behavioral predicates — dod-guard runs the command and checks output, same as any other proof. The difference from the old static analysis: the tool does the analysis, not dod-guard's checker.ts.

**Convergence audit:**
1. Run all structural gates
2. Count new findings (critical + major)
3. If count > 0: fix, re-run → go to step 1
4. If count == 0 two consecutive runs: GO
5. Max 3 iterations — if still finding issues on iteration 3, report to user (design-level problem)

**Postmortem capture:**
After Phase 4 GO, if any Phase 3 findings were critical:
1. Distill finding into an anti-pattern rule
2. Add to project's `.dod-guard/anti-patterns.json`
3. Future Phase 1 spec reviews automatically check against accumulated anti-patterns
4. This is compounding — each project gets smarter over time

**dod-guard encoding:**
- Behavioral structural proofs added as concrete leaves in a "Structural Gates" root
- New `convergence_audit` gate type in AdversarialGate metadata
- Anti-patterns stored in `.dod-guard/anti-patterns.json` (project-local, not in MCP storage)
- `dod_create` auto-generates structural gates based on project language (from `standards/language-commands.md`)

## Cross-Cutting Improvements

### 1. AdversarialGate as a First-Class Concept

New type in `types.ts`:

```typescript
export interface AdversarialGate {
  phase: 1 | 2 | 3 | 4;
  timestamp: string;
  verdict: "GO" | "REVISE" | "STOP";
  lenses: AdversarialLensResult[];
  critical_count: number;
  major_count: number;
  minor_count: number;
  summary: string;
}
```

New field in `DodDocument`:
```typescript
adversarial_gates: AdversarialGate[];
```

A DoD cannot progress to phase N+1 until phase N's gate is GO. `dod_check` reports gate status at the top of its output.

### 2. New MCP Tool: `dod_adversarial_gate`

```
dod_adversarial_gate(dod_id, phase, lenses[])
  → dispatches N subagents (one per lens) in parallel
  → each subagent returns structured JSON with findings
  → computes verdict from finding severities
  → checks mandatory minimums (rubber-stamp detection)
  → stores AdversarialGate in DoD metadata
  → returns verdict + summary
```

This tool doesn't spawn subagents itself (MCP tools can't). Instead, it returns a **structured dispatch plan** that the skill's orchestrator executes. The tool's job is:
1. Generate the exact prompts for each lens (parameterized by DoD context)
2. Define the verdict computation rules
3. Store the results

The actual subagent dispatch is done by the skill orchestrator (Claude Code), which calls the tool to record results.

### 3. New Predicate Types

| Type | Behavior |
|------|----------|
| `adversarial` | Runs adversarial review, checks verdict. `value`: "GO" (must pass). `extract`: lens count for mandatory finding check. |
| `holdout` | Verifies holdout test file exists and fingerprint matches. `value`: expected SHA-256. |
| `convergence` | Checks that convergence audit reached GO. `value`: "GO". |

### 4. New Skill: `/adversarial-workflow`

Choreographs the full 4-phase flow. Replaces the need to manually run interview → step-by-step → cleanup:

```
User: /adversarial-workflow "Add user authentication with JWT"

Phase 1: INTERVIEW
  - Runs interview skill (Phases 1-3.5)
  - Spawns 5-lens adversarial spec review
  - Presents findings to user
  - Iterates until GO
  - Creates DoD via dod_create

Phase 2: TEST
  - Spawns RED-phase test author (spec only, no implementation)
  - Spawns 3-lens test audit
  - Presents findings
  - Iterates until GO
  - Tags holdout tests

Phase 3: IMPLEMENT
  - Runs step-by-step skill (or cheap-step for cost savings)
  - After all steps: spawns 3 mandatory-finding review roles
  - Presents findings
  - Iterates until GO
  - Full dod_check

Phase 4: CLEANUP
  - Spawns structural audit
  - Convergence loop
  - Postmortem capture
  - Final dod_check (all gates GO)
```

### 5. Fix Broken Interview Phase 3.6

Immediate fix needed (independent of full migration):

The interview SKILL.md Phase 3.6 references 8 optional proof categories (tdd, mutation, streamline, observability, performance, complexity, coverage, duplication) — but post-e973fc6, the Predicate.type union only has 9 behavioral types and ProofCategory only has 4 values. The contrarian prompt asks about categories that can't be encoded in a DoD.

**Fix:** Rewrite Phase 3.6 to use the multi-lens adversarial approach from Phase 1 above. The contrarian becomes a proper spec adversary with 5 lenses instead of a single agent with stale categories.

### 6. Cross-Model Verification Strategy

| Phase | Generator model | Adversary model | Rationale |
|-------|----------------|-----------------|-----------|
| 1 (Spec) | Current session model | sonnet (subagent) | Different context = different blind spots |
| 2 (Tests) | haiku (cheap for test boilerplate) | sonnet (judgment for audit) | Cost-optimized; test generation is mechanical |
| 3 (Implement) | sonnet or DeepSeek (cheap-step) | sonnet + opus (saboteur gets opus) | Saboteur needs adversarial creativity |
| 4 (Cleanup) | sonnet | haiku (mechanical lint checks) | Structural gates are deterministic |

## Migration Steps

### Step 1: Fix Interview Skill (immediate — 1 file change)

**File:** `packages/dod-guard/skills/interview/SKILL.md`

- Rewrite Phase 3.6 "Contrarian Agent" → "Adversarial Spec Review"
- Remove references to deleted predicate types and categories
- Add 5-lens structure with GO/REVISE/STOP verdicts
- Fix stale predicate type list in Phase 4 (still lists `mutation`, `regression`, etc.)
- Fix stale proof category list (still lists 16 categories, now only 4)

### Step 2: Add AdversarialGate Types (1 file change)

**File:** `packages/dod-guard/src/types.ts`

- Add `AdversarialGate`, `AdversarialLensResult`, `AdversarialVerdict` types
- Add `adversarial_gates: AdversarialGate[]` to `DodDocument`
- Add `adversarial`, `holdout`, `convergence` to `Predicate.type` union
- Add `test_audit` to `ProofCategory`

### Step 3: Add AdversarialGate Evaluation (2 files)

**Files:**
- `packages/dod-guard/src/evaluate-proof.ts` — add `evalAdversarial()`, `evalHoldout()`, `evalConvergence()` handlers
- `packages/dod-guard/src/schemas.ts` — update PredicateSchema

### Step 4: Add `dod_adversarial_gate` Tool (1 file)

**File:** `packages/dod-guard/src/index.ts`

- Register new tool with Zod schema for phase + lenses
- Implement gate creation (generates dispatch plan, stores results)
- Implement gate status check (reads existing gates, validates progression)

### Step 5: Create `/adversarial-workflow` Skill (new file)

**File:** `packages/dod-guard/skills/adversarial-workflow/SKILL.md`

- Full 4-phase choreography
- Lens dispatch templates per phase
- Verdict computation rules
- Failure recovery (per-phase REVISE loops)
- Integration with existing skills (interview, step-by-step, cheap-step)

### Step 6: Enhance `/step-by-step` with Adversarial Injection (1 file)

**File:** `packages/dod-guard/skills/step-by-step/SKILL.md`

- After all steps complete (Phase 2), inject adversarial implementation review
- Add Phase 3 (adversarial review) and Phase 4 (structural gates) to step-by-step flow
- Or: keep step-by-step focused on implementation, have adversarial-workflow call it

### Step 7: Create Structural Gate Templates (1 file)

**File:** `standards/structural-gates.md`

- Per-language behavioral structural proof commands
- Convergence audit configuration
- Anti-pattern schema for postmortem capture

### Step 8: Update Marketplace & Docs (2 files)

**Files:**
- `packages/dod-guard/.claude-plugin/marketplace.json` — add adversarial-workflow skill
- `.claude-plugin/marketplace.json` (root) — update skill count/descriptions
- `packages/dod-guard/CLAUDE.md` — update architecture docs
- `packages/dod-guard/README.md` — user-facing docs

### Step 9: Test & Publish

- Write tests for new predicate evaluators
- Write tests for AdversarialGate validation
- Build, bundle, version bump, tag, push

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CIC (Critique-Induced Confusion) from hallucinated adversarial feedback | Medium | High | Execution-based evidence requirement — all findings must cite `file:line` + failing command. Abstract objections rejected. |
| Rubber-stamp adversarial agents (zero findings) | High | Medium | Mandatory minimum findings per role. Zero findings = invalid verdict, re-dispatch with stronger prompt. |
| Token cost of multi-agent adversarial review | Medium | Low | Use cheap models for mechanical lenses (haiku), expensive models only for judgment (sonnet). Parallel dispatch. |
| User frustration with GO/REVISE loops | Medium | Medium | Max 3 iterations per phase. After 3 REVISE without GO, escalate to user with structured options. |
| Adversarial agents find non-issues (false positives) | Low | Medium | Cross-model verification + execution evidence reduces FP rate to ~7% (literature baseline). User always has final override. |
| Migration breaks existing DoDs | Low | High | Backward-compatible: new fields are optional, old DoDs have no `adversarial_gates`, old predicates still work. Gate progression check only applies when gates exist. |

## Success Metrics

1. **Phase 1 spec reviews** catch at least 1 critical or 2+ major issues per non-trivial spec (validated against historical specs with known bugs)
2. **Phase 2 test audits** flag at least 1 untested edge case per feature (validated by inserting known bugs into implementations)
3. **Phase 3 implementation reviews** catch at least 1 non-obvious bug per feature (validated against bugs found in production)
4. **Phase 4 structural gates** prevent regression on length/complexity with zero false positives (behavioral tools, not regex heuristics)
5. **Postmortem anti-patterns** accumulate and prevent recurrence of escaped bugs (compound improvement over time)
