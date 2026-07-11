---
name: ratchet
description: >
  Unified ratcheting workflow that combines dod-guard (verification gates), gitevo (evolutionary branching),
  evomcp (cascade solver), obsidian-rag (learning persistence), and code-review-graph (impact analysis)
  to reliably solve complex multi-sub-problems. Two-phase: interactive setup (triage + requirements + DoD + user lock-in),
  then autonomous /loop execution (one sub-problem per iteration, ratchet gates every cycle).
  Use when facing non-trivial problems with unknown unknowns, multiple interdependent sub-problems,
  or when a single-shot approach would waste tokens on wrong approaches.
  Trigger: "solve with ratchet", "ratchet this", "complex problem", "multi-step solution", "ratcheting workflow".
---

# Ratchet — Unified Ratcheting Workflow

## Overview

Two-phase workflow for complex multi-sub-problem work. A ratchet only moves forward — each iteration must pass ALL previous verification gates plus any new ones. dod-guard enforces this; the other tools accelerate exploration, capture learning, and minimize token spend.

**Phase A (Setup — this session, interactive):** Triage → research → requirements via AskUserQuestion → DoD tree → contrarian review → baseline check → gitevo init → **user lock-in gate**. You do not write a single line of implementation code in Phase A.

**Phase B (Execution — /loop dynamic, autonomous):** User runs `/loop` to enter dynamic mode. The agent then self-paces via `ScheduleWakeup`, processing one sub-problem per iteration. Each iteration: refine drafts → implement → scoped dod_check → full regression check → learn → checkpoint → schedule next wakeup. Loop terminates via `ScheduleWakeup(stop=true)` when dod_check returns PASS, or when escalated for manual intervention.

**Announce at start:** "Using the ratchet workflow — Phase A: requirements gathering + DoD creation (no code yet). Phase B: autonomous /loop execution with ratchet gates every cycle."

### How /loop Actually Works

Critical mechanics — the skill's Phase B design depends on these:

- **Context accumulates across iterations.** `/loop` runs in the current conversation — each iteration sees the full history of every previous iteration. Context is NOT fresh per cycle. This is beneficial for ratchet: the agent remembers which sub-problems are done, what approaches were tried, and what lessons were learned. But it means the prompt stays lean (one sub-problem at a time) to avoid context bloat.
- **Iterations never overlap.** If Claude is mid-response when a scheduled wakeup fires, the prompt waits until the current turn completes. No concurrent execution, no catch-up for missed intervals. A sub-problem that takes 12 minutes delays the next iteration — it doesn't queue backlogged fires.
- **Self-paced loops (/loop dynamic):** The agent controls pacing via `ScheduleWakeup`. To end the loop, call `ScheduleWakeup(stop=true)`. If an iteration ends without calling ScheduleWakeup at all, a ~20-minute fallback fires once, then the loop dies. We use explicit `stop=true` for clean termination — never rely on the fallback.
- **ScheduleWakeup delays are real, not nominal.** `delaySeconds: 60` means the next iteration fires ~60 seconds after the current turn ends. There's no jitter on self-paced wakeups (jitter only applies to fixed-interval CronCreate loops). Pick delays that match what you're waiting for: 60-120s when actively working through sub-problems, 300s+ when waiting on external state (CI, user input).
- **Fixed-interval loops (/loop 5m):** These are cron-backed and CAN be killed by the agent via `CronDelete`. But they have deterministic jitter (up to half the interval for sub-hourly) and auto-expire after 7 days. We don't use this mode — ratchet uses self-paced dynamic exclusively.

## When to Use vs Not Use

### Use ratchet when:

- Problem has 2+ sub-problems with dependencies between them
- Unknown unknowns — you'd burn tokens guessing at the solution
- Regression risk is real — later changes could break earlier work
- Worth the setup cost (10-15 min) for cheaper, safer execution
- Cross-session memory would help future similar problems

### Skip ratchet when:

- Single straightforward change (one file, one function)
- Already have a complete DoD from /interview — just use /goal
- Trivial config change, typo fix, or mechanical rename
- You're in a hurry and accept the regression risk

**If unsure, use the triage gate (A.1).** It costs 2-3 questions and tells you whether to proceed or downgrade.

## The Five Tools

| Tool | Role in Ratchet |
|------|-----------------|
| **dod-guard** | The ratchet teeth. DoD proofs that ALL must pass. Cryptographic fingerprinting prevents tampering. |
| **gitevo** | Evolutionary branching. Spawn per-sub-problem, capture learnings, abandon dead ends, adopt winners. |
| **evomcp** | Cascade solver. Cheap model (DeepSeek) fanout → verify → repair → escalate only stuck nodes to Claude. |
| **obsidian-rag** | Cross-session memory. Persist learnings, recall past approaches, avoid repeating mistakes. |
| **code-review-graph** | Impact analysis. Understand blast radius before changes, verify no surprising coupling after. |

