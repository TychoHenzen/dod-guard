---
name: adversarial-workflow
description: Drive one piece of work through a 4-phase review and record a gate at each stage. Use when the user asks for the adversarial workflow, says "gate this", asks for strict quality, asks for a full adversarial pass, asks for an adversarial review or a 4-phase review, or wants gates at each stage of spec, tests, implementation, and cleanup. Use it too when the user raises a quality or security concern about multi-step implementation work. Reviewers run without the author's reasoning and must produce findings. The product is four dod_adversarial_gate records against one dod_id.
argument-hint: [task description or dod_id]
---

# Adversarial workflow

You delegate the building and you do the reviewing. Your product is four
`dod_adversarial_gate` records, phases 1 to 4, against one `dod_id`, plus the
implemented feature. Everything below exists to keep those records honest.

## Where to start

You get one of two entries.

1. A task and no `dod_id`. Delegate to `/dod-guard:interview`. That skill
   gathers requirements, builds the tree, reviews the spec, calls `dod_create`,
   and records the phase 1 gate itself. Stop it before it hands work to an
   executor, because you are the executor. Then start at phase 2.
2. A `dod_id`. Do not run interview. A second run builds a second DoD.

To read gate state, open the stored document at
`~/.claude/dod-store/<dod_id>.json`, or under `$DOD_STORE_DIR` when that
variable is set. Look at `adversarial_gates`. Match entries by their `phase`
field, because the array is ordered by recording time. Start at the lowest
phase whose verdict is not `GO`. A recorded `REVISE` at phase 1 sends the work
back to `/dod-guard:interview`, never forward to phase 2.

If the document carries no phase 1 gate at all, run the spec review here.
`dod_import`, a hand-built `dod_create`, and any DoD older than the gate
feature all land in that state.

`/dod-guard:interview` and `/dod-guard:clean-house` send work here at phase 2.
`/dod-guard:ratchet` and `/dod-guard:test-integrity-checker` also route here.

## Dispatching reviewers

| Phase | Lens | Agent |
|---|---|---|
| 1 Spec | Security | `subagent_type: "dod-guard:adversarial-security"` |
| 1 Spec | Assumptions, Testability, Consistency, Implementability | `subagent_type: "dod-guard:adversarial-spec-reviewer"` |
| 2 Test | Coverage, Falsifiability, Gap detection | `subagent_type: "dod-guard:adversarial-test-auditor"` |
| 3 Implementation | Saboteur | `subagent_type: "dod-guard:adversarial-saboteur"` |
| 3 Implementation | New hire | `subagent_type: "dod-guard:adversarial-new-hire"` |
| 3 Implementation | Spec audit | `subagent_type: "dod-guard:adversarial-spec-auditor"` |

Each agent already carries its own persona, its checklist, how many findings it
owes you, and its output format. Never restate any of that in a prompt. Give a
dispatch only the lens name, the user's original request word for word, and the
material under review, all as literal text. These agents cannot see this
conversation. Never point one at an earlier message.

Every reviewer returns findings or one `NO_FINDINGS:` line with a reason. A
reply carrying neither is not a pass. Re-dispatch that reviewer.

`subagent_type` names an agent, not a model. Passing `sonnet` or `opus` there
fails, because the model is a separate parameter on the same call.

| Model that produced the work | Route reviewers to |
|---|---|
| opus | sonnet, with the saboteur left on opus |
| sonnet | opus or haiku, with the saboteur left on opus |
| haiku | sonnet or opus |
| a non-Claude model, such as a cheap worker from `/dod-guard:cheap-step` | any Claude model, with the saboteur on opus |

A reviewer sharing a model with the author shares its blind spots. Never route
the saboteur below `opus`, which is its own default. When two genuinely
distinct models are not reachable, write that into the recorded `summary` and
do not claim independent review.

## Verdicts and the gate record

Count severities across every lens in the phase. This rule covers all four
phases.

| Counts for the phase | Verdict |
|---|---|
| 0 critical and at most 2 major | `GO` |
| 1 or more critical, or 3 or more major | `REVISE` |
| any blocker | `STOP` |

Phase 3 is the one exception. It carries three reviewers rather than two, so it
takes `GO` at up to 3 major, and `REVISE` at 4 or more.

