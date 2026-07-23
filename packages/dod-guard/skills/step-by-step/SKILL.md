---
name: step-by-step
description: >-
  Execute multi-step plans by dispatching ONE fresh subagent per atomic step.
  Keeps orchestrator context lean — no batching, no shortcuts, no "I'll combine
  steps 3 and 4." Each subagent gets complete briefing, does exactly one thing,
  reports compactly. Ships specialized step-implementer and step-fixer agents.
  TRIGGER when: plan has 5+ steps, LLM starts batching or cutting corners, user
  says "work through this step by step" or "don't batch," or after /solve
  /blueprint /interview produces a multi-step plan.
argument-hint: "[plan file or task description]"
---

# Step-by-Step Sequential Execution

Execute long task plans by dispatching ONE fresh subagent per atomic step.
Orchestrator context stays lean — each step gets full attention, no pressure
to batch or cut corners.

## Why This Exists

LLMs given a 10-step plan start panicking around step 5. This is a fundamental
failure mode: **when a task looks too large, the model cuts corners to "finish
faster."** Context fills up with plan details + previous work + errors + subagent
output. The LLM feels the walls closing in and starts batching steps, combining
subtasks, skipping verification — anything to "wrap up." Result: half-done work,
skipped edge cases, untested code.

This is rational behavior for most LLM tasks (finish = lower cost, fewer turns).
It is COMPLETELY WRONG for implementation work. The whole point of this skill is
to remove the pressure that causes this behavior.

**Root cause:** The LLM's context is the plan + all prior work. That's pressure.

**Fix:** Fresh subagent per step. The orchestrator holds only the current step
+ compact result of the last step. Context stays lean regardless of step count.
No pressure → no temptation to shortcut.

**Cost reality:** Each subagent costs pennies (DeepSeek). Completing 20 steps
correctly costs ~$0.50. Getting 12 steps done with 3 skipped and 2 batched-badly
costs... nothing, because the work is wrong. Never optimize for token spend.

## When to Use

- Plan has 5+ steps or subtasks
- LLM is trying to batch, skip, or combine steps
- Complex task where each step requires focused attention
- User says "work through this step by step" or "don't batch"
- After /solve, /blueprint, or /interview produces a multi-step plan
- Any task where cutting corners would cause real problems

## When NOT to Use

- 1-3 trivial steps — just do them
- Single file, single change
- Tasks completable in <5 trivial actions

## Process

### Phase 0: Decompose

Read the plan or task list. Ensure each step is **atomic** — one concern,
completable by one subagent in a single session. If steps are too big, split.
If no plan exists, create one first (use /interview or /solve, then return).

Save to `.step-session/steps.json`:
```json
{
  "goal": "One-line goal",
  "cwd": "/absolute/path/to/project",
  "plan_source": "/absolute/path/to/plan.md",
  "plan_mtime": "2026-07-23T20:49:00+02:00",
  "steps": [
    {
      "id": "S01",
      "title": "Add user model",
      "description": "Create User struct with id, name, email fields...",
      "files": ["src/models/user.rs"],
      "deps": [],
      "status": "pending"
    }
  ]
}
```

Report step count to user. Proceed without asking unless steps > 20 or unclear.

### Phase 1: Execute — One Step at a Time

For each step in dependency order:

#### 1.1 Craft briefing

Write a self-contained briefing. Subagent has zero conversation context.
Include everything it needs:

- **Task**: exact step description from plan
- **Context**: what previous steps produced, what this depends on
- **Files**: exact paths to read before starting, paths it may modify
- **Expected output**: concrete testable criteria for "done"
- **Constraints**: patterns to follow, files NOT to touch

#### 1.2 Dispatch subagent

Route to the RIGHT agent for the step. Never default to `general-purpose`
without checking this table first. Wrong agent = wasted tokens + worse results.

**Agent routing table**:

| Step Category | subagent_type | model | Notes |
|---------------|---------------|-------|-------|
| Standard implementation step | `step-implementer` | sonnet | Shipped with this skill — reads, implements, tests, reports. Best for most steps. |
| Fix failed step (retry) | `step-fixer` | haiku | Shipped with this skill — minimal targeted repair. Root cause → fix → verify. |
| Fix build/compile/type errors | `build-error-resolver` | haiku | Built-in — fixes build errors only, minimal diffs. |
| Debug/investigate bug | `debug-investigator` | sonnet | Built-in — reproduces, isolates, diagnoses root cause. |
| Research/explore codebase | `Explore` | haiku | Built-in — read-only, returns conclusions not file dumps. |
| Locate code (read-only) | `caveman:cavecrew-investigator` | haiku | Built-in — returns file:line table, ~60% fewer tokens. |
| Single-file mechanical edit | `caveman:cavecrew-builder` | haiku | Built-in — 1-2 files max, refuses 3+ file scope. |
| Complex design/architecture | `general-purpose` | opus | Built-in — design decisions, architectural changes. |
| Code review of step output | `caveman:cavecrew-reviewer` | haiku | Built-in — severity-tagged findings, no praise. |
| Security-sensitive code | `security-scanner` | sonnet | Built-in — OWASP Top 10, secrets, injection vectors. |
| TDD: write failing test | `tdd-red-agent` | sonnet | Built-in — generates test candidates for Red phase. |
| TDD: make test pass | `tdd-green-implementation` | sonnet | Built-in — minimal implementation for Green phase. |
| Fallback (anything else) | `general-purpose` | sonnet | Built-in — catch-all when no specialist fits. |

