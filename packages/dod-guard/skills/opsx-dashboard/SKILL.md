---
name: opsx-dashboard
description: Start, stop, or open the OpenSpec dashboard. Use when the user says "open dashboard", "start dashboard", "show dashboard", "show me the openspec dashboard", "stop dashboard", or "dashboard status". The dashboard is a read-only browser view over every registered OpenSpec project, served by tools/openspec-dashboard/serve.mjs on the loopback interface.
argument-hint: [stop]
---

# OpenSpec dashboard

This skill wraps `tools/openspec-dashboard/serve.mjs`, a Node HTTP server that
binds to `127.0.0.1` on the first free port from 4400 to 4419. It never
touches a remote host and it never needs a build step.

## 1. Locate the script

Resolve `serve.mjs` before doing anything else. Try these in order and use
the first path that exists:

1. `<monorepo root>/tools/openspec-dashboard/serve.mjs`, where the monorepo
   root is the nearest ancestor of the current working directory that
   contains `tools/openspec-dashboard/serve.mjs`.
2. `<dod-guard plugin install directory>/tools/openspec-dashboard/serve.mjs`,
   where the plugin install directory is wherever this skill itself is
   running from (the `dod-guard` plugin checkout, typically under
   `~/.claude/plugins/cache/dod-guard/<sha>/`).

If neither path exists, tell the user the dashboard script could not be
found and stop. Do not guess a third location.

## 2. Detect whether a dashboard is already running

The server logs its port to stdout on startup
(`OpenSpec dashboard on http://127.0.0.1:<port>`), but once it is running in
the background you only have the OS to ask. Scan the loopback range
4400-4419 for a listener, using whatever the platform provides:

Windows (PowerShell or cmd):
```
netstat -ano | findstr "127.0.0.1:44"
```

macOS/Linux:
```
lsof -iTCP -sTCP:LISTEN -P | grep ':44'
```
or, where `lsof` is unavailable:
```
ss -ltnp | grep ':44'
```

A hit in range 4400-4419 bound to 127.0.0.1 means a dashboard is already
running on that port. Treat only ports in that range as this dashboard;
ignore unrelated listeners.

Run the platform-appropriate command for the machine you are on. Do not run
a Unix command on Windows or vice versa: it will fail or hang rather than
report "not running".

## 3. `/opsx:dashboard` with no argument (start or report)

1. Run the port detection command.
2. If a port is already listening in range 4400-4419: report that URL
   (`http://127.0.0.1:<port>`) as the running dashboard. Do not start a
   second instance.
3. If nothing is listening: start the server in the background from the
   resolved script path.
   - Windows: `start /b node "<path to serve.mjs>"` or launch it as a
     detached background process so it survives the current command
     finishing.
   - macOS/Linux: `node "<path to serve.mjs>" &` or an equivalent detached
     background launch.
   Then read the port from the server's startup line
   (`OpenSpec dashboard on http://127.0.0.1:<port>`). If the startup line
   was not captured, re-run the port detection command a moment later.
   Report the URL it bound to.
4. Check the registry at `~/.openspec-dashboard/projects.json` for whether
   the current project (its OpenSpec root, the directory holding
   `openspec/`) is already registered (its `projects[].path` list).
   - If it is registered: tell the user the URL and that they can browse
     this project's specs there.
   - If it is not registered: tell the user the URL, and offer to register
     the current project before pointing them at it. Registration means
     adding an entry `{ "name": <directory basename>, "path": <absolute
     project path, forward slashes> }` to the `projects` array in
     `~/.openspec-dashboard/projects.json`. Create the file (with an
     empty `roots` array) if it does not exist.

## 4. `/opsx:dashboard stop`

1. Run the port detection command to find a listener in range 4400-4419.
2. If nothing is listening: tell the user no dashboard was found running
   and stop. There is nothing to do.
3. If a listener is found: read its process id from the detection output.
   On Windows that is the last column of `netstat -ano`. On Unix it is the
   PID column of `lsof` or `ss`. Then stop the process.
   - Windows: `taskkill /PID <pid> /F`
   - macOS/Linux: `kill <pid>`
4. Re-run the detection command once more to confirm nothing is listening
   in that range. Report to the user that the dashboard was stopped. If it
   is still listening, report that the stop did not take effect rather than
   claiming success.

## Notes

- The dashboard is read-only over project specs; it never edits a project's
  `openspec/` tree. Registering a project only adds an entry to
  `~/.openspec-dashboard/projects.json`.
- Never open a browser window yourself. Report the URL and let the user open
  it.
- `OPENSPEC_DASHBOARD_PORT` overrides the server's start port. When that
  variable is set, widen the detection range to start there instead of
  4400.
