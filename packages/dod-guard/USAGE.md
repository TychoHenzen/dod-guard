# dod-guard Usage Guide

How to pick the right skill for your goal. Project-agnostic - works for any
codebase with an `openspec/` directory.

## Quick Reference: What Skill for What Goal

| You want to... | Use | Why |
|----------------|-----|-----|
| Understand requirements before coding | `/dod-guard:interview` | Structured questioning, writes scenarios + test bindings into an OpenSpec change |
| Execute a confirmed multi-step plan correctly | `/dod-guard:step-by-step` | One fresh subagent per step, no batching, no shortcuts |
| Same as above but cheaper (90%+ cost savings) | `/dod-guard:cheap-step` | DeepSeek workers implement, host model verifies |
| Solve interdependent sub-problems autonomously | `/dod-guard:ratchet` | Coverage-gate check every loop iteration, evolutionary branching |
| Maximum quality with adversarial gates | `/dod-guard:adversarial-workflow` | 4-phase gated: Spec->Test->Implement->Cleanup, verdicts in `design.md` |
| Find and delete duplicate/obsolete code | `/dod-guard:clean-house` | Git archaeology, confused-model detection, aggressive cleanup |
| Remove accidental complexity in a codebase sweep | `/dod-guard:tighten` | Scanner-ranked targets, blind-rewritten one at a time |
| Replace an implementation without a paraphrase | `/dod-guard:blind-rewrite` | Delete first, rebuild from a contract, gate against the deleted original |
| Audit tests that bless bugs instead of catching them | `/dod-guard:test-integrity-checker` | Detects logic mirroring, output blessing, weak assertions |
| Reconcile documents that contradict each other | `/dod-guard:doc-reconcile` | Dates each claim from real edit history, deletes the older side |
| Fix a skill that ignored its own steps | `/dod-guard:skill-debug` | Debugs from real session transcripts, not guesswork |
| Migrate a skill/agent to a newer model | `/dod-guard:skill-migrate` | Blind-rewrites from an extracted behavioral contract |

## Decision Flowchart

```
You have a task
|
+- Is it unclear what to build?
|    YES -> /dod-guard:interview
|    Then: pass the change id to step-by-step, cheap-step, ratchet,
|    or adversarial-workflow
|
+- Is it a single straightforward change?
|    YES -> Just do it. No skill needed.
|
+- Is it a confirmed multi-step plan (5+ steps)?
|    Budget-sensitive? -> /dod-guard:cheap-step
|    Quality-critical? -> /dod-guard:step-by-step
|
+- Does it have interdependent sub-problems?
|    YES -> /dod-guard:ratchet
|    (needs a change id from interview first)
|
+- Do you need maximum adversarial quality?
|    YES -> /dod-guard:adversarial-workflow
|    (4-phase gated: spec review -> test audit -> implementation review -> cleanup)
|
+- Is your codebase full of old/duplicate implementations?
|    YES -> /dod-guard:clean-house
|
+- Do you want to sweep accidental complexity, not a named target?
|    YES -> /dod-guard:tighten
|
+- Still unsure?
     Start with /dod-guard:interview - it's always safe
```

## Skill Details

### `/dod-guard:interview` - Requirements Gathering

**What it does:** Reads the code the change touches. Questions the user one
item at a time, then confirms a written requirements summary. Runs an
adversarial review of that spec. Writes the resulting scenarios into an
OpenSpec change and marks how each one binds to a test. Never implements.

**When to use:**
- Starting any non-trivial implementation task
- Requirements are unclear or incomplete
- You want to prevent wrong-problem drift (implementing adjacent thing, not
  requested thing)
- Before any other dod-guard skill that plans or executes work

**When to skip:**
- Trivial 1-line changes, typo fixes
- You already have a confirmed OpenSpec change with its scenarios written
- Pure research/exploration (no implementation planned)

**What it produces:**
- Scenarios in the change's spec delta under `openspec/changes/<id>/specs/`
- A test binding for each scenario (a `covers:` marker comment on the
  line directly above the test declaration, added at implementation time
  and checked by `dod-guard cover`. The marker must be above the
  declaration, never inside the function body. Uses `//` for
  JS/TS/Go/Rust/Java/Kotlin, `#` for Python/Ruby/shell)