## Core Principle: The Ratchet

```
Ratchet tooth = dod-guard concrete proof node.
dod_check verifies ALL teeth every run.
Passing tooth stays passed (fingerprint detects tampering).
New teeth can only be ADDED — never removed without audit trail (dod_amend).
```

A problem is "solved" when `dod_check` (no nodePath) returns `PASS` with zero draft nodes.

---

# Phase A: Setup & Lock-In (Interactive)

**Iron rule: Do NOT write implementation code in Phase A.** This phase is research, questions, DoD creation, and user confirmation. Code happens in Phase B.

## A.1 Triage Gate — Is This a Ratchet Problem?

Before investing in a full DoD, ask 2-3 scoping questions via AskUserQuestion:

### Question 1: Complexity

> "How many distinct sub-problems does this break into? (e.g., 'add auth' = password hashing + login endpoint + session management + integration = 4)"

Options: "1 (single change)", "2-3", "4-6", "7+ (complex)"

If "1": suggest downgrading to /interview + /goal. Stop and offer: "This looks like a single change. Use /interview instead for a faster workflow. Continue with ratchet anyway?"

### Question 2: Dependencies

> "Do sub-problems depend on each other, or are they independent?"

Options: "Sequential (B needs A first)", "Mostly independent (parallelizable)", "Mixed", "Unsure"

This determines execution order in Phase B. Sequential = one branch, process in order. Independent = parallel evomcp solves possible.

### Question 3: Verification Surface

> "What's the primary verification surface?"

Options: "Tests + lint + format (code quality)", "Runtime behavior (API responses, CLI output, UI)", "Performance metrics", "Mixed — all of the above"

This determines which predicate types and baseline categories apply.

### Triage Outcome

After 2-3 questions, decide:
- **Full ratchet**: 2+ sub-problems, dependencies, non-trivial verification → continue to A.2
- **Ratchet-lite**: 2-3 sub-problems, mostly independent, but still want ratchet guarantees → continue but skip evomcp, implement directly
- **Downgrade**: Recommend /interview + /goal instead, user confirms

Report the triage decision before proceeding.

## A.2 Context & Recall

Before requirements gathering, research the codebase and recall past learnings.

### A.2.1 Impact Analysis (code-review-graph)

If the codebase has a built graph:

```
mcp__code-review-graph__get_minimal_context_tool(task="<one-line goal>")
```

For complex problems, follow up with:

```
mcp__code-review-graph__detect_changes_tool  (if changes already exist)
mcp__code-review-graph__get_impact_radius_tool  (blast radius)
mcp__code-review-graph__list_flows_tool(sort_by="criticality")  (critical paths)
```

### A.2.2 Recall Past Approaches (obsidian-rag)

```
mcp__plugin_obsidian-rag_obsidian-rag__memory_recall(query="<problem domain>")
mcp__plugin_gitevo_gitevo__evo_lessons()  (if prior ratchet run exists)
```

### A.2.3 Codebase Research

- Explore agent to find related code, patterns, tests
- Check for prior art in the codebase
- Identify language, test framework, build system
- Check docs/plans/ for existing specs

## A.3 Requirements Gathering

Ask questions **one at a time** via AskUserQuestion. Each question should be specific, informed by A.2 research, and unambiguous.

### Question Categories

Work through these as relevant:

- **Purpose** — What problem does this solve? Who is it for?
- **Inputs/Outputs** — What data goes in? What comes out? What format?
- **Behavior** — Happy path? Error behavior? Edge cases?
- **Constraints** — Performance? Compatibility? Security? Scope boundaries?
- **Integration** — How does this connect to existing code? What contracts?
- **Verification** — How do we know it's correct? What's the acceptance criteria?

### Minimum Questions by Scope

| Estimated scope (from A.1+A.2) | Minimum clarifying questions |
|--------------------------------|------------------------------|
| Small — 1-3 files, one component/layer | 2-3 |
| Medium — 4-8 files, or 2+ layers | 4-5 |
| Large — 9+ files, or 3+ projects/layers | 6+ |

The floor is a minimum, not a target. Keep asking if ambiguities remain.

### Red Flags — Ask More If:

- You're about to write "TBD" in requirements
- You have competing interpretations of a requirement
- You don't know what error behavior should be
- Scope boundary is unclear
- You haven't discussed how to verify correctness
- You've asked fewer questions than the scope floor

## A.4 Build the DoD Tree

Based on the requirements from A.3, construct a hierarchical TaskNode tree.

### Minimum Tree Structure

