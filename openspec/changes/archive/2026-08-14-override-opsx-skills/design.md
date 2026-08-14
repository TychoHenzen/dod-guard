## Context

Six generated OpenSpec skills live under `.claude/skills/openspec-*`. They call `openspec` CLI commands and work generically. The dod-guard monorepo has a custom `dod-guard-spec-driven` schema, a `steps.json` execution pipeline, scenario-coverage verification via `dod-guard cover`, and specialized worker agents. The generated skills do not use any of this.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Six dod-guard-aware skills under `packages/dod-guard/skills/` that replace the generated versions
- Each skill calls `openspec` CLI commands for the parts OpenSpec owns (scaffolding, status, instructions, validation, archiving)
- Each skill calls `dod-guard` CLI commands for the parts dod-guard owns (steps generation, coverage checks)
- Each skill bridges to the appropriate dod-guard skill where one exists (step-by-step, interview)

**Non-Goals:**
- No changes to the `openspec` CLI or the `dod-guard` CLI
- No changes to the existing dod-guard skills (step-by-step, interview, etc.)
- No new agent definitions - these are single-skill SKILL.md files
- No compiled code changes

## Decisions

### Keep the generated skills' CLI integration pattern

The generated skills call `openspec status --json`, `openspec instructions --json`, and other CLI commands to discover artifact state and instructions. The overrides keep this pattern. The dod-guard-specific additions layer on top: `dod-guard steps` for steps generation, `dod-guard cover` for coverage checks.

Alternative: Build the skills to call dod-guard's MCP tools instead of the CLI. Rejected because dod-guard registers no MCP tools (its `index.ts` starts the server with an empty tool list). The CLI is the interface.

### Apply routes to step-by-step, not direct implementation

The generated `/opsx:apply` loops through task checkboxes and implements them inline. The override routes to `/dod-guard:step-by-step` instead. Step-by-step dispatches typed workers (implementer, tdd-implementer, debugger, build-fixer), runs `verify_cmd` after each step, and commits per step. This is the implementation path the monorepo already uses.

Alternative: Keep the generated apply behavior for small changes and route to step-by-step only for large ones. Rejected because the user wants a single consistent path.

### Delete the generated skills rather than overriding in place

The generated skills live in `.claude/skills/openspec-*`. The overrides live in `packages/dod-guard/skills/opsx-*`. Both ship to the user's Claude Code environment through different paths (the generated ones via `openspec init --tools claude`, the overrides via the dod-guard plugin). To avoid confusion, the generated ones are deleted from this repo. The `openspec` CLI may regenerate them in other projects. In this repo, dod-guard owns the workflow.

### Explore coexists with interview

`/opsx:explore` is a thinking partner for when the user has a vague idea. `/interview` is structured requirements gathering. Explore suggests interview as a handoff when the exploration produces concrete acceptance criteria. They serve different moments and both survive.

## Risks / Trade-offs

[Slash-command name collision] -> The generated skills use `openspec-explore` as the SKILL.md `name`, with `opsx:explore` as an alias set outside the SKILL.md (by the `.claude/skills/` directory convention). The overrides use `opsx-explore` as the SKILL.md `name`. If both exist, the user sees duplicate entries. Deleting the generated versions prevents this.

[Store support] -> The generated skills carry a `--store <id>` pattern for standalone OpenSpec repos. The overrides keep this pattern from the generated text. It costs nothing and supports a feature some users need.
