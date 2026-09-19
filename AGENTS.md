# dod-guard monorepo

npm workspaces monorepo with three MCP plugins, one CLI workspace, and two
code-free plugins.

| Path | Purpose |
|---|---|
| `packages/quality-guard` | Structural scanner, staged commit gate, and quality-refactor skill. |
| `packages/code-explorer` | Read-only source navigation MCP server. |
| `packages/knowledge-base` | Persistent Markdown-backed knowledge retrieval MCP server. |
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

Agents may create and update the pull request. Before merging, they must invoke
`/complete-pr` as the final acceptance gate: verify the current head, linked
child acceptance, review remediation, required checks, and cleanup conditions.
That command owns the guarded ready, auto-merge, issue confirmation, and branch
deletion flow; it is a verification gate, not a separate human-approval stop.

Functional changes to `master` require a pull request and these current checks.
An explicitly invoked maintenance-only `/publish` may push a version-bumped
commit directly to `master` without a PBI or PR. Require its parent to equal
the saved `master` SHA and use `--force-with-lease` pinned to that SHA. This is
still a fast-forward, and the lease rejects any intervening update. Require
`allow_force_pushes` to be enabled. Temporarily disable only admin enforcement,
restore every saved protection setting immediately, and wait for all required
checks before refreshing plugin caches. Other users remain subject to the
branch rules:

- `build-test`
- `plugin-config`
- `static-analysis`
- `package-integrity`

CI has read-only repository permission. It does not commit formatting, bundles,
or ratchet baselines.

Do not add arbitrary wall-clock timeouts that kill long-running agents,
advisors, reviewers, or delivery tasks. Wait for authoritative terminal state;
retain only provider/resource safety limits or an explicit user cancellation.

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

Nothing publishes to npm. Functional changes use a reviewed pull request and
green CI. A maintenance-only `/publish` release can skip the PBI and PR, use
the bounded force-with-lease fast-forward to `master`, and refresh the consuming
plugin cache after CI passes. Do not copy bundles into runtime caches.