```
roots:
  "Code Quality" (task group) — concrete
    - Lint
    - Format
    - Full test suite

  "<Feature Work>" (task group) — mix of concrete + draft
    - Sub-problem A (task group)
      - Concrete proofs (known upfront)
      - Draft proofs (implementation-dependent)
    - Sub-problem B (task group)
      - ...

  "Integration" (task group)
    - Wiring proof (concrete)
    - Behavioral proof (draft)

  "Manual Verification" (task group)
    - Code review (concrete, manual)
    - Walkthrough (concrete, manual)
```

### TaskNode Rules

- **Task group** — has `children`, represents a sub-goal. Decompose until children are pure leaves.
- **Draft leaf** — `refinement: "draft"`, has `intent`. Use when implementation-dependent.
- **Concrete leaf** — `refinement: "concrete"`, has `command`, `predicate`, `description`, `category`. Use when known upfront.
- **3 levels max** — roots → 2-4 task groups per root → leaves.
- **~40-60% concrete, ~40-60% draft** — some proofs known upfront, others discovered during implementation.

### Sub-Problem Identification

Each **task group under Feature Work** that has draft nodes is a sub-problem for Phase B. Name them clearly — these become branch names and loop iteration targets.

## A.5 Contrarian Review

Spawn a contrarian agent to push for maximum proof coverage before calling dod_create:

> You are an adversarial quality reviewer. Review the planned DoD tree below. For each optional proof category, argue WHY it should be ADDED. Be specific — reference the actual change and code.
>
> Optional categories: tdd, mutation, streamline, observability, performance, complexity, coverage, duplication
>
> For each: "MUST ADD — [reason + suggested command]" or "SKIP — [one-line justification]"
>
> Output skip_reasons JSON for skipped categories.

Present contrarian's recommendations to user. Accept, reject, or modify each. Collect skip_reasons for all omitted categories.

## A.6 Create DoD & Baseline Check

### A.6.1 Create DoD

```
mcp__plugin_dod-guard_dod-guard__dod_create(
  title="<Feature Name>",
  goal="<One sentence>",
  type="general",
  cwd="<Absolute project root>",
  markdown_path="<Absolute path to docs/plans/YYYY-MM-DD-<slug>.md>",
  sections={
    "requirements": "<Markdown requirements from A.3>",
    "research_notes": "<Key findings from A.2>",
    "decisions": "<Design decisions from A.3 questions>",
    "open_questions": "<Deferred items>",
    "open_risks": "<Known risks>"
  },
  roots=[<tree from A.4>],
  skip_reasons={<from A.5>}
)
```

### A.6.2 Baseline Check

**Immediately run dod_check** — before any implementation:

```
mcp__plugin_dod-guard_dod-guard__dod_check(dod_id="<id>")
```

Check:
- Concrete proofs that SHOULD fail (TDD red phase, grep for nonexistent code) → expected
- Concrete proofs that error (command not found, bad path) → fix via dod_amend NOW
- Concrete proofs that PASS before code exists → suspect, strengthen or convert to draft
- Draft nodes listed → confirms tree structure

**Do NOT proceed to A.7 until baseline runs clean** (all errors fixed, only expected failures remain).

## A.7 Initialize Evolution (gitevo)

```
mcp__plugin_gitevo_gitevo__evo_init()
mcp__plugin_gitevo_gitevo__evo_checkpoint(
  name="baseline",
  description="Initial state before ratchet run. DoD: <dod_id>"
)
```

If gitevo unavailable: skip. Use git branches manually. Note the degradation.

## A.8 User Confirmation Gate

Present the final setup summary and **require explicit user confirmation** before proceeding:

```markdown
## Ratchet Setup Complete

**DoD ID:** <id>
**Goal:** <one sentence>
**Sub-problems:** <N> (<list with dependencies>)

**Phase B will:**
1. Process sub-problems in dependency order
2. Each iteration: implement → scoped dod_check → full regression check
3. Cascade solve with evomcp for suitable sub-problems
4. Escalate stuck sub-problems for manual intervention
5. Terminate when full dod_check returns PASS

**Estimated iterations:** <N to N*3>
**Tools available:** evomcp (<yes/no>), gitevo (<yes/no>), obsidian-rag (<yes/no>), code-review-graph (<yes/no>)

**Ready to begin Phase B execution?**
```

User must explicitly confirm. If they identify gaps, return to A.3.

---

# Phase B: Execution Loop (/loop dynamic)

Phase B runs autonomously via `/loop` (dynamic mode — no fixed interval). Each loop iteration processes one sub-problem, verifies ratchet integrity, and schedules the next wakeup.

## B.1 Entering Loop Dynamic Mode

After user confirms in A.8, tell the user: **"Phase A complete. Run `/loop` to begin Phase B autonomous execution."**

The user runs `/loop` with no arguments — this enters self-paced dynamic mode. The agent then takes control: it calls `ScheduleWakeup` to self-pace through sub-problems, one per iteration.

### First Iteration (Bootstrapping)

On the first iteration after `/loop` is invoked, the agent:

