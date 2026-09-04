## Why

A user who types `/opsx:` sees 9+ skills (after the admin and override changes land) and has no idea which one to use, what order they go in, or what the overall lifecycle looks like. The OpenSpec CLI has no tutorial mode. The skill descriptions are one-liners that assume the user already knows the system. The existing `/opsx:explore` is a thinking partner, not a teacher. There is no entry point that answers "I installed this plugin, now what?"

## What Changes

- Add `/opsx:guide` skill that provides interactive guidance on the OpenSpec + dod-guard workflow:
  - Maps the user's intent ("I want to build something", "I want to understand my specs", "I want to fix something") to the right skill
  - Shows the full lifecycle diagram: explore -> interview/propose -> apply/step-by-step -> cover -> archive
  - Explains what each skill does, when to use it, and what it produces
  - Points at the dashboard for reading specs
  - Walks through a worked example using the current project's actual specs and changes
  - Answers questions about concepts: scenarios, capabilities, changes, deltas, coverage, archiving

## Capabilities

### New Capabilities
- `dod-guard/opsx-guide`: Interactive tutorial and guidance skill that teaches the OpenSpec + dod-guard workflow, maps user intent to the right skill, and walks through worked examples.

### Modified Capabilities

None.

## Impact

- One new SKILL.md file under `packages/dod-guard/skills/`
- Root marketplace entry gains one new skill
- `validate-plugins.mjs` and `check-skill-hygiene.mjs` run against the new skill directory
- No compiled code changes
