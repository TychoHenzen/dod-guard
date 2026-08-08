---
name: adversarial-workflow
description: Drive one piece of work through a 4-phase review and record a gate at each stage. Use when the user asks for the adversarial workflow, says "gate this", asks for strict quality, asks for a full adversarial pass, asks for an adversarial review or a 4-phase review, or wants gates at each stage of spec, tests, implementation, and cleanup. Use it too when the user raises a quality or security concern about multi-step implementation work. Reviewers run without the author's reasoning and must produce findings. The product is four dod_adversarial_gate records against one dod_id.
argument-hint: [task description or dod_id]
---
# Adversarial workflow

Drive one unit of work through four rounds of hostile review, each closing with a
`dod_adversarial_gate` record on one shared `dod_id`. Those four records plus the working
feature are the output. Delegate the building and spend your own turns judging what comes
back. Scope is that single `dod_id`: another tree, or writing the code yourself, sits outside it.

## Starting point

With no `dod_id` yet, pass the task to `/dod-guard:interview`, which collects requirements,
builds the tree, reviews the spec, calls `dod_create` and files the phase 1 gate. Halt it
there rather than letting it pass work onward, then carry on at phase 2 yourself.

With a `dod_id` in hand, resume from the record rather than calling `/dod-guard:interview`,
whose second run yields a separate DoD. Load `~/.claude/dod-store/<dod_id>.json`, or that
file under `$DOD_STORE_DIR` when the variable is set, and read `adversarial_gates`. Entries
sit in write order, so find each through its `phase` field rather than its index, and restart
at the lowest phase whose verdict is anything but `GO`. Phase 1 holding `REVISE` returns to
`/dod-guard:interview` rather than moving to phase 2, and a document with no phase 1 entry
gets that spec round run here rather than later. `/dod-guard:interview`,
`/dod-guard:clean-house`, `/dod-guard:ratchet` and `/dod-guard:test-integrity-checker` all
feed work in, and the first two hand off at phase 2, so accept that as a start.

## Round by round

**Phase 1, spec.** Send the five spec lenses across the requirements and the tree. Then run a
negative control: pick the lens that reported least, hand it the real spec with one flaw
seeded inside that lens's own territory, and see whether it names the flaw. Skip the control
after a `STOP`, on a spec under roughly 20 lines, or once this `dod_id` has seen two. A lens
that misses its seeded flaw earns one repeat on a stronger model, and `summary` names that
lens. File the gate at `phase: 1` last, so the control result reaches its `summary`.

**Phase 2, test.** Secure tests from a party that has not read the implementation, settling
that before auditing starts. Send the test auditor across its three lenses, one dispatch
each, and file the gate at `phase: 2`.

**Phase 3, implementation.** Delegate the build to `/dod-guard:step-by-step` or
`/dod-guard:cheap-step`, each of which halts at steps done, tests green and build clean,
since the judging falls to you. Send the saboteur, the new hire and the spec auditor across
the diff, run `dod_check` over the whole `dod_id`, and file the gate at `phase: 3`. Any
`critical` finding here outlives the run through `memory_save` at `type: "project"`, or
through `evo_learn` where gitevo runs. Use one of those two rather than inventing a
project-local rules file.

**Phase 4, structural.** Attach structural proofs with `dod_add_node`, or sharpen an existing
draft placeholder with `dod_refine` at `mode: "concretize"`. Lift ready proof JSON for the
project's language from `standards/structural-gates.md` in this package, and execute each
proof before attaching it, so you know it can still report failure. For a language that file
omits, author the proof, watch it fail on a broken file and pass on the real tree, then
return the working section there. Audit, mend what the findings name, audit again, and quit
once two consecutive audits surface no fresh `critical` and no fresh `major`. Past 3 audits,
escalate the remainder to the user. File the gate at `phase: 4`.

## Lenses, agents and dispatches