1. Reads `dod_status(dod_id="<id>")` — confirms which proofs exist and their state
2. Reads `evo_summary()` if gitevo available
3. Identifies the first sub-problem (earliest in dependency order)
4. Proceeds to the per-iteration process (B.4)
5. Ends the iteration with `ScheduleWakeup(delaySeconds=60, reason="next sub-problem: <name>")`

### The Iteration Prompt (Internal)

Each `ScheduleWakeup` call passes this prompt — the agent's internal instructions for every iteration:

```
Ratchet Phase B — DoD: <dod_id> | CWD: <cwd> | Sub-problem: <current>

Process ONE sub-problem this iteration. ONE. Not two, not "also this other thing."
The entire loop is designed so a weak model doing one small thing perfectly 100 times
outperforms a strong model doing everything at once and cutting corners.

## Anti-Laziness Hard Rules

These exist because every LLM tries to "finish fast" when a task looks big. That is
EXACTLY the wrong instinct here. Read before every iteration:

1. ONE SUB-PROBLEM PER ITERATION. If you even THINK about doing two, stop. You have
   literally unlimited iterations. There is no rush.

2. dod_check IS THE ONLY SOURCE OF TRUTH. If dod_check doesn't pass, you're NOT done.
   No amount of "this looks right" or "the tests pass locally" matters. dod_check is
   the ratchet. No other metric.

3. COST DOES NOT MATTER. You are running on DeepSeek. A billion tokens costs <$5.
   Spending 20 iterations on a sub-problem costs ~$0.10. The user paid more for the
   electricity to run this loop than you will ever cost in API tokens. Never optimize
   for token spend.

4. THERE IS NO SESSION LIMIT. This loop runs forever until the work is done or the
   user stops it. You will not time out. You will not hit a rate limit. You will not
   be "too slow." The loop runs for however many iterations the work needs.

5. NEVER SKIP THE REGRESSION CHECK. Step 5 (full dod_check) is MANDATORY after every
   sub-problem. Even if you're "sure nothing broke." Even if the sub-problem was
   "trivial." The ratchet exists because you're wrong about that sometimes.

6. NEVER SILENTLY DEGRADE. If a proof fails and you can't fix it, ESCALATE. Do not
   mark it advisory. Do not dod_amend it to be weaker. Do not convert it to manual.
   Escalate so the human can decide.

7. "TRIVIAL" IS A RED FLAG. If you catch yourself thinking "this is trivial, I'll
   just do it and the next sub-problem too" — STOP. That's the laziness instinct
   talking. One per iteration. Always.

## On Entry
1. dod_status(dod_id="<dod_id>") — what passes/fails/has drafts
2. Identify next unsatisfied sub-problem in dependency order
3. Skip sub-problems whose dependencies aren't yet passing

## Sub-Problem Queue
<list: name, nodePath, dependency, status>

## Process (one sub-problem, one iteration)

1. REFINE: dod_refine any draft nodes in this subtree to concrete
2. SPAWN: evo_spawn("baseline" or last checkpoint, "ratchet/<slug>")
3. IMPLEMENT: cascade (evomcp solve) or direct. See cascade-vs-direct rules.
4. VERIFY: dod_check --nodePath=<path> → all concrete proofs in subtree pass
5. REGRESSION: dod_check (full, no nodePath) → ANY regression = fix NOW
6. LEARN: evo_learn + evo_checkpoint
7. SCHEDULE: ScheduleWakeup for next iteration or termination

## Cascade vs Direct
- evomcp solve: self-contained, 3+ proofs, working proxy
- Direct: trivial (1-2 lines), deep architecture knowledge, evomcp unavailable

## Escalation
If sub-problem fails after direct implementation: record what was tried (evo_learn),
present to user with options (different approach / guidance / skip). Do NOT silently
skip or loop on failure.

## Termination (call ScheduleWakeup(stop=true) when)
1. dod_check (full) = PASS → SUCCESS
2. dod_check (full) = INCOMPLETE (all automated pass, manuals remain) → list manuals
3. 3 consecutive escalations without progress → present escalation report
4. User intervened to stop

## On Success
evo_adopt → tighten (optional dod_add_node) → evo_export_lessons → memory_save →
evo_finish → ScheduleWakeup(stop=true)
```

The prompt is the same every iteration — context accumulates so the agent knows where it is in the queue. The prompt stays lean (~1K tokens) so it doesn't dominate the growing context window.

## B.2 Anti-Laziness Architecture

The ratchet skill is designed to counter a fundamental LLM failure mode: **when a task looks too large, the model cuts corners to "finish faster."** This is rational behavior for most LLM tasks (finish = lower cost, fewer turns) but completely wrong for ratchet-style work. The entire point of the ratchet is to turn one big scary task into many small mechanical steps so a weak model like DeepSeek can deliver high-quality results through sheer iteration count.

### The Cost Reality

