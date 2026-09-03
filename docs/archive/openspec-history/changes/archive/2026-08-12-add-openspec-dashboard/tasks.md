## 1. Reading the OpenSpec CLI

- [x] 1.1 Write the CLI locator. Prefer `OPENSPEC_JS` from the environment,
      otherwise read the `openspec` launcher off the search path and take the
      entry file named on its last line.
- [x] 1.2 Make the server refuse to start when the locator finds nothing, with
      a message naming `OPENSPEC_JS`.
- [x] 1.3 Write the runner. Spawn `process.execPath` with the entry file, in a
      given project directory, and parse stdout as JSON.
- [x] 1.4 Restrict the runner to the reporting commands: `list`,
      `list --specs`, `show --type spec`, `show --type change` and `status`.
      Refuse anything else.
- [x] 1.5 Turn a non-zero exit or unparseable output into a readable failure
      rather than an exception that reaches the browser.

## 2. Caching

- [x] 2.1 Write the newest-modification-time walk over a project's `openspec/`
      directory.
- [x] 2.2 Memoize a runner result against the project path, the command, and
      that modification time. Drop the entry when the time moves.
- [x] 2.3 Add an explicit refresh that clears every entry for one project.

## 3. Registry and scanning

- [x] 3.1 Write the registry reader and writer for
      `~/.openspec-dashboard/projects.json`. Treat an unparseable file as
      empty.
- [x] 3.2 Seed a missing registry with the current directory, but only when it
      holds an `openspec/` directory.
- [x] 3.3 Write the scan. Walk each configured root to a bounded depth, skip
      `node_modules`, `.git`, `dist` and `build`, and record a directory
      holding an `openspec/` child without descending into it.
- [x] 3.4 Default the roots to the developer directories that exist under the
      home directory, and skip a configured root that is absent.
- [x] 3.5 Mark a candidate the registry already lists, and make adding it again
      a no-op.
- [x] 3.6 Implement add and remove. Removing deletes the registry entry and no
      project file.
- [x] 3.7 Report a registered project whose `openspec/` directory is gone as
      missing, without dropping it from the registry.

## 4. Task file parsing

- [x] 4.1 Parse `tasks.md` into sections from `## N. <name>` headings.
- [x] 4.2 Parse each `- [ ] X.Y <text>` and `- [x] X.Y <text>` item, keeping
      its identifier, text and checked state, including continuation lines.
- [x] 4.3 Report an absent or unparseable task file as absent, so the change
      still renders.

## 5. HTTP server and API

- [x] 5.1 Start `node:http` bound to the loopback interface, on a preferred
      port, falling forward to a free one. Print the address.
- [x] 5.2 Serve `public/` with the right content type per extension.
- [x] 5.3 Add `GET /api/projects`, returning each registry entry with its name,
      path and whether it is still readable.
- [x] 5.4 Add `GET /api/project/:id/overview`, merging `list --json` and
      `list --specs --json`.
- [x] 5.5 Add `GET /api/project/:id/spec/:specId`.
- [x] 5.6 Add `GET /api/project/:id/change/:changeId`, merging the change
      deltas, the artifact status, and the parsed tasks.
- [x] 5.7 Add `POST /api/scan` and `POST /api/projects` for scanning and for
      adding or removing entries.
- [x] 5.8 Resolve `:id` as a registry index and reject one outside the
      registry. Ignore any directory path a request supplies.

## 6. Browser interface

- [x] 6.1 Build the page shell: a tab bar, a sidebar, and a detail pane.
- [x] 6.2 Render one tab per project, with a single selected tab and a control
      that opens the scan panel.
- [x] 6.3 Render the sidebar's two groups with their counts, and wire the
      filter to narrow both.
- [x] 6.4 Render a spec: its purpose, then each requirement as a block that
      opens to reveal its scenarios.
- [x] 6.5 Render a change: task progress, artifact state chips, deltas grouped
      by target spec with the operation labelled, and tasks grouped by section.
- [x] 6.6 Draw a task's completion box as a state rather than an input, so no
      click writes anything.
- [x] 6.7 Render the scan panel: candidates with the registered ones marked,
      and an explicit add.
- [x] 6.8 Render the empty states and the unreadable-project state.

## 7. Documentation and verification

- [x] 7.1 Write `tools/openspec-dashboard/README.md`: how to start it, what it
      requires, where the registry lives, and that it never writes to a
      project.
- [x] 7.2 Check the dashboard's numbers against the CLI for this repo: 5 specs,
      1 active change, 14 requirements in `quality-structural-scan`, and 0 of
      33 tasks across 8 sections in `adopt-openspec-for-dod-proofs`.
- [x] 7.3 Confirm a scan lists candidates, that adding one adds a tab, and that
      the tab survives a restart.
- [x] 7.4 Confirm the repository is otherwise untouched, and that the quality
      scan and `validate-plugins.mjs` report nothing under `tools/`.
