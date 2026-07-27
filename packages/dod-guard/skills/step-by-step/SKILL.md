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

**Serial by design (do not "optimize" this):** Steps dispatch one at a time, in
dependency order, even when `deps` are disjoint. Concurrent dispatch would require
isolating each subagent's working tree, and **git worktrees are banned in this
project** — they strand work in broken states. Two subagents editing the same
checkout race on files and on the build. Wall-clock time is not the constraint here;
correctness is. Do not add parallel dispatch.

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

Write `.step-session/steps.json` — this is the canonical plan state, not a summary.
Write it BEFORE dispatching step 1, and rewrite it after every gate decision.

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
      "verify_surface": "code",
      "verify_cmd": "npm test -w packages/core",
      "manual_required": false,
      "status": "pending"
    }
  ]
}
```

Field notes:
- `plan_source` / `plan_mtime` — optional, but always set them when the plan came from
  a file on disk. They drive staleness check #3. Capture `plan_mtime` by stat-ing
  `plan_source` at decomposition time, not by guessing.
- `verify_cmd` — the exact command the orchestrator will run at gate time. Resolve it
  now, from this project's actual test/build setup. Not `npm test or equivalent`.
- `manual_required` — set `true` for any `visual` or `gameplay` step when this
  environment has no way to launch the app (no screenshot tooling, no headless
  browser, no game engine on PATH). Those steps get a human-confirmation gate
  instead of an automated one.
- `status` — one of `pending` | `completed` | `skipped` | `blocked`.

Each step gets a `verify_surface` tag set during decomposition. This is the single
verification table for this skill — Phase 1.3 gates against it, and it is pasted into
every briefing.

| verify_surface | Tag when the step is about | Verified by | NOT verified by |
|----------------|---------------------------|-------------|-----------------|
| `code` | calculate, parse, validate, transform, query, filter, sort, encode, serialize, route, endpoint | Tests pass + build clean | — |
| `visual` | render, display, show, UI, screen, color, layout, css, style, animation, mesh, texture, sprite, canvas | Baseline + app launched and output looked at, OR screenshot diff, OR `manual_required` human confirmation | ❌ build/tests passing |
| `gameplay` | physics, collision, movement, spawn, ai, enemy, player, level, balance, difficulty | Baseline + app launched and played, OR automated gameplay test, OR `manual_required` human confirmation | ❌ build/tests passing |
| `config` | config, env, settings, `.json`, `.yaml`, `.toml`, `.env`, dependency, package | Syntax valid + system/service actually starts | ❌ file written |
| `structural` | rename, move, extract, refactor, reorganize, split, merge files | Baseline + diff review, no unexpected files touched, imports consistent | ❌ no type errors alone |

**The one rule this table encodes:** a passing build proves the code compiled. It
proves nothing about what the code looks like or how it plays. `visual` and
`gameplay` steps are unverified until a human or a screenshot has seen the output.
Everything else in this skill about visual verification is a restatement of this.

**Lock-in gate.** Report to the user: step count, verify_surface breakdown, count of
`manual_required` steps, and the resolved `verify_cmd`s. Wait for confirmation before
dispatching step 1. This is the ONLY planned interruption — a decomposition mistake
costs every dispatch downstream, so it is worth one question. After confirmation,
run to completion and interrupt only for BLOCKED or AMBIGUOUS (Phase 1.4).

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
| Fix failed step (retry) | `step-fixer` | **same tier as the implementer that failed, or higher** | Shipped with this skill — minimal targeted repair. Root cause → fix → verify. Never downgrade: diagnosing a failure is harder than producing it, so a weaker model than the one that failed will not crack it. Build/type errors are the exception — route those to `build-error-resolver` on haiku. |
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

YOU run the verification, not the subagent. Run the step's `verify_cmd` yourself and
read the output. "The subagent said it passes" is not verification — subagents are
optimistic, and on a cheap model they are optimistic and wrong.

Baseline for every step: `verify_cmd` exits clean, build clean, output matches the
briefing's expected criteria. Then apply the step's `verify_surface` row from the
Phase 0 table — that table is the authority, don't re-derive it here.

For a `visual` or `gameplay` step, one of these must be true before you mark it done:
you launched the app and looked at the output, a screenshot diff passed, or the step
is `manual_required` and you are reporting it to the user as pending human
confirmation. Nothing else counts. A subagent claiming "the UI looks correct" is a
text model describing code it cannot see — discard that claim.

#### 1.4 Gate decision

Four outcomes. Every dispatch resolves to exactly one.

- **PASS** → mark `completed`, append to progress.log, flush details from context
- **AMBIGUOUS** → the subagent could not proceed because the spec is underdetermined.
  It reports the question plus the interpretations it weighed. Do NOT dispatch a
  fixer — a fixer cannot resolve a spec question either, and burns a dispatch
  proving it. Instead: resolve with the user via `AskUserQuestion`, using the
  subagent's candidate interpretations as the options. Rewrite the briefing with the
  answer stated as fact, re-dispatch the same step. Log:
  `? S0N — ambiguity resolved: <question> → <answer>`
- **FAIL** → dispatch `step-fixer` with original briefing + failure output.
  **Max 2 fixer attempts.**
- **SKIP** → only with user approval. Mark `skipped` with reason.

**Approach pivot (on repeated failure).** If a step fails twice on the SAME approach —
the fixer changed parameters, not strategy — the strategy is wrong and a third fixer
inherits the same wrong premise. Instead:

1. Re-read the original requirements for this step
2. Ask: "Is this step implementing the right thing, or a convenient adjacent thing?"
3. If wrong problem → re-spec the step with corrected requirements
4. If right problem, wrong approach → dispatch `step-implementer` (NOT `step-fixer`)
   with an explicit instruction to use a different architectural approach, and name
   the approach that already failed so it isn't retried
5. Log: `⟳ S0N — approach pivot: <old approach> → <new approach>`

**Total budget per step: 2 fixer attempts, then 1 pivot, then BLOCKED.** The pivot
gets its own 2 fixer attempts. After the pivot's budget is spent, stop — do not pivot
twice. Report BLOCKED to the user with: step ID, both approaches tried, what failed
each time. Two failed approaches means the plan is wrong, not the implementation, and
that is the user's call to make.

This budget exists because 8 of 10 confirmed breakdown events were the model iterating
on one wrong approach (build verification for visual changes, material properties
instead of viewport rendering, single-corridor layout).

#### 1.5 Compact

Rewrite `.step-session/steps.json` with the step's new `status`, and append one line
to `.step-session/progress.log`. Do this on EVERY gate decision, before dispatching
the next step — that is what makes recovery-after-compaction work. A session file
written only at the end is a session file that never survives the crash it exists for.

Then strip subagent details from your context. Keep only what the NEXT step needs:
"S03 depends on the User model from S01 (src/models/user.rs)."

### Phase 2: Integration Check

After ALL steps complete:
1. Run full test suite
2. Check for cross-step issues (imports, wiring, config)
3. Report summary: steps completed, files changed, any concerns
4. Present commit message (do NOT auto-commit)

### Phase 3: Adversarial Injection Point

This skill does NOT run adversarial review — it stays focused on implementation.
When invoked from `/dod-guard:adversarial-workflow`, that orchestrator takes over
after the integration check above and handles its own gates.

## Subagent Briefing Template

Fill every field. The subagent has zero conversation context — anything you leave as
a reference instead of a value is something it will guess at.

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

## Verification
- verify_surface: {code | visual | gameplay | config | structural}
- What that requires of you: {paste the matching row from the verify_surface table}
- Run this exact command: {verify_cmd}

## Files
- Read before starting: {must-read files}
- May modify: {allowed files}
- Do NOT touch: {files to leave alone}

## Steps
1. Read all files listed above
2. Implement EXACTLY what's specified — nothing more, nothing less
3. Write or update tests for your changes
4. Run {verify_cmd}, confirm it passes
5. Report in the format below

## Report Format
Reply with exactly one of these, nothing else:

  ## Step {id}: {title} — DONE
  ### Changes
  - `path` — what changed (1-2 lines each)
  ### Verification
  - command run, result, N passing / 0 failing
  - for visual/gameplay: state plainly whether you could actually see the output
  ### Concerns
  (none, or brief unscoped observations)

  ## Step {id}: {title} — AMBIGUOUS
  ### Question
  {the single thing that is underdetermined}
  ### Interpretations Considered
  1. {option} — implies {consequence}
  2. {option} — implies {consequence}
  ### What I Did
  Nothing. No files changed.

  ## Step {id}: {title} — BLOCKED
  ### Failure
  {what's failing, with the decisive error line}
  ### Diagnosis
  {what you determined}
  ### Why Blocked
  {why it can't be resolved within this step's scope}

Work from: {cwd}

## Hard Constraints
- You have NO channel to the user. Do not call AskUserQuestion — nobody is listening,
  and a question you ask is a question that never gets answered.
- If requirements are unclear: do NOT ask, do NOT guess, do NOT pick the convenient
  reading and proceed. Stop, change nothing, and return AMBIGUOUS with the specific
  question and the interpretations you weighed. The orchestrator resolves it with the
  user and re-dispatches you with the answer. Returning AMBIGUOUS is a success, not a
  failure — it costs one cheap dispatch, guessing costs the whole step plus the
  cleanup.
- If you're stuck on execution rather than spec: return BLOCKED with specifics.
  Bad work is worse than no work.
- Do NOT run `git commit`, `git push`, `git checkout`, `git reset`, or any other
  history- or branch-mutating git command. Read-only git (`status`, `diff`, `log`)
  is fine. The orchestrator commits, once, at the end.
- If something needs to change outside your scope — note it in Concerns, don't touch it.
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
   command. Subagents can be optimistic. You are the gate. Match the verification to
   the step's `verify_surface` — a `visual` step signed off on a passing build is
   unverified, and that single mistake accounts for 80% of dod-guard breakdown
   events (code change → build → "done" → user launches → still broken).

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

10. **SAME APPROACH, SAME FAILURE.** If step-fixer applies the same strategy with
    different parameters and fails, the strategy is wrong — not the parameters.
    Rewind to requirements, pivot once, then BLOCKED. Never a third fixer on the
    same premise.

11. **AMBIGUITY IS YOURS TO RESOLVE, NOT THE SUBAGENT'S.** Subagents have no channel
    to the user. When one returns AMBIGUOUS, you ask via `AskUserQuestion` — that is
    what the interrupt budget is for. Never answer a spec question on the subagent's
    behalf by picking whichever reading lets you keep moving.

12. **SERIAL, ALWAYS.** One step at a time, in dependency order, no concurrent
    dispatch. Not negotiable, and not a performance bug to be fixed later — see
    "Serial by design" above.

## Anti-Patterns (watch for these in yourself)

| Temptation | Correct Response |
|------------|-----------------|
| "Steps 3-5 are related, I'll combine them" | NO. Three separate subagents. |
| "This is trivial, I'll do it inline" | NO. Dispatch it. Every time. "Trivial" is a red flag. |
| "I'll skip verification, subagent says it works" | NO. Run the verification command yourself. |
| "Let me fix this small thing instead of re-dispatching" | NO. Re-dispatch via `step-fixer`. Your context is precious. |
| "I'm at step 8 of 12, let me wrap up" | NO. Context at 50% is FINE. Keep going. |
| "The plan has too many steps, let me simplify" | Maybe valid. ASK USER first. Don't silently drop. |
| "This is getting long, I should check in with user" | NO. One lock-in gate at Phase 0, then run to completion. Interrupt only for BLOCKED or AMBIGUOUS. |
| "I can do a batch of mechanical steps together" | NO. One per dispatch. Always. |
| "Build passes, visual change is verified" | NO. Build ≠ visual verification. Launch the app or mark it pending human check. |
| "The subagent says it looks right" | NO. Subagents cannot see. They report code output, not visual output. |
| "I changed the approach slightly, same strategy" | NO. If the same strategy failed twice, the strategy is wrong. Pivot once, then BLOCKED. |
| "I'll verify the visual output on the next step" | NO. Verify THIS step before moving on. Deferred verification = forgotten verification. |
| "Subagent flagged ambiguity, I'll pick the sensible reading" | NO. That's the guess the AMBIGUOUS path exists to prevent. Ask the user. |
| "Subagent returned AMBIGUOUS, I'll send a fixer at it" | NO. A fixer can't answer a spec question either. Resolve with the user, then re-dispatch. |
| "These two steps don't touch the same files, I'll run them in parallel" | NO. Serial by design. No worktrees, no concurrent dispatch. |
| "I'll write the session files at the end" | NO. Write on every gate decision. Files written at the end don't survive the crash they exist for. |

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
| `haiku` | Mechanical, read-only, 1-2 file edits, build/type-error retries |
| `sonnet` | Multi-file implementation, judgment calls, standard work |
| `opus` | Complex design decisions, architectural changes |

**This is the `model` param, NOT `subagent_type`.** Never pass "sonnet" or "opus"
as `subagent_type` — those aren't agent types, they're model names.

**Never downgrade a retry.** A `step-fixer` dispatched against a failure must run at
the same tier as the implementer that produced it, or higher. Diagnosis is harder
than production. The one exception is a pure build/type error routed to
`build-error-resolver`, where the fix is mechanical.

## Session Files

`.step-session/` survives compaction for recovery:
```
.step-session/
├── steps.json     # Plan with per-step status — schema in Phase 0
└── progress.log   # One line per gate decision (see below)
```

Write both on EVERY gate decision, not at the end. `progress.log` line formats:

```
✓ S01 — completed
✗ S03 — fixer 1/2: <one-line failure>
? S04 — ambiguity resolved: <question> → <answer>
⟳ S05 — approach pivot: <old approach> → <new approach>
⊘ S07 — skipped (user approved): <reason>
⛔ S09 — BLOCKED after pivot: <what failed both times>
👁 S11 — completed, PENDING HUMAN VISUAL CONFIRMATION
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

## Failure Recovery

- **Step fails verification** → dispatch `step-fixer` with original briefing + failure
  output (max 2 attempts). Route build/type errors to `build-error-resolver` instead,
  logic bugs to `debug-investigator`.
- **Still failing after 2 attempts** → approach pivot: re-spec and dispatch
  `step-implementer` with a different approach, naming the one that failed. The pivot
  gets its own 2 fixer attempts.
- **Pivot also exhausted** → report BLOCKED: step ID, both approaches tried, what
  failed each time. Do not pivot twice — two dead approaches means the plan is wrong,
  and that's the user's call.
- **Subagent returns AMBIGUOUS** → resolve with the user via `AskUserQuestion`, rewrite
  the briefing with the answer as fact, re-dispatch. Does not consume fixer budget.
- **Context lost mid-execution** → read `.step-session/progress.log`, resume from first
  pending step (after running staleness checks above)
- **Plan needs change** → update steps.json, note in progress.log, continue
