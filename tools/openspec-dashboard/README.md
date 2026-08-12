# OpenSpec dashboard

A local web view of your OpenSpec projects. `openspec view` prints counts and
exits. This opens the same data in a browser, so you can read a requirement's
scenarios, see which tasks are done, and hold several projects at once.

## Run it

```bash
node tools/openspec-dashboard/serve.mjs
```

It prints the address it bound, normally `http://127.0.0.1:4400`. When that
port is taken it takes the next free one and prints that instead. It listens on
the loopback interface only.

## What you need

- Node 18 or later.
- The OpenSpec CLI on your search path. Version 1.8.0 works.

No dependencies and no build step. Edit a file and reload the page.

## What it shows

Each registered project is a tab. Inside a tab, the sidebar lists that
project's active changes and its specs, with a filter above them.

- A **spec** opens to its purpose and its requirements. Open a requirement to
  read its scenarios.
- A **change** opens to its task progress, the state of each planning artifact,
  its spec deltas grouped by the spec they target, and its tasks grouped by
  section.

Press `+` in the tab bar to scan for more projects. Press `Refresh` to re-read
the current project from disk.

## It never writes to a project

Every command it runs reports state: `list`, `show` and `status`. It runs no
`archive`, no `sync` and no `apply`, and the reader refuses any command outside
that set. Task boxes are drawn as a state, not as an input, so clicking one
does nothing.

The one file it writes is its own registry, at
`~/.openspec-dashboard/projects.json`. That file holds the roots a scan
searches and the projects the tabs show. Removing a project deletes its entry
there and touches nothing inside the project.

## Scanning

A scan searches the configured roots, three levels down, and treats any
directory holding an `openspec/` child as a project. It skips `node_modules`,
`.git`, `dist`, `build`, and other dependency or output directories. It only
proposes. Nothing reaches the registry until you add it.

The default roots are the developer directories that exist under your home
directory. Edit the `roots` list in the registry file to change them.

## Settings

| Variable | Effect |
|---|---|
| `OPENSPEC_JS` | Path to the CLI's `bin/openspec.js`. Set this when the dashboard cannot find the CLI. |
| `OPENSPEC_DASHBOARD_PORT` | Preferred port. Default 4400. |

## Notes on the design

Spawning `openspec` by name fails on Windows. The extensionless shim gives
`ENOENT`, and the `.cmd` launcher gives `EINVAL`, because Node will not spawn a
batch file without a shell. Both launchers name the real entry file, so the
dashboard reads that path back and runs it with its own node.

One CLI run costs about 860ms, nearly all of it node startup. So a result is
reused until the newest modification time under the project's `openspec/`
directory moves. Walking that small tree is far cheaper than running the
command again.

A request names a project by its position in the registry, never by a path. So
no request can point the CLI at a directory you did not register.
