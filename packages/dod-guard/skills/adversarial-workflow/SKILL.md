---
name: adversarial-workflow
description: >-
  4-phase adversarial choreography replacing the primitive "Contrarian Agent."
  Each phase gates the next with adversarial review: Spec → Test Audit →
  Implementation Review → Structural Gates. Requires GO verdict at each gate
  before the next phase can execute. Uses dod_adversarial_gate to store results.
  TRIGGER when: user says "adversarial workflow", "gate this", "strict quality",
  "full adversarial pass", "4-phase review", or wants rigorous multi-phase
  verification with adversarial gates between each phase.
argument-hint: "[goal description]"
---

# Adversarial Workflow — 4-Phase Adversarial Choreography

Execute a full adversarial-gated workflow: requirements spec with adversarial
review → test contracts with audit → implementation with mandatory-finding review
→ structural cleanup with convergence audit. Each phase must pass a GO gate
before the next can execute.

## Why This Exists

Self-critique has a ~30-60% false positive rate — models approve their own output
because they share blind spots. Adversarial review drops this to ~7% by isolating
context, requiring mandatory findings, and demanding execution-based evidence.

The old "Contrarian Agent" in interview Phase 3.6 was a single reviewer arguing
for deleted static-analysis proof categories. This replaces it with a rigorous
4-phase choreography where each phase has its own adversarial gate.

## When to Use

- Non-trivial feature where bugs have real consequences
- Security-sensitive work (auth, data integrity, input handling)
- Multi-step implementation where spec quality gates downstream cost
- User says "full adversarial pass" or "strict quality mode"

## When NOT to Use

- Trivial fixes (typos, config changes, single-line patches)
- Documentation-only changes
- Exploration/spike work
- Tasks where the overhead outweighs the risk

## Phase Structure

| Phase | Name | Adversary | Gates Next Phase |
|-------|------|-----------|-----------------|
| 1 | Spec Review | 5 parallel lenses (Security, Assumptions, Testability, Consistency, Implementability) | Phase 2 (Test) |
| 2 | Test Audit | 3 parallel lenses (Coverage, Falsifiability, Gap Detection) | Phase 3 (Implement) |
| 3 | Implementation Review | 3 mandatory-finding roles (Saboteur, New Hire, Spec Auditor) | Phase 4 (Cleanup) |
| 4 | Structural Cleanup | Convergence audit (behavioral structural proofs) | Final PASS |

Each phase uses `dod_adversarial_gate` to store the verdict canonically.
`dod_check` blocks execution of phase N+1 proofs until phase N's gate is GO.

## Process

### Phase 1: Spec Review

```
User describes task
  → Run /dod-guard:interview (phases 1–3.5) ← existing interview skill
  → Adversarial spec review (5 lenses in parallel)
  → Collect findings, compute GO/REVISE/STOP verdict
  → Present to user, iterate until GO
  → dod_create with adversarial_gate recorded
```

**5 lenses — dispatch in parallel as separate subagents:**

| Lens | subagent_type | model | Question |
|------|---------------|-------|----------|
| Security | `general-purpose` | sonnet | STRIDE threats, trust boundaries, authZ gaps |
| Assumptions | `general-purpose` | haiku | Implicit assumptions about codebase, user behavior, environment |
| Testability | `general-purpose` | haiku | Can each requirement produce a falsifiable proof? |
| Consistency | `general-purpose` | haiku | Do requirements align? Contradictions? Scope drift? |
| Implementability | `general-purpose` | haiku | Fits existing architecture? Missing deps? |

**Each lens prompt:**
```
You are an adversarial {lens} reviewer. Review this spec for {attack_surface}.
You MUST find at least 1 issue OR report "NO_FINDINGS: [specific justification]".
A bare "no issues found" = invalid verdict.

SPEC:
- Goal: {goal}
- Requirements: {requirements}
- TaskNode tree: {tree_structure}
- Language/stack: {language}

Output EACH finding as:
  SEVERITY: critical|major|minor
  TARGET: which requirement/node this attacks
  PROBLEM: concrete description
  SUGGESTION: how to fix
```

