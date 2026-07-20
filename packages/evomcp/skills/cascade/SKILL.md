---
name: cascade-solver
description: >
  Cheap-model fanout with verified selection, escalating stuck sub-problems up a
  ladder that ends at the user. Use this skill whenever the user wants to dispatch
  implementation work to evomcp, says "cascade this", "solve this with evomcp",
  "fan this out", or hands over any feature/bugfix/optimization task with (or that
  could have) a machine-checkable acceptance test — especially tasks that would
  otherwise burn >50K host-model tokens. Also use it when reviewing or triaging an
  evomcp escalation report.
---

# Cascade Solver: Cheap Fanout → Escalate Stuck Nodes

Spend cheap worker tokens on breadth, reserving the host model — and above it,
the **user** — for the ~5% of sub-problems the search can't crack.

## Why This Exists

The core economic insight from [EvoMCP.md](../../docs/EvoMCP.md):

> The cheap workers do the fanout, and "same failing assertion after 3 lineages"
> is the trigger to spend smart tokens on exactly that node. Most of the cost
> lives in the easy 90%; most of the failure lives in the hard 10%.

A single host-model trajectory costs ~100K tokens. 20 worker attempts with repair
chains cost less. **Cheap breadth beats expensive depth** when you have a verifier.

But this only works if:
1. The verify command is correct and specific — bad verify = garbage candidates selected
2. Diversity is enforced at plan level — blind temperature resampling gives 20 copies of the same bug
3. Escalation routes each stuck node to the *right* tier — and the top tier is the user, not a bigger model
4. The task is decomposed to the right size — too big and 20 attempts won't hit; too small and overhead dominates

**Cost reality**: 20 worker attempts ≈ $0.50. 1 host-model attempt ≈ $1–3.
1 user interruption ≈ minutes of human attention — the scarcest resource in the
system. The ladder exists to protect each tier from work the tier below could do.

## The Worker Backend (deliberately opaque)

This skill does NOT know or care how evomcp runs its workers. The worker model,
subprocess mechanism, proxy, and API routing are **evomcp deployment config**,
not skill concerns. Never reference the backend model by name in specs, prompts,
or user-facing reports — say "worker" and "lineage."

Consequences:
- Swapping the worker backend must require zero changes to this skill.
- If workers produce no output, that is a **backend health problem**: report
  `evomcp status` output to the user and stop. Do not debug the backend from here.
- Never tune specs to a specific worker model's quirks. Tune them to be
  *worker-agnostic*: tight verify, small scope, explicit context.

## The Escalation Ladder

Every stuck node climbs this ladder. Each rung has a trigger and a budget.

```
Rung 0  Worker repair loop        (inside evomcp: 3 repairs, lineage kill on repeat signature)
Rung 1  Worker resample           (inside evomcp: fresh lineages, deduped plans)
Rung 2  Host model                (this session: solve ONLY the stuck node)
Rung 3  User                      (AskUserQuestion: decision, not delegation)
```

**The critical distinction — capability vs. authority:**

- A **capability gap** means the problem is well-specified but too hard for the
  current tier. Capability gaps climb rungs in order: worker → host model.
  Never skip to the user for a capability gap the host model hasn't attempted.
- An **authority gap** means no model at any tier is *entitled* to decide:
  ambiguous intent, conflicting requirements, scope tradeoffs, "which behavior
  is the correct one," acceptable-cost judgments, deleting user code. Authority
  gaps go **directly to Rung 3**, from any rung, immediately. Burning host-model
  tokens "solving" an authority gap produces confident garbage.

Before escalating anything, classify it. The single most common cascade failure
is misrouting: treating an ambiguous spec (authority) as a hard problem
(capability), then watching every tier fail on it in sequence.

## When to Use

- Feature implementation with clear acceptance criteria
- Bug fix with reproducible test case
- Multi-file changes where approach isn't obvious (let fanout explore)
- Optimization tasks with numeric fitness metric (use evolve)
- Any task where you'd normally spend >50K host-model tokens implementing
- User says "solve this with evomcp" or "cascade this"

## When NOT to Use

- Trivial single-function changes (just write it — overhead > benefit)
- Tasks with no verification command possible (can't write verify_cmd → can't use evomcp)
- Architecture/design decisions (no execution oracle exists — these are authority
  questions; take them to the user, not to fanout)
