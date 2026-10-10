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

- overall score, file count, and high, medium, and low finding counts;
- expandable files with rule, severity, line, and message;
- repository-level findings in a "Project findings" section, unscored and counted in the severity totals;
- architecture findings grouped by category;
- filtering across paths, rules, and messages.

A report saved by an older quality-guard (schemaVersion 1) is not rendered;
the tab asks you to press Refresh to regenerate it.

If the quality-guard bundle that Refresh runs is itself outdated and still
writes schemaVersion 1, Refresh does not save that report. The message names
the bundle path Refresh ran and says it is outdated, so pressing Refresh again
will not help until that bundle is updated.

Refresh regenerates the report with the repository's quality-guard scanner,
writes it to the project's ignored `.quality/` directory, and displays it.
`Code Explorer` runs inside the dashboard process for the selected readable
project. Its browser and API use the dashboard's existing loopback listener.

Projects qualify when they contain `.quality/quality-report.json`. The `+`
button scans configured roots for more projects. Registry state remains in
`~/.openspec-dashboard/projects.json` for compatibility with existing installs.

## Local checks

```text
npm run test:quality-dashboard
```
