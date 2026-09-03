## Why

The OpenSpec dashboard already identifies the selected registered project, while the planned Code Explorer requires an explicit project-root launch. A small server-owned bridge can connect those views without accepting a browser-supplied launch path or adding code-navigation behavior to the dashboard.

## What Changes

- Add a `Code Explorer` action beside `Refresh` for the selected readable project.
- Open a placeholder browser tab synchronously, start or reuse one dashboard-managed Code Explorer child for that project, and navigate the tab after the child prints a validated loopback URL.
- Bind each index to a registry revision and an unguessable dashboard capability before the server resolves the project.
- Discover only a validated Code Explorer package entry from `CODE_EXPLORER_JS` or the packaged monorepo bundle, then launch it through the current Node executable without a shell or inherited credentials.
- Track idle, starting, open, and failed states; join concurrent starts; bound retained children; retry after failure; and stop managed children through identity-safe dashboard shutdown.
- Add dependency-free launcher and API tests, process integrations, a real-browser one-click practice check using the prerequisite workspace, and a root test script without adding a CI gate.
- Keep project-path selection, language detection, navigation proxying, embedded explorer UI, independent child lifetime, and project editing outside this change.

## Capabilities

### New Capabilities

- `openspec-dashboard/code-explorer-launch`: Registered-project launch authorization, executable discovery, child readiness, reuse, failure recovery, and dashboard-owned cleanup.

### Modified Capabilities

- `openspec-dashboard/ui`: Adds the selected-project Code Explorer action, launch states, placeholder-tab handoff, and local failure presentation while preserving the dashboard's project-read-only contract.

## Impact

- Extends `tools/openspec-dashboard/` server, API, browser state, header actions, styles, documentation, and dependency-free test support.
- Adds one capability-protected dashboard launch endpoint addressed by registered project index and matching registry revision.
- Reads the planned `packages/code-explorer/dist/bundle.js` and starts its `serve --project-root <registered-path> --no-open` mode.
- Adds a root npm script for dashboard tests but leaves all existing CI jobs unchanged.
- Depends on completed `add-code-explorer-navigation` and `add-local-code-explorer` changes.
