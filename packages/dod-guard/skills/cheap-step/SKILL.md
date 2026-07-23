---
name: cheap-step
description: >-
  Execute multi-step plans where each atomic step is implemented by cheap-worker
  fanout (evomcp solve → DeepSeek) and verified by the host model. Host model
  formulates specs, reviews results, and fixes failures the cheap workers can't
  crack. Same discipline as step-by-step but implementation runs on the cheap
  API — 90%+ of work costs pennies, host model only touches the hard 10%.
  TRIGGER when: plan has 5+ steps, user says "cheap step", "offload to deepseek",
  "use cheap model for this", "delegate the grunt work", or wants step-by-step
  execution without burning host-model tokens on routine implementation.
argument-hint: "[plan file or task description]"
---

# Cheap-Step: Host Formulates → Cheap Workers Implement → Host Verifies

Step-by-step's atomic discipline but each step's implementation runs on cheap
workers via evomcp solve. Host model writes the spec, verifies the result, and
only touches code directly when cheap workers fail after feedback+retry.

## Why This Exists

Step-by-step already solves the context-pressure problem (fresh subagent per
step). But each subagent runs on Anthropic models — even for routine,
mechanical implementation work. A 20-step plan costs ~$2–5 in host-model tokens.

The cascade strategy proved that cheap workers with a good verifier can handle
~90% of implementation work. The remaining ~10% needs the host model's
judgment.

**Cheap-step combines both insights:**

```
Step 1: Host writes spec → evomcp solve (DeepSeek) → Host verifies ✓
Step 2: Host writes spec → evomcp solve (DeepSeek) → Host verifies ✗
         → Feedback + retry (DeepSeek) → Host verifies ✓
Step 3: Host writes spec → evomcp solve (DeepSeek) → Host verifies ✗
         → Feedback + retry (DeepSeek) → Still ✗
         → Host fixes directly (only this step)
...
Step 20: Host writes spec → evomcp solve (DeepSeek) → Host verifies ✓
```

**Cost reality:** 20 steps where 18 pass on first try, 1 passes on retry, 1
needs host fix ≈ $0.50–1.00 total. Same work with all-host-model subagents ≈
$2–5. And the host model's context stays lean because it never holds
implementation details — only specs and verification results.

**The hard-10% guarantee:** The cascade strategy predicts ~10% of sub-problems
will be too hard for cheap workers. Cheap-step budgets for this: every step has
a fallback path. The host model NEVER spends tokens on work a cheap worker
could do, but ALWAYS catches what cheap workers can't.

## When to Use

- Multi-step plan where steps are well-specified and verifiable
- Routine implementation work (CRUD, wiring, config, mechanical refactors)
- Tasks where you'd normally use step-by-step but want lower cost
- Any plan where >60% of steps are "implement X following pattern Y"
- User says "offload this to deepseek" or "use cheap model"

## When NOT to Use

