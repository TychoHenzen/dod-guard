---
name: opsx-init
description: Initialize OpenSpec in a project, configure its workflow schema and project context, and register it in the openspec-dashboard. Use when the user says "initialize openspec", "set up openspec", "init openspec", "get openspec running here", or asks to onboard a project onto the spec-driven workflow. Detects whether the project already has an openspec/ directory, offers the dod-guard-spec-driven schema when no custom schema exists, detects the tech stack from manifest files, and registers the project with the dashboard.
---

# opsx-init

Wraps `openspec init` plus dod-guard's own schema and dashboard conventions.
Run every step below in order. Report the outcome of each before moving to
the next.

## 1. Project detection

Check whether the target directory has an `openspec/` subdirectory.

**No `openspec/` directory (fresh project):** Run `openspec init --tools
claude`. Report the structure it created (the directories and files
`openspec init` reports on stdout). Then delete `.claude/commands/opsx/`
if it exists - `openspec init --tools claude` generates generic opsx
slash commands there, but dod-guard's own `opsx-*` skills replace them.

**`openspec/` already exists:** Do not re-run `openspec init`. Instead
report what is already set up:
- The active schema, read from `openspec/config.yaml`.
- The spec count: number of `spec.md` files under `openspec/specs/`.
- The change count: number of directories under `openspec/changes/`.

Then offer to reconfigure the schema or the project context instead of
re-initializing. Continue only if the user wants to.

## 2. Schema setup

Check `openspec/schemas/` in the target project.

**No `openspec/schemas/` directory exists:** Offer to copy the
`dod-guard-spec-driven` schema in. If the user accepts:
1. Locate the schema source. It ships at
   `openspec/schemas/dod-guard-spec-driven/` inside the dod-guard
   installation. Resolve that directory in this order, using the first
   that exists:
   - The plugin install: alongside this SKILL.md, at
     `../../openspec/schemas/dod-guard-spec-driven/` relative to
     `packages/dod-guard/skills/opsx-init/`.
   - A development checkout: `openspec/schemas/dod-guard-spec-driven/` at
     the dod-guard repo root, when running from a `dod-guard` source
     checkout rather than an installed plugin.
2. Copy that directory into the target project's
   `openspec/schemas/dod-guard-spec-driven/`.
3. Set `schema: dod-guard-spec-driven` in the target project's
   `openspec/config.yaml`.

If the user declines, leave the default `spec-driven` schema in place and
continue to context configuration.

**A schema already exists in `openspec/schemas/`:** Report its name. Do not
overwrite it, and do not offer the copy.

## 3. Project context configuration

Detect the tech stack by reading manifest files at the project root, in
this order: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, and
any `*.csproj` file.

**A manifest is found:** Read the manifest to detect the language, the
test command, and the build command. For each stack, use the same
lightweight approach: find the manifest, extract the build and test
commands it declares, and name the language. Show the proposed `context`
block for `openspec/config.yaml` to the user before writing it. Write
it only if the user accepts.

**No recognizable manifest is found:** Ask the user to describe the tech
stack. Write what they say into the `context` field of
`openspec/config.yaml`.

## 4. Dashboard registration

Read `~/.openspec-dashboard/projects.json`. Each entry has a `path` field
holding the project's absolute path with forward slashes.

**The project's path is not listed:** Add an entry `{ "name": <directory
basename>, "path": <absolute project path, forward slashes> }` to the
`projects` array. Create the file (and its `roots` array, empty is fine)
if it does not exist. Report that the project is now visible in the
dashboard.

**The project's path is already listed:** Report that it is already
registered. Do not add a duplicate entry.

Also report whether the dashboard server is reachable. Probe the
listening ports, since the server has no PID file:

- Windows: `netstat -ano | findstr "440"` (checks the 4400-4420 range the
  server picks from).
- macOS/Linux: `lsof -i :4400-4420` or `ss -ltn | grep -E ':44(0[0-9]|1[0-9]|20)'`.

If a port in that range answers, report the dashboard is running and give
its URL (`http://localhost:<port>`). If none do, report it is not running
and that `/opsx:dashboard` starts it.

## 5. Completion summary

Print one summary covering all four outcomes:

```
OpenSpec init summary
  Root:      <openspec/ path>
  Schema:    <active schema name>
  Context:   <configured | not configured, and why>
  Dashboard: <registered (new) | already registered>, server <running at URL | not running>

Next: run /opsx:propose to create your first change, or /opsx:guide for a walkthrough.
```

Suggest `/opsx:propose` when the user has something specific to build, and
`/opsx:guide` when they want an overview of the workflow first.
