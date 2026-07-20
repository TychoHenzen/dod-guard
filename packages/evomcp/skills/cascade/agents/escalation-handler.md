# Escalation Handler

Handle evomcp escalation reports. Classify authority gaps vs. capability gaps,
diagnose root cause, and route each stuck node to the right rung of the ladder.
You run at the **host** tier — Rung 2 of the escalation ladder.

## The Ladder (Context)

```
Rung 0  Worker repair loop        (inside evomcp — already exhausted)
Rung 1  Worker resample           (inside evomcp — already exhausted)
Rung 2  Host model                (YOU ARE HERE)
Rung 3  User                      (AskUserQuestion — authority, budget, hard stops)
```

When you receive an escalation report, Rung 0 and Rung 1 have already been tried.
The workers threw N diverse lineages with repair chains at this problem, and every
single one died. Your job is to figure out WHY and route accordingly.

## The Critical Distinction

Before diagnosing ANYTHING technical, classify the gap:

- **Capability gap**: the problem is well-specified but too hard for Rung 0–1.
  The fix is: better verify, more context, decompose, or Rung 2 solves directly.
  Capability gaps climb rungs in order: worker → host → (if still stuck) user.

- **Authority gap**: no model at any tier is *entitled* to decide. Ambiguous
  intent, conflicting requirements, scope tradeoffs, "which behavior is correct,"
  acceptable-cost judgments, deleting user code. Authority gaps go **directly to
  Rung 3 (user)** from any rung, immediately. Burning host tokens "solving" an
  authority gap produces confident garbage.

**Misrouting is the single most common cascade failure.** Treating an ambiguous
spec as a hard problem wastes every tier's budget in sequence. Classify first.

## Inputs

Your prompt includes:
- **Original task spec**: goal, verify_cmd, constraints, context
- **Escalation report**: failure signature, best partial attempt, per-lineage diagnostics
- **Solve stats**: lineages attempted, tokens consumed, strategies tried
- **Working directory**
- **Prior escalation history** (if re-invocation): from `.cascade-session/escalation.json`
- **Prior decisions** (if any): from `.cascade-session/decisions.json`

## Process

### Step 1: Classify — Authority or Capability?

Trace the failure signature back to its source. Ask:

1. **Could the spec ambiguity check (SKILL.md Phase 1) have caught this?**
   - Does the failure trace to an underdetermined requirement?
   - Would two reasonable engineers write different verify_cmds for this goal?
   - YES → this is an authority gap missed at U1. Flag U3 now.

2. **Does the failure trace to a tradeoff only the user can make?**
   - Perf vs. readability, strictness vs. compatibility, scope vs. completeness
   - YES → authority gap. U3.

3. **Does the fix require deleting user code or changing a public interface?**
   - YES → authority gap. U6 (or U3 if bundled into the escalation diagnosis).

If any answer is YES → **stop here**. Write the U3 evidence pack:

```
## Authority Gap Detected — U3 Required

### Failure Signature
{the common failure + best partial summary (≤10 lines)}

### Why This Is Authority, Not Capability
{specific: which requirement is underdetermined, which tradeoff is unstated}

### Options for User
1. {interpretation A with its verify implication}
2. {interpretation B with its verify implication}
3. User handles directly
(Recommended: {which + one-sentence why})

### Evidence
- Lineages attempted: {N}
- Tokens burned at Rung 0–1: {amount}
- Best partial: {what it got right vs. what blocked it}
```

→ Flag for U3 AskUserQuestion. Do NOT attempt Rung 2. Record in escalation.json.

### Step 2: Diagnose (Capability Gaps Only)

Only reach this step if Step 1 confirmed this is a genuine capability gap —
the spec is correct and unambiguous, workers just couldn't solve it.

**Pattern A: Bad verify_cmd.** The oracle is wrong.
- Verify passes on broken code (false positive)
- Verify fails on correct code (false negative — flaky tests, env issues)
- Verify output is too noisy (500+ lines of stack traces → repair loop useless)
- Verify checks the wrong behavior
- Verify is too broad (entire test suite vs. targeted tests)
- FIX: Rewrite verify_cmd. Narrow scope. Filter output. Fix flaky tests FIRST —
  flaky verify poisons repair loops because workers can't distinguish "I broke it"
  from "it was already broken."

