# quality-guard

`quality-guard` separates fast write feedback from the decision that accepts a commit.

## Decision layers

| Layer | Purpose | What it does not prove |
| --- | --- | --- |
| PostToolUse hook | File-local feedback after a supported source write. It checks normal hard bounds and a read-only baseline. | Repository reachability, dependency boundaries, staged architecture, or commit readiness. |
| `quality-guard check --staged` | Authoritative staged decision. It compares the index with `HEAD`, checks structural and architectural evidence, and returns `PASS`, `REVIEW_REQUIRED`, or `FAIL`. | That CI has accepted the commit. |
| Architecture acknowledgement | Records a reviewer reason and author for a review finding. The record is valid only for the current staged fingerprint. | A different staged source snapshot. |
| CI committed-tree replay | Runs the same decision against a committed tree and its first parent. | Unrelated repository checks. |

Run the staged decision before committing:

```bash
quality-guard check --staged --json
```

`quality-guard report --root=<repository>` regenerates the dashboard report
for a repository and writes the JSON result to standard output. It is
read-only with respect to the repository.

For a responsibility-moving refactor, provide a repository-relative responsibility map:

```bash
quality-guard check --staged --intent refactor --target .quality/responsibility-map.json --json
```

`PASS` exits 0, `FAIL` exits 1, `REVIEW_REQUIRED` exits 2, and a usage error exits 3.

## Optional Git-hook wiring

The shipped PostToolUse hook is optional feedback for compatible agent runtimes. A repository may also wire its own Git pre-commit hook to run `quality-guard check --staged`. That hook is a convenience only. CI remains authoritative because it replays `quality-guard check --committed HEAD --json` from Git objects.

Codex discovers the plugin hook from `hooks/hooks.json`. After installation or an update, review and trust the hook in `/hooks`; Codex does not run a new plugin hook before that trust step.

## MCP tools

The server exposes `quality_scan`, `quality_report`, `quality_gate`, `quality_skips`, and `quality_commit_gate`.
`quality_report` scores every supported source file under the repository root and adds an unscored current-state
architecture audit. Use `quality_commit_gate` when an MCP client needs the same staged decision as the command line.