**Verdict thresholds:**
- **GO**: 0 critical, 0-2 major → record via `dod_adversarial_gate`, proceed to Phase 2
- **REVISE**: 1+ critical OR 3+ major → present findings, iterate, re-run
- **STOP**: 1+ blocker → abort

**Max 3 REVISE iterations.** After 3, escalate remaining unresolved findings to user.

### Phase 2: Test Audit

```
Spec locked (Phase 1 GO)
  → Test author writes tests (RED isolation: sees spec, NOT implementation)
  → 3-lens test audit
  → REVISE loop until GO
  → Tag holdout tests with <!-- @dod-holdout -->
  → Record gate via dod_adversarial_gate
```

**RED isolation:** Test author subagent gets spec + TaskNode tree but NOT implementation
plan. Prompt explicitly forbids reading implementation files.

**3 lenses — dispatch in parallel:**

| Lens | Question | Evidence required |
|------|----------|-------------------|
| Coverage | Does every requirement have a test? | Map each requirement → test file:line |
| Falsifiability | Would each test fail if requirement was wrong? | Describe a bug that WOULD make it fail |
| Gap Detection | What edge cases/assumptions are untested? | List specific missing test scenarios |

**Mandatory minimums:** Each lens must find at least 1 issue. Zero = rubber-stamp, re-dispatch.

**Holdout contracts:** After GO, tag key behavioral tests with `<!-- @dod-holdout -->`.
Use the `holdout` predicate type — stores SHA-256 of test file to detect weakening.

**dod_adversarial_gate call:**
```json
{
  "dod_id": "{id}",
  "phase": 2,
  "verdict": "GO",
  "lenses": [{...}],
  "summary": "Test audit passed: {N} holdout tests tagged, {M} gaps addressed"
}
```

### Phase 3: Implementation Review

```
Tests locked (Phase 2 GO)
  → Run /dod-guard:step-by-step (or /dod-guard:cheap-step for cost savings)
  → All steps complete, tests pass, build clean
  → 3 mandatory-finding review roles (clean context)
  → REVISE loop until GO
  → Full dod_check
```

**3 mandatory-finding roles — dispatch in parallel:**

| Role | Perspective | Must find | model |
|------|------------|-----------|-------|
| Saboteur | "How do I break this?" — worst-case inputs, concurrency, resource exhaustion | 2 issues | opus |
| New Hire | "Can I understand this without author's context?" — clarity, naming, flow | 1 issue | haiku |
| Spec Auditor | "Does this match the spec?" — compares to original requirements, not plan | 1 issue | sonnet |

**Clean context:** Each role sees only the diff + spec (saboteur/spec auditor) or
diff alone (new hire). Never sees implementer's reasoning or intermediate steps.

**Execution-based evidence:** Every finding must cite:
1. `file:line` of the issue
2. A command that demonstrates the problem
3. A concrete fix suggestion

Findings without all three = CIC (Critique-Induced Confusion), rejected.

**Verdict:**
- **GO**: 0 critical, 0-3 major, all mandatory minimums met
- **REVISE**: 1+ critical OR 4+ major OR mandatory minimum unmet
- **STOP**: design-level flaw requiring spec change → back to Phase 1

### Phase 4: Structural Cleanup

```
Implementation reviewed (Phase 3 GO)
  → Run behavioral structural gates
  → Convergence audit (repeat until stable)
  → Postmortem capture (anti-patterns → .dod-guard/anti-patterns.json)
  → Full dod_check PASS (all gates GO)
```

**Structural gates — behavioral tools, not static analysis:**

| Gate | Command | Predicate |
|------|---------|-----------|
| Function complexity | `npx biome lint --rule complexity/noExcessiveCognitiveComplexity` | exit_code: 0 |
| Large files | `find src/ -name "*.ts" -exec wc -l {} + \| awk '$1 > 300 {print $2, $1}'` | output_not_contains regex |
| Dead code | `npx ts-prune \| wc -l` | output_matches: "0" |
| Duplicate logic | `npx jscpd src/ --min-lines 10 --min-tokens 50` | exit_code: 0 |
| Error swallowing | `grep -r "catch\s*(" src/ \| grep -v "console\.\|logger\.\|throw\|reject"` | output_not_contains regex |