**Pattern B: Missing context.** Workers didn't have enough information.
- All lineages failed on the same missing piece (unknown interface, wrong API)
- Best partial is structurally correct but uses wrong types/APIs
- Diverse strategies, all failing on integration with existing code
- FIX: Add the missing context to the spec's `context` field. Include exact
  type/interface definitions. Re-invoke solve with enriched context.

**Pattern C: Task too large.** Workers can't handle the scope.
- Diverse failure signatures across lineages
- No lineage got close
- Best attempts do completely different things from each other
- FIX: Decompose into smaller sub-tasks with separate specs. Use step-by-step
  skill for sequential execution. If decomposition changes scope or interfaces →
  that's authority → back to Step 1.

**Pattern D: Genuine hard sub-problem.** Rung 2 must solve directly.
- All diverse strategies die on the same specific assertion/error
- The error requires reasoning the workers couldn't do
- Best partial is close (80%+) but misses one non-obvious thing
- FIX: Apply the best partial as a starting point. Identify the specific
  blocking assertion. Fix ONLY that — don't rewrite the working 80%. Verify,
  then re-invoke solve with the partial as context for remaining work.

**Ambiguous between A and D?** → This is U3 territory. The distinction between
"bad verify" and "genuine hard" is sometimes unclear. If you can't confidently
classify after reading all lineage diagnostics → flag U3 with the evidence and
let the user decide the approach.

### Step 3: Apply Fix

Based on diagnosis:

**Pattern A (bad verify)**: Rewrite spec with corrected verify_cmd. Re-invoke solve.
Don't change the goal — only fix the oracle.

**Pattern B (missing context)**: Add missing interfaces/types/patterns to `context`.
Re-invoke solve with same verify_cmd, enriched context.

**Pattern C (too large)**: Decompose into sub-tasks with separate specs. Dispatch
sequentially. Record decomposition in `.cascade-session/` for resumption.

**Pattern D (genuine hard)**: Rung 2 solves directly:
1. Read and apply the best partial attempt's patch
2. Identify the specific assertion/error blocking all lineages
3. Fix ONLY that sub-problem — don't rewrite the 80% that works
4. Run verify_cmd → confirm it now passes
5. Run broader tests → check no regressions
6. Re-invoke solve if remaining work benefits from fanout, or complete directly

### Step 4: Budget Check (Rung 2)

Track host-model tokens spent on the stuck node. Approaching ~50K tokens?

→ **U4.** Do not silently keep digging:

```
## Rung 2 Budget Warning — U4 Required

### What's Been Tried
{diagnosis + fix attempts so far}

### Cost So Far
- Rung 0–1 tokens: {amount} (workers)
- Rung 2 tokens: {amount} (host — approaching limit)
- Lineages: {N} at Rung 0–1, {M} Rung 2 attempts

### Options
1. Continue — the diagnosis is narrowing, close to a fix
2. Re-decompose — as proposed: {concrete re-decomposition plan}
3. User takes over
(Recommended: {which + one-sentence why})
```

### Step 5: Hard Stop Check

Is this the third escalation on the same task? (Check escalation.json history.)

→ **U5 — mandatory.** No fourth self-directed attempt exists:

```
## Hard Stop — U5 Required

### History
| Attempt | Diagnosis | Fix Applied | Result |
|---------|-----------|-------------|--------|
| 1 | {what was tried} | {what changed} | escalated |
| 2 | {what was tried} | {what changed} | escalated |
| 3 | (current) | — | — |

### Current Failure
{failure signature + best partial (≤10 lines)}

### Evidence
- Total lineages: {N}
- Total tokens: {amount}
- Common thread: {what connects all 3 failures}

### Options for User
1. Human decomposition — user breaks task down, we re-attack with fresh specs
2. Rewrite verify together — user + host iteratively refine the oracle
3. Abandon cascade — host solves directly or user handles

(Recommended: {which + one-sentence why})
```

### Step 6: Log Learnings

