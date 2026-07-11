---
name: ratchet
description: Unified ratcheting workflow that combines dod-guard (verification gates), gitevo (evolutionary branching), evomcp (cascade solver), obsidian-rag (learning persistence), and code-review-graph (impact analysis) to reliably solve complex multi-sub-problems. Use when facing non-trivial problems with unknown unknowns, multiple interdependent sub-problems, or when a single-shot approach would waste tokens on wrong approaches. Trigger: "solve with ratchet", "ratchet this", "complex problem", "multi-step solution", "ratcheting workflow".
---

# Ratchet — Unified Ratcheting Workflow

## Overview

Combine all five repo tools into a ratcheting problem-solving workflow. A ratchet only moves forward — each iteration must pass ALL previous verification gates plus any new ones. dod-guard enforces this; the other tools accelerate exploration, capture learning, and minimize token spend.

**Announce at start:** "Using the ratchet workflow. This will decompose the problem, fan out exploration with cheap models, escalate only stuck sub-problems, and ratchet forward so nothing regresses."

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

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: Context & Recall                                       │
│   code-review-graph: impact analysis                            │
│   obsidian-rag: memory_recall past approaches                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 1: Define the Ratchet (dod-guard)                         │
│   Interview → TaskNode tree → dod_create → baseline dod_check   │
│   Each concrete proof = one ratchet tooth                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 2: Initialize Evolution (gitevo)                          │
│   evo_init → evo_checkpoint baseline                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 3: Decompose into Sub-Problems                            │
│   For each DoD task group that needs implementation:            │
│   - Identify verify_cmd = dod_check --nodePath=<subtree>        │
│   - evo_spawn a branch per sub-problem                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │   For each      │
                    │   sub-problem   │
                    └────────┬────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 4: Cascade Solve (evomcp)                                 │
│   evomcp solve with verify_cmd = dod_check --nodePath=X         │
│   - N parallel DeepSeek instances with diverse strategies       │
│   - Auto-verify each candidate against dod-guard proofs         │
│   - Up to 3 repair iterations with failure feedback             │
│   - Stuck detection → kill lineage                              │
└────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
        ┌──────────┐           ┌──────────────┐
        │ PASSED   │           │ ESCALATED    │
        │          │           │ (all lineages│
        │ evo_learn│           │  failed)     │
        │ what     │           │              │
        │ worked   │           │ Parent Claude│
        │          │           │ solves stuck │
        │ Continue │           │ sub-problem  │
        │ to next  │           │ directly     │
        └──────────┘           └──────┬───────┘
                                      │
                              ┌───────▼───────┐
                              │ Verify with   │
                              │ dod_check     │
                              └───────┬───────┘
                                      │
                              ┌───────▼───────┐
                              │ PASS → learn  │
                              │ FAIL → learn  │
                              │ + abandon     │
                              └───────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 5: Adopt & Ratchet Tightening                              │
│   evo_adopt winning branches                                     │
│   Full dod_check — ALL proofs must pass                          │
│   Optionally: add new proof nodes (tighten ratchet)              │
│   evo_finish cleanup                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ PHASE 6: Persist Learning (obsidian-rag)                         │
│   evo_export_lessons → memory_save per lesson                    │
│   dod_check final verdict → memory_save as project reference     │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 0: Context & Recall

Before touching code, gather context and recall past learnings.

### 0.1 Impact Analysis (code-review-graph)

If the codebase has a built graph, get the lay of the land:

```
mcp__code-review-graph__get_minimal_context_tool(task="<one-line goal>")
```

This returns ~100 tokens: graph stats, risk score, top communities, suggested next tools. Use this to decide depth.

For complex problems, follow up with:

```
mcp__code-review-graph__detect_changes_tool  (if changes already exist)
mcp__code-review-graph__get_impact_radius_tool  (to understand blast radius)
mcp__code-review-graph__list_flows_tool(sort_by="criticality")  (critical paths)
```

### 0.2 Recall Past Approaches (obsidian-rag)

Search for relevant past learnings:

```
mcp__plugin_obsidian-rag_obsidian-rag__memory_recall(query="<problem domain>")
```

Also check gitevo lessons if a previous ratchet run exists:

```
mcp__plugin_gitevo_gitevo__evo_lessons()
```

### 0.3 Codebase Research

Use the interview skill's Phase 1 research patterns (don't re-run full interview — just the research):
- Explore agent to find related code, patterns, tests
- Check for prior art in the codebase
- Identify language, test framework, build system

## Phase 1: Define the Ratchet (dod-guard)

The DoD IS the ratchet. Every concrete proof is a tooth. The full set must pass for the problem to be "solved."

### 1.1 Requirements Gathering

Use `Skill("dod-guard:interview")` for structured requirements gathering. This produces:
- Clear requirements with explicit scope boundaries
- A hierarchical TaskNode tree (task groups → concrete + draft leaves)
- Baseline categories filled
- skip_reasons for omitted optional categories

**Minimum tree structure for a ratchet run:**

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

### 1.2 Create the DoD

Call `dod_create` with the tree. The DoD markdown goes to `docs/plans/YYYY-MM-DD-<slug>.md`.

### 1.3 Baseline Check

**Immediately run `dod_check`** — before any implementation:

```
mcp__plugin_dod-guard_dod-guard__dod_check(dod_id="<id>")
```

What to check:
- Concrete proofs that SHOULD fail (TDD red phase, grep for nonexistent code) → expected, proceed
- Concrete proofs that error (command not found, bad path) → fix via `dod_amend` NOW
- Concrete proofs that PASS before code exists → suspect, strengthen or convert to draft
- Draft nodes listed → confirms tree structure

**Do NOT proceed to Phase 2 until the baseline check runs clean** (all errors fixed, only expected failures remain).

## Phase 2: Initialize Evolution (gitevo)

### 2.1 Initialize

```
mcp__plugin_gitevo_gitevo__evo_init()
```

Creates `.evo/` directory, tags HEAD as `evo-root`, initializes `lessons.jsonl`.

### 2.2 Baseline Checkpoint

```
mcp__plugin_gitevo_gitevo__evo_checkpoint(
  name="baseline",
  description="Initial state before ratchet run. DoD: <dod_id>"
)
```

This is the fallback point. Any branch can be abandoned back to this checkpoint.

## Phase 3: Decompose into Sub-Problems

### 3.1 Identify Sub-Problems

Each **task group** in the DoD that has draft nodes (i.e., needs implementation) is a sub-problem. Sub-problems may have dependencies:
- Code Quality must pass first (lint/format/test baseline)
- Feature work can be parallelized if independent
- Integration depends on feature work
- Manual verification is last

### 3.2 Determine Execution Order

Sort sub-problems by dependencies. Independent sub-problems can run in parallel (spawn multiple evomcp solve calls).

### 3.3 Spawn Branches

For each sub-problem, create a branch:

```
mcp__plugin_gitevo_gitevo__evo_spawn(
  checkpoint_name="baseline",
  new_branch="ratchet/<sub-problem-slug>"
)
```

**Branch naming convention:** `ratchet/<task-group-slug>` — makes it clear these are ratchet work branches.

### 3.4 Define Verification Commands

For each sub-problem, the verify_cmd is a scoped dod_check:

```
verify_cmd = 'dod_check --nodePath=<subtree-path>'
```

Example: if the sub-problem is `roots[1].children[2]` (Integration task group), the verify_cmd is:

```
dod_check --nodePath=1.children.2
```

Scoped runs are fast (only that subtree executes) and return INCOMPLETE (never PASS). This is intentional — only the full dod_check at the end can return PASS.

## Phase 4: Cascade Solve

The core insight from the cascade strategy: **DeepSeek does fanout (95% of work), Claude only touches stuck sub-problems (5%).**

### 4.1 Solve Each Sub-Problem

For each independent sub-problem, call evomcp solve:

