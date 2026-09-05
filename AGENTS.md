# dod-guard monorepo

npm workspaces monorepo with two MCP plugins, one CLI workspace, and two
code-free plugins.

| Path | Purpose |
|---|---|
| `packages/quality-guard` | Structural scanner, staged commit gate, and quality-refactor skill. |
| `packages/code-explorer` | Read-only source navigation MCP server. |
| `packages/fossil` | Git-history and workspace-debris CLI. |
| `plugins/dod-guard` | GitHub issue delivery and repository-maintenance skills. |
| `plugins/natural-output-style` | Natural and Neurodivergent output styles. |
| `tools/openspec-dashboard` | Compatibility path for the read-only quality-report dashboard. |

Read a package's own `AGENTS.md` before changing it.

## Development commands

Run from the monorepo root:

```text
npm run clean
npm run build
npm test
npm run bundle
node scripts/ci/validate-plugins.mjs
npx @biomejs/biome check packages/*/src/ scripts/ci/ --no-errors-on-unmatched
```

Tracked bundles live at `packages/*/dist/bundle.js`. Regenerate and commit them
on the feature branch. CI reproduces generated files and fails on drift.

## GitHub delivery

Per-task requirements live in GitHub Issues. Acceptance criteria that complete
independently are sub-issues. Use the single open GitHub Project explicitly
linked to the current repository.

One parent issue maps to one `codex/<issue>-<slug>` branch and one draft pull
request. Close a code-backed sub-issue only after its commit is pushed. Keep the
parent issue and Project item In Progress until a human merges the pull request.

Agents may create and update the draft pull request. They must not approve it,
mark it ready, merge it, or close the parent issue unless the user explicitly
invokes `/complete-pr` to accept the current pull request head. That command
owns the guarded ready, auto-merge, issue confirmation, and branch deletion
flow.

`master` requires a pull request and these current checks:

- `build-test`
- `plugin-config`
- `static-analysis`
- `package-integrity`

CI has read-only repository permission. It does not commit formatting, bundles,
or ratchet baselines.

## Plugin structure

Code plugins live under `packages/` and contain `package.json`, plugin metadata,
and a tracked bundle. Code-free plugins live under `plugins/` and ship content
directly. The root `.claude-plugin/marketplace.json` lists every plugin.

`scripts/ci/validate-plugins.mjs` checks manifest agreement, frontmatter,
tracked files, JSON syntax, descriptions, and credential leaks.

## Quality dashboard

Run `quality-dashboard.cmd`. It reads `.quality/quality-report.json` from each
registered project. Refresh runs the bundled quality-guard report command and
replaces that project's saved report. Other report views only read saved data.

## Release boundary

Nothing publishes to npm. Merge the reviewed pull request, wait for CI, then
refresh the consuming plugin cache. Do not copy bundles into runtime caches.