- Tasks requiring deep domain knowledge cheap workers won't have
- First-time setup of a new project (no existing test/lint/build harness)

## Pre-Flight Check

Before dispatching ANYTHING:

1. **Backend alive**: `evomcp status` → RUNNING, credentials SET. If not, report and stop.
2. **Verification exists and discriminates**: Run verify_cmd on a deliberately
   broken change (must fail) AND on the current state (output must be usable).
   If it passes broken code, your verify_cmd is broken.
3. **Task is decomposed**: One solve call targets ONE concern. Three independent
   parts = three solve calls.
4. **Spec is unambiguous**: Run the ambiguity check below. If it trips, that's
   an authority gap — resolve it with the user BEFORE spending any fanout budget.

## User Decision Points (AskUserQuestion Protocol)

The user is Rung 3: the intent authority and the smartest tier. Interruptions are
expensive, so every question must be one only the user can answer, asked once,
with the evidence attached.

**Mandatory decision points** (always ask, never guess):

| # | Trigger | Question shape |
|---|---------|----------------|
| U1 | Phase 1 ambiguity check trips: the goal admits ≥2 materially different verify_cmds, or acceptance behavior is underdetermined | "This task can mean A or B — which behavior is correct?" Options: the concrete interpretations, each with its verify implication |
| U2 | Winning patch contains a suspected degenerate pattern OR touches files outside allowed_files | "Candidate passes but did X — accept, reject, or re-run with hardened verify?" Include the specific diff hunks |
| U3 | Escalation diagnosis is ambiguous between bad-verify and genuine-hard | Present failure signature + best partial; options: "fix verify as proposed / treat as hard, host model solves / you'll handle it" |
| U4 | Host model (Rung 2) about to exceed ~50K tokens on one stuck node | "This node is expensive. Continue / re-decompose as proposed / take over?" |
| U5 | Third escalation on same task (hard stop) | Structured report + options: "human decomposition / rewrite verify together / abandon" |
| U6 | Any action that deletes user-written code, changes public interfaces, or alters behavior beyond the stated goal | Explicit confirmation with the diff |

**Question construction rules:**

1. **2–4 concrete options, each with its consequence.** Never open-ended "what
   should I do?" — the user is deciding, not brainstorming for you.
2. **Mark a recommended default** and say why in one sentence.
3. **Attach the evidence pack**: failure signature, best-partial summary (≤10
   lines), tokens/lineages burned. The user must be able to decide from the
   question alone without excavating logs.
4. **Batch.** If U1 surfaces three ambiguities, that's ONE interaction with three
   questions, not three interruptions.
5. **One-shot resolution.** Record the answer in `.cascade-session/decisions.json`
   and never re-ask a resolved question in this task.

**Never ask the user:**
- Anything an oracle can answer (does it compile, do tests pass, is it flaky) —
  run the command instead.
- To review raw candidates or choose among N patches — selection is the
  verifier's job; the user sees at most one winner plus a flag.
- Capability questions the host model hasn't attempted yet (Rung 2 exists).
- Anything already answered in `decisions.json`.

**Fallback**: if no AskUserQuestion-style tool is available (non-interactive
run), do not improvise: stop at the decision point, write the question + options
+ evidence pack to `.cascade-session/pending-decision.json`, surface it in the
  final report, and leave the task in a resumable state.

## Process

### Phase 1: Write the Spec (host model + spec-writer agent)

This is the HIGHEST-LEVERAGE step. Bad spec = wasted fanout budget.

**Ambiguity check (before writing the spec):** ask yourself — could two
reasonable engineers write different verify_cmds for this goal? Are there
unstated tradeoffs (perf vs. readability, strictness vs. compatibility)? Does
"fix" have more than one candidate meaning? If yes → **U1, now**, before any
tokens burn. The answers become part of the spec's `context`.

**The spec-writer agent** produces:

```typescript
{
  goal: string,              // Precise one-sentence description of what to build/fix
  verify_cmd: string,        // Shell command: exit 0 = pass, non-zero = fail
  build_cmd?: string,        // Optional: build gate before verify
  test_cmd?: string,         // Optional: test gate before verify
  lint_cmd?: string,         // Optional: lint gate before verify
  budget_tokens?: number,    // Default ~100K worker tokens, increase for complex tasks
  fanout?: number,           // Default 5, increase for harder problems (max 16)
  allowed_files?: string[],  // Constrain search space — smaller = better results
  context?: string,          // Key interfaces, constraints, patterns, U1 decisions
  held_out_tests?: string,   // Tests hidden from workers (Goodhart defense)
}
```

