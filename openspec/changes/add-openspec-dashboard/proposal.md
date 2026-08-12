## Why

`openspec view` prints a fixed summary and exits. It reports counts, not
content. A reader cannot open a requirement, read its scenarios, see which
tasks in a change are done, or look at any project other than the one holding
the current directory. Every follow-up question costs another CLI call typed by
hand.

The data is already there. `openspec list`, `show` and `status` all emit JSON.
Nothing reads that JSON into a view a person can browse.

## What Changes

- Add a local web dashboard at `tools/openspec-dashboard/`, started with
  `node tools/openspec-dashboard/serve.mjs`. It serves on the loopback
  interface only.
- Show every registered project as a tab. A sidebar lists that project's active
  changes and specs. A detail pane opens either one.
- Open a spec down to its requirements, and each requirement down to its
  WHEN/THEN scenarios.
- Open a change to its task progress, its per-artifact state, its spec deltas
  grouped by target spec, and its task list grouped by section.
- Find other OpenSpec projects on this machine by scanning a bounded set of
  roots for an `openspec/` directory. A scan proposes candidates. The reader
  picks which ones to keep.
- Record the kept projects in a registry at `~/.openspec-dashboard/projects.json`,
  so the tabs survive a restart.
- Read only. The dashboard runs `list`, `show` and `status`, and never
  `archive`, `sync`, `validate` or `apply`. It edits no project file. The
  registry is the single file it writes, and that file is its own.

## Capabilities

### New Capabilities

- `openspec-dashboard/project-registry`: which projects the dashboard shows, how a scan
  proposes new ones, and how the registry keeps that choice across restarts.
  A scan proposes and the registry decides.
- `openspec-dashboard/cli-reader`: how the dashboard gets a project's data. It locates
  the OpenSpec CLI, runs only read commands, reuses a result until the
  project's files change, and turns a failure into a readable message.
- `openspec-dashboard/ui`: what a reader sees and can reach in the browser.
  Tabs, the change and spec lists, the detail panes, the scan panel, and the
  empty states.

### Modified Capabilities

(none - no existing capability changes behavior. The five `quality-*` specs
describe quality-guard and are untouched.)

## Impact

- New directory `tools/openspec-dashboard/`. It sits outside the `packages/*`
  workspace glob, so it never publishes and no version bump applies.
- No CI change. The quality scan runs on `packages`, Biome runs on
  `packages/*/src/` and `scripts/ci/`, and `validate-plugins.mjs` reads
  `packages/` and `plugins/`. All are scoped away from `tools/`.
- No new dependency and no build step. The dashboard runs on Node 18 or later
  with `node:http` alone.
- Requires the OpenSpec CLI installed on the machine, at a version whose
  `list`, `show` and `status` accept `--json`. Version 1.8.0 does.
- Writes one new file outside the repository, `~/.openspec-dashboard/projects.json`.
