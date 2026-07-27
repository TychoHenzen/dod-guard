---
name: adversarial-workflow
description: >-
  4-phase adversarial-gated quality choreography. Each phase requires adversarial
  review before the next can execute: Spec Review → Test Audit → Implementation
  Review → Structural Cleanup. Uses dod_adversarial_gate to store verdicts
  canonically — dod_check blocks phase N+1 until phase N gate is GO. TRIGGER
  when: user says "adversarial workflow", "gate this", "strict quality", "full
  adversarial pass", "4-phase review", "adversarial review", wants rigorous
  multi-phase verification, or asks for adversarial gates on any non-trivial
  feature. Also trigger when user flags quality or security concerns on multi-step
  implementation work.
argument-hint: "[task description or existing DoD ID]"
---

# Adversarial Workflow

You are the orchestrator. Execute this 4-phase adversarial-gated workflow.
Each phase dispatches adversarial subagents in parallel, collects their findings,
computes a GO/REVISE/STOP verdict, and records it via `dod_adversarial_gate`.
A DoD cannot progress to phase N+1 until phase N's gate is GO.

## Determine where you are

If the user passed a DoD ID, read its gates first:

```
dod_status(dod_id: "<id>")
// or: dod_tree(dod_id: "<id>")
```

Look at `adversarial_gates[]` in the response. Start at the first phase without GO.

If the user described a task with no DoD: start at Phase 1.

## Phase 1: Spec Review

Build a DoD from the user's task, then attack it with 5 adversarial lenses.

### Steps

1. Run `/dod-guard:interview` to gather requirements and build the DoD.
   Run it through **Phase 4 (`dod_create`)** — you need a real `dod_id` before
   any gate can be recorded in step 6. Stop before Phase 5 (hand-off); this
   skill is the executor. Do NOT let it start implementation.

   Interview runs the same 5 lenses as its own Phase 3.6. If it already did and
   recorded a phase-1 gate, don't repeat the work — read `adversarial_gates[]`
   and skip to Phase 2.

2. Dispatch these 5 subagents IN PARALLEL — each gets the DoD as context:

| Lens | subagent_type | model | What to ask |
|------|---------------|-------|-------------|
| Security | dod-guard:adversarial-security | sonnet | STRIDE threats, trust boundaries, authZ gaps. Look for injection vectors, missing validation, exposed secrets. |
| Assumptions | dod-guard:adversarial-spec-reviewer | haiku | Implicit assumptions about codebase state, user behavior, environment, data format. What happens if any assumption is wrong? |
| Testability | dod-guard:adversarial-spec-reviewer | haiku | Can each requirement produce a falsifiable proof? Which requirements are vague or unverifiable? |
| Consistency | dod-guard:adversarial-spec-reviewer | haiku | Do requirements align? Contradictions? Duplicates? Scope drift from the original goal? |
| Implementability | dod-guard:adversarial-spec-reviewer | haiku | Does this fit existing architecture? Missing dependencies? Breaking changes to shared interfaces? |

3. Each lens prompt (customize the bracketed parts):

```
You are an adversarial [LENS] reviewer. Review this spec.
You MUST find at least 1 issue OR report exactly "NO_FINDINGS: [specific reason]".
A bare "no issues found" without justification = invalid verdict.

SPEC:
- Goal: [goal]
- Requirements: [requirements]
- TaskNode tree: [tree structure]
- Language/stack: [language]

For each finding output EXACTLY:
  SEVERITY: critical|major|minor
  TARGET: which requirement or node
  PROBLEM: concrete description
  SUGGESTION: how to fix
```

4. Collect all findings from all 5 subagents. Count critical, major, minor across all lenses.

5. Compute verdict:
   - **GO**: 0 critical, 0–2 major → record gate, proceed to Phase 2
   - **REVISE**: 1+ critical OR 3+ major → present findings to user, iterate (max 3 REVISE cycles)
   - **STOP**: 1+ blocker (fundamentally infeasible) → escalate to user, abort

6. Call dod_adversarial_gate:

```
dod_adversarial_gate(
  dod_id: "<id>",
  phase: 1,
  verdict: "GO"|"REVISE"|"STOP",
  lenses: [
    {
      lens: "Security",
      findings: [{severity: "major", target: "req-2", problem: "...", suggestion: "..."}],
      mandatory_minimum_met: true
    },
    // ... all 5 lenses
  ],
  summary: "Spec review: 0 critical, 2 major, 4 minor across 5 lenses"
)
```

7. If GO → tell user "Phase 1 passed. Ready for Phase 2 (Test Audit)."
   If REVISE → fix issues, re-dispatch lenses, re-evaluate.

## Phase 2: Test Audit

Write tests in RED isolation (author sees spec, NOT implementation code), then audit them.