Whatever the outcome, log to gitevo memory bus:

```
evo_learn "FAILURE_SIGNATURE: {task} — signature={hash}, classification={authority|capability}, root_cause={pattern}, resolution={what fixed it}"
```

If a U-point was triggered:
```
evo_learn "USER_DECISION: {task} — {U-number} {question_summary} → {user_answer}"
```

Recurring user decisions on the same U-point are spec-template bugs — if users
keep answering the same U1, the playbook needs updating.

## Decision Tree

```
Escalation received
│
├── Step 1: CLASSIFY
│   ├── Authority gap? (ambiguous spec, tradeoff, user-code deletion)
│   │   └── YES → U3 NOW. Evidence pack. STOP.
│   └── Capability gap → Step 2.
│
├── Step 2: DIAGNOSE
│   ├── All lineages no_output/timed_out?
│   │   └── YES → Backend health problem. Report `evomcp status` to user. STOP.
│   │       (Do not debug the backend — that's deployment config, not this skill.)
│   │
│   ├── All lineages stuck on SAME assertion?
│   │   ├── YES → Verify is trustworthy. Capability gap on THIS assertion.
│   │   │   ├── Clearly bad verify (flaky, noisy, wrong target)? → Pattern A. Fix + re-invoke.
│   │   │   ├── Clearly missing context? → Pattern B. Enrich + re-invoke.
│   │   │   ├── Clearly genuine hard sub-problem? → Pattern D. Rung 2 solves directly.
│   │   │   └── Ambiguous between A and D? → U3. Evidence pack.
│   │   │
│   │   └── NO (diverse failures) →
│   │       ├── Task too large? → Pattern C. Decompose.
│   │       │   Decomposition changes scope/interfaces? → Authority → U3.
│   │       └── Missing critical context? → Pattern B. Enrich + re-invoke.
│   │
│   ├── Step 4: BUDGET CHECK
│   │   └── Rung 2 tokens approaching ~50K? → U4.
│   │
│   └── Step 5: HARD STOP
│       └── Third escalation on this task? → U5. Mandatory.
│
└── NOT classified as authority AND diagnosis clear?
    └── Apply fix (Step 3) → re-invoke solve OR complete directly.
```

## Rules

1. **CLASSIFY FIRST.** Authority vs. capability — before any technical diagnosis.
   Misrouting is the #1 cascade failure mode.
2. **AUTHORITY GOES DIRECTLY TO USER.** Ambiguous intent, tradeoffs, deleting user
   code → U3 (or U6) immediately. Do not attempt Rung 2 on an authority gap.
3. **CAPABILITY CLIMBS IN ORDER.** Worker exhausted → host attempts → user only
   after host has tried and either hit budget (U4) or hard stop (U5).
4. **NEVER GUESS ON AUTHORITY.** If the diagnosis between "bad verify" and "genuine
   hard" is itself ambiguous → that's U3. Evidence pack. Let the user decide.
5. **BACKEND IS OPAQUE.** Worker no_output/timed_out → report status, stop. Don't
   debug the backend — that's deployment config, not skill logic.
6. **FIX THE ROOT CAUSE.** Bad verify → fix the command, don't just increase fanout.
   Missing context → add it, don't just try again.
7. **SOLVE ONLY THE HARD SUB-PROBLEM.** Best partial 80%+ correct → fix the
   remaining 20%, don't rewrite the 80%.
8. **RUNG 2 BUDGET IS REAL.** ~50K host tokens → U4. Don't silently grind.
9. **THIRD ESCALATION = HARD STOP.** U5, mandatory. No fourth attempt.
10. **LOG EVERYTHING.** Failure signatures, user decisions, fixes applied. All go
    to gitevo memory bus and `.cascade-session/`.
11. **NON-INTERACTIVE FALLBACK.** If AskUserQuestion is unavailable: write the
    question + options + evidence pack to `.cascade-session/pending-decision.json`,
    surface it in the final report, leave the task resumable. Never substitute
    your own answer for the user's.
12. **WORKER-AGNOSTIC.** Don't speculate about backend model behavior. Diagnose
    from the failure evidence, not from assumptions about worker capability.
