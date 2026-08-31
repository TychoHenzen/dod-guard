## 1. Package and server boundary

- [x] 1.1 Gate execution on the implemented `add-code-explorer-navigation` capability requirements, `adapter-selection.json`, and language manifests. Add the server-owned core factory, shutdown lifecycle, `serve`, and `--project-root` parsing in `packages/code-explorer/src/` with exact project vectors and cancellation tests. Replace the shared generic MCP description with five operation-specific records and return every MCP envelope through both `structuredContent` and the compatibility JSON text item, with success, error, and process-handshake tests. Verify with `npm test -w packages/code-explorer`.
<!-- status: completed -->
  <!-- covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Server starts from the working directory -->
  <!-- covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Startup argument selects the project -->
  <!-- covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Browser request contains a project path -->
  <!-- covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Startup project is invalid -->
  <!-- covers: code-explorer/browser-server :: The packaged plugin is discoverable with useful MCP metadata :: Tool discovery explains each operation -->
  <!-- covers: code-explorer/browser-server :: The packaged plugin is discoverable with useful MCP metadata :: Successful tool result is structured and text-compatible -->
  <!-- covers: code-explorer/browser-server :: The packaged plugin is discoverable with useful MCP metadata :: Failed tool result is structured and text-compatible -->

- [x] 1.2 Add the bounded `127.0.0.1` listener and platform browser opener in `packages/code-explorer/src/browser-server/`, including `--no-open` and nonfatal launch errors. Verify with `npm test -w packages/code-explorer`.
<!-- status: completed -->
  <!-- covers: code-explorer/browser-server :: The server is reachable only through loopback :: Preferred port is available -->
  <!-- covers: code-explorer/browser-server :: The server is reachable only through loopback :: Preferred port is occupied -->
  <!-- covers: code-explorer/browser-server :: The server is reachable only through loopback :: Every configured port is occupied -->
  <!-- covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Default launch succeeds -->
  <!-- covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Automatic opening is disabled -->
  <!-- covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Operating system cannot open the browser -->

- [ ] 1.3 Implement the closed session-control and read-only JSON routes, exact Host and POST Origin checks, CSP and attribute allowlist, connection/header/body/rate ceilings, core limits, real-path static asset root, response headers, and stable HTTP error mapping in `packages/code-explorer/src/browser-server/`. Add binder, opener, route, traversal, schema, boundary-byte, slow-client, hostile-field, capacity, and read-only tests. Verify with `npm test -w packages/code-explorer`.
  <!-- covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Browser lists or calls a write route -->
  <!-- covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Cross-origin preflight is sent -->
  <!-- covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Request authority or origin is not the printed endpoint -->
  <!-- covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Source contains HTML and script text -->
  <!-- covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Navigation labels contain active browser text -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request uses an unknown field -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request body is oversized -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request body is at the byte boundary -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Browser session capacity is reached -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: HTTP transport capacity is reached -->
  <!-- covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Navigation response succeeds -->
  <!-- covers: code-explorer/browser-server :: Static assets and server errors have stable behavior :: Static path attempts traversal -->
  <!-- covers: code-explorer/browser-server :: Static assets and server errors have stable behavior :: Navigation core returns a redacted error -->

- [ ] 1.4 Map Performance Navigation Timing and exclusive-Web-Lock tab identifiers to core sessions in `packages/code-explorer/src/browser-server/` and `packages/code-explorer/src/browser/`. Cover exact create/restore bodies and headers, reload restore, reload-race replacement, duplicate rotation, unsupported-browser closure, cross-tab rejection, fake-clock boundary expiry, and visible recovery. Verify with `npm test -w packages/code-explorer` and the package browser test command.
  <!-- covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: Tab reloads during a live session -->
  <!-- covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: User opens another tab -->
  <!-- covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: Tab presents another session identifier -->
  <!-- covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: Duplicated tab presents copied storage -->
  <!-- covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: Browser lacks the tab-isolation primitive -->
  <!-- covers: code-explorer/browser-server :: Idle browser sessions expire predictably :: Session remains active -->
  <!-- covers: code-explorer/browser-server :: Idle browser sessions expire predictably :: Session is idle for 30 minutes -->
  <!-- covers: code-explorer/browser-server :: Idle browser sessions expire predictably :: Request arrives at the expiry boundary -->
  <!-- covers: code-explorer/browser-server :: Idle browser sessions expire predictably :: Page recovers from expiry -->

