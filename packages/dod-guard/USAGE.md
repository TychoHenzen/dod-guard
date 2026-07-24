# dod-guard Usage Guide

How to pick the right skill for your goal. Project-agnostic — works for any codebase.

## Quick Reference: What Skill for What Goal

| You want to... | Use | Why |
|----------------|-----|-----|
| Understand requirements before coding | `/dod-guard:interview` | Structured questioning + DoD tree + adversarial spec review |
| Execute a complex multi-step plan correctly | `/dod-guard:step-by-step` | One fresh subagent per step, no batching, no shortcuts |
| Same as above but cheaper (90%+ cost savings) | `/dod-guard:cheap-step` | DeepSeek workers implement, host model verifies |
| Maximum quality with adversarial gates | `/dod-guard:adversarial-workflow` | 4-phase gated: Spec→Test→Implement→Cleanup |
| Solve complex multi-sub-problem with ratchet | `/dod-guard:ratchet` | DoD gates every cycle, evolutionary branching, cross-session learning |
| Find and delete duplicate/obsolete code | `/dod-guard:clean-house` | Git archaeology, confused-model detection, aggressive cleanup |

## Decision Flowchart

```
You have a task
│
├─ Is it unclear what to build?
│  └─ YES → /dod-guard:interview
│     Then: pass the DoD to step-by-step, cheap-step, ratchet, or adversarial-workflow
│
├─ Is it a single straightforward change?
│  └─ YES → Just do it. No skill needed.
│
├─ Is it a multi-step plan (5+ steps)?
│  ├─ Budget-sensitive? → /dod-guard:cheap-step
│  └─ Quality-critical? → /dod-guard:step-by-step
│
├─ Does it have interdependent sub-problems?
│  └─ YES → /dod-guard:ratchet
│     (Ratchet gates = can't break earlier sub-problems)
│
├─ Do you need maximum adversarial quality?
│  └─ YES → /dod-guard:adversarial-workflow
│     (4-phase gated: spec review → test audit → implementation review → cleanup)
│
├─ Is your codebase full of old/duplicate implementations?
│  └─ YES → /dod-guard:clean-house
│
└─ Still unsure?
   └─ Start with /dod-guard:interview — it's always safe
```

## Skill Details

### `/dod-guard:interview` — Requirements Gathering + DoD Creation

**What it does:** Structured questioning → research → requirements → DoD tree → adversarial spec review → creates a locked DoD via `dod_create`.

**When to use:**
- Starting any non-trivial implementation task
- Requirements are unclear or incomplete
- You want to prevent wrong-problem drift (implementing adjacent thing, not requested thing)
- Before any other dod-guard skill (they all consume DoDs)

**When to skip:**
- Trivial 1-line changes, typo fixes
- You already have a complete, locked DoD
- Pure research/exploration (no implementation planned)

**What it produces:**
- DoD markdown file in `docs/plans/`
- Locked DoD in MCP canonical storage (SHA-256 fingerprint)
- Hierarchical TaskNode tree (draft + concrete leaves)
- Adversarial spec review gate (Phase 1 GO)

**Key output:** A `/goal` prompt you can hand to an autonomous agent.

**Budget:** 10-15 min interactive. Worth it for anything non-trivial.

---

### `/dod-guard:step-by-step` — Sequential Multi-Step Execution

**What it does:** Decomposes a plan into atomic steps, dispatches ONE fresh subagent per step. Orchestrator context stays lean — no batching, no shortcuts, no "I'll combine steps 3 and 4." Each step gets full attention.

**When to use:**
- Plan has 5+ steps
- LLM is trying to batch, skip, or combine steps
- Complex task where each step requires focused attention
- Quality matters more than token cost

**When to skip:**
- 1-3 trivial steps — just do them
- Single file, single change
- Budget-sensitive (use cheap-step instead)

**Verification by step type:**

| Step type | Minimum verification | Common failure |
|-----------|---------------------|----------------|
| Code (logic, API, data) | Tests pass + build clean | — |
| Visual (UI, rendering, CSS) | Tests + build + **launch app** OR mark as pending manual check | "Build passes" for a visual change = unverified |
| Gameplay (physics, AI, behavior) | Tests + build + **playtest** OR mark as pending manual check | "Tests pass" for gameplay behavior = unverified |
| Config (env, settings, deps) | Config syntax valid + system starts | "File written" without validation |
| Structural (refactors, renames) | Tests + build + diff review | "No type errors" without import check |

