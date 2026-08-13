## Context

These are skill files (SKILL.md) that wrap existing CLI commands and the dashboard server. No compiled code. The ambiguity is in three areas: where the skills live, how the init skill detects the tech stack, and how the dashboard skill manages a background process inside Claude Code.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Three discoverable skills under `packages/dod-guard/skills/`
- Each skill grants `Bash(openspec:*)` or the shell permissions it needs
- The init skill produces a working `openspec/config.yaml` with project-specific context

**Non-Goals:**
- No changes to the dashboard server code or the OpenSpec CLI
- No agent definitions - these are single-skill SKILL.md files
- No compiled code or test files - skills are instruction text

## Decisions

### Skills live under `packages/dod-guard/skills/`, not `.claude/skills/`

The `.claude/skills/` directory holds the generated openspec-* skills that ship with the OpenSpec CLI. The new admin skills ship with the dod-guard plugin, so they go under `packages/dod-guard/skills/` alongside existing skills like `interview/`, `step-by-step/`, and `ratchet/`.

Alternative: Put them in `.claude/skills/`. Rejected because that directory is for generated skills that the OpenSpec CLI manages. Manually authored skills belong to the package that ships them.

### Dashboard process detection uses port probing, not PID files

The dashboard skill checks whether a process is listening on ports 4400-4420 rather than writing a PID file. The dashboard server already picks the next free port in that range when 4400 is taken. Probing matches the server's own behavior and requires no changes to the dashboard code.

Alternative: Write a PID file on start, read it on status check. Rejected because that requires changing the dashboard server, and stale PID files cause false positives after crashes.

### Init skill detects tech stack from manifest files, not from file extensions

Reading `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, and `*.csproj` gives precise information about the runtime, test framework, and dependencies. Counting file extensions gives only the language.

### Schema copy is from the plugin installation, not hard-coded

The init skill reads `openspec/schemas/dod-guard-spec-driven/` from the dod-guard plugin's own installation directory and copies it into the target project. This keeps the schema current with whatever version of dod-guard the user has installed.

## Risks / Trade-offs

[Dashboard process detection is platform-dependent] -> The port-probing command differs between Windows (`netstat`) and Unix (`lsof` or `ss`). The skill instruction text must handle both. `buildShellInvocation` in `src/shell.ts` is not available to skills, so the skill text carries the platform branch.

[Schema copy assumes the plugin is installed] -> The init skill resolves the schema from the dod-guard plugin directory. When dod-guard is not installed as a plugin (e.g., running from a development checkout), the path is different. The skill text checks both locations.
