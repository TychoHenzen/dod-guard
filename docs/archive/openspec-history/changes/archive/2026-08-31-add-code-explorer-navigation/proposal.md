## Why

Agents currently navigate code by guessing names, searching broad file sets, and reading more source than the current question needs. A focused Code Explorer MCP service can provide IDE-like navigation with explicit state, bounded symbol views, and discoverable project landmarks across Rust, Python, and C#.

## What Changes

- Add a focused `code-explorer` npm workspace and marketplace MCP plugin, separate from `dod-guard` and `openspec-dashboard`.
- Add read-only MCP tools for fuzzy symbol search, bounded symbol focus, handle-based relation following, navigation history, and service status.
- Add evidence-ranked project landmarks so an agent can discover important project concepts without guessing search terms.
- Add semantic adapters for Rust, Python, and C# that treat language-server results as authoritative.
- Add explicit freshness, exclusion, dirty-file, and unresolved-edge reporting.
- Run a bounded Serena-versus-Symbols spike against the recorded DeepSeekCustom examples before selecting or building the production semantic adapter.
- Exclude the localized browser, dashboard link, code editing, rename, completion, diagnostics, and agent-follow mode from this change.

## Capabilities

### New Capabilities

- `code-explorer/mcp-navigation`: Read-only focus views, visible-symbol handles, relation following, and explicit navigation history.
- `code-explorer/symbol-discovery`: Fuzzy search, deterministic ranking, bounded refinement, and filters for paths, languages, symbol kinds, tests, production, and generated content.
- `code-explorer/project-landmarks`: Evidence-ranked project concepts and grouped entry points that replace guessed search terms without relying on raw word frequency.
- `code-explorer/language-adapters`: Semantic navigation and readiness contracts for Rust, Python, and C# language servers.
- `code-explorer/workspace-freshness`: Saved-file freshness, explicit refresh, exclusions, dirty-file state, and index identity reporting.

### Modified Capabilities

None. The existing `openspec-dashboard` capabilities remain unchanged.

## Impact

- Adds a new workspace under `packages/code-explorer` with its own package manifest, plugin manifest, MCP configuration, source, tests, and tracked distribution bundle.
- Adds the plugin to the root marketplace and npm workspace lock data.
- Adds runtime integration with semantic navigation dependencies selected by the bounded spike.
- Adds package tests, bundle smoke coverage, plugin validation coverage, and Rust, Python, and C# practice projects or fixtures.
- Does not modify the existing OpenSpec dashboard server or UI.