**Key anti-pattern:** Build passes ≠ visual/gameplay verification. This pattern caused 80% of dod-guard breakdown events. Steps tagged `visual` or `gameplay` require actual visual verification or explicit human confirmation.

**Session recovery:** `.step-session/progress.log` survives compaction. Resume from first pending step.

---

### `/dod-guard:cheap-step` — Cheap-Worker Step Execution

**What it does:** Same atomic-step discipline as step-by-step, but implementation runs on cheap workers (DeepSeek via evomcp). Host model writes specs, verifies results, and only touches code directly when cheap workers fail (expected ~10% of steps).

**When to use:**
- Multi-step plan where steps are well-specified and verifiable
- Routine implementation work (CRUD, wiring, config, mechanical refactors)
- Budget-sensitive — 90%+ cost savings vs step-by-step
- Any plan where >60% of steps are "implement X following pattern Y"

**When to skip:**
- Visual/gameplay steps (cheap workers cannot see — must be host-only)
- Steps requiring architectural decisions (host model should design, not verify)
- Security-sensitive code
- Steps where the spec is harder to write than the implementation

**Step modes:**
- `cheap` — evomcp solve → host verifies → feedback/retry → host fallback
- `host-only` — host implements directly (architecture, visual, gameplay, security)

**Cost reality:** 20 steps where 18 pass on first try, 1 passes on retry, 1 needs host fix ≈ $0.50–1.00. Same work with all-host-model subagents ≈ $2–5.

**Visual/gameplay rule:** Steps tagged `visual` or `gameplay` MUST be `host-only`. Cheap workers substitute "build passes" for verification — the exact pattern that caused 8 of 10 breakdown events.

---

### `/dod-guard:ratchet` — Unified Ratcheting Workflow

**What it does:** Two-phase workflow for complex multi-sub-problem work. Phase A (interactive): triage → research → requirements → DoD → contrarian review → baseline check → user lock-in. Phase B (autonomous loop): one sub-problem per iteration, full regression check every cycle, ratchet gates prevent regressions ahead.

**When to use:**
- Problem has 2+ sub-problems with dependencies between them
- Unknown unknowns — you'd burn tokens guessing
- Regression risk is real — later changes could break earlier work
- Cross-session memory would help future similar problems

**When to skip:**
- Single straightforward change
- You already have a complete DoD from interview — just use `/goal`
- Trivial config change, typo fix, mechanical rename

**The five tools:**
- **dod-guard** — The ratchet teeth. DoD proofs that ALL must pass.
- **gitevo** — Evolutionary branching. Spawn, learn, abandon, adopt.
- **evomcp** — Cascade solver. Cheap model fanout, escalate stuck nodes.
- **obsidian-rag** — Cross-session memory. Persist learnings.
- **code-review-graph** — Impact analysis. Blast radius before changes.

**Minimum viable ratchet:** dod-guard alone. No evomcp, no gitevo, no obsidian-rag — but still a ratchet.

---

### `/dod-guard:adversarial-workflow` — 4-Phase Gated Quality

**What it does:** Each phase requires adversarial review before the next can execute. Phase 1 (Spec Review) → Phase 2 (Test Audit) → Phase 3 (Implementation Review) → Phase 4 (Structural Cleanup). Gates stored canonically via `dod_adversarial_gate` — dod_check blocks phase N+1 until phase N gate is GO.

**When to use:**
- Security-sensitive or mission-critical features
- User says "adversarial workflow", "gate this", "strict quality"
- Multi-step implementation where you want hard-gate verification
- After interview produces a DoD — run adversarial-workflow for maximum quality

**When to skip:**
- Trivial changes (overhead of 4-phase review > benefit)
- Prototype/exploratory work
- Single-file changes with no integration surface

**Lens counts by phase:**
- Phase 1: 5 lenses (Security, Assumptions, Testability, Consistency, Implementability)
- Phase 2: 3 lenses (Coverage, Falsifiability, Gap Detection)
- Phase 3: 3 roles (Saboteur, New Hire, Spec Auditor)
- Phase 4: Convergent structural audit (0 new findings on 2 consecutive runs)

**Model diversity:** Phase 2 and 3 lenses should use a different model/provider than the implementation author. Same model reviewing its own output = rubber-stamp risk. Use haiku lenses against sonnet implementations, or sonnet lenses against DeepSeek implementations.

---

### `/dod-guard:clean-house` — Duplicate/Obsolete Code Removal