| Metric | Value |
|--------|-------|
| DeepSeek input | ~$0.27 / million tokens |
| DeepSeek output | ~$1.10 / million tokens |
| 1 BILLION tokens | ~$5 |
| Typical ratchet iteration | ~20K tokens → ~$0.02 |
| Full ratchet run (50 iterations) | ~$1 |

**You cannot spend meaningful money here.** The user's electricity to run this loop costs more per hour than you will ever spend in API tokens. If you find yourself thinking "this is taking too many iterations" — that thought is the laziness instinct. There is no "too many iterations."

### Why the Loop Design Fights Laziness

The loop is structured to make laziness physically impossible:

1. **One sub-problem per iteration** — the agent cannot "do everything at once" because the prompt explicitly says ONE. And there's always a next iteration. The queue gives permission to stop after one.

2. **dod_check gates every iteration** — the agent cannot "mark it done and move on" because dod_check is a machine gate. It either passes or it doesn't. There's no faking it.

3. **Full regression check after every sub-problem** — the agent cannot "assume B didn't break A." The ratchet verifies it. Every time.

4. **Unlimited iterations** — the loop has no max count. There is no pressure to finish in N turns because N doesn't exist. The loop runs until the work is done, period.

5. **Self-pacing** — the agent controls when the next iteration fires. If an iteration takes 30 minutes of work, that's fine. ScheduleWakeup just schedules the next one. No queue backs up. No timeout fires.

6. **Escalation instead of silent degradation** — when stuck, the agent must escalate to the human. It cannot quietly weaken proofs, skip steps, or mark failures as advisory to make dod_check pass.

### Signs of Laziness (Escalate If You See These)

| Symptom | What It Looks Like | Reality |
|---------|-------------------|---------|
| Combining sub-problems | "I'll do A and B together to save time" | There is nothing to save. Each costs $0.02. |
| Skipping regression check | "This was trivial, full check is overkill" | The regressions you catch are NEVER the ones you expected |
| Premature "it works" | "Tests pass locally, we're good" | dod_check is the only truth. Nothing else counts. |
| Weakening proofs | "That proof is too strict, let me dod_amend it" | dod_amend requires a reason the user approved. Amending to pass = cheating. |
| Marking as advisory | "This failure is just advisory, it's fine" | Advisory is set at dod_create, not discovered during execution. |
| Rushing to termination | "Let me finish the last 2 sub-problems in this iteration" | ScheduleWakeup takes 60 seconds. Wait for it. |

### The Core Mantra (Read Every Iteration)

> **There is no "too long." There is no "too expensive." There is no "too many iterations." There is only "dod_check doesn't pass yet." The ratchet doesn't care how many cycles it takes. It only cares that every tooth is locked.**

## B.3 /loop Context Management

Context accumulates across iterations (see "How /loop Actually Works" in Overview). After 5+ sub-problems, the conversation may be long. Strategies:

- **Lean iteration prompt** — the prompt above is ~1K tokens. The bloat comes from dod_check output and implementation details, not the prompt.
- **Subagent delegation** — for research-heavy sub-problems, spawn an Explore agent. The one-line result lands in main context instead of full file dumps.
- **Scoped dod_check output** — `--nodePath` runs produce shorter output than full checks. Use scoped during implementation, full only for regression gate.
- **Accept the accumulation** — ratchet NEEDS context. The agent must remember which sub-problems are done and what approaches were tried. Context is working memory, not waste.

## B.4 Loop Iteration Logic (Quick Reference)

```
LOOP ITERATION:
  dod_status() → find next sub-problem with unsatisfied proofs
  ↓
  Has draft nodes? → dod_refine them
  ↓
  Cascade or direct? → implement
  ↓
  dod_check --nodePath=X → subtree must pass
  ↓
  dod_check (full) → REGRESSION? fix it NOW
  ↓
  evo_learn + evo_checkpoint
  ↓
  More sub-problems? → ScheduleWakeup(60-120s)
  All done? → termination sequence
  Stuck? → escalate to user
```

## B.5 Sub-Problem Execution Detail

### Cascade Solve (evomcp)

When using evomcp solve:

1. N parallel `claude -p` instances (DeepSeek), each with different strategy
2. Each implements a candidate solution
3. Verify each candidate against `dod_check --nodePath=X`
4. Failed candidates get up to 3 repair iterations with failure feedback
5. Stuck detection: same failure after repair → kill lineage
6. First passing candidate → return patch + verification report
7. All lineages fail → return escalation report

### Direct Implementation

When implementing directly:

1. Read relevant source files
2. Implement the change
3. Run scoped dod_check
4. If fail: read failure output, fix, re-run (max 3 attempts)
5. If still failing after 3 attempts → escalate (same as cascade escalation)

### Handling Escalations

When a sub-problem escalates (all approaches failed):

