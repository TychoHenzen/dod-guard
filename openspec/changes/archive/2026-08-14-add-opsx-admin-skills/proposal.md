## Why

The openspec CLI has commands for initialization (`openspec init`), health checks (`openspec doctor`, `openspec validate`), and this repo has a browser dashboard (`tools/openspec-dashboard/serve.mjs`). None of these are accessible as skills inside Claude Code. A user who types `/opsx:` sees explore, propose, apply, update, sync, and archive, but nothing for setting up a new project, checking system health, or opening the dashboard. The CLI commands exist but Claude Code cannot run them without a skill wrapper that grants the right tool permissions.

## What Changes

- Add `/opsx:init` skill that runs `openspec init --tools claude`, detects the project's language and framework, offers to set up a custom schema and `openspec/config.yaml` with project context, and registers the project in the dashboard.
- Add `/opsx:dashboard` skill that starts the dashboard server as a background process, reports the bound URL, checks whether it is already running, and tells the user how to stop it.
- Add `/opsx:doctor` skill that runs `openspec doctor` and `openspec validate --all --strict`, then reports findings in plain language with fix suggestions.

## Capabilities

### New Capabilities
- `dod-guard/opsx-init`: Skill that initializes OpenSpec in a project, configures the schema and project context, and registers the project in the dashboard.
- `dod-guard/opsx-dashboard`: Skill that starts and stops the openspec-dashboard server and directs the user to it.
- `dod-guard/opsx-doctor`: Skill that runs health checks on the OpenSpec setup and reports problems with fix suggestions.

### Modified Capabilities

None.

## Impact

- Three new SKILL.md files under `packages/dod-guard/skills/`
- Root marketplace entry gains three new skills
- `validate-plugins.mjs` and `check-skill-hygiene.mjs` run against the new skill directories
- No code changes to the dashboard or CLI - these skills wrap existing functionality
