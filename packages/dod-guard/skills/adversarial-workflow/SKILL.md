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
   Stop after interview phases 1–3.5 (spec + requirements + TaskNode tree).
   Do NOT proceed to implementation phases.

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

| Lens | subagent_type | model | What to ask | Evidence required |
|------|---------------|-------|-------------|-------------------|
| Coverage | dod-guard:adversarial-test-auditor | sonnet | Does every requirement have at least one test? | Map each requirement → test file:line |
| Falsifiability | dod-guard:adversarial-test-auditor | sonnet | Would each test fail if the requirement was wrong? | Describe a bug that WOULD make each test fail |
| Gap Detection | dod-guard:adversarial-test-auditor | sonnet | What edge cases, error paths, or boundary conditions are untested? | List specific missing test scenarios with example inputs |

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

| Role | subagent_type | model | Must find | Perspective |
|------|---------------|-------|-----------|-------------|
| Saboteur | dod-guard:adversarial-saboteur | opus | 2 issues | "How do I break this?" Worst-case inputs, concurrency races, resource exhaustion, null/undefined injection |
| New Hire | dod-guard:adversarial-new-hire | haiku | 1 issue | "Can I understand this cold?" Unclear naming, missing comments, confusing control flow, undocumented assumptions |
| Spec Auditor | dod-guard:adversarial-spec-auditor | sonnet | 1 issue | "Does this match the original spec?" Compare implementation against Phase 1 requirements (not the implementation plan) |

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

1. Add structural proofs to the DoD as concrete leaves (via dod_add_node or dod_refine):

| Proof | Command | Predicate |
|-------|---------|-----------|
| Complexity | `npx biome lint` | exit_code: 0 |
| Large files | find *.ts >300 lines | output_not_contains |
| Dead code | `npx ts-prune` | output_matches: "0" |
| Error swallowing | grep catch blocks without log/throw/rethrow | output_not_contains |

2. Convergence audit loop:
   a. Run `dod_check(dod_id: "<id>")` on the structural proofs
   b. Count new critical + major findings
   c. If count > 0 → fix, go to step (a)
   d. If count == 0 on two consecutive runs → GO
   e. Max 3 iterations — if still finding issues, report to user

3. If any Phase 3 findings were critical, distill them into anti-pattern rules and append to `.dod-guard/anti-patterns.json`.

4. Call dod_adversarial_gate(phase: 4, verdict: "GO", lenses: [{lens: "Convergence", findings: [], mandatory_minimum_met: true}], summary: "Structural cleanup converged after N iterations").

5. Run full `dod_check(dod_id: "<id>")` → should return PASS (all 4 gates GO, all behavioral proofs pass).

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