```
mcp__plugin_evomcp_evomcp__solve(
  spec={
    "goal": "<sub-problem description from DoD>",
    "verify_cmd": "<dod_check --nodePath=X command>",
    "cwd": "<project root>",
    "strategy": "best-of-n",
    "context": "<relevant file paths, existing test output, constraints>"
  }
)
```

**What happens inside evomcp solve:**
1. N parallel `claude -p` instances (DeepSeek), each with different strategy
2. Each instance implements a candidate solution
3. Verify each candidate against `dod_check --nodePath=X`
4. Failed candidates get up to 3 repair iterations with failure feedback
5. Stuck detection: same failure after repair → kill lineage
6. First passing candidate → return patch + verification report
7. All lineages fail → return escalation report

### 4.2 Handle Results

**If PASSED:**
```
mcp__plugin_gitevo_gitevo__evo_learn(
  content="Sub-problem <name>: PASSED. Approach: <what worked>. Patch: <summary>"
)
mcp__plugin_gitevo_gitevo__evo_checkpoint(
  name="<sub-problem>-solved",
  description="Sub-problem <name> solved. dod_check --nodePath=X passes."
)
```

**If ESCALATED (all lineages failed):**
- Read the escalation report carefully
- The failure signature tells you WHY all approaches failed
- Parent Claude (you) solves the stuck sub-problem directly:
  1. Inspect the failure signature
  2. Identify the specific barrier (missing dependency, wrong architecture, test infrastructure gap)
  3. Implement the fix directly (this is the 5% that needs expensive model)
  4. Verify with `dod_check --nodePath=X`
  5. Learn the lesson

```
mcp__plugin_gitevo_gitevo__evo_learn(
  content="Sub-problem <name>: ESCALATED. Failure signature: <sig>. Root cause: <why>. Fix: <what Claude did>"
)
```

### 4.3 Abandon Failed Branches

If a sub-problem approach is fundamentally wrong (not just stuck — the whole direction is invalid):

```
mcp__plugin_gitevo_gitevo__evo_abandon(
  checkpoint="baseline",
  reason="<why this approach was wrong>"
)
```

This tags the branch as `evo-dead-<branch>`, reverts to baseline checkpoint, and records the reason as a lesson.

### 4.4 Cycle Until All Sub-Problems Pass

Work through sub-problems in dependency order. After each passing sub-problem, run a **full** dod_check to verify no regressions:

```
mcp__plugin_dod-guard_dod-guard__dod_check(dod_id="<id>")
```

If a previously passing proof now fails → REGRESSION DETECTED. The ratchet caught it. Fix before continuing.

## Phase 5: Adopt & Tighten

### 5.1 Adopt Winning Branches

For each sub-problem branch that passed:

```
mcp__plugin_gitevo_gitevo__evo_adopt(branch="ratchet/<sub-problem-slug>")
```

This merges the branch into the root branch and tags it as `evo-adopted`.

### 5.2 Full Verification

```
mcp__plugin_dod-guard_dod-guard__dod_check(dod_id="<id>")
```

This MUST return PASS (or INCOMPLETE if manual proofs remain). If it returns FAIL, the ratchet worked — it caught a regression. Fix the failing proof before proceeding.

### 5.3 Optional: Tighten the Ratchet

After the problem is solved, consider adding more proof gates:
- Regression tests for edge cases discovered during cascade
- Performance benchmarks
- Observability checks for new code paths
- Mutation testing threshold

```
mcp__plugin_dod-guard_dod-guard__dod_add_node(
  dod_id="<id>",
  parent_path="<path>",
  title="<new proof>",
  refinement="concrete",
  command="<command>",
  predicate={"type": "<type>", "value": <value>},
  description="<description>",
  category="<category>"
)
```

Then re-run `dod_check` — the ratchet is now tighter.

### 5.4 Cleanup

```
mcp__plugin_gitevo_gitevo__evo_finish()
```

This merges to root, deletes all evo-* tags, removes side branches, deletes `.evo/`. **Irreversible** — only run when confirming the final state is correct.

## Phase 6: Persist Learning

### 6.1 Export Lessons

```
mcp__plugin_gitevo_gitevo__evo_export_lessons()
```