| Phase | Lens | `subagent_type` |
|---|---|---|
| 1 | Security | `dod-guard:adversarial-security` |
| 1 | Assumptions, Testability, Consistency, Implementability | `dod-guard:adversarial-spec-reviewer` |
| 2 | Coverage, Falsifiability, Gap detection | `dod-guard:adversarial-test-auditor` |
| 3 | Saboteur | `dod-guard:adversarial-saboteur` |
| 3 | New hire | `dod-guard:adversarial-new-hire` |
| 3 | Spec audit | `dod-guard:adversarial-spec-auditor` |

| Author | Reviewer model | Saboteur model |
|---|---|---|
| `opus` | `sonnet` | `opus` |
| `sonnet` | `opus` or `haiku` | `opus` |
| `haiku` | `sonnet` or `opus` | `opus` |
| not Claude, such as a `/dod-guard:cheap-step` worker | any Claude model | `opus` |

`opus` is both the saboteur's default and its floor, so leave it there rather than trading
down. Independence spans reviewer models, phase 2 test authorship and the closing report
alike, and any piece of it you cannot secure goes into the recorded `summary` as the gap it
is. Where a gap is recorded, describe the review as partly dependent rather than calling it
independent.

Each agent file already fixes its persona, checklist, finding floor and output shape. Omit all
of that instead. Send three things: the lens name, the user's request copied word for word,
and the material under review, each spelled out in full. Reviewers see none of this
conversation, so paste what they need rather than citing where it sits. A reviewer answers
with findings or with one `NO_FINDINGS:` line and a reason, and any other shape counts as a
failed dispatch worth sending again. `subagent_type` picks the agent, while the model travels
on its own parameter of the same call, so a model name inside `subagent_type` errors out.
Budget 5 dispatches at phase 1 plus at most 1 negative control, then 3 at phase 2 and 3 at
phase 3. A repeated round costs the full set again, to a limit of 3 rounds per phase.

## Verdict and record

Total the severities over all lenses in the round. A finding reads `critical`, `major`,
`minor` or `blocker`. Zero critical with 2 major or fewer gives `GO`. One critical or more,
or 3 major or more, gives `REVISE`. A single blocker gives `STOP`. Phase 3 carries three
reviewers instead of two, so it alone allows `GO` up to 3 major and turns `REVISE` at 4 or more.

Each agent file names a finding floor: 2 for the saboteur and 1 for every other reviewer. A
lens under its floor takes `mandatory_minimum_met: false`, and one `false` anywhere drives
the round to `REVISE` even where the severities alone would allow `GO`. A `NO_FINDINGS:` line
with a reason clears the floor. On `REVISE`, mend what the findings name and rerun that
round, to a limit of 3 rounds, then bring the remainder to the user. On `STOP`, reach the
user immediately. File every round with `dod_adversarial_gate`, `REVISE` rounds included.

```json
{
  "dod_id": "<dod_id>", "phase": 3, "verdict": "REVISE",
  "lenses": [
    { "lens": "Saboteur", "mandatory_minimum_met": true, "findings": [
      { "severity": "critical", "target": "src/auth/token.ts:42",
        "problem": "Expired tokens still validate.",
        "suggestion": "Compare exp with the clock before returning.",
        "evidence": "token.test.js passes with exp in the past" } ] },
    { "lens": "New hire", "mandatory_minimum_met": true, "findings": [] }
  ],
  "summary": "One critical in token checks. Saboteur opus, other lenses sonnet."
}
```

The tool turns down phase N while any lower-numbered phase is absent or short of `GO`. It
answers with a line that opens `ERROR: Cannot record Phase`, naming that phase and its state.
It stores nothing. A call that lands lists all four phases with their verdicts, so read the
answer after every filing. `dod_check` polices no phase order itself. To make the DoD withhold
a pass until the gates read `GO`, add a leaf with predicate
`{"type": "adversarial", "value": 3}` for phase 3, which carries no `command`.
`{"type": "convergence"}` takes no value and always reads phase 4.

Close out by reporting the `dod_id`, all four verdicts with their finding counts, the closing
`dod_check` verdict, the markdown path, and every phase where independence came up short.
