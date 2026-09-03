## Context

See proposal.md - Why. The failing run is `stage-0-latent-core` in a
downstream project, session 2a8182cc.

Two facts constrain where the fix can live. The downstream project runs
OpenSpec's built-in `spec-driven` schema, not `dod-guard-spec-driven`, so a
schema-only fix would not have reached it. And `openspec validate --strict`
passed on the bad `tasks.md`, so validation cannot carry the check either.

## Goals / Non-Goals

Goals: stop the skill reading a proposal's draft-state description as a
deliverable, and give the repository a mechanical check that does not depend
on a model reading prose.

Non-goals: fixing `/opsx-propose` and `/opsx-quick`, which author specs and
tasks in one pass and can leak the same way. Neither has a failing run.

## Decisions

**The invariant goes above the sections, not inside one.** The failing run
recovered mid-way, writing correct spec deltas while saying "these describe
the code surface, not the planning documents", and then relapsed when it
wrote `tasks.md`. A rule placed at artifact creation would have missed the
place it bit. Stating it as the skill's opening frame covers both.

**The wording changes with the rule.** The skill said "plan `tasks.md` in
waves" and "already fully planned". That phrasing makes a plan sound like an
output the change produces. Leaving it in place next to a rule that says the
opposite invites the next reader to follow the phrasing. Names that identify
an interface, `planningHome` and the plan-incomplete code, keep their
spelling; renaming them would break the reference they exist to make.

**The gate fires only on a fully expanded plan.** Alternative considered:
fire whenever a wave binds no scenario. Rejected because an early wave may
legitimately build scaffolding that binds nothing, and a gate with a real
false positive gets waived rather than fixed. A plan with every group
expanded and nothing bound has no such reading.

**The gate mirrors `checkPlanComplete`.** Same shape, same two call sites,
same precedence: a plan problem outranks the coverage outcome. Building it
as a sibling keeps one pattern in `run.ts` rather than two.

## Risks / Trade-offs

A skill branching on cover's exit code sees a new value -> the existing codes
keep their meanings, so a caller checking only 0, 1, 3 and 4 reads
plan-unbound as a non-zero failure rather than as a wrong outcome.

The gate cannot fire in CI -> `check-coverage-gate.mjs` runs `--all`, which
skips both plan checks. Unit tests are the only enforcement, the same
trade-off the plan-incomplete check already documents.

Prose cannot be tested -> the skill rules are checked by review and by
`check-skill-hygiene`, not by a scenario. The gate is what carries proof.