**verify_cmd rules** (CRITICAL — the whole strategy depends on this):

1. **Use dod-guard DoDs as verify_cmd when possible.** A DoD with
   lint+format+build+test+mutation gates is a pre-built multi-layer oracle:
   ```
   dod_check --dod-id=abc123 --nodePath=0.children.2
   ```
2. **Be specific.** `npm test` runs 500 tests and drowns the feedback compiler.
   `npm test -- --testNamePattern="auth login"` runs 5 and gives precise signal.
3. **Test the verify command** on a deliberately wrong change AND the current
   state. 500 lines of stack trace = useless repair loop.
4. **Prefer exit-code predicates.** If your framework exits 0 on failure, wrap it:
   ```
   npm test -- --testNamePattern="auth" --reporter=json 2>&1 | node -e "process.exit(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).numFailedTests > 0 ? 1 : 0)"
   ```

**fanout sizing**: bug fix 3 · clear-spec feature 5 · open-ended optimization
7–10 · hard many-approach problem 12 (still cheaper than one host attempt).

**budget_tokens**: default ~100K worker tokens · complex multi-file 200–300K ·
full module 500K. Worker burn is cheap — don't under-budget.

### Phase 2: Dispatch to evomcp

Single MCP call. The host model goes quiet. All token burning happens inside
evomcp, invisible to this context — that's the point of the MCP boundary.

**Binary fitness (feature/bug)** — `solve`:
```
evomcp solve spec={goal, verify_cmd, ...}
```
**Scalar fitness (optimization)** — `evolve`:
```
evomcp evolve spec={goal, fitness_cmd, target_files, generations, population_size}
```

What happens inside (all backend-internal):
1. N diverse plans sampled, deduped by token overlap
2. Each plan implemented by an isolated worker with tools
3. Each candidate verified against verify_cmd
4. Failures get up to 3 repair attempts with structured feedback
5. Stuck lineages killed (same failure signature 2+ consecutive)
6. Multi-candidate judge scores survivors on correctness/clarity/efficiency/maintainability
7. Winner returned OR escalation report

The host context never sees 19 failed candidates — only the winning patch +
report. That's the context-economy argument for MCP co-location (EvoMCP.md §MCP).

### Phase 3: Review the Result

**If PASS** — evomcp returned a winning patch:

1. Read the patch. Check for: actually solves the problem (read the verification
   report), degenerate patterns (hardcoded outputs, deleted assertions, swallowed
   errors), allowed_files respected, no scope creep.
2. Re-run verify_cmd yourself. Workers can be optimistic; you are the gate.
3. Degenerate pattern or scope violation found → **U2**. Do not silently accept
   OR silently discard — a passing-but-suspicious patch is the user's call.
4. Clean → apply (`git apply < patch.diff`), run held-out tests (the Goodhart
   defense — if these fail, the candidate cheated: reject, harden verify, re-run).
5. Mark complete. Log to gitevo memory bus if used:
   ```
   evo_learn "ELITE_SOLUTION: {task} solved with strategy {strategy}"
   ```

**If ESCALATED** → Phase 4.

### Phase 4: Handle Escalation

Escalation is NOT failure. It is the system correctly identifying that this node
is in the hard 10%. The cascade strategy PREDICTS this.

The escalation report contains: common failure signature, best partial attempt,
per-lineage diagnostics, lineages/tokens consumed.

**The escalation-handler agent** runs this routing:

1. **Classify first**: capability gap or authority gap?
   - Authority (the failure traces to spec ambiguity, conflicting requirements,
     or an unstated tradeoff) → **U1/U3 immediately**. Do not attempt Rung 2.
   - Capability → continue.
2. **Bad verify or genuine hard?**
   - Bad verify (flaky, too noisy, checks the wrong thing): fix verify_cmd,
     re-invoke. Flaky tests get fixed BEFORE retry — flaky verify poisons repair
     loops because workers can't distinguish "I broke it" from "it was broken."
   - Ambiguous between the two → **U3** with evidence pack.
   - Genuine hard → Rung 2: the host model solves ONLY the stuck node. Read the
     best partial (often 80% correct), identify the specific blocking assertion,
     fix exactly that, then re-invoke solve with the partial as context.
