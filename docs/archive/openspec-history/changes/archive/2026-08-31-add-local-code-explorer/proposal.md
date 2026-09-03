## Why

The planned Code Explorer service gives agents bounded semantic navigation, but it has no human-facing view. A local browser can expose the same one-symbol workflow as searchable panes and a small one-hop graph without adding a whole-project diagram or duplicating the navigation core.

## What Changes

- Add `code-explorer serve` as a second package mode that starts one project-scoped HTTP server on `127.0.0.1`, validates its exact local Host and API Origin, prints its URL, and opens the default browser unless `--no-open` is present.
- Add a vanilla TypeScript browser with search and landmarks, one bounded source focus, lazy semantic relation groups, Back and Forward history, freshness controls, and a localized SVG graph.
- Give every browser tab an exclusive-Web-Lock session that survives reload, rotates after tab duplication, and expires at 30 minutes of inactivity.
- Reuse the Code Explorer application core directly. Do not proxy raw MCP or create a second navigation implementation.
- Make the packaged plugin installable through both the existing Claude marketplace and a Codex local marketplace. A fresh Codex task must discover the same five read-only MCP tools without separate manual MCP registration.
- Replace the generic MCP tool description with operation-specific descriptions, and return every success or error envelope through MCP `structuredContent` while preserving the JSON text item for older clients.
- Add deterministic browser automation through a pinned Node-18-compatible Playwright release, plus live Rust, Python, and C# practice sequences.
- Keep authentication, CORS, project selection, multiple-project tabs, editing, diagnostics, agent-follow mode, and the OpenSpec dashboard link outside this change.

## Capabilities

### New Capabilities

- `code-explorer/browser-server`: Project-scoped loopback launch, HTTP boundary, per-tab sessions, asset delivery, and stable failure behavior.
- `code-explorer/browser-navigation`: Search, landmarks, focus, lazy relations, history, freshness, and mouse-driven pane interaction over the shared navigation core.
- `code-explorer/local-graph`: A bounded one-hop SVG view that shows only the current symbol and relations the user has explicitly loaded.

### Modified Capabilities

None. The navigation service capabilities remain unchanged and become dependencies of this browser view.

## Impact

- Extends the planned `packages/code-explorer` workspace with an HTTP entry mode, browser assets, and a browser-facing adapter over its application core.
- Adds the Codex plugin manifest and local-marketplace metadata beside the existing Claude plugin manifest, with installation smoke coverage for both runtimes.
- Improves MCP discovery metadata and adds native structured results without removing the existing JSON text response.
- Adds a browser build target and a pinned Playwright development dependency while keeping the shipped runtime compatible with Node 18.
- Adds fake-adapter browser tests and required live practice coverage for the existing Rust, Python, and C# fixture projects.
- Does not modify `tools/openspec-dashboard`, its UI capability, or any other package.