1. **Read the escalation report** — the failure signature tells you what's stuck
2. **Identify the barrier** — missing dependency? wrong architecture? test infrastructure gap?
3. **Fix directly** — this is the 5% that needs expensive model
4. **Verify** with dod_check --nodePath=X
5. **Learn the lesson** — evo_learn with root cause, not just "it failed"

```
mcp__plugin_gitevo_gitevo__evo_learn(
  content="Sub-problem <name>: ESCALATED. Failure signature: <sig>. Root cause: <why>. Fix: <what Claude did>"
)
```

If the direction is fundamentally wrong (not stuck — invalid approach):

```
mcp__plugin_gitevo_gitevo__evo_abandon(
  checkpoint="baseline",
  reason="<why this approach was wrong>"
)
```

## B.6 Termination: Adopt, Tighten, Persist

When full dod_check returns PASS or INCOMPLETE (all automated pass):

### Adopt
```
mcp__plugin_gitevo_gitevo__evo_adopt(branch="ratchet/<slug>")
```

### Tighten (Optional)
Add regression proofs for edge cases discovered during cascade:

```
mcp__plugin_dod-guard_dod-guard__dod_add_node(
  dod_id="<id>", parent_path="<path>", title="<new proof>",
  refinement="concrete", command="<command>",
  predicate={"type": "<type>", "value": <value>},
  description="<description>", category="<category>"
)
```

### Persist
```
mcp__plugin_gitevo_gitevo__evo_export_lessons()
```
→ For each lesson: `memory_save(id, title, description, content, type="project", metadata={...})`

Also save final verdict:
```
mcp__plugin_obsidian-rag_obsidian-rag__memory_save(
  id="ratchet-<slug>-verdict",
  title="Ratchet verdict: <DoD title>",
  description="Full ratchet run completed. Verdict: <PASS|FAIL|INCOMPLETE>",
  content="<summary of sub-problems, escalations, key learnings>",
  type="project",
  metadata={"dod_id": "<id>", "date": "<date>", "sub_problems": <N>, "escalated": <M>}
)
```

### Cleanup
```
mcp__plugin_gitevo_gitevo__evo_finish()
```
**Irreversible** — only after confirming final state is correct.

---

## Tool Availability & Degradation

Check at Phase A.2 and report:

```
mcp__plugin_evomcp_evomcp__status()     # deepclaude proxy running?
mcp__plugin_dod-guard_dod-guard__dod_list()  # dod-guard connected?
```

| Tool Missing | Degradation |
|-------------|-------------|
| evomcp | Phase B uses direct implementation only. Slower but still ratchets. |
| gitevo | Skip A.7 + git branching in B. Use git manually. Lose structured lesson capture. |
| obsidian-rag | Skip persistence. Lessons lost across sessions. Ratchet still works within session. |
| code-review-graph | Skip A.2.1 impact analysis. Use grep/glob for manual assessment. |

**Minimum viable ratchet:** dod-guard alone. Create DoD (Phase A), implement sub-problems sequentially with dod_check after each (Phase B direct). No cascade, no branching, no persistence — but still a ratchet.

---

## Anti-Patterns

| Anti-Pattern | Why Wrong | Do Instead |
|-------------|-----------|------------|
| Writing code before user confirms A.8 | Defeats the lock-in — user hasn't approved the plan | No code until Phase B |
| Skipping triage (A.1) | Full ratchet on a 1-line change wastes 10 min of setup | Triage first, downgrade if appropriate |
| Asking zero requirements questions | "Build X" without clarification = wrong X gets built | Minimum 2-3 AskUserQuestion calls |
| Skipping baseline check (A.6.2) | Broken proofs discovered late, wasted work | Always baseline check before A.7 |
| Running full dod_check on every cascade attempt | Slow — runs all proofs when only one subtree changed | Scoped `--nodePath=X` during implementation, full check after |
| evomcp solve without dod-guard verify_cmd | No ratchet — solution quality unverified | Always use dod_check as verify_cmd |
| Not capturing lessons on escalation | Same failure repeats next session | Always evo_learn + memory_save on escalation |
| Manual-only DoD (no concrete machine proofs) | Nothing to ratchet against | Minimum: lint, format, test, integration_wiring |
| Running cascade on trivial sub-problems | Wastes tokens on fanout for 1-line fixes | Direct implementation for trivial nodes |
| Adopting before full dod_check | Merges code that breaks other sub-problems | Full dod_check before any evo_adopt |
| Skipping regression check (full dod_check after each sub-problem) | Sub-problem B breaks sub-problem A silently | Full dod_check after EVERY sub-problem |
| Not tightening ratchet after success | Same problem class will need same effort next time | Add regression proofs after solving |
| Continuing loop after 3 escalations | Infinite loop burning tokens | Stop and present escalation report |
| Skipping evo_finish cleanup | Orphaned branches and tags accumulate | Clean up after verified PASS |
| Forgetting to dod_refine drafts before cascade | Cascade agents can't verify draft nodes | All nodes in sub-problem's subtree must be concrete before evomcp solve |