Severity counts are not the only bar. Every reviewer owes you a minimum number
of findings, and the agent states its own. The saboteur owes 2. The others owe
1. A reviewer that came in under its minimum sets `mandatory_minimum_met` to
`false` for that lens, and any `false` forces `REVISE` whatever the counts say.
A reviewer that found nothing real says so with `NO_FINDINGS:` and a reason,
which does meet the minimum.

On `REVISE`, fix what the findings name, then dispatch that phase again. Cap
this at 3 rounds per phase, then take it to the user. On `STOP`, go to the user
at once.

Record every phase with `dod_adversarial_gate`, including a `REVISE`. A finding
severity is `critical`, `major`, `minor`, or `blocker`.

```json
{
  "dod_id": "6f1c...",
  "phase": 2,
  "verdict": "REVISE",
  "lenses": [
    {
      "lens": "Coverage",
      "mandatory_minimum_met": true,
      "findings": [
        {
          "severity": "critical",
          "target": "R3 email verification required",
          "problem": "No test exercises the unverified-email path",
          "suggestion": "Assert login rejects an account with verified=false",
          "evidence": "test-auth.ts:89"
        }
      ]
    },
    { "lens": "Falsifiability", "mandatory_minimum_met": true, "findings": [] }
  ],
  "summary": "1 critical coverage gap on R3, tests written before the code"
}
```

The tool refuses to record phase N while an earlier phase is missing or not
`GO`. It answers with a line starting `ERROR: Cannot record Phase`, naming the
earlier phase and its state, and stores nothing. A successful call lists all
four phases with their verdicts, so read that reply back after each recording.

`dod_check` does not enforce phase order. To make the DoD itself refuse to pass
until the gates are `GO`, add a leaf with predicate
`{"type": "adversarial", "value": 3}` for phase 3, which needs no `command`.
`{"type": "convergence"}` takes no value and always reads phase 4.

## The four phases

### Phase 1, Spec

Dispatch the five lenses from the table over the requirements and the tree.

Then test one reviewer before you trust the set. Take the lens that returned
the fewest findings, breaking a tie in favour of Security. Send it the real
spec again with one flaw planted inside its own subject. Give Security a
credential read from an environment variable and logged. Give Assumptions a
requirement that silently expects a sorted input. Give Testability a
requirement worded so no command could falsify it. Give Consistency a second
requirement contradicting an earlier one. Give Implementability a call into a
module the project does not depend on.

A reviewer that misses its planted flaw is not reading. Dispatch it once more
on a stronger model, and write `Negative control: <lens> missed` into the
`summary`. A reviewer that catches it earns `Negative control: <lens> passed`.
Skip this when the phase already reached `STOP`, when the spec is under about
20 lines, or when you have already run it twice on this `dod_id`.

Record the gate at `phase: 1`.

### Phase 2, Test

The tests have to come from a party that never saw the implementation. Arrange
that before you audit. When you cannot, say so in the `summary` and do not
claim the audit is independent. Then dispatch the test auditor three times,
once for coverage, once for falsifiability, once for gap detection. Record the
gate at `phase: 2`.

### Phase 3, Implementation

Delegate the building to `/dod-guard:step-by-step` or to
`/dod-guard:cheap-step`. Both stop at "all steps complete, tests pass, build
clean", precisely because you review afterwards. Then dispatch the saboteur,
the new hire, and the spec auditor over the diff. Run a full `dod_check` on the
`dod_id` here. Record the gate at `phase: 3`.

A `critical` finding here is worth keeping past this run. Save it with
`memory_save` at `type: "project"`, or with `evo_learn` when gitevo is running.
Never invent a local rules file for it.

### Phase 4, Structural

Add structural proofs to the tree with `dod_add_node`. Where the tree already
holds a draft placeholder for one, use `dod_refine` at `mode: "concretize"`
instead. Copy the ready-made proof JSON for the project's language from
`standards/structural-gates.md` in this package.

Run each proof before you add it. A proof that cannot fail is worse than no
proof, because it makes this phase converge on nothing. For a language that
file lacks, write the proof, point it at a file you have deliberately broken,
and confirm it fails. Then confirm it passes on the real tree. Add the working
section back to that file so the next run inherits it.

Then audit and fix what the findings name. Audit again. Stop when two audits in
a row produce no new `critical` and no new `major` finding. Give up after 3
audits and take what is left to the user. Record the gate at `phase: 4`.

## Reporting

Report the `dod_id` and the four verdicts with their finding counts. Report the
final `dod_check` verdict and the markdown path. Name every phase where you
could not reach model diversity or an independent test author.