## 2. Local browser navigation

- [ ] 2.1 Build the packaged HTML, CSS, TypeScript store, three-pane desktop shell, narrow drawers, status strip, and closed action dispatcher under `packages/code-explorer/src/browser/`. Verify with the package browser test command at wide and narrow viewports.
  <!-- covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Browser opens with no focused symbol -->
  <!-- covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Symbol is focused -->
  <!-- covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Window becomes narrow -->
  <!-- covers: code-explorer/browser-navigation :: Browser actions cannot modify project content :: User inspects every visible action -->
  <!-- covers: code-explorer/browser-navigation :: Browser actions cannot modify project content :: Browser submits an unadvertised operation -->

- [ ] 2.2 Implement discovery inputs, grouped landmarks, service-ordered result rendering, filters, fuzzy labels, omitted counts, and refinement guidance in `packages/code-explorer/src/browser/`. Verify with deterministic fake-core browser tests.
  <!-- covers: code-explorer/browser-navigation :: Browser discovery preserves service ranking and filters :: User searches with a misspelling -->
  <!-- covers: code-explorer/browser-navigation :: Browser discovery preserves service ranking and filters :: User narrows search filters -->
  <!-- covers: code-explorer/browser-navigation :: Browser discovery preserves service ranking and filters :: User clears the query -->
  <!-- covers: code-explorer/browser-navigation :: Browser discovery preserves service ranking and filters :: Results are omitted by a limit -->

- [ ] 2.3 Render bounded source through validated UTF-16 spans, escaped text nodes, line numbers, handle actions, identity metadata, and truncation counts in `packages/code-explorer/src/browser/`. Verify with deterministic source and hostile-markup browser fixtures.
  <!-- covers: code-explorer/browser-navigation :: Focused source is bounded text with navigable handles :: Focused body contains visible symbols -->
  <!-- covers: code-explorer/browser-navigation :: Focused source is bounded text with navigable handles :: Focused body is truncated -->
  <!-- covers: code-explorer/browser-navigation :: Focused source is bounded text with navigable handles :: Focused body contains unsafe markup text -->

- [ ] 2.4 Implement lazy relation groups with supported, unavailable, external, omitted, loading, and failed states in `packages/code-explorer/src/browser/`. Prove one dispatch per opened group and no eager relation requests with fake-core browser assertions.
  <!-- covers: code-explorer/browser-navigation :: Semantic relations load only on demand :: Focus view first opens -->
  <!-- covers: code-explorer/browser-navigation :: Semantic relations load only on demand :: User opens a relation group -->
  <!-- covers: code-explorer/browser-navigation :: Semantic relations load only on demand :: Relation is unsupported -->
  <!-- covers: code-explorer/browser-navigation :: Semantic relations load only on demand :: Result belongs to an external dependency -->

- [ ] 2.5 Route search, landmark, source-handle, and relation selections through one focus action that updates view state only after success. Add browser assertions for history append and failure preservation.
  <!-- covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: User selects a search candidate -->
  <!-- covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: User follows a visible handle -->
  <!-- covers: code-explorer/browser-navigation :: Selecting a local result recenters navigation :: Focus request fails -->

- [ ] 2.6 Implement shared-session Back and Forward controls with immutable view restoration and branch replacement in `packages/code-explorer/src/browser/`. Verify restored source, relations, graph state, and history positions in browser tests.
  <!-- covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User selects Back -->
  <!-- covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User selects Forward -->
  <!-- covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User navigates after Back -->

- [ ] 2.7 Add visible-tab status polling, generation and readiness display, stale navigation locks, Refocus, and Refresh states in `packages/code-explorer/src/browser/`. Verify pending, stale, refocus, and failure behavior with a controllable fake clock and core.
  <!-- covers: code-explorer/browser-navigation :: Freshness remains visible without replacing the focus :: New generation is pending -->
  <!-- covers: code-explorer/browser-navigation :: Freshness remains visible without replacing the focus :: Current view becomes stale -->
  <!-- covers: code-explorer/browser-navigation :: Freshness remains visible without replacing the focus :: User selects Refocus -->
  <!-- covers: code-explorer/browser-navigation :: Freshness remains visible without replacing the focus :: Refresh fails -->

- [ ] 2.8 Give search, relation, graph, freshness, and workspace areas distinct local not-loaded, loading, empty, unavailable, stale, and failure rendering. Verify that local failures preserve the other panes and that generation 0 disables navigation.
  <!-- covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: Search has no matches -->
  <!-- covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: One relation fails -->
  <!-- covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: Workspace has no published generation -->