**Agent namespacing**: Agents shipped with this skill (`step-implementer`, `step-fixer`)
are referenced by bare name — the plugin namespace (`dod-guard:`) is auto-prefixed by
Claude Code at install time. Built-in agents are referenced by their bare name as shown.

**How to choose**: Read the step description. Match against the "Step Category" column.
Use that agent. If nothing matches → fallback. "Standard implementation step" via
`step-implementer` is the most common — that's your default.

The briefing IS the subagent's entire prompt. Subagent implements, tests, verifies.

#### 1.3 Verify

Run verification before marking done. At minimum:
- Tests pass for affected code
- Build clean
- Output matches expected criteria from briefing

#### 1.4 Gate decision

- **PASS** → mark step `completed`, log one-line result, flush details
- **FAIL** → dispatch `step-fixer` with original briefing + failure output. Max 2 retries.
  If still failing after 2 → report BLOCKED to user
- **SKIP** → only with user approval. Mark `skipped` with reason

#### 1.5 Compact

Update progress. Strip subagent details from mental context. Keep only what the
NEXT step needs: "S03 depends on the User model from S01 (src/models/user.rs)."

### Phase 2: Integration Check

After ALL steps complete:
1. Run full test suite
2. Check for cross-step issues (imports, wiring, config)
3. Report summary: steps completed, files changed, any concerns
4. Present commit message (do NOT auto-commit)

### Phase 3: Adversarial Injection Point

When this skill is called as part of a larger adversarial workflow (via
`/dod-guard:adversarial-workflow`), Phase 3 of that workflow runs AFTER
the integration check here. The adversarial-workflow orchestrator dispatches
3 mandatory-finding review roles (Saboteur, New Hire, Spec Auditor) against
the implementation diff. Results are stored via `dod_adversarial_gate`.

This skill does NOT run adversarial review itself — it stays focused on
implementation. The orchestrator handles the gate. If a DoD has
`adversarial_gates` set, `dod_check` enforces gate progression automatically.

## Subagent Briefing Template

```
You are executing Task {id}: {title}

## What To Do
{exact step description — paste it, don't reference files}

## Context
- Overall goal: {goal}
- Previous step results (what you depend on): {compact summary of prior steps}
- Key files created/modified by prior steps: {file list with brief notes}

## Expected Output
{concrete, testable criteria for success}

## Files
- Read before starting: {must-read files}
- May modify: {allowed files}
- Do NOT touch: {files to leave alone}

## Steps
1. Read all files listed above
2. Implement EXACTLY what's specified — nothing more, nothing less
3. Write or update tests for your changes
4. Run tests, confirm they pass
5. Report compactly: what you changed, test results, any concerns

Work from: {cwd}

If anything is unclear — STOP and ask. Don't guess.
If you're stuck — report BLOCKED with specific details. Bad work is worse than no work.
If something needs to change outside your scope — note it, don't touch it.
```

## Rules (ABSOLUTE — no exceptions)

These exist because every LLM tries to "finish fast" when a task looks big. That
is EXACTLY the wrong instinct here. Read these before dispatching each step:

1. **ONE STEP PER SUBAGENT.** If you even THINK about doing two, stop. You have
   literally unlimited subagent dispatches. There is no rush.

2. **NEVER BATCH.** Two steps look related? Dispatch separately. "I'll combine
   steps 3 and 4" is the laziness instinct talking. One per dispatch. Always.

3. **NEVER SKIP.** Step seems optional? It's not. User can say skip. You can't.
   A step that exists in the plan exists for a reason.

4. **VERIFY EVERY STEP.** No "the subagent said it passes." Run the verification
   command. Subagents can be optimistic. You are the gate.

5. **DON'T FIX FAILURES INLINE.** Failed step → `step-fixer` agent with specific
   failure output. Fixing it yourself fills YOUR context with debugging — the exact
   thing we're avoiding with this skill.

6. **KEEP ORCHESTRATOR LEAN.** After step completes, flush its details. Hold only:
   what step is next, what prior steps produced that it needs. This is the core
   mechanism — your context stays small so you never feel pressure to batch.

7. **COMPLETE ALL STEPS.** 12 steps, context at 30%? Good. Keep going. 20 steps,
   context at 40%? Still fine. Each step is a fresh subagent — your context grows
   slowly. The skill exists precisely so you can do 20 steps without panicking.