---

## Integration with Existing Skills

| Phase | Skill/Tool | How |
|-------|-----------|-----|
| Triage (A.1) | — (built-in AskUserQuestion) | Scope the problem |
| Research (A.2) | Explore agent, code-review-graph, obsidian-rag | Codebase context + past learnings |
| Requirements (A.3) | `dod-guard:interview` patterns | Structured questioning → DoD tree |
| Contrarian (A.5) | `dod-guard:interview` contrarian pattern | Push for max proof coverage |
| Quality baseline | `dod-guard:test-verification` | Score existing tests before changes |
| Quality improvement | `dod-guard:quality-upgrade` | Multi-phase test+source quality loop |
| Test fixes | `dod-guard:test-fixer` | Fix specific test quality findings |
| Code review | `/code-review` | Review diffs between checkpoints |
| Pre-PR review | `/pre-pr-review` | Check for LLM-isms before adopting |

---

## Quick Reference: MCP Tool Calls

### dod-guard
```
dod_create(title, goal, type, cwd, markdown_path, sections, roots, skip_reasons?)
dod_check(dod_id?, path?, cwd_override?, nodePath?)
dod_refine(dod_id, node_path, mode, command?, predicate?, description?, category?, children?)
dod_add_node(dod_id, parent_path, title, refinement?, intent?, command?, predicate?, ...)
dod_amend(dod_id, node_path, reason, new_command?, new_predicate?, new_description?)
dod_verify(dod_id?, path?, proof_id)
dod_status(dod_id?, path?)
dod_list()
```

### gitevo
```
evo_init()
evo_checkpoint(name, description)
evo_spawn(checkpoint_name, new_branch)
evo_learn(content)
evo_lessons()
evo_export_lessons()
evo_abandon(checkpoint?, reason?)
evo_adopt(branch)
evo_diff(checkpoint_a, checkpoint_b)
evo_summary()
evo_checkpoints()
evo_branches()
evo_finish()
```

### evomcp
```
solve(spec: {goal, verify_cmd, cwd, budget_tokens?, strategy?, context?})
evolve(spec: {goal, fitness_cmd, cwd, target_files, generations?, population_size?, ...})
status()
```

### obsidian-rag
```
memory_save(id, title, description, content, type?, metadata?)
memory_recall(query, limit?)
memory_list()
vault_select(name)
search_notes(query, limit?, kind?)
```

### code-review-graph
```
get_minimal_context_tool(task, changed_files?, repo_root?, base?)
detect_changes_tool(base?, changed_files?, include_source?, max_depth?)
get_impact_radius_tool(changed_files?, max_depth?, repo_root?, base?)
get_review_context_tool(changed_files?, max_depth?, include_source?)
list_flows_tool(sort_by?, limit?, kind?)
```

---

## Example: Full Ratchet Run

**Problem:** "Add rate limiting to the login endpoint"

### Phase A: Setup

```
A.1 TRIAGE:
  Q1: "How many sub-problems?" → 3 (middleware, wiring, config)
  Q2: "Dependencies?" → Sequential (wiring needs middleware)
  Q3: "Verification surface?" → Tests + runtime behavior
  Verdict: Full ratchet. 3 sub-problems, sequential.

A.2 CONTEXT:
  memory_recall("rate limiting login") → no prior memories
  get_minimal_context_tool("add rate limiting to login") → 3 communities, 12 flows
  Explore agent → src/auth/routes.ts, src/auth/middleware/, tests/auth/

A.3 REQUIREMENTS:
  Q: "Rate limit window?" → 5 req/min per IP (Recommended: sliding window)
  Q: "Response on limit?" → 429 with Retry-After header
  Q: "Configuration mechanism?" → Environment variable, default 5/min
  Q: "Scope?" → Login endpoint only, not whole app

A.4 DOD TREE:
  roots:
    "Code Quality" (task group)
      - Lint (concrete)
      - Format (concrete)
      - Full test suite (concrete)
    "Rate Limiting" (task group)
      "Middleware" (task group)
        - Draft: "tracks IP requests with sliding window"
        - Draft: "returns 429 when limit exceeded"
      "Wiring" (task group)
        - Draft: "middleware applied to POST /login route"
      "Configuration" (task group)
        - Draft: "reads RATE_LIMIT_MAX from env, defaults to 5"
    "Integration" (task group)
      - Wiring: grep for middleware registration (concrete)
      - Draft: "curl login returns 429 after 5 rapid requests"
    "Manual Verification" (task group)
      - Code review (manual)
      - Walkthrough (manual)

  Sub-problems: A=Middleware, B=Wiring, C=Config. Order: A → B → C.
  (Integration depends on all three, runs last.)

A.5 CONTRARIAN:
  → MUST ADD: observability (log rate limit hits), performance (benchmark latency)
  → SKIP: mutation (middleware logic simple), streamline (greenfield)
  User accepts both additions.

A.6 CREATE + BASELINE:
  dod_create → DoD ID: abc123, 4 roots, 14 concrete proofs, 6 draft nodes
  dod_check baseline → 8 concrete pass (lint/format/tests),
                        6 concrete expected-fail (grep/tdd for new code)

A.7 GIT EVO:
  evo_init()
  evo_checkpoint(name="baseline", description="Before rate limiting. DoD: abc123")

A.8 CONFIRMATION:
  "Ratchet Setup Complete. 3 sub-problems (Middleware → Wiring → Config).
   14 concrete proofs, 6 drafts. evomcp: yes, gitevo: yes.
   Ready to begin Phase B execution?"
  User: "Yes, proceed."
```