3. **Decision tree**:
   ```
   All lineages stuck on same assertion?
   ├── YES → Verify is trustworthy. Capability gap on THIS assertion.
   │         Rung 2 solves this assertion only, then re-invoke with partial as context.
   └── NO (diverse failures) → Verify too broad or task too large.
        Decompose further, narrower verify_cmd per sub-task.
        Decomposition changes scope/interfaces? → that's authority → U1.
   ```
4. **Rung 2 budget**: approaching ~50K host tokens on one node → **U4**. Do not
   silently keep digging.
5. **Hard stop**: third escalation on the same task → **U5**, mandatory. No
   fourth self-directed attempt exists.

### Phase 5: Gating

After patch applied:
1. Full test suite passes (not just the targeted tests)
2. dod-guard full check passes (if a DoD subtree was the verify_cmd)
3. gitevo checkpoint: `evo_checkpoint "evomcp-solve-{task}"`
4. Commit with evidence: verification report snippet + any decision IDs from
   `decisions.json` that shaped the spec

## Tier Routing Table

Tiers are roles, not model names — model assignment per tier is deployment config.

| Phase | Agent / Tier | Tier | Purpose |
|-------|--------------|------|---------|
| 1. Write Spec | `spec-writer` | host | Tight spec + verify_cmd. Highest-leverage step. |
| 1. Ambiguity resolution | (user, U1) | user | Pin intent before tokens burn |
| 2. Dispatch | (direct MCP call) | worker | `evomcp solve` / `evomcp evolve` |
| 3. Review Winner | `patch-reviewer` | host-light | Diff review + degenerate check + re-verify |
| 3. Suspicious winner | (user, U2) | user | Accept/reject/harden call on passing-but-odd patches |
| 4. Escalation triage | `escalation-handler` | host | Classify authority-vs-capability, fix verify or solve stuck node |
| 4. Ambiguous diagnosis / budget / 3rd strike | (user, U3–U5) | user | Decisions only the intent authority can make |

`host-light` = the cheapest model tier that can pattern-match diffs; `host` = the
model running this skill. Configure actual model IDs in deployment, not here.

## Shipped Agents

| Agent | File | Purpose |
|-------|------|---------|
| `spec-writer` | `agents/spec-writer.md` | Precise evomcp specs: goal, verify_cmd, gates, budget, fanout; runs the ambiguity check |
| `patch-reviewer` | `agents/patch-reviewer.md` | Review solve output: correctness, degenerate patterns, scope creep; flags U2 |
| `escalation-handler` | `agents/escalation-handler.md` | Authority/capability classification, verify diagnosis, stuck-node solving; flags U3–U5 |

Referenced by bare name — the plugin namespace is auto-prefixed at install time.

## Integration Points

### dod-guard
DoDs are the PREFERRED verify_cmd — multi-layer oracle for free, structured
diagnostics per gate layer. Scope with `--nodePath` to the relevant subtree;
full DoDs are too slow for repair loops.

### gitevo
```
evo_checkpoint "pre-solve-{task}"     # before dispatch — always
evo_checkpoint "post-solve-{task}"    # after success
evo_learn "ELITE_SOLUTION: {task} — strategy: {strategy}, tokens: {N}"
evo_learn "FAILURE_SIGNATURE: {task} — {signature}, attempted: {N} lineages"
evo_learn "USER_DECISION: {task} — {question} → {answer}"   # U-point outcomes
```
Persisting U-point outcomes matters: recurring user decisions are spec-template
bugs. If users keep answering the same U1, encode the answer into the playbook.

### obsidian-rag
```
memory_save(id: "evomcp-pattern-{slug}", content: "Task pattern + what worked")
```

### code-review-graph
```
get_impact_radius(changed_files: [...])
```
Feeds allowed_files in the spec; also attach it to U6 evidence packs.

## Rules (ABSOLUTE — no exceptions)

1. **VERIFY COMMAND MUST BE CORRECT.** Test on a deliberately broken change and
   on current state. #1 failure mode of the entire strategy.
