## Context

See `proposal.md` for the why. This document records the technical findings the
approach rests on, and the choices made because of them.

Three findings came out of probing the OpenSpec CLI at version 1.8.0 on this
machine.

**The CLI cannot be spawned by name on Windows.** `execFile("openspec", ...)`
fails with `ENOENT`, because `openspec` on the search path is a shell script
with no extension. `execFile("openspec.cmd", ...)` fails with `EINVAL`, because
Node refuses to spawn a batch file without a shell. The call that works is
`execFile(process.execPath, [<entry file>, ...])`, where the entry file is the
`.js` path named on the last line of `openspec.cmd`.

**Each CLI run costs about 860ms.** Most of that is Node startup plus module
loading, so it is a fixed cost per run rather than a cost that scales with the
project. A project's view needs several runs, so an uncached dashboard with
four projects would take many seconds to paint.

**`openspec show --type change --json` returns no tasks.** Its keys are `id`,
`title`, `deltaCount`, `deltas` and `root`. `openspec list --json` gives a
change's completed and total counts but no task text. Nothing reports the text
of an individual task.

## Goals / Non-Goals

**Goals:**
- One reading path. Every number the dashboard shows comes from the CLI's own
  JSON, so the two cannot disagree.
- Adding a project is a decision, never a side effect of scanning.
- The dashboard cannot damage a project, by construction rather than by care.

**Non-Goals:**
- Editing anything through the browser. Archive, sync and task completion stay
  in the CLI and the skills.
- Running `openspec validate`. It is safe, but slow across many projects, and
  the dashboard is for reading.
- Publishing as a plugin. This is a local tool, not a sixth package.
- Serving to anything but this machine. No authentication is designed, because
  nothing off the loopback interface can reach it.

## Decisions

### The tool lives in `tools/`, not in `packages/`

Root `package.json` sets `workspaces` to `packages/*`. A directory under
`tools/` is therefore not a workspace, gets no version, and never publishes.
Every CI gate is scoped away from it as well: the quality scan runs on
`packages`, Biome runs on `packages/*/src/` and `scripts/ci/`, and
`validate-plugins.mjs` reads `packages/` and `plugins/`.

Alternative considered: a sixth package that is both an MCP server and a
dashboard. Rejected. `smoke-bundle.mjs` requires a working MCP handshake, so
that route means writing MCP tools whose only purpose is to satisfy a gate.
The dashboard needs no MCP surface.

### The CLI is resolved by reading its launcher, not by hardcoding a path

The launcher on the search path names the real entry file on its last line.
Reading it back gives the entry path on any machine, rather than the one this
design was written on. An environment variable overrides the search, which
covers a non-standard install.

Alternative considered: spawn through a shell so the launcher resolves itself.
Rejected. It reintroduces shell quoting on a platform where this repo has
already been burned by it, and this repo's own rule is to never hand-roll
shell escaping.

### Caching is keyed on modification time, not on a timer

A time-to-live either serves stale content or throws away good content. The
newest modification time under a project's `openspec/` directory answers the
real question: did anything change. That tree holds a few dozen small files, so
walking it is far cheaper than the 860ms a CLI run costs.

Alternative considered: watching the file system. Rejected as more machinery
than a tree this small justifies.

### A project is addressed by registry position

A request from the browser names a project by its index in the registry, never
by a directory path. So no request can point the CLI at an arbitrary directory,
even though the server runs a child process for every read.

### Task text is parsed from the task file

No reporting command exposes it, and the format is stable and simple: a section
heading, then checkbox items carrying an identifier. Parsing it is the only way
to show a task list, and the parse is contained in one module.

Alternative considered: show only the completed and total counts the CLI
already gives. Rejected. Seeing which task is next is a main reason to open a
change at all.

### No dependencies and no build step

`node:http` serves the pages and the API. The front end is plain HTML, CSS and
JavaScript. Editing a file and reloading the page is the whole loop, which
matches how this repo's scanner scripts are written.

## Risks / Trade-offs

- Scanning the disk is slow or noisy -> bound it. Search only configured roots,
  stop at a fixed depth, skip dependency and build directories, and stop
  descending once a directory is found to be a project.
- The CLI's JSON shape changes in a later version -> every field the dashboard
  reads was checked against 1.8.0 output. A missing field renders as absent
  rather than crashing the pane, and a read failure is reported as a message.
- The task file format drifts -> the parser fails soft. A change whose tasks
  cannot be parsed still renders with its progress counts, which come from the
  CLI rather than from the parse.
- Cached content looks stale after an external edit -> modification time
  catches an ordinary edit, and an explicit refresh covers anything it misses.