**Key output:** An OpenSpec change id you can hand to `/step-by-step`,
`/cheap-step`, `/ratchet`, or `/adversarial-workflow`.

**Budget:** 10-15 min interactive. Worth it for anything non-trivial.

---

### `/dod-guard:step-by-step` - Sequential Multi-Step Execution

**What it does:** Reads `openspec/changes/<id>/tasks.md`, dispatches ONE
fresh subagent per atomic step, verifies the result, records it, and moves
on. Orchestrator context stays lean - no batching, no shortcuts, no "I'll
combine steps 3 and 4." The Finishing phase runs `dod-guard cover <id>` and,
on a clean result, `openspec archive`.

**When to use:**
- Plan has 5+ steps
- LLM is trying to batch, skip, or combine steps
- Complex task where each step requires focused attention
- Quality matters more than token cost

**When to skip:**
- 1-3 trivial steps - just do them
- Single file, single change
- Budget-sensitive (use cheap-step instead)

**Verification by step type:**

| Step type | Minimum verification | Common failure |
|-----------|---------------------|----------------|
| Code (logic, API, data) | Tests pass + build clean | - |
| Visual (UI, rendering, CSS) | Tests + build + **launch app** OR mark as pending manual check | "Build passes" for a visual change = unverified |
| Gameplay (physics, AI, behavior) | Tests + build + **playtest** OR mark as pending manual check | "Tests pass" for gameplay behavior = unverified |
| Config (env, settings, deps) | Config syntax valid + system starts | "File written" without validation |
| Structural (refactors, renames) | Tests + build + diff review | "No type errors" without import check |

**Key anti-pattern:** Build passes is not the same as visual/gameplay
verification. A step tagged `visual` or `gameplay` needs someone to actually
look at it, or confirm it by hand.