**Convergence audit:**
1. Run all structural gates
2. Count new findings (critical + major)
3. If count > 0 → fix, re-run, go to step 1
4. If count == 0 two consecutive runs → GO
5. Max 3 iterations — if still finding issues, report to user

**Postmortem capture:**
After GO, if any Phase 3 findings were critical:
1. Distill finding into anti-pattern rule
2. Add to `.dod-guard/anti-patterns.json`
3. Future Phase 1 spec reviews check against accumulated anti-patterns

## Clean-Context Dispatch Protocol

Every adversarial subagent gets CLEAN context — only the artifact under review.
Never include the author's reasoning, plan, or intermediate steps.

```
You are an adversarial reviewer. You are reviewing ONLY the artifact below.
You do NOT have access to the author's reasoning, design decisions, or
implementation plan. Your job is to find problems in what you see.

{artifact — spec, diff, or structural output}

Rules:
1. You MUST find at least {N} issue(s) OR provide a specific justification
   for why none exist. "No issues" without justification = invalid.
2. Every finding MUST cite concrete evidence (file:line, command output, etc.).
   Abstract objections are rejected.
3. Be specific. "This is wrong" is useless. "file:line: X causes Y because Z" is useful.
```

## Verdict Computation (shared across phases)

| Verdict | Condition |
|---------|-----------|
| **GO** | 0 critical, 0-{max_major} major, all mandatory minimums met |
| **REVISE** | 1+ critical OR >{max_major} major OR mandatory minimum unmet |
| **STOP** | 1+ blocker (fundamentally infeasible, irreconcilable) |

Phase-specific thresholds:
- Phase 1: max_major=2
- Phase 2: max_major=2
- Phase 3: max_major=3
- Phase 4: max_major=0 (convergence)

## dod_adversarial_gate Tool

Records gate results in canonical DoD storage. Called after each phase completes:

```
dod_adversarial_gate(
  dod_id: "<id>",
  phase: 1|2|3|4,
  verdict: "GO"|"REVISE"|"STOP",
  lenses: [{lens, findings: [{severity, target?, problem, suggestion?, evidence?}], mandatory_minimum_met}],
  summary: "one-line summary"
)
```

Gate results persist in `DodDocument.adversarial_gates[]` and are checked by
`dod_check` via `adversarial`/`convergence` predicate types.

## Failure Recovery

| Scenario | Response |
|----------|----------|
| Phase N REVISE | Fix issues, re-run that phase's adversarial review. Max 3 iterations. |
| Phase N STOP | Present blocker to user. Abort or redesign. |
| 3 REVISE without GO | Escalate to user: show remaining findings, ask for override or redesign. |
| dod_adversarial_gate not called | `dod_check` reports gate missing (FAIL). |
| Context lost mid-workflow | Read DoD's `adversarial_gates[]` — resume from first phase without GO. |

## Model Strategy

| Phase | Generator | Adversary | Rationale |
|-------|-----------|-----------|-----------|
| 1 (Spec) | Current session | sonnet (all 5 lenses) | Different context = different blind spots |
| 2 (Tests) | haiku (test boilerplate) | sonnet (audit judgment) | Test generation is mechanical |
| 3 (Implement) | sonnet or DeepSeek | sonnet + opus (saboteur) | Saboteur needs adversarial creativity |
| 4 (Cleanup) | sonnet | haiku (mechanical checks) | Structural gates are deterministic |

## Skills Integration

- **Phase 1**: Calls `/dod-guard:interview` for research + spec construction
- **Phase 3**: Calls `/dod-guard:step-by-step` or `/dod-guard:cheap-step` for implementation
- **All phases**: Calls `dod_adversarial_gate` to record results
- **All phases**: Calls `dod_check` to verify gate progression

## Rules

1. **PHASE ORDER IS ENFORCED.** Phase N+1 cannot start until Phase N gate is GO.
2. **CLEAN CONTEXT ALWAYS.** Adversarial subagents never see author's reasoning.
3. **MANDATORY FINDINGS.** Zero-finding lenses = rubber-stamp, re-dispatch.
4. **EXECUTION EVIDENCE.** All findings must cite file:line + failing command.
5. **MAX 3 ITERATIONS.** After 3 REVISE cycles, escalate to user.
6. **NEVER SKIP GATES.** Every phase runs, even if "obviously fine."
