## 1. Add code review gate to SKILL.md

- [x] 1.1 Add a new step to `packages/dod-guard/skills/opsx-archive/SKILL.md` after the coverage gate and before the archive command. The step runs `/code-review low` over the change's affected files.
<!-- covers: dod-guard/opsx-archive :: Code review gate before archive :: Review finds no issues -->
<!-- covers: dod-guard/opsx-archive :: Code review gate before archive :: Review finds issues -->
<!-- covers: dod-guard/opsx-archive :: Review effort level :: Review runs at low effort -->

- [x] 1.2 Add skip_specs exemption to the new step so it is skipped when `.openspec.yaml` sets `skip_specs: true`, matching the coverage gate's skip behavior
<!-- covers: dod-guard/opsx-archive :: Code review gate before archive :: Skip-specs change skips review -->

- [x] 1.3 Add scope instructions to the review step directing the agent to target only the files the change's tasks and specs identify as affected
<!-- covers: dod-guard/opsx-archive :: Review scope is the change's implementation files :: Review reads only affected files -->

## 2. Renumber and update guardrails

- [x] 2.1 Renumber the archive and summary steps so they follow the new review step

- [x] 2.2 Add a guardrail entry stating the code review is advisory (user can proceed past findings) unlike the coverage gate which is mandatory

## 3. Validate

- [x] 3.1 Run `node scripts/ci/validate-plugins.mjs` to confirm the updated SKILL.md passes plugin validation
- [x] 3.2 Run `node scripts/ci/check-skill-hygiene.mjs` to confirm the skill passes hygiene checks