## 3. Bounded one-hop graph

- [ ] 3.1 Build the graph projection from the current view and explicitly loaded local relations only, with normalized identity deduplication and no expansion. Verify focus-only, one-group, second-hop, and duplicate cases in pure projection tests and browser tests.
  <!-- covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Focus has no loaded relations -->
  <!-- covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: One relation group loads -->
  <!-- covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Loaded relation points beyond one hop -->
  <!-- covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Duplicate identity arrives through two relations -->

- [ ] 3.2 Render relation-source labels and deterministic incoming, center, and outgoing SVG lanes in `packages/code-explorer/src/browser/`. Verify distinct multi-edges, discovery exclusion, direction, order, and repeat rendering.
  <!-- covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Reference has no call-hierarchy evidence -->
  <!-- covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Caller and definition target the same symbol -->
  <!-- covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Relation is discovery-only -->
  <!-- covers: code-explorer/local-graph :: Relation direction is visually stable :: Incoming and outgoing relations are loaded -->
  <!-- covers: code-explorer/local-graph :: Relation direction is visually stable :: Graph rerenders without state changes -->

- [ ] 3.3 Bound SVG growth to returned candidates and show per-group omitted counts without placeholders. Verify the union of several bounded groups and the absence of recursive nodes.
  <!-- covers: code-explorer/local-graph :: Graph growth remains visibly bounded :: Relation response is truncated -->
  <!-- covers: code-explorer/local-graph :: Graph growth remains visibly bounded :: Several bounded groups are loaded -->

- [ ] 3.4 Route selectable local graph nodes through normal focus navigation and exclude external or unavailable results. Verify successful recenter, failed-focus preservation, and external list-only behavior.
  <!-- covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: User selects a local graph node -->
  <!-- covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: Graph focus request fails -->
  <!-- covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: External result is loaded -->

- [ ] 3.5 Bind graph data to immutable views, restore it through history, disable stale graph actions, and contain validation or layout failures to the SVG area. Verify stale, restored, malformed, and collapsed states.
  <!-- covers: code-explorer/local-graph :: Stale and restored views keep recorded graph state :: Project generation advances -->
  <!-- covers: code-explorer/local-graph :: Stale and restored views keep recorded graph state :: History restores an older view -->
  <!-- covers: code-explorer/local-graph :: Graph rendering failure does not remove source navigation :: Graph renderer rejects malformed local state -->
  <!-- covers: code-explorer/local-graph :: Graph rendering failure does not remove source navigation :: Graph area is collapsed -->

## 4. Browser automation, practice, and packaging

- [ ] 4.1 Pin `@playwright/test` 1.55.1, add the fake-core Chromium harness, browser asset compilation, package scripts, tracked distribution files, lockfile entries, and repository gate adoption. Add `.codex-plugin/plugin.json` and the repository-local Codex marketplace entry beside the existing Claude metadata. Extend package-integrity fixtures to launch the same tracked bundle from both installed layouts and prove a fresh Codex task discovers the five tools without separate MCP registration. Run all deterministic browser scenarios against built assets on Node 18 and the CI Node version, then run the clean package build, package tests, strict Biome checks, plugin validation, package integrity, and `openspec validate --all --strict --no-interactive`.
  <!-- covers: code-explorer/browser-server :: Static assets and server errors have stable behavior :: Browser requests the application shell -->
  <!-- covers: code-explorer/browser-server :: The packaged plugin is discoverable with useful MCP metadata :: Fresh Codex marketplace installation lists the tools -->

- [ ] 4.2 Add the exact `practice:browser` process harness, disposable fixtures, cleanup, timeout, exit codes, and redacted evidence recording for Rust, Python, and C# under `packages/code-explorer/`. Run the live search, focus, semantic follow, Back, Forward, saved-file, stale, Refocus, and Refresh sequence once for each language.
  <!-- covers: code-explorer/browser-navigation :: The same browser workflow supports Rust, Python, and C# :: Rust practice project is explored -->
  <!-- covers: code-explorer/browser-navigation :: The same browser workflow supports Rust, Python, and C# :: Python practice project is explored -->
  <!-- covers: code-explorer/browser-navigation :: The same browser workflow supports Rust, Python, and C# :: C# practice project is explored -->