2. **SCOPE THE VERIFY.** 500 tests = noise, 5 tests = signal.
3. **ONE CONCERN PER SOLVE CALL.** Decompose first.
4. **REVIEW BEFORE APPLYING.** Re-run verify yourself, read the diff, check for
   degenerate patterns. Cheap models cheat unintentionally.
5. **CLASSIFY BEFORE ESCALATING.** Authority gaps go to the user immediately from
   any rung. Capability gaps climb rungs in order. Misrouting wastes the most
   expensive tokens in the system.
6. **NEVER GUESS ON AUTHORITY QUESTIONS.** Ambiguous intent, scope tradeoffs,
   behavior selection, deleting user code → AskUserQuestion, always.
7. **NEVER ASK THE USER WHAT AN ORACLE CAN ANSWER.** Run the command.
8. **NEVER IGNORE ESCALATION.** Same spec + retry = same result. Diagnose first.
9. **DON'T INFINITE-LOOP.** Max 2 re-invocations after escalation; third → U5
   hard stop.
10. **BUDGET IS CHEAP AT RUNG 0–1, EXPENSIVE AT RUNG 2, PRECIOUS AT RUNG 3.**
    Don't under-budget workers; don't over-spend host; batch user questions.
11. **CHECKPOINT BEFORE SOLVING.** One command. Zero cost. Infinite regret
    prevention.
12. **BACKEND IS OPAQUE.** Never name, tune for, or debug the worker backend
    from this skill. Backend problems → report status, stop.

## Anti-Patterns

| Temptation | Correct Response |
|------------|------------------|
| "I'll write the verify_cmd quickly and iterate" | NO. Bad verify = wasted fanout. |
| "npm test is good enough" | NO. Scope to relevant tests. |
| "The goal is a bit ambiguous but I'll pick the sensible reading" | NO. That's an authority gap → U1. Your "sensible" reading fails silently 20 times. |
| "Escalation means evomcp failed, I'll just do it myself" | Classify first. It may be a 2-line verify fix — or an authority gap the user must resolve. |
| "I'll ask the user which of these 5 candidates looks best" | NO. Selection is the verifier's job. The user sees one winner + flags. |
| "This is taking a while, I'll quietly keep grinding at Rung 2" | NO. ~50K tokens → U4. The user decides where their money goes. |
| "Combine 3 tasks into one solve call" | One concern per solve. |
| "Patch passes, skip review" | Review every patch. Passing-but-suspicious → U2. |
| "20 lineages failed, evomcp is useless" | It correctly identified a HARD node. That's the signal the cascade exists to produce. |
| "Increase fanout to 30" | Diminishing returns after ~16; deduped plans converge. |
| "Skip the checkpoint" | One command. Zero cost. |

## Session Files

`.cascade-session/` survives compaction:
```
.cascade-session/
├── spec.json              # Last task spec + verify_cmd
├── result.json            # Last solve result summary
├── escalation.json        # Escalation history (if any)
├── decisions.json         # U-point questions asked + user answers (never re-ask)
└── pending-decision.json  # Unanswered decision point (non-interactive fallback)
```

On skill start: check `.cascade-session/`. `pending-decision.json` present →
resume by asking that question first. `spec.json` present → re-invocation after
escalation → load prior context and `decisions.json`.

## Failure Recovery

- **Backend down / no worker output** → `evomcp status`, report to user, stop.
  Backend health is not this skill's job.
- **All lineages timed out** → Task too complex or budget too low. Decompose or
  raise budget.
- **Escalation after 2 re-invocations** → U5: structured report (what failed,
  what was tried, what the signature suggests) + decomposition options.
- **Verify flaky** → Fix flakiness BEFORE retrying. Flaky verify poisons repair.
- **User unavailable at a decision point** → write pending-decision.json, leave
  resumable, summarize in final message. Never substitute your own answer.

## Quick Reference

```bash
# Pre-flight
evomcp status

# Solve (binary fitness — feature/bug)
evomcp solve '{"spec": {"goal": "...", "verify_cmd": "...", "cwd": "..."}}'

# Evolve (scalar fitness — optimization)
evomcp evolve '{"spec": {"goal": "...", "fitness_cmd": "...", "cwd": "...", "target_files": ["..."], "generations": 5, "population_size": 6}}'

# After solve
evo_checkpoint "post-solve-{task}"
evo_learn "ELITE_SOLUTION: ..."
```