**What it does:** Four-phase hunt for duplicate and obsolete implementations: HUNT (structural name scan, near-name clusters, dead code detection) → BLAME (git archaeology, confused-model detection, divergence analysis) → VERIFY (reference check, test coverage, runtime path) → CLEAN (aggressive removal, migration of confused-model changes).

**When to use:**
- Versioned APIs coexist (`/api/v1` + `/api/v2`)
- Files named `*-old.*`, `*-legacy.*`, `*-v2.*`, `*-new.*`
- Directories like `compat/`, `shims/`, `legacy/`, `old/`
- Rewrite shipped but old code was never deleted
- LLM keeps editing the wrong version of a feature

**Confused-model detection:** If the old file has commits dated AFTER the new version was created, an LLM got confused and edited the wrong file. Migrate those changes to the new version, then delete the old one.

**Hard rule:** Never keep old version "just in case." Git history IS your safety net.

---

## Cross-Skill Patterns

### Pattern 1: Interview → Step-by-Step (Standard)

```
/dod-guard:interview     → DoD created, spec reviewed
/dod-guard:step-by-step  → Execute the plan, one atomic step at a time
```

Most common pattern. Interview locks requirements. Step-by-step implements them without batching.

### Pattern 2: Interview → Cheap-Step (Budget)

```
/dod-guard:interview     → DoD created, spec reviewed
/dod-guard:cheap-step    → Cheap workers implement, host verifies
```

Same as Pattern 1 but 90%+ cheaper. Good for routine implementation work.

### Pattern 3: Interview → Adversarial (Maximum Quality)

```
/dod-guard:interview              → DoD created, spec reviewed (Phase 1 gate)
/dod-guard:adversarial-workflow   → Phases 2-4: test audit, implementation review, cleanup
```

Interview handles Phase 1 (spec review). Adversarial-workflow takes over from Phase 2. Maximum quality for security/mission-critical features.

### Pattern 4: Interview → Ratchet (Complex Multi-Problem)

```
/dod-guard:interview     → DoD created
/dod-guard:ratchet       → Phase A setup + Phase B autonomous loop
```

For complex problems with interdependent sub-problems. Ratchet gates prevent regressions across sub-problem boundaries.

### Pattern 5: Adversarial with Cheap-Step Implementation

```
/dod-guard:adversarial-workflow  → Phase 1 (spec review) GO
                                 → Phase 2 (test audit)
                                 → Phase 3: use /dod-guard:cheap-step for implementation
                                 → Adversarial review of cheap-worker output
                                 → Phase 4 (structural cleanup)
```

Cost-optimized adversarial quality. Spec and tests reviewed adversarially. Implementation offloaded to cheap workers. Cheap-worker output reviewed adversarially.

### Pattern 6: Step-by-Step → Clean-House (Post-Implementation)

```
/dod-guard:step-by-step  → Implement feature, possibly creating duplicate code
/dod-guard:clean-house   → Hunt and remove any duplicates created during implementation
```

After a large implementation, run clean-house to catch accidental duplicates.

## Anti-Patterns — What NOT to Do

| Anti-pattern | Why wrong | Correct approach |
|-------------|-----------|-----------------|
| Using interview for a 1-line fix | 10 min setup for 30 sec work. | Just do the fix. |
| Using cheap-step for visual/gameplay work | Cheap workers can't see. They'll substitute "build passes." | Mark visual/gameplay steps as host-only. |
| Skipping interview for non-trivial features | Wrong requirements = wrong implementation. | Interview always before non-trivial implementation. |
| Running adversarial-workflow without a DoD | Nothing to gate against. | Create DoD via interview first. |
| Using ratchet for a single change | Overkill. Ratchet setup costs 10-15 min. | Use step-by-step or just do it. |
| "Build passes" for visual changes | Build ≠ visual output. 80% of breakdown events. | Launch the app and visually confirm, or mark as manual. |
| Same model for test author + implementer | TDD theater — tests written to pass known implementation. | Model-diversity: different model for test audit lenses. |
| Amending same node 3+ times without approach change | Fixation cycle. Same strategy, different parameters. | Re-read requirements. Change the approach, not the parameters. |
| All concrete proofs, no manual for visual feature | Build-only verification for visual output = unverified. | Always include manual predicate for visual/gameplay changes. |
| Dispatching adversarial lenses with same model as author | Rubber-stamp — model agrees with itself. | Model diversity or maximally different lens prompts. |

## Verification Surface Reference

Not all changes verify the same way. This table helps you correctly tag steps and choose the right skill:

| Surface | Examples | Can be machine-verified? | Skill compatibility | Required proof types |
|---------|----------|--------------------------|---------------------|---------------------|
| **Code** | Logic, algorithms, data flow, API | Yes — tests, lint, build | All skills | behavioral + wiring |
| **Visual** | UI, rendering, CSS, 3D, animations | Partially — build compiles, visual output needs eyes | step-by-step (manual verification), interview (manual predicate) | behavioral + wiring + **manual** |
| **Gameplay** | Physics, AI, level design, balance | Partially — unit tests, playtest for feel | step-by-step (manual verification), interview (manual predicate) | behavioral + wiring + **manual** |
| **Config** | Env vars, deps, settings | Yes — parse + start | All skills | wiring |
| **Structural** | Renames, refactors, file moves | Yes — tests + diff | All skills | behavioral |

**The golden rule:** If a change modifies visual output, gameplay behavior, or anything a human would need to look at to confirm — the DoD MUST include a `manual` predicate. No exceptions.

## Platform Notes

- **Windows (cmd.exe):** Proof commands must use Windows tools (`findstr`, `type`, `dir`), not Unix (`grep`, `cat`, `ls`). dod-guard validates at create time.
- **Globs:** `cmd.exe` doesn't expand globs. Use tools that handle their own globbing (Biome, ripgrep) or explicit paths.
- **Node test runner:** Outputs TAP format — never contains "tests pass". Use `exit_code` predicate for npm test, never `output_contains`.
- **Visual verification on headless CI:** Impossible. Manual predicates are the only option. Batch multiple visual proofs under one manual check to reduce fatigue.

## MCP Tool Quick Reference

All dod-guard skills use these MCP tools under the hood. You rarely need to call them directly, but they're available:

| Tool | Purpose | Called by |
|------|---------|-----------|
| `dod_create` | Build new DoD with TaskNode tree | interview, ratchet (Phase A) |
| `dod_check` | Run proofs, get pass/fail/stuck verdict | All skills |
| `dod_refine` | Draft → concrete or subdivide | step-by-step, cheap-step, ratchet |
| `dod_amend` | Modify concrete proof (audit trail) | All skills (when requirements change) |
| `dod_verify` | Human out-of-band verification popup | step-by-step (manual steps) |
| `dod_tree` | Read-only structural dump | All skills (discover node paths) |
| `dod_status` | Last check result without re-running | ratchet (loop iteration start) |
| `dod_list` | List all tracked DoDs | Any skill (find existing DoDs) |
| `dod_import` | Parse markdown DoD → canonical storage | recovery, migration |
| `dod_adversarial_gate` | Record gate verdict (GO/REVISE/STOP) | adversarial-workflow |
| `dod_add_node` | Add node to tree | ratchet (tightening), interview |
| `dod_remove_node` | Remove node + descendants | clean-house, structural cleanup |

## STUCK Verdict

dod-guard now has a `stuck` verdict alongside `pass`/`fail`/`incomplete`/`pass_dirty`. A STUCK verdict means:

- One or more proofs are failing after 3+ amendment cycles
- The node has been amended repeatedly without an approach change
- The approach itself is likely wrong — not the parameters

**What to do when STUCK:**
1. Read the stuck summary — it tells you which nodes and why
2. Re-read the original requirements for those nodes
3. Ask: "Is this implementing the right thing, or a convenient adjacent thing?"
4. If wrong problem: re-spec with corrected requirements
5. If right problem, wrong approach: re-spec with a DIFFERENT architectural approach
6. If the requirement itself is unreasonable: `dod_remove_node` or `dod_amend` to split into achievable sub-goals

STUCK is not failure — it's honest signaling. An agent that reports STUCK after N amendment cycles is behaving correctly, not failing. Binary "done/failed" forces agents to claim done when stuck. STUCK gives them an honest third option.

## Summary: Skill Selection by Goal

1. **"I don't know exactly what to build"** → `/dod-guard:interview`
2. **"Build this plan correctly, no shortcuts"** → `/dod-guard:step-by-step`
3. **"Same as #2 but cheaper"** → `/dod-guard:cheap-step`
4. **"Maximum adversarial quality"** → `/dod-guard:adversarial-workflow`
5. **"Complex problem with sub-problem dependencies"** → `/dod-guard:ratchet`
6. **"Codebase has old/duplicate implementations"** → `/dod-guard:clean-house`

When in doubt: start with interview. It's always safe, and the DoD it produces can be fed to any other skill.