This returns a JSON array of all lessons from the `.evo/lessons.jsonl` file, formatted for obsidian-rag `memory_save`.

### 6.2 Save to Obsidian-RAG

For each exported lesson, call `memory_save`:

```
mcp__plugin_obsidian-rag_obsidian-rag__memory_save(
  id="ratchet-<slug>-<date>",
  title="<lesson title>",
  description="<one-line summary>",
  content="<full lesson content with approach, what worked, what didn't>",
  type="project",
  metadata={"dod_id": "<id>", "branch": "<branch>", "outcome": "<pass|fail>"}
)
```

Also save the final DoD verdict:

```
mcp__plugin_obsidian-rag_obsidian-rag__memory_save(
  id="ratchet-<slug>-verdict",
  title="Ratchet verdict: <DoD title>",
  description="Full ratchet run completed. Verdict: <PASS|FAIL|INCOMPLETE>",
  content="<summary of all sub-problems, what passed, what was escalated, key learnings>",
  type="project",
  metadata={"dod_id": "<id>", "date": "<date>", "sub_problems": <N>, "escalated": <M>}
)
```

### 6.3 Cross-Session Bootstrap

Next time a similar problem comes up, Phase 0.2 will recall these memories via `memory_recall`. The ratchet gets smarter over time.

## Tool Availability & Degradation

Not all tools may be available. The workflow degrades gracefully:

| Tool Missing | Degradation |
|-------------|-------------|
| evomcp | Skip Phase 4 cascade. Implement sub-problems directly with Claude. Slower, more expensive, but still ratchets. |
| gitevo | Skip Phase 2/3 branching. Use git branches manually. Lose structured lesson capture. |
| obsidian-rag | Skip Phase 6 persistence. Lessons lost across sessions. Ratchet still works within session. |
| code-review-graph | Skip Phase 0.1 impact analysis. Use grep/glob for manual impact assessment. |

**Minimum viable ratchet:** dod-guard alone. Create DoD, implement sub-problems sequentially, dod_check after each. No cascade, no branching, no persistence — but still a ratchet.

### Availability Check

At start of Phase 0, check tool availability:

```
mcp__plugin_evomcp_evomcp__status()     # Is deepclaude proxy running?
mcp__plugin_dod-guard_dod-guard__dod_list()  # Is dod-guard connected?
```

Report which tools are available and which phases will run in degraded mode.

## Anti-Patterns

| Anti-Pattern | Why Wrong | Do Instead |
|-------------|-----------|------------|
| Writing all code before first dod_check | Defeats the ratchet — no early feedback | dod_check after every sub-problem |
| Skipping baseline check (Phase 1.3) | Broken proofs discovered late, wasted work | Always baseline check before Phase 2 |
| Using full dod_check during cascade | Slow — runs all proofs when only one subtree changed | Use scoped `--nodePath=X` during Phase 4 |
| evomcp solve without dod-guard verify_cmd | No ratchet — solution quality unverified | Always use dod_check as verify_cmd |
| Not capturing lessons on escalation | Same failure repeats next session | Always evo_learn + memory_save on escalation |
| Manual-only DoD (no concrete machine proofs) | Nothing to ratchet against | Minimum: lint, format, test, integration_wiring |
| Running cascade on trivial sub-problems | Wastes tokens on fanout for 1-line fixes | Direct implementation for trivial nodes |
| Adopting before full dod_check | Merges code that breaks other sub-problems | Full dod_check before any evo_adopt |
| Skipping evo_finish cleanup | Orphaned branches and tags accumulate | Clean up after verified PASS |
| Not tightening ratchet after success | Same problem class will need same effort next time | Add regression proofs after solving |

## Integration with Existing Skills

The ratchet skill orchestrates other dod-guard skills:

| Phase | Skill/Tool | How |
|-------|-----------|-----|
| Requirements | `dod-guard:interview` | Structured questioning → DoD tree |
| Quality baseline | `dod-guard:test-verification` | Score existing tests before changes |
| Quality improvement | `dod-guard:quality-upgrade` | Multi-phase test+source quality loop |
| Test fixes | `dod-guard:test-fixer` | Fix specific test quality findings |
| Code review | `/code-review` | Review diffs between checkpoints |
| Pre-PR review | `/pre-pr-review` | Check for LLM-isms before adopting |

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

## Example: Full Ratchet Run

**Problem:** "Add rate limiting to the login endpoint"

### Phase 0
```
memory_recall(query="rate limiting login endpoint") → no prior memories
get_minimal_context_tool(task="add rate limiting to login") → 3 communities, 12 flows
Explore agent → found src/auth/routes.ts, src/auth/middleware/, tests/auth/
```

### Phase 1
```
Interview → requirements: 5 req/min per IP, 429 response, configurable window
dod_create → 4 roots, 12 concrete proofs, 6 draft nodes
dod_check baseline → 8 concrete pass (lint/format/existing tests),
                      4 concrete expected-fail (TDD red phase, grep for new code)
```

### Phase 2
```
evo_init()
evo_checkpoint(name="baseline", description="Before rate limiting implementation")
```

### Phase 3
```
Sub-problems:
  A. Rate limiter middleware (draft → code)
  B. Apply middleware to login route (draft → wiring)
  C. Configuration (draft → env var)

evo_spawn(checkpoint_name="baseline", new_branch="ratchet/rate-limiter")
```

### Phase 4
```
// Sub-problem A: Rate limiter middleware
evomcp_solve({
  goal: "Implement rate limiter middleware that tracks IP requests...",
  verify_cmd: "dod_check --nodePath=1.children.0",
  cwd: "/project",
  context: "Use src/auth/middleware/ directory. Express middleware pattern..."
})
→ PASSED after 2 repair iterations
evo_learn("Rate limiter: in-memory Map with sliding window. 2nd repair fixed window boundary bug.")
evo_checkpoint(name="rate-limiter-solved", description="Middleware passes dod_check --nodePath=1.children.0")

// Sub-problem B: Wiring
evomcp_solve({
  goal: "Apply rate limiter middleware to POST /login route...",
  verify_cmd: "dod_check --nodePath=1.children.1",
  ...
})
→ ESCALATED: all 6 lineages failed — couldn't find correct middleware registration pattern
// Claude inspects: project uses a non-standard middleware chain, not Express-style
// Claude implements directly, dod_check passes
evo_learn("ESCALATED: non-standard middleware chain. Claude fixed by reading actual router code.")

// Sub-problem C: Configuration
evomcp_solve(...) → PASSED
```

### Phase 5
```
Full dod_check → PASS (18/18 concrete proofs)
evo_adopt(branch="ratchet/rate-limiter")
// Tighten ratchet: add performance regression proof
dod_add_node(..., category="performance", predicate={"type": "regression"})
dod_check → PASS
evo_finish()
```

### Phase 6
```
evo_export_lessons() → 3 lessons
memory_save each lesson
memory_save final verdict
```

## Common Mistakes

- **Running full dod_check on every cascade attempt** — use scoped `--nodePath` during Phase 4. Full check only at phase boundaries.
- **Not reading escalation reports** — the failure signature tells you exactly what's stuck. Read it before implementing directly.
- **Skipping learn on successes** — "it worked" is not a lesson. Capture WHY it worked and what approach succeeded.
- **Parallelizing dependent sub-problems** — if B depends on A, don't spawn both simultaneously. evomcp can't see A's solution.
- **Ratchet without teeth** — a DoD with only manual proofs has nothing to ratchet. Minimum: lint, format, test, integration_wiring as concrete machine-checkable proofs.
- **Not tightening after success** — the ratchet should get stronger. Add regression proofs for edge cases the cascade discovered.
- **Using evomcp for trivial sub-problems** — a 3-line config change doesn't need 6 parallel DeepSeek instances. Implement directly.
- **Forgetting to dod_refine drafts** — cascade agents can't verify draft nodes. All nodes in a sub-problem's subtree must be concrete before evomcp solve.