- 1–3 trivial steps — overhead of evomcp solve > benefit; just do it
- Steps requiring deep architectural decisions (host model should think, not verify)
- Tasks with no machine-checkable verification per step (can't write verify_cmd)
- First-time project setup with no existing test/lint/build harness
- Security-sensitive code where cheap-model errors are unacceptable even with verification
- Steps where the spec is harder to write than the implementation

## Pre-Flight

1. **Backend alive:** `evomcp status` → RUNNING. If not, report and stop.
2. **evomcp tools available:** `solve` tool must be registered. If not, this skill can't work.
3. **Git clean or checkpointed:** evomcp solve creates branches. Dirty tree without
   gitevo checkpoint = risk of lost work. Run `evo_checkpoint "pre-cheap-step"` first.

## Process

### Phase 0: Decompose

Read the plan or task list. Ensure each step is **atomic** and **verifiable** —
every step must have a clear verify_cmd the host can run after implementation.

**Critical difference from step-by-step:** steps must be sized for cheap-worker
success. Cheap workers do best with:
- Clear input/output contracts
- Existing patterns to follow (not novel architecture)
- Single-file or 2–3 file changes
- Specific, scoped verify commands (5–20 tests, not 500)

If a step is too big for cheap workers, split it. If it requires architectural
novelty, mark it `host-only` — the host model implements these steps directly.

Save to `.cheap-step/steps.json`:
```json
{
  "goal": "One-line goal",
  "cwd": "/absolute/path/to/project",
  "steps": [
    {
      "id": "S01",
      "title": "Add user model validation",
      "description": "Add validate() method to User model that checks email format and password length...",
      "verify_cmd": "npm test -- --testNamePattern='user validation'",
      "allowed_files": ["src/models/user.ts", "src/models/user.test.ts"],
      "context": "User model is at src/models/user.ts, uses zod for validation...",
      "mode": "cheap",
      "deps": [],
      "status": "pending"
    },
    {
      "id": "S02",
      "title": "Design auth middleware architecture",
      "description": "Design the auth middleware chain — this is architectural, host does it...",
      "mode": "host-only",
      "deps": [],
      "status": "pending"
    }
  ]
}
```

**Step modes:**
- `cheap` — evomcp solve → verify → feedback/retry → host fallback
- `host-only` — host model implements directly (like step-by-step's step-implementer)

Report step count and mode breakdown to user. Flag any step >3 files or with
verify_cmd running >50 tests — these will likely need decomposition.

### Phase 1: Execute — One Step at a Time

For each step in dependency order:

#### 1.1 Cheap steps: Write spec + dispatch

Write a tight evomcp solve spec for this ONE step:

```
Goal: [exact step description — paste from plan, don't paraphrase]
Verify: [verify_cmd from plan]
Allowed files: [from plan]
Context: [patterns to follow, interfaces to implement, constraints]
Fanout: 3–5 (narrow scope = fewer strategies needed)
Budget: ~30K tokens per step (small scope = small budget)
```

The spec quality determines worker success rate. Bad spec = wasted fanout.

Key spec-writing rules:
1. **verify_cmd must be specific.** Not `npm test` — `npm test -- --testNamePattern="user validation"`
2. **allowed_files constrains search.** Workers explore less, hit more.
3. **context includes patterns.** "Follow the validation pattern in src/models/product.ts" — workers copy patterns well.
4. **One concern per spec.** If the step description has "and" in it, split.

#### 1.2 Dispatch to evomcp

```
evomcp solve spec={goal, verify_cmd, allowed_files, context, fanout: 3, budget_tokens: 30000}
```

The host model goes quiet during solve. All worker token burning happens inside
evomcp, invisible to this context.

#### 1.3 Host verifies result

If evomcp returns PASS:
1. **Read the diff.** Not optional. Check for: actually solves the step (read
   the verification report), degenerate patterns (hardcoded outputs, deleted
   assertions, swallowed errors, commented-out code), allowed_files respected,
   no scope creep into other steps' territory.
2. **Re-run verify_cmd yourself.** Workers can be optimistic.
3. **Run broader tests if relevant.** The verify_cmd is scoped — make sure
   nothing else broke: `npm test -- --testNamePattern="user"` (broader but not full suite).
4. **Degenerate pattern or scope violation?** Reject, feed back, retry (1.4).
5. **Clean?** Mark step `completed`, apply patch, move on.

**Passing-but-suspicious rule:** If the patch passes verify but contains
something questionable (overly clever, wrong pattern, touches unexpected files),
that's a judgment call only the host can make. Reject with specific feedback.

#### 1.4 Failed? Feedback + retry

If evomcp returns ESCALATED or the host rejects a passing patch:

1. **Read the escalation report or host notes.** What failed? Single assertion?
   Pattern mismatch? Scope violation?
2. **Write structured feedback.** Not "fix it" — specific:
   ```
   FAILURE: User validation test expects ValidationError to include field name,
   but implementation throws generic Error.
   FIX: Throw new ValidationError(`Invalid ${field}: ${value}`) instead of
   throw new Error('Invalid').
   PATTERN: See src/models/product.ts:42 for the correct ValidationError usage.
   ```
3. **Re-dispatch with feedback as context:**
   ```
   evomcp solve spec={same goal, same verify_cmd, context: original context + feedback}
   ```
4. **Max 2 retries per step.** Same feedback → same result. If the second retry
   fails with the same signature, the step is in the hard 10%.

#### 1.5 Host fallback (hard 10%)

If a cheap step fails after 2 retries:

1. **Read the best partial attempt.** evomcp's escalation report includes the
   best candidate — often 80% correct.
2. **Identify the specific blocking issue.** It's usually ONE thing: one
   assertion, one edge case, one pattern the cheap model doesn't grasp.
3. **Fix directly.** Host model implements the fix. This is the ONLY time the
   host model touches implementation code in cheap-step.
4. **Run verify_cmd.** Confirm the fix works.
5. **Mark step `completed-host-fallback`.** Track these — if >30% of steps need
   host fallback, the task is too complex for cheap-step; escalate to user.

**Host fallback is EXPECTED.** The cascade strategy predicts ~10% of nodes need
it. It's not a failure of cheap-step — it's the system working as designed. The
host model's judgment applied to exactly the 10% that needed it, and the other
90% cost pennies.

#### 1.6 Host-only steps

For steps marked `host-only`:
1. Dispatch `step-implementer` agent (from step-by-step) OR implement directly.
2. Same verification gate as cheap steps.
3. These steps burn host-model tokens — that's intentional. They're the steps
   where judgment matters more than cost.

#### 1.7 Compact

Update progress. Strip all implementation details from context. Keep only what
the NEXT step needs: "S03 depends on User.validate() from S01
(src/models/user.ts, added in cheap pass)."

### Phase 2: Integration Check

After ALL steps complete:
1. Run full test suite (`npm test`)
2. Run lint/build
3. Check for cross-step issues (inconsistent patterns, import conflicts, style drift)
4. Report summary with cost breakdown:
   ```
   Steps: 20 total
     Cheap-pass (1st try):  15
     Cheap-pass (retry):     3
     Host-fallback:          1  (S07: auth middleware — cheap model couldn't
                                  handle token refresh edge case)
     Host-only:              1  (S02: architecture design)
   Estimated cost: ~$0.60 (workers) + ~$0.30 (host fallback step)
   vs. all-host step-by-step: ~$3.00
   ```
5. Present commit message (do NOT auto-commit)

## Spec-Writing Reference

Good specs make cheap workers succeed. Bad specs waste fanout budget.

### verify_cmd patterns

```bash
# Good — specific test pattern
npm test -- --testNamePattern="user model validation"

# Good — dod-guard DoD subtree
dod_check --dod-id=abc123 --nodePath=0.children.2

# Good — targeted lint
npx biome check src/models/user.ts

# Bad — too broad (500 tests = noise)
npm test

# Bad — no exit code signal
npm test -- --reporter=verbose | grep "PASS"  # always exits 0
```

### Context patterns

```
# Good — points to existing pattern
Follow the validation pattern in src/models/product.ts:
- validate() returns ValidationResult
- throws ValidationError with field name and message
- called in constructor before any mutations

# Good — specific constraint
The User class already exists. Add validate() method only — do NOT refactor
the constructor or change the field types.

# Bad — vague
Add validation to the user model. Make it good.

# Bad — too much
[entire file content of 5 unrelated files]
```

### Step sizing

| Step characteristic | Cheap-worker success rate |
|---------------------|--------------------------|
| 1 file, 1 function | ~95% |
| 1 file, multiple functions | ~85% |
| 2–3 files, clear pattern | ~75% |
| 2–3 files, novel logic | ~60% |
| 4+ files | ~40% — split further |
| New file from scratch | ~80% (needs pattern reference) |
| Refactor existing | ~70% (needs before/after examples) |

If a step's estimated success rate is <60%, either split it or mark it
`host-only`.

## Rules (ABSOLUTE — no exceptions)

1. **ONE STEP PER SOLVE CALL.** Never batch two steps into one evomcp solve.
   The verify_cmd must be step-specific.

2. **VERIFY EVERY RESULT.** Read the diff. Re-run the verify_cmd. No "evomcp
   said it passes."

3. **FEEDBACK IS SPECIFIC.** "Fix the validation" → wasted retry. "Throw
   ValidationError with field name, see product.ts:42" → fixed in one shot.

4. **MAX 2 RETRIES.** Same failure signature after 2 retries → host fallback.
   Don't retry hoping the cheap model gets lucky.

5. **HOST FALLBACK IS TARGETED.** Fix ONLY the specific blocking issue. Don't
   rewrite the whole step — the cheap worker's 80% solution is good enough.

6. **NEVER SKIP VERIFICATION.** Even on host-only steps. Even on "trivial"
   steps. Run the command.

7. **KEEP ORCHESTRATOR LEAN.** After step completes, flush everything except
   what the next step depends on. This is the same mechanism as step-by-step.

8. **TRACK FALLBACK RATE.** If >30% of cheap steps need host fallback, stop and
   tell the user. The task is too complex for cheap-step — either the specs are
   bad or the steps need decomposition. Don't silently burn retries.

9. **COST IS NOT THE GOAL.** Correctness is the goal. Cheap workers are a means,
   not an end. Never accept a wrong result because "it was cheap."

10. **CHECKPOINT BEFORE EACH SOLVE.** `evo_checkpoint "pre-S{N}"` — one
    command, zero cost, infinite regret prevention.

11. **HOST-ONLY MEANS HOST-ONLY.** Don't try evomcp solve "just to see" on a
    step you marked host-only. Those steps exist because you judged the cheap
    model can't handle them. Trust your judgment.

12. **BACKEND IS OPAQUE.** Never name, tune for, or debug the worker backend
    from this skill. If evomcp solve returns no output, report `evomcp status`
    to the user and stop. Backend health is not this skill's job.

## Anti-Patterns

| Temptation | Correct Response |
|------------|------------------|
| "Steps 3 and 4 are small, I'll combine them into one solve" | NO. One solve per step. Always. |
| "The spec is obvious, I'll skip writing context" | NO. Context = pattern references. Cheap workers need them. |
| "evomcp passed, I'll skip reading the diff" | NO. Read every diff. Cheap models cheat unintentionally. |
| "This step failed twice, let me try a third time" | NO. Host fallback. Same signature → same result. |
| "I'll mark this as cheap even though it's architectural" | NO. Architecture = host-only. Cheap workers copy patterns, don't design them. |
| "The host fallback rate is 40% but the steps are small" | 40% is too high. Stop — the task isn't suitable. Tell the user. |
| "I'll skip the checkpoint, it's just one step" | One command. Zero cost. |
| "Let me run the full test suite after every step" | NO. Scoped verify_cmd is enough per step. Full suite at integration check. |
| "This failed because the verify_cmd is flaky, let me just mark it pass" | NO. Fix the flaky test first. Flaky verify poisons the whole workflow. |

## Session Files

`.cheap-step/` survives compaction:
```
.cheap-step/
├── steps.json       # Plan with per-step status, mode, verify_cmd
├── progress.log     # One line per step: ✓ S01 (cheap) | ✗ S03 (retry 1/2) | ⚑ S07 (host-fallback) | ◆ S02 (host-only)
└── specs/           # Saved evomcp specs per step (for debugging failures)
    ├── S01-spec.json
    └── S03-spec.json
```

On skill start: check for existing `.cheap-step/progress.log`. If found → resume
from first pending step.

## Failure Recovery

- **evomcp backend down** → `evomcp status`, report to user, stop. Backend health
  is not this skill's job.
- **Step fails 2 retries** → host fallback. Fix the specific blocking issue.
- **Host fallback rate >30%** → report to user: steps, failure signatures, recommendation
  (decompose differently, switch to all-host step-by-step, or adjust specs).
- **Context lost mid-execution** → read `.cheap-step/progress.log`, resume from first
  pending step.
- **Verify flaky** → fix flakiness BEFORE retrying. Flaky verify poisons the
  feedback loop — cheap workers can't distinguish "I broke it" from "it was broken."
- **Plan needs change** → update steps.json, note in progress.log, continue.

## Integration Points

### evomcp
Primary execution engine. Every cheap step dispatches `evomcp solve`. The skill
assumes evomcp is installed and the deepclaude proxy is running.

### dod-guard
Preferred verify_cmd format. DoD subtrees give multi-layer verification
(lint+build+test+mutation) in one command:
```
dod_check --dod-id=abc123 --nodePath=0.children.2
```

### gitevo
```
evo_checkpoint "pre-cheap-step"              # before starting
evo_checkpoint "pre-S{N}"                    # before each solve
evo_checkpoint "post-S{N}"                   # after each passing step
evo_learn "CHEAP_STEP_FALLBACK: S{N} — {failure signature} → {fix summary}"
evo_learn "CHEAP_STEP_PATTERN: {task type} — {what worked} — {spec pattern}"
```

### step-by-step
Host-only steps can dispatch `step-implementer` agent. The two skills share the
atomic-step discipline — cheap-step just routes implementation to evomcp instead
of Anthropic subagents.

## Quick Reference

```bash
# Pre-flight
evomcp status
evo_checkpoint "pre-cheap-step"

# Dispatch a cheap step
evomcp solve '{"spec": {"goal": "...", "verify_cmd": "npm test -- --testNamePattern=\"...\"", "cwd": "...", "allowed_files": ["src/models/user.ts"], "fanout": 3, "budget_tokens": 30000, "context": "Follow pattern in src/models/product.ts..."}}'

# After step passes
evo_checkpoint "post-S{N}"
evo_learn "CHEAP_STEP_PATTERN: ..."

# Host fallback (when cheap workers fail)
# 1. Read best partial from escalation report
# 2. Fix the specific blocking assertion
# 3. Run verify_cmd to confirm
```
