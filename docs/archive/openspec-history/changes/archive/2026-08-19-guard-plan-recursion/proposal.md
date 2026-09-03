## Why

`/opsx-continue` read a proposal's description of its own draft state as a
statement about what the change delivers, and wrote a plan whose tasks were
"write the plan".

The run that showed it: `stage-0-latent-core` in a downstream project. The
proposal opened "This change is a planning pass. It produces a concrete
implementation plan, not the implementation itself." The skill wrote six
correct spec deltas describing code behavior, then a `tasks.md` whose whole
first wave wrote a planning document, with no `covers:` annotation on any
item. The run had already closed the change's open decisions with the user,
then wrote tasks telling a later worker to close them again in a document.

Nothing caught it. `openspec validate --strict` passed. `dod-guard cover`
adopts a scenario the baseline has never seen at its current outcome, so a
new change with every scenario unwired exits 0.

The word "plan" in the skill invited the reading. The skill said "plan
`tasks.md` in waves" and "already fully planned", which makes a plan sound
like an output the change produces rather than the change itself.

## What Changes

- `/opsx-continue` states an invariant above all its sections: an OpenSpec
  change never delivers a plan, because the change is the plan. A proposal
  calling itself a planning pass describes its draft state, which
  `openspec status` already reports.
- The skill never writes a task whose deliverable is a plan. Content the
  proposal lists as a planning document belongs in the run's own artifacts.
- The skill's wording stops treating a plan as an output. "Plan `tasks.md`"
  becomes "expand `tasks.md`", "fully planned" becomes "complete". Terms
  naming a real API field or exit code keep their spelling.
- `dod-guard cover` gains a plan-unbound exit code. A change-scoped run
  whose groups are all expanded, whose deltas carry scenarios, and whose
  plan binds none of them, exits with it.

## Capabilities

### Modified Capabilities

- `dod-guard/opsx-continue` - the invariant and the wording rule
- `dod-guard/coverage-gate` - the plan-unbound exit code

## Impact

- `packages/dod-guard/skills/opsx-continue/SKILL.md`
- `packages/dod-guard/src/cli.ts`, `src/cover/run.ts`, `src/cover/run.test.ts`
- `openspec/schemas/dod-guard-spec-driven/schema.yaml`
- Exit-code tables in both `CLAUDE.md` files

A skill that branches on cover's exit code sees a new value. The existing
codes keep their meanings, so a skill that checks only 0, 1, 3 and 4 reads
plan-unbound as a non-zero failure rather than as a wrong outcome.