8. **"TRIVIAL" IS A RED FLAG.** If you catch yourself thinking "this is trivial,
   I'll just do it and the next step too" — STOP. That's the laziness instinct.
   Trivial steps still get their own subagent.

9. **COST DOES NOT MATTER.** Subagents run on cheap models. Spending 20 subagent
   dispatches costs ~$0.50. Correct work is worth it.

## Anti-Patterns (watch for these in yourself)

| Temptation | Correct Response |
|------------|-----------------|
| "Steps 3-5 are related, I'll combine them" | NO. Three separate subagents. |
| "This is trivial, I'll do it inline" | NO. Dispatch it. Every time. "Trivial" is a red flag. |
| "I'll skip verification, subagent says it works" | NO. Run the verification command yourself. |
| "Let me fix this small thing instead of re-dispatching" | NO. Re-dispatch via `step-fixer`. Your context is precious. |
| "I'm at step 8 of 12, let me wrap up" | NO. Context at 50% is FINE. Keep going. |
| "The plan has too many steps, let me simplify" | Maybe valid. ASK USER first. Don't silently drop. |
| "This is getting long, I should check in with user" | NO. Complete ALL steps, then report. Only interrupt for blockers. |
| "I can do a batch of mechanical steps together" | NO. One per dispatch. Always. |

## Shipped Agents

This skill ships two specialized agents in `agents/`:

| Agent | File | Purpose |
|-------|------|---------|
| `step-implementer` | `agents/step-implementer.md` | Execute ONE atomic step — read, implement, test, verify, report. |
| `step-fixer` | `agents/step-fixer.md` | Fix a specific failure from a prior attempt — minimal targeted repair. |

These are referenced by bare name (`step-implementer`, `step-fixer`) — the plugin
namespace is auto-prefixed at install time.

## Model Selection

The `model` param on the Agent tool controls which LLM runs the subagent:

| Model | When |
|-------|------|
| `haiku` | Mechanical, read-only, 1-2 file edits, fix retries |
| `sonnet` | Multi-file implementation, judgment calls, standard work |
| `opus` | Complex design decisions, architectural changes |

**This is the `model` param, NOT `subagent_type`.** Never pass "sonnet" or "opus"
as `subagent_type` — those aren't agent types, they're model names.

## Session Files

`.step-session/` survives compaction for recovery:
```
.step-session/
├── steps.json     # Plan with per-step status
└── progress.log   # One line per step: ✓ S01 | ✗ S03 (retry 1/2) | ⊘ S05 (skipped)
```

### Staleness Detection (check BEFORE resuming)

On skill start, check for existing `.step-session/progress.log`. If found, run staleness
checks BEFORE resuming. Staleness is the norm — plans change between sessions, old plans
finish, context shifts. Resuming a stale plan silently is WORSE than starting fresh
(because you'll execute the wrong steps).

**Staleness checks (in order, first match wins):**

1. **ALL STEPS DONE** — if every step in `steps.json` has status `completed` or `skipped`:
   → STALE. Old plan finished. Overwrite with new plan. Log: "Previous plan complete — overwriting."

2. **GOAL MISMATCH** — if `steps.json` `goal` doesn't match the current plan being executed:
   → STALE. Different task. Overwrite with new plan. Log: "Goal mismatch — overwriting stale session."

3. **PLAN SOURCE CHANGED** — if `steps.json` has `plan_source` (path to the plan markdown file)
   and that file's mtime is newer than `plan_mtime` stored in steps.json:
   → STALE. Plan was updated after session started. Overwrite with new plan.
   Log: "Plan source modified — overwriting stale session."

4. **ALL CHECKS PASS** — session is fresh for this plan. Resume from first pending step.

**NEVER silently resume a stale session.** If you're unsure whether the session is stale,
it probably is. Ask: "Does this goal match what we're doing NOW?" If no → overwrite.

### steps.json Format (with staleness fields)

```json
{
  "goal": "One-line goal",
  "cwd": "/absolute/path/to/project",
  "plan_source": "/absolute/path/to/plan.md",
  "plan_mtime": "2026-07-23T20:49:00+02:00",
  "steps": [
    {
      "id": "S01",
      "title": "Add user model",
      "description": "Create User struct with id, name, email fields...",
      "files": ["src/models/user.rs"],
      "deps": [],
      "status": "pending"
    }
  ]
}
```

`plan_source` and `plan_mtime` are optional but recommended — they enable staleness check #3.
Always include them when the plan comes from a file on disk.

## Failure Recovery

- **Step fails verification** → dispatch `step-fixer` with original briefing + failure
  output (max 2 retries). Route build/type errors to `build-error-resolver` instead,
  logic bugs to `debug-investigator`.
- **Still failing after 2 retries** → report BLOCKED: step ID, what failed, what was tried
- **Context lost mid-execution** → read `.step-session/progress.log`, resume from first
  pending step
- **Plan needs change** → update steps.json, note in progress.log, continue
