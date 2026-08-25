---
name: adversarial-workflow
description: Drive one piece of work through a 4-phase review and record a gate at each stage. Use when the user asks for the adversarial workflow, says "gate this", asks for strict quality, asks for a full adversarial pass, asks for an adversarial review or a 4-phase review, or wants gates at each stage of spec, tests, implementation, and cleanup. Use it too when the user raises a quality or security concern about multi-step implementation work. Reviewers run without the author's reasoning and must produce findings. The product is four GO/REVISE/STOP verdicts recorded in the change's design.md, plus the working feature.
---
# Adversarial workflow

Drive one unit of work through four rounds of hostile review, each closing with a
verdict recorded in `openspec/changes/<change-id>/design.md`. Those four entries plus
the working feature are the output. Delegate the building and spend your own turns
judging what comes back. Scope is that single change: another change, or writing the
code yourself, sits outside it.

## Agent dispatch compatibility

### Codex lifecycle

Before a Codex dispatch, inspect the active agent list. Reuse a related agent when practical.

Limit each parallel wave to the free agent slots. Wait for the wave, record every result, then close completed agents with the runtime's close action when available. If only interruption is available, interrupt agents whose work is no longer needed.

Do not assume a returned result freed a slot. If capacity is full, release unneeded agents and retry once. If closure is unavailable, reuse an existing agent through a follow-up instead of spawning another.

Resolve `<agent-definitions-dir>` before dispatching a dod-guard agent. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/agents`. In Codex, use the `agents` directory beside the parent `skills`
directory that contains this loaded `SKILL.md`.

For every `dod-guard:<name>` dispatch:

- Claude uses `dod-guard:<name>`.
- Codex uses `dod_guard_<name>`, with hyphens converted to underscores, when that custom agent is
  registered.
- If the Codex custom agent is unavailable, read `<agent-definitions-dir>/<name>.md` completely.
  Spawn `explorer` when its `tools` omit `Write` and `Edit`. Spawn `worker` otherwise.
  Include the definition body and task briefing in the spawn message.
- Preserve every clean-context, model-separation, dispatch-cap, and return-shape rule below.

## Before you start

You need a confirmed OpenSpec change id. No change means no work. Route to
`/dod-guard:interview` or `/opsx:propose`, then come back. Every run of this skill
works against `openspec/changes/<change-id>/`, and every gate it files lands in that
change's `design.md`.

## Starting point

With no change id yet, pass the task to `/dod-guard:interview`, which collects
requirements, writes the spec delta's scenarios, opens the change and files the phase 1
gate in its `design.md`. Halt it there rather than letting it pass work onward, then
carry on at phase 2 yourself.

With a change id in hand, resume from the record rather than calling
`/dod-guard:interview`, whose second run yields a separate change. Read
`openspec/changes/<change-id>/design.md` for its `## Adversarial gate` entries. Entries
sit in write order, so find each through its `phase` field rather than its index, and
restart at the lowest phase whose verdict is anything but `GO`. Phase 1 holding
`REVISE` returns to `/dod-guard:interview` rather than moving to phase 2, and a
`design.md` with no phase 1 entry gets that spec round run here rather than later.
`/dod-guard:interview`, `/dod-guard:clean-house`, and
`/dod-guard:test-integrity-checker` all feed work in. Interview and clean-house
can hand off at phase 2, so accept that as a start.

## Round by round

**Phase 1, spec.** Send the five spec lenses across the requirements and the tree. Then run a
negative control: pick the lens that reported least, hand it the real spec with one flaw
seeded inside that lens's own territory, and see whether it names the flaw. Skip the control
after a `STOP`, on a spec under roughly 20 lines, or once this change has seen two. A lens
that misses its seeded flaw earns one repeat on a stronger model, and `summary` names that
lens. File the gate at `phase: 1` last, so the control result reaches its `summary`.

**Phase 2, test.** Secure tests from a party that has not read the implementation, settling
that before auditing starts. Send the test auditor across its three lenses, one dispatch
each, and file the gate at `phase: 2`.

**Phase 3, implementation.** Delegate the build to `/dod-guard:step-by-step`, which
halts at steps done, tests green, and build clean, since the judging falls to you.
Send the saboteur, the new hire, and the spec auditor across the diff, run
the dod-guard `cover` tool (with `cwd` and `changeId`) over the change's spec deltas, and file the gate at
`phase: 3`. If a critical finding should survive this run, record it in the
change's `design.md` summary and in the final report. Do not create a separate
project-local rules file.

**Phase 4, structural.** Lift ready proof commands for the project's language from
`standards/structural-gates.md` in this package, and run each one directly before trusting
it, so you know it can still report failure. For a language that file omits, author the
command, watch it fail on a broken file and pass on the real tree, then return the working
section there. Record each proof's outcome as a finding in the phase 4 gate entry, the same
shape phases 1 through 3 use. Audit, mend what the findings name, audit again, and quit
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
| not Claude, such as an external executor | any Claude model | `opus` |

`opus` is both the saboteur's default and its floor, so leave it there rather than trading
down. Independence spans reviewer models, phase 2 test authorship and the closing report
alike, and any piece of it you cannot secure goes into the recorded `summary` as the gap it
is. Where a gap is recorded, describe the review as partly dependent rather than calling it
independent.

Each agent file already fixes its persona, checklist, finding floor and output shape. Omit all
of that instead. Send three things: the lens name, the user's request copied word for word,
and the material under review, each spelled out in full. When the work under review traces to
an OpenSpec change, add a fourth: its spec deltas. Use the `specs/` markdown under
`openspec/changes/<change-id>/`, or the JSON from `openspec show <change-id> --json
--deltas-only`. Withhold that fourth item from the new hire lens alone - it reads the diff
cold, with no prior context. Handing it spec deltas would erase the lens that makes it useful. Reviewers
see none of this conversation, so paste what they need rather than citing where it sits. A reviewer answers
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
user immediately.

File every round yourself by appending a `## Adversarial gate` entry to
`openspec/changes/<change-id>/design.md`, `REVISE` rounds included. Before appending a
phase N entry, confirm every lower-numbered phase already has an entry reading `GO`;
if one is absent or short of `GO`, stop and return to that phase instead of filing this
one out of order.

```markdown
## Adversarial gate

phase: 3
verdict: REVISE
lenses:
  - lens: Saboteur
    mandatory_minimum_met: true
    findings:
      - severity: critical
        target: src/auth/token.ts:42
        problem: Expired tokens still validate.
        suggestion: Compare exp with the clock before returning.
        evidence: token.test.js passes with exp in the past
  - lens: New hire
    mandatory_minimum_met: true
    findings: []
summary: One critical in token checks. Saboteur opus, other lenses sonnet.
```

After appending, re-read `design.md` and confirm the entry landed and every phase up to
this one reads in order. Nothing polices phase order automatically, so this read-back is
the only check there is.

## Finishing

After phase 4 closes at `GO`, call the dod-guard `cover` tool with `cwd`
set to the workspace root and `changeId` set to the change id. It checks
each scenario in the change's spec deltas against the coverage baseline.
No regressions means every scenario matches or improves. A regression or
error means stop here: report it and do not archive.

On exit 0, run `openspec archive <change-id> --yes`. It merges the change's spec deltas
into `openspec/specs/` and moves the change under `changes/archive/`. Run archive
without asking the user first, the cover check is the approval.

Close out by reporting the change id, all four verdicts with their finding counts, the
cover and archive outcome, the `design.md` path, and every phase where independence came
up short.