### Prerequisite

Phase 1 gate must be GO. Verify: `dod_status(dod_id: "<id>")` → check adversarial_gates[0].verdict === "GO".

### Steps

1. Dispatch a test author subagent. Give it the DoD spec + TaskNode tree. Explicitly forbid reading implementation files or the implementation plan. The author writes tests against the spec, not the code.

2. After tests exist, dispatch these 3 audit lenses IN PARALLEL:

| Lens | subagent_type | What to ask | Evidence required |
|------|---------------|-------------|-------------------|
| Coverage | dod-guard:adversarial-test-auditor | Does every requirement have at least one test? | Map each requirement → test file:line |
| Falsifiability | dod-guard:adversarial-test-auditor | Would each test fail if the requirement was wrong? | Describe a bug that WOULD make each test fail |
| Gap Detection | dod-guard:adversarial-test-auditor | What edge cases, error paths, or boundary conditions are untested? | List specific missing test scenarios with example inputs |

**Model selection comes from the Model-Diversity Enforcement section below** — it depends on who wrote the tests, so there is no fixed default here.

Each lens MUST find at least 1 issue. Zero findings from a lens = rubber-stamp → re-dispatch that lens with a stronger prompt.

3. Compute verdict (same thresholds as Phase 1: 0 critical, ≤2 major).

4. If GO: tag key behavioral tests with `<!-- @dod-holdout -->` comments. These become holdout proofs that detect test weakening later.

5. Call dod_adversarial_gate(phase: 2, verdict, lenses, summary).

## Phase 3: Implementation Review

Implement the feature, then attack the diff with mandatory-finding reviewers.

### Prerequisite

Phase 2 gate must be GO.

### Steps

1. Run `/dod-guard:step-by-step` (preferred) or `/dod-guard:cheap-step` (cost-optimized) to implement the feature. All steps must complete, tests pass, build clean.

