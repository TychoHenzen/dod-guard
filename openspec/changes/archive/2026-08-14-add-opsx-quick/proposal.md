## Why

The full OpenSpec workflow (explore, propose with 5 artifacts, step-by-step execution) is thorough but heavy for small changes. When the user knows what they want and says "just build it," the ceremony of writing a full proposal, specs, design, tasks, and steps before touching code is disproportionate. There is no lightweight path that still keeps the OpenSpec documentation accurate. Users either skip OpenSpec entirely for small work (losing traceability) or spend more time planning than building.

## What Changes

- Add `/opsx:quick` skill that runs a minimal-ceremony development flow:
  1. Ask 2-3 clarifying questions about what the user wants
  2. Create an OpenSpec change with a lightweight proposal and tasks only (skip specs and design for small changes, include them for larger ones)
  3. Generate `steps.json` via `dod-guard steps` and hand off to `/dod-guard:step-by-step`
  4. After implementation, sync any behavioral changes back to specs via `/opsx:sync`
  5. Archive the change

## Capabilities

### New Capabilities
- `dod-guard/opsx-quick`: Skill that runs a minimal-ceremony development flow, creating just enough OpenSpec documentation to keep traceability while building quickly.

### Modified Capabilities

None.

## Impact

- One new SKILL.md file under `packages/dod-guard/skills/`
- Root marketplace entry gains one new skill
- `validate-plugins.mjs` and `check-skill-hygiene.mjs` run against the new skill directory
- No compiled code changes
