## 1. The plan-unbound gate

- [x] 1.1 Add `EXIT_PLAN_UNBOUND = 5` to `src/cli.ts` beside `EXIT_PLAN_INCOMPLETE`, and name it in the cover usage text
- [x] 1.2 Add `checkPlanBound` to `src/cover/run.ts` as a sibling of `checkPlanComplete`, returning the plan-unbound code when a change-scoped run has every group expanded, at least one scenario, and no item naming one
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A finished plan naming nothing is refused -->
- [x] 1.3 Wire `checkPlanBound` into both `checkPlanComplete` call sites, after the plan-incomplete check so an unexpanded group is reported first
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An unexpanded group is reported before an unannotated plan -->
- [x] 1.4 Pin that a plan naming its scenario passes even before any test binds it
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A plan is judged on its own annotations, not on tests -->
- [x] 1.5 Pin that a change with no spec deltas is not refused
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A change with no spec deltas is not refused -->
- [x] 1.6 Pin that an `--all` run never exits with the plan-unbound code
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An --all run skips the check -->
- [x] 1.7 Pin that a change with no `tasks.md` is not judged, since it has no plan yet
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: A change with no tasks.md is not judged -->
- [x] 1.8 Pin that an annotation naming a scenario outside the change does not satisfy the check
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: An annotation naming a scenario the change does not have is not enough -->

- [x] 1.9 Report the annotation count and the expected format when a plan's annotations named nothing
<!-- covers: dod-guard/coverage-gate :: cover refuses a finished plan that names none of its scenarios :: Annotations that named nothing are reported with the expected format -->

## 2. The invariant in opsx-continue

- [x] 2.1 Replace the intro of `skills/opsx-continue/SKILL.md` with the invariant: a change is the plan, a proposal's self-description is its draft state, no task's deliverable is a plan, and the change delivers what its spec deltas describe
- [x] 2.2 Add the wave coherence stop to the tasks section: when the deltas carry scenarios and no item in the wave binds one, report the scenarios and the drafted items and ask before writing
- [x] 2.3 Apply the wording pass across the skill, so filling in `tasks.md` is expanding it and a change with every artifact present is complete, leaving `planningHome` and the plan-incomplete code spelled as they are
- [x] 2.4 Add the reinforcing sentence to the `proposal` instruction in `openspec/schemas/dod-guard-spec-driven/schema.yaml`

## 3. Documentation and release

- [x] 3.1 Add the plan-unbound code to the exit-code descriptions in the root `CLAUDE.md` and `packages/dod-guard/CLAUDE.md`
- [x] 3.2 Run the full gate set and rebaseline the coverage gate for the new scenarios
- [x] 3.3 Verify against the run that produced this, by covering `stage-0-latent-core` with the rebuilt binary