2. Dispatch these 3 roles IN PARALLEL — each gets CLEAN context (only the diff + spec, never the implementer's reasoning or intermediate steps):

| Role | subagent_type | Must find | Perspective |
|------|---------------|-----------|-------------|
| Saboteur | dod-guard:adversarial-saboteur | 2 issues | "How do I break this?" Worst-case inputs, concurrency races, resource exhaustion, null/undefined injection |
| New Hire | dod-guard:adversarial-new-hire | 1 issue | "Can I understand this cold?" Unclear naming, missing comments, confusing control flow, undocumented assumptions |
| Spec Auditor | dod-guard:adversarial-spec-auditor | 1 issue | "Does this match the original spec?" Compare implementation against Phase 1 requirements (not the implementation plan) |

**Model selection is decided by the Model-Diversity Enforcement section below, not here** — it depends on which model wrote the implementation, so there is no fixed default. When model diversity is unavailable, omit `model` and let each agent's own frontmatter decide.

3. Every finding MUST include all three (reject findings missing any):
   - `file:line` of the issue
   - A shell command that demonstrates the problem
   - A concrete fix suggestion

4. Compute verdict:
   - **GO**: 0 critical, 0–3 major, all mandatory minimums met
   - **REVISE**: 1+ critical OR 4+ major OR a role didn't find its minimum
   - **STOP**: design-level flaw → back to Phase 1

5. Fix REVISE issues, re-dispatch roles, re-evaluate. Max 3 iterations.

6. Call dod_adversarial_gate(phase: 3, verdict, lenses, summary).

7. Run full `dod_check(dod_id: "<id>")` — all behavioral proofs must pass.

## Phase 4: Structural Cleanup

Run behavioral structural gates, converge to zero new findings, capture anti-patterns.

### Prerequisite

Phase 3 gate must be GO.

### Steps

1. Add structural proofs to the DoD as concrete leaves (via `dod_add_node` or `dod_refine`).

   **Copy them from [`standards/structural-gates.md`](../../../../standards/structural-gates.md)** — it holds ready-made,
   per-language proof JSON (complexity, large files, dead code, error swallowing)
   with correct commands and predicates. Do not hand-write these; the obvious
   one-liners are wrong in subtle ways (`ts-prune` prints a list, so matching
   `"0"` never fires; a bare `find` for line counts isn't a portable command).

   Pick the section matching the project's language, adapt paths, and verify each
   proof runs before adding it. If the language has no section, write the proof,
   test it against a deliberately-bad file to confirm it actually fails, and add
   the new section to `standards/structural-gates.md` so the next run inherits it.

2. Convergence audit loop:
   a. Run `dod_check(dod_id: "<id>")` on the structural proofs
   b. Count new critical + major findings
   c. If count > 0 → fix, go to step (a)
   d. If count == 0 on two consecutive runs → GO
   e. Max 3 iterations — if still finding issues, report to user

3. Call dod_adversarial_gate(phase: 4, verdict: "GO", lenses: [{lens: "Convergence", findings: [], mandatory_minimum_met: true}], summary: "Structural cleanup converged after N iterations").

4. Run full `dod_check(dod_id: "<id>")` → should return PASS (all 4 gates GO, all behavioral proofs pass).

5. If any Phase 3 finding was critical, write it up as a durable lesson so the
   next run doesn't reproduce it. Use whichever of these is available:
   `memory_save(type: "project")` for cross-session recall, or `evo_learn` if a
   gitevo run is active. Do not invent a local rules file for this — a JSON blob
   nothing reads is not a feedback loop.

---

## Verdict thresholds (reference)

| Phase | max_major for GO | Mandatory minimums |
|-------|-----------------|-------------------|
| 1 (Spec) | 2 | Each of 5 lenses: ≥1 finding |
| 2 (Test) | 2 | Each of 3 lenses: ≥1 finding |
| 3 (Implement) | 3 | Saboteur: ≥2, New Hire: ≥1, Spec Auditor: ≥1 |
| 4 (Cleanup) | 0 (convergence) | Zero new findings on 2 consecutive runs |

**GO**: 0 critical, ≤max_major major, all mandatory minimums met
**REVISE**: 1+ critical OR >max_major major OR mandatory minimum unmet
**STOP**: 1+ blocker (fundamentally infeasible)

## Subagent clean-context template

Every adversarial subagent gets ONLY the artifact under review. Never include the author's reasoning, implementation plan, or intermediate steps.

```
You are an adversarial reviewer. Review ONLY the artifact below.
You do NOT have access to the author's reasoning, design decisions, or plan.
Your job is to find problems.

[artifact — spec, diff, or structural output]

Rules:
1. You MUST find at least [N] issue(s) OR report "NO_FINDINGS: [specific justification]"
2. Every finding MUST cite concrete evidence (file:line, command output)
3. Be specific. "file:line: X causes Y because Z" is useful. "This is wrong" is rejected.
```

## Model-Diversity Enforcement (Phase 2 & 3)

**The problem:** Same model writing tests AND implementation = TDD theater (test written to pass the implementation the model already has in mind). Same model running adversarial lenses against its own output = rubber-stamp (model agrees with itself).

**The fix:** Phase 2 (Test Audit) and Phase 3 (Implementation Review) lenses SHOULD use a different model/provider than the implementation author.

### Model-diversity routing table

| Phase | Author model | Recommended lens model | Rationale |
|-------|-------------|----------------------|-----------|
| Phase 2 (Test Audit) — if tests written by Claude/Sonnet | sonnet | haiku (different model) | Haiku won't share Sonnet's "the tests are fine" bias |
| Phase 2 (Test Audit) — if tests written by DeepSeek | deepseek | sonnet | Claude catches what DeepSeek misses |
| Phase 3 (Implement Review) — if implementation by Claude | sonnet/opus | haiku (new-hire, spec-auditor), sonnet (saboteur) | Different model for understanding gaps; same-model OK for attack lens since attack surface is different |
| Phase 3 (Implement Review) — if implementation by DeepSeek | deepseek | sonnet (all 3 lenses) | Claude reviews DeepSeek output — genuine independence |

### How to apply model diversity

When dispatching adversarial subagents, set the `model` parameter explicitly:

```
// Phase 2 example — tests written by sonnet, audit by haiku
Agent(subagent_type: "dod-guard:adversarial-test-auditor", model: "haiku", ...)

// Phase 3 example — implementation by deepseek, review by sonnet
Agent(subagent_type: "dod-guard:adversarial-saboteur", model: "sonnet", ...)
Agent(subagent_type: "dod-guard:adversarial-new-hire", model: "sonnet", ...)
Agent(subagent_type: "dod-guard:adversarial-spec-auditor", model: "sonnet", ...)
```

**When model diversity is unavailable** — this includes any single-provider
setup, and notably a session proxied entirely to one cheap backend, where
`model: "sonnet"` and `model: "haiku"` both resolve to the same weights and the
whole routing table above is inert:

- Use the same model but with maximally different lens prompts
- The lens agent definitions already encode different personas and attack surfaces
- Lean harder on the compensating controls that don't depend on model identity:
  clean context per lens, mandatory minimum findings, required `file:line` +
  reproducing command on every Phase 3 finding, and negative-control injection
- This is defense-in-depth-lite — better than nothing, weaker than true diversity
- Flag it in the gate summary: "Model diversity unavailable — single-model adversarial review (degraded independence)"

**Check before relying on the table:** if you cannot name two distinct models
actually reachable in this session, you are in the degraded case. Say so rather
than passing `model:` params that quietly resolve to the same thing.

### Negative Control Injection (rubber-stamp detection)

**The problem:** A lens that returns zero findings on everything is rubber-stamping. But you can't tell a legitimately clean artifact from a lazy lens without testing the lens itself.

**The fix:** Periodically feed a known-bad artifact to one lens during Phase 1 (Spec Review). If the lens returns zero findings on a known-bad spec, it's rubber-stamping — re-dispatch with a stronger prompt.

**Implementation (lightweight — Phase 1 only):**

Run this on the **weakest lens**, not only on a lens that returned literally
zero — a lens returning zero is already an invalid verdict handled by the
mandatory-finding rule, so gating on that makes this check dead code.

After the 5 Phase 1 lenses complete:

1. Pick the lens with the fewest findings, counting a `NO_FINDINGS:` return as
   zero. Ties → pick Security.
2. Feed that lens a synthetic bad spec: the REAL spec with one obvious flaw
   injected, chosen to fall inside that lens's own attack surface —
   - Security → drop auth from an endpoint serving user data
   - Assumptions → reference a helper that doesn't exist in the codebase
   - Testability → replace a requirement with an unfalsifiable one ("feels fast")
   - Consistency → add a requirement contradicting an existing one
   - Implementability → require infrastructure the project doesn't have
3. Lens catches the injected flaw → it's discriminating. Record and move on.
4. Lens misses it → rubber-stamp. Re-dispatch against the original spec with:
   "You previously found N issues. A variant of this spec with a deliberate
   [flaw type] also passed your review. Re-review with higher scrutiny."

**Skip negative controls when:**
- Fewer than 3 total findings across all lenses (the spec is genuinely sparse — negative control would be noise)
- Phase 1 gate is already REVISE (no point testing lenses when the spec is known-bad)
- The run is already over its time budget — this costs one extra dispatch

**Recording negative control results:**
Add to the gate summary: "Negative control: <lens-name> detected <N>/1 injected flaws — <OK/RUBBER-STAMP>."

## Recovery

| Scenario | Response |
|----------|----------|
| Phase N REVISE | Fix issues, re-run that phase. Max 3 iterations, then escalate. |
| Phase N STOP | Present blocker to user. Abort or redesign. |
| Context lost mid-workflow | Read DoD's `adversarial_gates[]` — resume from first phase without GO. |
| Gate never recorded | `dod_check` reports FAIL. Run the missing phase's adversarial review. |

## Rules

1. PHASE ORDER IS ENFORCED — check gates before starting any phase.
2. CLEAN CONTEXT ALWAYS — adversarial subagents never see author's reasoning.
3. MANDATORY FINDINGS — zero-finding lenses = re-dispatch.
4. EXECUTION EVIDENCE — every Phase 3 finding cites file:line + failing command.
5. MAX 3 REVISE ITERATIONS per phase — then escalate to user.
6. NEVER SKIP GATES — every phase runs, even if it seems "obviously fine."

## Shipped Agents

This skill ships 6 specialized agents in `agents/`:

| Agent | File | Purpose | Phase(s) |
|-------|------|---------|----------|
| `adversarial-security` | `agents/adversarial-security.md` | STRIDE threats, OWASP Top 10, authZ, injection, secrets | Phase 1 |
| `adversarial-spec-reviewer` | `agents/adversarial-spec-reviewer.md` | Assumptions, testability, consistency, implementability | Phase 1 |
| `adversarial-test-auditor` | `agents/adversarial-test-auditor.md` | Coverage mapping, falsifiability, edge case gaps | Phase 2 |
| `adversarial-saboteur` | `agents/adversarial-saboteur.md` | Worst-case inputs, races, exhaustion, null injection | Phase 3 |
| `adversarial-new-hire` | `agents/adversarial-new-hire.md` | Naming, comments, control flow, conventions | Phase 3 |
| `adversarial-spec-auditor` | `agents/adversarial-spec-auditor.md` | Requirement-to-implementation tracing, fidelity | Phase 3 |

These are referenced by scoped name (`dod-guard:adversarial-security`, etc.) —
the plugin namespace is auto-prefixed at install time.

## Agent Tool Usage

**CRITICAL**: The `subagent_type` parameter is an agent NAME, NOT a model name.

```
// ✅ CORRECT — agent name + model are separate
Agent(subagent_type: "dod-guard:adversarial-saboteur", model: "opus", ...)

// ❌ WRONG — model name passed as agent type (agent "sonnet" doesn't exist)
Agent(subagent_type: "sonnet", ...)
```

The `model` parameter is optional when the agent's frontmatter already specifies
the model — it overrides the agent default when you need a different model for
a specific invocation. When omitted, the agent's own `model` frontmatter is used.