### Phase B: /loop Execution

```
ITERATION 1 — Sub-problem A: Middleware
  dod_refine drafts → concrete proofs for sliding window + 429 response
  evo_spawn("baseline", "ratchet/middleware")
  evomcp_solve(goal="Implement rate limiter middleware...",
               verify_cmd="dod_check --nodePath=1.children.0", ...)
  → PASSED after 2 repair iterations
  dod_check --nodePath=1.children.0 → 4/4 concrete pass
  dod_check (full) → no regressions
  evo_learn("Middleware: in-memory Map with sliding window. 2nd repair fixed boundary bug.")
  evo_checkpoint("middleware-solved", "Middleware passes scoped check.")
  ScheduleWakeup(60s, "next: Wiring")

ITERATION 2 — Sub-problem B: Wiring
  dod_refine draft → concrete: "grep 'rateLimiter' src/auth/routes.ts"
  evo_spawn("middleware-solved", "ratchet/wiring")
  evomcp_solve(...) → ESCALATED: all 6 lineages failed
  // Claude inspects: project uses non-standard middleware chain, not Express-style
  // Claude implements directly: registers middleware in custom chain
  dod_check --nodePath=1.children.1 → PASS
  dod_check (full) → no regressions
  evo_learn("ESCALATED: non-standard middleware chain. Claude fixed by reading router code.")
  evo_checkpoint("wiring-solved", "Wiring passes. Direct implementation after escalation.")
  ScheduleWakeup(60s, "next: Config")

ITERATION 3 — Sub-problem C: Config
  dod_refine draft → concrete: "node -e 'process.env.RATE_LIMIT_MAX=10; require(...)'"
  Direct implementation (trivial — one env var read)
  dod_check --nodePath=1.children.2 → PASS
  dod_check (full) → no regressions
  evo_learn("Config: process.env.RATE_LIMIT_MAX || 5. Trivial.")
  evo_checkpoint("config-solved", "Config passes.")

ITERATION 4 — Integration + Termination
  (Integration drafts auto-refined during prior iterations as code was written)
  dod_check (full) → PASS (20/20 concrete proofs, 0 drafts)
  evo_adopt("ratchet/middleware")
  dod_add_node(performance regression proof — latency < 5ms)
  dod_check → PASS
  evo_export_lessons() → 3 lessons → memory_save each
  memory_save final verdict
  evo_finish()
  ScheduleWakeup(stop=true)

Report: "Ratchet complete. DoD abc123: PASS. 3 sub-problems solved, 1 escalated (wiring), 3 lessons saved."
```

---

## Common Mistakes

- **Skipping triage** — full ratchet setup for a typo fix = 10 min wasted. Always triage.
- **Zero requirements questions** — "build X" without clarification = wrong X. Minimum 2-3 questions.
- **Writing code in Phase A** — defeats the lock-in. No implementation until Phase B.
- **Not confirming at A.8** — user must approve the plan before autonomous execution begins.
- **Running full dod_check on every cascade attempt** — use scoped `--nodePath` during implementation. Full check after each sub-problem completes.
- **Skipping regression check (full dod_check after each sub-problem)** — sub-problem B WILL break sub-problem A eventually. Catch it immediately.
- **Not reading escalation reports** — the failure signature tells you exactly what's stuck.
- **Skipping learn on successes** — "it worked" is not a lesson. Capture WHY and what approach succeeded.
- **Parallelizing dependent sub-problems** — if B depends on A, don't spawn both simultaneously.
- **Ratchet without teeth** — a DoD with only manual proofs has nothing to ratchet against.
- **Not tightening after success** — add regression proofs for edge cases discovered during cascade.
- **Using evomcp for trivial sub-problems** — a 3-line config change doesn't need 6 parallel DeepSeek instances.
- **Forgetting to dod_refine drafts before cascade** — cascade agents can't verify draft nodes.
- **Continuing loop after repeated escalations** — 3 consecutive failures without progress = stop and report.
