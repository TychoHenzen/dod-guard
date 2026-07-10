# Postmortem: test-fixer / test-verification Loop Inefficiency

**Date**: 2026-07-08, 15:00–18:00 (main loop), with pre-loop at 13:31 and follow-up at 20:52
**Duration**: ~3 hours of active loop time
**Impact**: 27 meaningful commits produced, but at ~5× the token/context cost it should have taken
**Status**: Resolved (work completed, inefficiency analyzed)

---

## Summary

The test-fixer and test-verification skills were run in a loop to improve test quality across the dod-guard codebase. 27 substantive commits landed — diagnostic messages added to assertions, brevity violations fixed, observability improvements, refactoring — but the session transcript weighed 6.5 MB (3,166 lines) when ~1 MB should have sufficed. The agent was trapped in a self-reinforcing inefficiency cycle: context pollution → lost state → re-doing work → more context pollution.

## Root Cause

**The skills are designed for an agent-as-orchestrator pattern (spawn subagents, coordinate state via manifest), but the agent defaulted to inline execution because hook-injected instructions consumed the context budget needed to hold both the skill instructions AND file contents simultaneously.** This created a cascade: no room for subagent prompts → inline work → re-reading files each turn → more turns → more hook injections → cycle continues.

## 5-Whys Analysis

1. **Why** did a 3-hour session produce a 6.5 MB transcript?
   → The agent re-read the same files, re-ran the same commands, and re-created the same tasks across 155+ turns.

2. **Why** did the agent re-do work instead of progressing linearly?
   → It lost track of its cycle state between turns, reverting to "Cycle 1" task creation 33 times.

3. **Why** did it lose state between turns?
   → Context was saturated with 155+ repeated hook injections of the same user instruction (~100 KB of identical text), plus inline file contents that subagents should have held.

4. **Why** was the agent doing inline work instead of spawning subagents?
   → Context pressure. When the main context is 60% hook noise + 30% file contents, there's no room for the detailed agent prompt templates the skills prescribe. The agent defaults to inline work as the only option.

5. **Why** does the hook inject on every turn instead of once per cycle?
   → The hook mechanism (`lastPrompt`) has no concept of "cycles" — it's designed for one-shot task reminders, not loop-based workflows. The skill doesn't coordinate with the hook system.

**Systemic root cause**: The skills assume the orchestrator has clean context for subagent dispatch, but the hook + inline fallback pattern creates a context starvation feedback loop.

## Contributing Factors

| Category | Factor | Systemic? | Priority |
|----------|--------|-----------|----------|
| Process | `lastPrompt` hook injects same instruction on every turn, not once per cycle | Yes | P0 |
| Process | No persistent cycle progress file — agent must reconstruct state from scratch each cycle | Yes | P0 |
| Tooling | Skill prescribes subagents but agent falls back to inline under context pressure | Yes | P1 |
| Tooling | No explicit enforcement that manifest SHA-256 (not git status) is dirty-detection source | Yes | P1 |
| Code | Full `npm test` runs used where targeted `node --test dist/X.test.js` would suffice | No | P1 |
| Process | No batching of identical mechanical fixes (e.g., "add diagnostic messages" to 5+ files) | No | P2 |
| Code | Agent re-creates TaskCreate objects instead of reading/updating existing persistent task list | No | P2 |

## What Went Well

- 27 meaningful commits landed: test quality improved, brevity violations fixed, observability anti-patterns cleaned up
- The manifest-based change detection (SHA-256 hashes) WORKED when used — files that hadn't changed were correctly skipped
- The follow-up session assessed actual improvement and prepared for publishing — loop eventually converged
- All tests remained passing throughout; no regressions were introduced

## What Went Poorly

- 155+ identical hook injections consumed ~100 KB of context with no value
- Only 3 subagent spawns across 3,166 lines — the skills prescribe one subagent PER FILE, but compaction-induced amnesia meant the agent kept re-starting from scratch instead of dispatching
- "Cycle 1" task was created/deleted/recreated 33 times instead of progressing to Cycle 2, 3, etc.
- 215 Bash calls — most were redundant `npm test` (full suite) when only 1-2 files changed per cycle
- 97 Edit operations + 135 Read operations — evidence of re-reading files after compaction
- Agent used `git status` for dirty detection despite user repeatedly instructing "manifest has sha256 hash fingerprints"

## Action Items

| Priority | Action | Type | Effort |
|----------|--------|------|--------|
| **P0** | **Add cycle state to manifest.json** — merge cycle tracking fields (phase, cycle_number, last_file_processed, files_verified/fixed) into manifest.json under a `cycle` key. Manifest is already written after every verify + fix — cycle state updates as a side effect with no extra "remember to" step. One file, always written, no separate state to forget. | Prevent | Small |
| **P0** | **Eliminate repeated hook injection** — skill writes current instruction hash to cycle.json on first cycle turn; hook checks if instruction already matches before re-injecting. Or: hook only injects on mode change, not every turn. | Prevent | Medium |
| **P1** | **Mandate manifest SHA-256 as sole dirty-detection source** — Step 1 of both skills: Read manifest.json. Compute SHA-256 of each test file. Compare to stored hashes. That's it. Never invoke `git status` for dirty detection. | Prevent | Small |
| **P1** | **Use targeted test runs during fix cycles** — After editing one test file, run only that file's tests: `node --test dist/<file>.test.js`. Only run `npm test` (full suite) at cycle boundaries (before commit). | Process | Small |
| **P2** | **Batch mechanical fixes** — When manifest shows 5+ files with the same low-dimension issue (e.g., diagnostics ≤ 6) and the fix is mechanical (add assertion messages), batch them into one subagent with a list of files. | Process | Medium |
| **P2** | **Lock task list — no re-creation** — Create tasks once at cycle start, update their status, never delete and re-create. If the agent finds itself re-creating "Cycle 1", that's a red flag to check cycle.json. | Process | Small |

## Lessons Learned

1. **Context is a budget, not a pool.** When hook noise + inline file contents consume >60% of context, the agent cannot spawn the subagents the skill prescribes. Skills must detect this and fail fast rather than silently degrade to inline mode.
2. **Cycles need persistent state.** An agent with no cycle progress file is an agent that will re-create "Step 1" every time it loses context. A 20-line JSON file prevents 1 MB of transcript.
3. **One instruction, one injection.** The hook-as-task-reminder pattern breaks down in loop workflows. The instruction is correct once; after that it's noise that consumes the budget needed to follow it.
4. **SHA-256 hashes already solved the problem.** The manifest was designed with content-addressable change detection. The agent just didn't use it. The first step of every cycle should be: "Read manifest.json, hash all test files, cross-reference."
5. **Subagents are not optional in the design.** Both skills say "spawn a subagent for each file." When context pressure prevents this, the fallback (inline) produces 5× waste. The skills must enforce this constraint rather than treat subagents as a nice-to-have.

## Information Gaps

- Was the dashboard actually broken throughout the loop, or did it recover early? The pre-loop session title was "Diagnose broken dashboard" — need to check if dashboard regeneration was a bottleneck.
- How many of the 215 Bash calls were `npm test` vs useful one-shot commands? Exact breakdown would help quantify the targeted-test-run savings.
- Did any subagent-produced fix introduce a regression? The 3 subagents that DID spawn may have done quality work while the inline fixes caused the thrash.

---
*This postmortem is blameless. It focuses on systemic improvements to the skills and tooling, not individual agent behavior.*
