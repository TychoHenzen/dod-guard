# Quality dashboard

A local browser for `.quality/quality-report.json` files.

## Run

From this repository root:

```text
quality-dashboard.cmd
```

The server prints its address, normally `http://127.0.0.1:4400`. It binds only
to loopback and takes the next available port when needed.

## Views

Each registered project is a tab. The selected report shows:

- overall score, file count, errors, and warnings;
- expandable files with rule, severity, line, and message;
- architecture findings grouped by category;
- filtering across paths, rules, and messages.

Refresh regenerates the report with the repository's quality-guard scanner,
writes it to the project's ignored `.quality/` directory, and displays it.
`Code Explorer` remains available for the selected readable project.

Projects qualify when they contain `.quality/quality-report.json`. The `+`
button scans configured roots for more projects. Registry state remains in
`~/.openspec-dashboard/projects.json` for compatibility with existing installs.

## Local checks

```text
npm run test:quality-dashboard
```