**Session state:** Everything lives in the committed
`openspec/changes/<id>/tasks.md` - there is no separate working-copy
session file. A stale plan (goal mismatch, every step already done, or
artifact statuses that drifted from the plan's snapshot) triggers a prompt
to the user about whether to re-resolve each task's `verify_cmd`. A valid
plan resumes from the first uncompleted task.

---

### `/dod-guard:cheap-step` - Cheap-Worker Step Execution

**What it does:** Same atomic-step discipline as step-by-step. Same
`tasks.md`, same staleness checks, same closing gate. One substitution:
implementation goes to the evomcp `solve` tool, which runs cheap DeepSeek
workers, instead of a dispatched host agent. The host model writes the
instruction, runs `verify_cmd` itself, and decides the verdict.

**When to use:**
- Multi-step plan where steps are well-specified and verifiable
- Routine implementation work (CRUD, wiring, config, mechanical refactors)
- Budget-sensitive - 90%+ cost savings vs step-by-step
- Any plan where most steps are "implement X following pattern Y"

**When to skip:**
- Visual/gameplay steps (cheap workers cannot see - those stay host-only)
- A step that needs an architectural decision (the host model should design
  it, not just verify it)
- Security-sensitive code

**Before you start:** call the evomcp `status` tool. If the proxy is not
running and no key is configured, run `/dod-guard:step-by-step` instead.

---

### `/dod-guard:ratchet` - Autonomous Sub-Problem Execution

**What it does:** Executes an existing OpenSpec change autonomously, one
sub-problem per loop iteration. Setup (interactive): recall prior attempts,
read the impact radius, decide sub-problem order, get the user to approve
it. Then an autonomous loop: one sub-problem per iteration, `dod-guard cover`
re-run every cycle so earlier work cannot silently break.

**It does not build the plan.** Requirements, the scenarios, and the spec
review all live in `/dod-guard:interview`. Run that first, then bring the
change id here.

**When to use:**
- Problem has 2+ sub-problems with dependencies between them
- Unknown unknowns - you'd burn tokens guessing
- Regression risk is real - later changes could break earlier work
- Cross-session memory would help future similar problems

**When to skip:**
- Single straightforward change
- You already have a confirmed change from interview and a linear plan - use
  `/dod-guard:step-by-step`
- Trivial config change, typo fix, mechanical rename

**What it composes:**
- **dod-guard** - the coverage gate every iteration must clear
- **gitevo** - evolutionary branching. Spawn, learn, abandon, adopt
- **evomcp** - cascade solver. Cheap model fanout, escalate stuck nodes
- **obsidian-rag** - cross-session memory. Persist learnings
- **code-review-graph** - impact analysis. Blast radius before changes

**Minimum viable ratchet:** dod-guard alone. No evomcp, no gitevo, no
obsidian-rag - but still a ratchet.

---

### `/dod-guard:adversarial-workflow` - 4-Phase Gated Quality

**What it does:** Drives one OpenSpec change through four rounds of hostile
review, each closing with a verdict recorded in the change's `design.md`.
Spec review runs first, then a test audit, then implementation review, then
structural cleanup. A round holding anything but GO blocks the next one from
starting.

**When to use:**
- Security-sensitive or mission-critical features
- User says "adversarial workflow," "gate this," "strict quality"
- Multi-step implementation where you want hard-gate verification
- After interview produces a change - run adversarial-workflow for maximum
  quality

**When to skip:**
- Trivial changes (overhead of 4-phase review > benefit)
- Prototype/exploratory work
- Single-file changes with no integration surface

**Starting point:** with no change id yet, pass the task to
`/dod-guard:interview`, which files the spec-review gate itself. With a
change id in hand, resume from `design.md`'s `## Adversarial gate` entries
instead of calling interview again. Restart at the earliest round whose
verdict is anything but GO.

**Model diversity:** the test-audit and implementation-review reviewers
should use a different model or provider than the implementation author.
Same model reviewing its own output is a rubber-stamp risk.

---

### `/dod-guard:clean-house` - Duplicate/Obsolete Code Removal

**What it does:** Finds pairs where one implementation superseded another.
Git history decides which side is dead. Rescues work that landed on the
dead side by mistake. Gets approval, then deletes.

**When to use:**
- Versioned APIs coexist (`/api/v1` + `/api/v2`)
- Files named `*-old.*`, `*-legacy.*`, `*-v2.*`, `*-new.*`
- Directories like `compat/`, `shims/`, `legacy/`, `old/`
- Rewrite shipped but old code was never deleted
- LLM keeps editing the wrong version of a feature

**Confused-model detection:** If the old file has commits dated AFTER the new
version was created, an LLM got confused and edited the wrong file. Migrate
those changes to the new version, then delete the old one.

**Hard rule:** Never keep old version "just in case." Git history IS your
safety net.

---

### `/dod-guard:tighten` - Autonomous Complexity Removal

**What it does:** Ranks the repository by structural violations joined
against git return-churn, then blind-rewrites the worst target one
invocation at a time. Opens an OpenSpec change scoped to the picked target,
closes it on `dod-guard cover` reporting zero regressions plus `openspec
archive`. Two gates must pass: the result has to be different, and it has to
be smaller.

**When to use:**
- Sweeping accidental complexity with no single named target
- Wiring a cleanup loop into a driver (`/loop`, cron) that calls it until the
  queue empties

**When to skip:**
- You already have one named rewrite target - use `/dod-guard:blind-rewrite`
  directly
- Ordinary refactoring with a known scope

---

### `/dod-guard:blind-rewrite` - Contract-Driven Rewrite

**What it does:** Deletes the target. Extracts a contract of what it does,
not how it reads, and hands that contract to an author who never sees the
original. Gates the result against the deleted copy with `overlap-scan.mjs`,
which rejects paraphrase. Four shapes: new interior behind an existing seam,
no seam yet, dependency swap, and prose with no test harness.

**When to use:**
- A previous rewrite attempt came back as a renamed variable or cosmetic edit
- "Rewrite this properly," "no cosmetic changes," "swap this library"

**When to skip:**
- Ordinary edits, bug fixes, additive features, or ordinary copy editing

---

### `/dod-guard:test-integrity-checker` - Test Integrity Audit

**What it does:** Audits a test file for tests written to match the
implementation instead of a specification. It looks for logic mirroring,
output blessing, weak assertions (`toBeDefined`/`toBeTruthy`), mock-everything
tests, symmetry or inverse tests that cancel a shared bug, and missing
negative cases. Then it repairs one file into a test backed by a
demonstrated fault.

**When to use:**
- You don't trust tests that pass
- Tests assert only truthiness, every dependency is mocked, or a round trip
  is the only check
- A mutant survived a mutation-testing pass

**When to skip:**
- Tests older than the implementation (nothing fitted to check against)
- Snapshot files (they copy output by design)

**Where a written spec exists:** measure the tests against those
requirements instead, via `/dod-guard:adversarial-workflow`'s test-audit round.

---

### `/dod-guard:doc-reconcile` - Contradiction Resolution

**What it does:** Finds documents that contradict each other. Dates each
conflicting claim from its real edit history. Deletes the older side when
the dating is decisive.

**When to use:**
- Two docs give different numbers or facts for the same thing
- "Which doc is right," docs contradict each other, stale documentation

**When to skip:**
- Uncommitted changes are pending (a claim in an uncommitted file can't be
  dated)

---

### `/dod-guard:skill-debug` - Skill Debugging From Transcripts

**What it does:** Locates every recent run of a target skill in session
transcripts. Compacts each one into a numbered trace, then aligns that
trace against what the SKILL.md required. Every proposed edit cites a step
number from a real run, never a guess from taste.

**When to use:**
- A skill ignored its own steps
- "Why did /x do that"

**When to skip:**
- Writing a brand-new skill (use `/skill-creator`)
- A bug in code the skill happened to touch, not the skill itself

---

### `/dod-guard:skill-migrate` - Skill/Agent Migration

**What it does:** Migrates a SKILL.md, agent definition, CLAUDE.md, memory
file, or instinct file to work on newer models by blind rewrite. It extracts
a behavioral contract, then sorts each instruction into scaffolding or
essential. A blind writer rebuilds the artifact from that contract. Four
automated gates - including an overlap check against the original and a gap
audit - must clear before the migration ships.

**When to use:**
- "Migrate this skill/agent," "tune for a newer model," "fix skill for
  literal models"

**When to skip:**
- Writing a new skill (`/skill-creator`) or debugging a skill from
  transcripts (`/skill-debug`)

## Cross-Skill Patterns

### Pattern 1: Interview -> Step-by-Step (Standard)

```
/dod-guard:interview     -> change opened, scenarios + test bindings written
/dod-guard:step-by-step  -> execute the plan, one atomic step at a time,
                            close on dod-guard cover + openspec archive
```

Most common pattern. Interview locks requirements. Step-by-step implements
them without batching.

### Pattern 2: Interview -> Cheap-Step (Budget)

```
/dod-guard:interview     -> change opened, scenarios + test bindings written
/dod-guard:cheap-step    -> cheap workers implement, host verifies
```

Same as Pattern 1 but 90%+ cheaper. Good for routine implementation work.

### Pattern 3: Interview -> Adversarial (Maximum Quality)

```
/dod-guard:interview              -> change opened, phase 1 gate filed
/dod-guard:adversarial-workflow   -> phases 2-4: test audit, implementation
                                     review, structural cleanup
```

Interview handles spec review. Adversarial-workflow takes over from the
test-audit round. Maximum quality for security/mission-critical features.

### Pattern 4: Interview -> Ratchet (Complex Multi-Problem)

```
/dod-guard:interview     -> change opened
/dod-guard:ratchet       -> setup (route + recall + ordering) then autonomous
                            loop, one sub-problem per iteration
```

For complex problems with interdependent sub-problems. `dod-guard cover`
re-runs every cycle to prevent regressions across sub-problem boundaries.

### Pattern 5: Adversarial with Cheap-Step Implementation

```
/dod-guard:adversarial-workflow  -> Phase 1 (spec review) GO
                                 -> Phase 2 (test audit)
                                 -> Phase 3: use /dod-guard:cheap-step for
                                   implementation
                                 -> adversarial review of cheap-worker output
                                 -> Phase 4 (structural cleanup)
```

Cost-optimized adversarial quality. Spec and tests reviewed adversarially.
Implementation offloaded to cheap workers. Cheap-worker output reviewed
adversarially.

### Pattern 6: Step-by-Step -> Clean-House (Post-Implementation)

```
/dod-guard:step-by-step  -> implement feature, possibly creating duplicate code
/dod-guard:clean-house   -> hunt and remove any duplicates created during
                            implementation
```

After a large implementation, run clean-house to catch accidental
duplicates.

## Anti-Patterns - What NOT to Do

| Anti-pattern | Why wrong | Correct approach |
|-------------|-----------|-----------------|
| Using interview for a 1-line fix | 10 min setup for 30 sec work. | Just do the fix. |
| Using cheap-step for visual/gameplay work | Cheap workers can't see. They'll substitute "build passes." | Mark visual/gameplay steps as host-only. |
| Skipping interview for non-trivial features | Wrong requirements = wrong implementation. | Interview always before non-trivial implementation. |
| Running adversarial-workflow without a change id | Nothing to gate against. | Create the change via interview first. |
| Using ratchet for a single change | Overkill. Ratchet setup costs 10-15 min. | Use step-by-step or just do it. |
| "Build passes" for visual changes | Build is not the same as visual output. | Launch the app and visually confirm, or mark as pending manual check. |
| Same model for test author + implementer | Rubber-stamp review - tests written to pass a known implementation. | Model diversity: different model for test-audit reviewers. |
| Skipping interview and writing scenarios by hand with no test binding | `dod-guard cover` reports every such scenario `unwired`, which the ratchet then treats as a regression risk the moment the baseline adopts it. | Write the `covers:` marker in the test at the same time you write the test. |
| Putting the `covers:` marker inside the function body | The scanner looks forward from the marker for a test declaration. A marker inside the body finds no declaration and binds nothing. | Place the marker on the line directly above `def test_`, `test(`, `func Test`, etc. |
| Dispatching adversarial reviewers with the same model as the author | Rubber-stamp - model agrees with itself. | Model diversity or maximally different reviewer prompts. |

## Verification Surface Reference

Not all changes verify the same way. Use this table to tag a step's
verification surface and pick the right skill:

| Surface | Examples | Can be machine-verified? | Skill compatibility |
|---------|----------|--------------------------|---------------------|
| **Code** | Logic, algorithms, data flow, API | Yes - tests, lint, build | All skills |
| **Visual** | UI, rendering, CSS, 3D, animations | Partially - build compiles, visual output needs eyes | step-by-step (manual verification, human confirmation required) |
| **Gameplay** | Physics, AI, level design, balance | Partially - unit tests, playtest for feel | step-by-step (manual verification, human confirmation required) |
| **Config** | Env vars, deps, settings | Yes - parse + start | All skills |
| **Structural** | Renames, refactors, file moves | Yes - tests + diff | All skills |

**The golden rule:** a change might modify visual output, gameplay behavior,
or anything else a human would need to look at. When it does, `/step-by-step`
flags that step for human confirmation. A passing build is not proof.

## Platform Notes

- **Windows (cmd.exe):** `verify_cmd` entries a step runs must use tools
  available on the host OS. `buildShellInvocation()` in `shell.ts` is the one
  place that knows how to reach a shell, and on Windows it produces
  `cmd.exe /d /s /c "<command>"` with `windowsVerbatimArguments: true`.
- **Globs:** `cmd.exe` doesn't expand globs. Use tools that handle their own
  globbing (Biome, ripgrep) or explicit paths.
- **Node test runner:** Outputs TAP format - never contains "tests pass."
  Check exit code, never stdout text, when scripting around `node --test`.
- **Visual verification on headless CI:** Impossible. A step tagged `visual`
  or `gameplay` needs a human in the loop, either at execution time or as a
  follow-up confirmation before the change closes.

## Summary: Skill Selection by Goal

1. **"I don't know exactly what to build"** -> `/dod-guard:interview`
2. **"Build this plan correctly, no shortcuts"** -> `/dod-guard:step-by-step`
3. **"Same as #2 but cheaper"** -> `/dod-guard:cheap-step`
4. **"Interdependent sub-problems, real regression risk"** -> `/dod-guard:ratchet`
5. **"Maximum adversarial quality"** -> `/dod-guard:adversarial-workflow`
6. **"Codebase has old/duplicate implementations"** -> `/dod-guard:clean-house`
7. **"Sweep accidental complexity, no single named target"** -> `/dod-guard:tighten`
8. **"Replace this one thing without a paraphrase"** -> `/dod-guard:blind-rewrite`
9. **"Are these tests real"** -> `/dod-guard:test-integrity-checker`
10. **"These docs disagree"** -> `/dod-guard:doc-reconcile`
11. **"This skill isn't behaving right"** -> `/dod-guard:skill-debug`
12. **"Migrate this skill/agent to a newer model"** -> `/dod-guard:skill-migrate`

When in doubt: start with interview. It's always safe, and the change it
opens can be fed to any other skill.
