## Context

See `proposal.md` for motivation and the three delta specs for observable behavior. This change depends on `add-code-explorer-navigation`: that change creates `packages/code-explorer`, the shared application core, one-project root boundary, explicit sessions and views, semantic adapters, search, landmarks, and revisioned freshness.

The existing `tools/openspec-dashboard` proves that a dependency-light Node loopback server with static browser modules fits this repository, but it is deliberately outside package CI gates and owns OpenSpec data rather than code navigation. The local explorer belongs inside the Code Explorer package so its browser API, assets, bundle, tests, and live fixtures ship with the service they present.

The pre-change Biome baseline is zero lint violations and zero format violations across 137 checked files. CI uses Node 22, while shipped package engines remain Node 18 or later.

## Goals / Non-Goals

**Goals:**

- Keep one navigation implementation shared by MCP and the browser.
- Make the common search, focus, relation, history, freshness, and graph sequence runnable in a real browser.
- Keep browser state bounded, tab-isolated, project-scoped, and removable with process exit.
- Ship browser assets and tests through the package build and repository gates.
- Make the same tracked MCP bundle installable and discoverable through Claude and Codex local marketplaces.
- Give MCP clients operation-specific discovery metadata and native structured envelopes without breaking text-only clients.

**Non-Goals:**

- No second semantic adapter stack or raw MCP proxy.
- No browser project picker, multiple-project host, persistent history, or remote server mode.
- No whole-project visualization, automatic graph expansion, or graph analysis.
- No authentication, CORS, editing, diagnostics, agent-follow behavior, or OpenSpec dashboard integration.
- No accessibility-specific acceptance program beyond the browser's native behavior.
- No second MCP implementation, remote MCP endpoint, or runtime-specific navigation behavior.

## Imported contracts

Execution is blocked until `add-code-explorer-navigation` is implemented and passes its gates. This change imports these capability requirements without weakening or restating their algorithms:

| Capability | Imported requirements |
|---|---|
| `code-explorer/language-adapters` | `One server process is confined to one canonical project root`, `Rust, Python, and C# share one capability-aware navigation contract`, `Production runtime uses a checked-in adapter selection record`, and `Language fixtures define one exact semantic oracle` |
| `code-explorer/mcp-navigation` | `MCP tool schemas are closed and versioned`, `Sessions, views, and handles have explicit ownership`, `Navigation history is explicit, bounded, and isolated`, `Navigation work has enforceable resource limits`, `Aggregate retained state is bounded`, and `Errors use one redacted schema` |
| `code-explorer/symbol-discovery` | exact matching, fuzzy ranking, filtering, classification, path containment, and result-limit requirements |
| `code-explorer/project-landmarks` | exact grouping, scoring, evidence, ordering, and per-group limits |
| `code-explorer/workspace-freshness` | saved-change detection, monotonic generations, global ordering, immutable views, refresh, and status requirements |

`packages/code-explorer/adapter-selection.json` and the three machine-readable language fixture manifests are required outputs of that prerequisite. Their schemas, locations, adapter protocol, fake-adapter contract, and validation tests are owned by `code-explorer/language-adapters`. The first task runs `npm test -w packages/code-explorer` before browser changes and fails when any record is absent, schema-invalid, version-incompatible, or unequal to its fixture oracle. The browser does not substitute defaults.

The production server supports Node 18 or later on `win32`, `darwin`, and Linux. An unrecognized platform may still serve the printed loopback URL, but automatic opening reports `browser_open_failed`. The acceptance browser is the Chromium revision installed by pinned Playwright 1.55.1. Other browsers are best-effort. A browser without Web Locks or `PerformanceNavigationTiming` receives `browser_capability_unavailable` before session creation.

## Decisions

### 1. Add a `serve` mode around the shared application core

The package binary accepts `serve`, `--project-root`, and `--no-open`. MCP stdio and HTTP are adapters around the same application service. The prerequisite exports versioned asynchronous TypeScript `startSession`, `search`, `focus`, `follow`, `history`, `status`, `refresh`, and `closeSession` operations using its closed inputs, common success envelope, redacted errors, request-ID replay, per-session FIFO, immutable views, and cancellation rules. The HTTP adapter may translate browser ownership fields, but it calls those operations directly and does not redefine their data. It never serializes a request back through MCP and never launches a second Code Explorer process.

The server owns an `ExplorerCoreFactory.start({ projectRoot, signal })` lifecycle. It validates the frozen root and starts the workspace controller before bind, but generation 1 may publish after the browser opens. At generation 0, session create, session restore, status, and refresh are admitted; status returns HTTP 200 with `state: "initializing"`, while search, focus, follow, and history return HTTP 503 retryable `workspace_unavailable`. Publication of generation 1 atomically changes subsequent calls to the ready contract. Startup failure before bind exits through the declared startup error. Each HTTP operation receives an abort signal; client disconnect, body timeout, server shutdown, or response-limit failure cancels or abandons the matching core call and retains no partial browser snapshot. `SIGINT`, `SIGTERM`, listener failure, and normal harness completion stop admission, abort in-flight HTTP work, call `closeSession` for browser mappings, call `core.close()`, close watchers and backend process trees, close the listener, then exit. Cleanup has a ten-second bound followed by the prerequisite process-tree termination path.

The replaceable seams have one production and one fake implementation:

```ts
interface PortBinder { listen(host: "127.0.0.1", port: number, signal: AbortSignal): Promise<HttpListener>; }
interface HttpListener { readonly address: URL; stopAdmission(): void; close(signal: AbortSignal): Promise<void>; }
interface BrowserOpener { open(url: URL, signal: AbortSignal): Promise<void>; }
interface MonotonicClock { nowMilliseconds(): number; }
```

`PortBinder.listen` rejects a bind conflict without retaining a listener. Abort before bind leaves no socket. Other bind failures terminate startup. `HttpListener.stopAdmission` is synchronous and idempotent. `close` is idempotent, waits for admitted requests until its signal aborts, then destroys remaining sockets and resolves after release. `BrowserOpener.open` resolves only after process spawn succeeds; later child exit is reported once and does not stop the listener. The default browser is an external user-owned application. Server shutdown never closes it. The monotonic clock never moves backward in production; the fake may advance to exact millisecond boundaries.

The server resolves a relative `--project-root` from the startup working directory, then applies the prerequisite real-path and filesystem-identity checks before binding. With no argument it uses cwd. With any argument it ignores cwd as a project candidate. Absolute arguments remain absolute. `.` and `..` are allowed startup choices and resolve normally. An existing link resolves to its canonical target; a broken link, nonexistent path, regular file, or inaccessible directory fails `invalid_project_root`. It tries `127.0.0.1:4410` through `:4429`. A replaceable binder records the exact attempt order in tests. Exhaustion emits only `browser_port_unavailable`, opens nothing, closes startup resources, and exits 1. It prints `Code Explorer: <url>` after `listening`, then invokes one replaceable opener. Windows uses `cmd.exe` with `/d /s /c start "" "<generated-url>"`; macOS uses `/usr/bin/open <generated-url>`; Linux uses `xdg-open <generated-url>` without a shell. An unsupported platform or failed spawn emits one `browser_open_failed` stderr line and does not affect the listener.

Alternatives considered:

- A separate `tools/code-explorer` proxy. Rejected because it duplicates lifecycle, packaging, and API ownership.
- Starting HTTP beside every MCP connection. Rejected because enabling MCP must not create an unsolicited listener or browser window.

### 2. Use a narrow same-origin JSON API

The public routes and closed bodies are:

| Method | Route | Closed body | Shared operation |
|---|---|---|---|
| `POST` | `/api/session` | `{action: "create", tab_instance_id, document_start: "new"}` or `{action: "restore", tab_instance_id, document_start: "reload"}` | start or restore one browser mapping |
| `POST` | `/api/search` | `{request_id, query, path_globs?, languages?, kinds?, content?, include_generated?, limit?}` | search or landmarks |
| `POST` | `/api/focus` | `{request_id, symbol_id, body_limit_bytes?}` | focus or Refocus one symbol |
| `POST` | `/api/follow` | `{request_id, view_id, handle, relation, limit?}` | load or follow one view-scoped relation |
| `POST` | `/api/history` | `{request_id, action: "back" | "forward" | "recent", limit?}` | explicit history |
| `POST` | `/api/status` | `{action: "status"}` or `{action: "refresh", request_id}` | status or Refresh |
| `GET` | `/` and packaged assets | none | browser shell |

Session `create` requires `X-Code-Explorer-Tab` equal to its body field, requires no session header, and returns `{schema_version: 1, project_id, project_generation, pending_generation, state: "created", data: {browser_session_id}}`. Session `restore` and every other API call require `X-Code-Explorer-Session` and `X-Code-Explorer-Tab`; the tab header must equal the stored owner. Session restore returns the complete current browser snapshot or `browser_session_expired`. All state-changing core requests retain the prerequisite request-ID replay behavior.

Success uses HTTP 200 and the core envelope. Errors use `application/json` and the exact `code-explorer/mcp-navigation` redacted envelope: `{schema_version: 1, code, message, retryable, details?}` with no other fields, `message === code`, and its closed details object. Browser-only codes are `invalid_browser_origin`, `invalid_browser_session`, `invalid_browser_view`, `browser_session_expired`, `browser_session_replaced`, `browser_capability_unavailable`, `browser_port_unavailable`, `browser_open_failed`, `route_not_found`, `method_not_allowed`, `http_capacity`, and `graph_render_failed`; only `browser_session_expired` and `http_capacity` are retryable. HTTP 400 carries `invalid_request`; 403 carries `invalid_browser_origin` or `invalid_browser_session`; 404 carries `route_not_found`; 405 carries `method_not_allowed`; 409 carries `request_id_conflict`, `stale_view`, or `browser_session_replaced`; 410 carries `browser_session_expired`; 413 carries request or response `resource_limit`; 429 carries `project_capacity` or `http_capacity`; 503 carries retryable workspace or backend errors; and 500 carries `internal_error`. A 64 KiB request limit counts received body bytes before UTF-8 decode and rejects content encoding. A 1 MiB serialized-response ceiling is checked before headers are sent. The adapter inherits the core's exact counting units, queue behavior, timeout behavior, and limits. Four and eight backend-operation limits mean concurrently in-flight operations. Status without refresh reads current memory and consumes no backend slot. Browser sessions consume the same eight-session project capacity as MCP sessions. The ninth create returns HTTP 429 retryable `project_capacity`. View allocation first applies the imported oldest-non-current eviction rule and returns HTTP 429 `project_capacity` without a partial view if 16 MiB still cannot be satisfied.

The HTTP server caps open TCP connections at 16 and in-flight HTTP requests at eight. It sets `maxHeaderSize` to 16 KiB, `headersTimeout` to 5,000 ms, API body timeout to 10,000 ms, `keepAliveTimeout` to 5,000 ms, and `maxRequestsPerSocket` to 100. One process token bucket refills at 60 requests per second and holds 120 tokens. Every asset, rejected-origin, invalid, and valid API request consumes one token after complete headers. A complete excess request receives HTTP 429 `http_capacity`; incomplete headers or bodies close on timeout. These transport rejections allocate no session, body buffer beyond the current bounded chunk, or core operation.

Every request validates `Host` against the printed authority. The shipped page uses same-origin `fetch` with JSON POST for every API call. Each POST must contain the exact printed `Origin`; missing is rejected intentionally. Asset GET needs Host but not Origin. The server emits no CORS permission headers and rejects `OPTIONS`. HTML, script, style, and API responses set `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. HTML uses this byte-for-byte directive value: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. There is no inline script or style. The renderer may set only `id`, `class`, `hidden`, `disabled`, `title`, `tabindex`, `data-action`, `data-state`, `data-view-id`, `aria-expanded`, and `aria-controls` on HTML elements. SVG creation may set only `viewBox`, `x`, `y`, `x1`, `x2`, `y1`, `y2`, `width`, `height`, `class`, `data-node-id`, and fixed `marker-end`. Every attribute value except opaque view or node IDs comes from a fixed client constant. Every untrusted string enters a text node. No untrusted string enters `innerHTML`, `outerHTML`, CSS text, a URL attribute, an event attribute, or markup serialization.

This deliberately follows the confirmed personal-tool boundary: loopback binding and the browser's normal same-origin restrictions, without a bootstrap token or user authentication.

Alternatives considered:

- WebSocket transport. Rejected because navigation is request-response and freshness already has explicit status and refresh operations.
- A generic `/api/tool` endpoint. Rejected because it would re-expose raw MCP names and weaken the closed read-only surface.

### 3. Make browser sessions tab-scoped and reload-restorable

The page stores a 128-bit random browser session identifier and 128-bit `tab_instance_id` in `sessionStorage`. It reads `PerformanceNavigationTiming.type` before session work. A document reported as `navigate`, `back_forward`, or `prerender` that inherited identifiers discards them and starts as `document_start: "new"`; only `reload` may request restore. Before either action, it requests an exclusive Web Lock named `code-explorer-tab:<tab_instance_id>` with `ifAvailable`. A reload that reacquires the released lock restores. A reload that loses the race rotates both identifiers, acquires a new lock, creates an empty session, and shows `browser_session_replaced`. A duplicate is classified as `navigate` and rotates even if it acquires the copied lock during the reload gap. The lock is held until document unload. Lack of Web Locks or Performance Navigation Timing is a closed unsupported-browser state.

The server maps `(browser_session_id, tab_instance_id)` to one core navigation session. `create` allocates both mappings only after the client sends `document_start: "new"` and its rotated tab identifier. `restore` accepts only `document_start: "reload"` and succeeds only when both submitted identifiers match. A different tab identifier receives `invalid_browser_session`; the response never reveals whether the session exists. This is ownership isolation, not authentication against a hostile local process or same-user modified browser.

The server retains the session on a monotonic sliding clock. The acceptance point and expiry check serialize in the core session FIFO. If `now - lastAcceptedAt >= 1,800,000 ms`, the request returns HTTP 410, cleanup releases the mapping and core state, and no requested operation dispatches. Otherwise acceptance updates `lastAcceptedAt` immediately. A fake monotonic clock drives boundary tests. The page handles expiry by clearing both identifiers, acquiring a new lock, creating an empty session, and presenting the expiry instead of reviving old handles.

Alternatives considered:

- Cookies. Rejected because the confirmed design calls for tab isolation, while cookies are shared across tabs.
- BroadcastChannel-only claims. Rejected because message absence cannot distinguish reload from a duplicated tab when a document is suspended.
- Disk persistence. Rejected because it would retain source-derived state after process exit and introduce migration and privacy work.

### 4. Build the UI as vanilla TypeScript and deterministic DOM state

Browser source lives under `packages/code-explorer/src/browser/`. The package bundle step produces `dist/browser/index.html`, `app.js`, and `style.css` as checked-in regular files alongside the MCP and CLI bundle. The runtime resolves that one directory from `import.meta.url`. It decodes request paths once, rejects invalid encodings, NUL, encoded separators, absolute or parent forms, resolves the real candidate, rejects links and reparse points, and proves containment under the real asset root. A missing or non-regular packaged asset fails closed as 404. Root package, plugin, tracked-file, and bundle checks adopt every shipped asset.

One browser store owns immutable snapshots of session, search, filters, focus, relation groups, history position, graph data, and workspace status. Rendering uses small pure view functions and DOM replacement, following the existing dashboard's readable module pattern without importing its code. At 900 CSS pixels and above, the grid is `240px minmax(0, 1fr) 280px`; at exactly 900 pixels the center is 380 pixels. At 899 pixels and below, the center occupies the viewport and each side pane is an overlaid exclusive drawer of `min(320px, 80vw)`. Closed drawers are translated fully outside the viewport and marked `hidden`; opening one closes the other. Layout assertions allow one CSS pixel of browser rounding.

Source rendering preserves every UTF-16 code unit and line separator from the returned body. It performs no newline normalization. It validates zero-based, end-exclusive line and character positions against JavaScript UTF-16 code units, then splits only at valid handle boundaries, assigns line numbers without removing separators, and emits each segment through `textContent`. Overlap, out-of-bounds positions, or a boundary inside a surrogate pair produce the local `invalid_browser_view` state. Search rows, paths, source, errors, status, relation rows, omitted labels, and SVG text all share the same text-only renderer. Fixed DOM and SVG attributes come from allowlisted constants, never service data. It uses no syntax-highlighting or UI framework dependency in this change.

Alternatives considered:

- React and Vite. Rejected because the interaction fits a small state store and deterministic DOM rendering, while another application framework would add build and runtime surface.
- Server-rendered pages. Rejected because lazy relations, tab state, and graph recentering require repeated local interaction.

### 5. Keep relations lazy and history view-owned

Focusing clears the visible relation panels to supported, unavailable, or not-yet-loaded states. Opening a group dispatches one shared follow operation and stores its result under the owning immutable `view_id`. Reopening uses that recorded result unless the view changed. An unavailable group never substitutes structural evidence or another relation.

Search candidates, landmarks, visible handles, relation rows, and graph nodes all enter focus through one action. A successful local focus appends one core history position and resets the current graph to its center. Search, filter, pane, relation-load, status, and graph-collapse actions append nothing. The browser store keys loaded relation groups and derived graph snapshots by immutable `view_id`; it does not create a second branch index. A failed focus preserves the existing view and history. Back and Forward first restore the core view, then look up the exact browser snapshot, with zero search, focus, or follow requests. Navigation after Back removes snapshots for the abandoned Forward views.

### 6. Render a lane-based one-hop SVG without a graph library

The SVG receives already validated view data. The focus occupies the 50 percent lane. Incoming callers and references use the 16 percent lane. Callees, definitions, types, and implementations use the 84 percent lane. Groups use the declared relation order. Rows use 48 CSS pixel spacing and service order. The SVG scrolls vertically rather than hiding nodes. A symbol identity produces one node, while multiple proven relations produce separate labeled edges.

The graph contains only results loaded for the current view. It makes zero service requests, recursively expands nothing, and inserts no placeholder nodes. Six groups of at most 200 service results cap one view at 1,201 nodes including focus and 1,200 returned relation edges before identity deduplication. The 1 MiB API response ceiling and 16 MiB project retained-view ceiling remain earlier bounds. Omitted counts remain group annotations. Clicking a local node dispatches the same focus action as a relation row. External and discovery-only results never become graph nodes.

Identity deduplication uses the returned normalized `symbol_id`. The checked-in graph oracle centers `F`, loads callers `[A, B]`, references `[A, C]` with omitted count 2, callees `[D, X]` where `X` is external, and contains hidden unrelated `H`. Its exact projection is nodes `[F, A, B, C, D]` and edges `[A->F caller, B->F caller, A->F reference, C->F reference, F->D callee]` in group then service order. `X` remains list-only and `H` never appears. The malformed oracle contains an edge to an absent node and must produce only `graph_render_failed` with zero service requests.

A graph validation or layout error is caught at the graph boundary and replaces only the SVG area with `graph_render_failed`. The source and list workflow remains usable.

Alternatives considered:

- A force-directed or automatic layout library. Rejected because it can move identical data between renders and encourages whole-graph growth.
- Canvas. Rejected because the small fixed lanes are simpler to inspect and assert as SVG elements.

### 7. Surface freshness without automatic recentering

The browser polls shared status only while the tab is visible, using a 5,000 ms interval, and once after every navigation response. A fake timer asserts the interval, hidden-tab silence, and request counts. It shows current generation, pending generation, workspace state, and backend readiness. The prerequisite `chokidar@4.0.3` controller, 100 ms coalescing, 30-second hash reconciliation, generation publication, and freshness errors remain the only source of truth. A newer generation does not replace source content. Once the current view is stale, handle, relation-row, and graph-node navigation is disabled.

Refocus searches for the focused symbol identity at the current generation and creates a new view on success. Refresh uses the shared atomic refresh operation. Failure preserves the prior complete view and presents the stable workspace error.

### 8. Use deterministic browser automation plus live language practice

Pin `@playwright/test` 1.55.1 as a development dependency because its package contract supports Node 18. CI runs its installed Chromium revision on Node 22 with `deviceScaleFactor: 1`, 100 percent page zoom, bundled-font loading disabled, and body overflow hidden so only pane interiors scroll. Layout cases use 899 by 800 and 900 by 800 CSS-pixel viewports and inspect `getBoundingClientRect`, not screenshots, with one CSS pixel tolerance. Browser tests start built assets with a fake application core, binder, opener, and monotonic clock. `packages/code-explorer/fixtures/browser/fake-core.json` holds the exact success and error envelopes, search and landmark order, UTF-16 source including CRLF, truncation bytes, hostile strings, relation results, hidden graph candidates, and session snapshots. `expected-browser.json` holds exact rendered row text, state attributes, request logs, graph projection, omitted counts, and error envelopes. Tests assert the ports 4410 through 4429, stdout and stderr lines, opener argument vectors, HTTP status and error envelopes, 65,536 versus 65,537 byte bodies across chunk boundaries, navigation-type duplicate rotation, reload lock-race replacement, expiry at 1,800,000 ms, request counts, exact rendered order, local error containment, text-only hostile values, the two fixed layouts, the 16/50/84 percent SVG lanes, and zero graph requests.

The Rust, Python, and C# practice projects and exact helper ranges come from `add-code-explorer-navigation`. The root invocation is `npm run practice:browser -w packages/code-explorer -- --language <rust|python|csharp>`. The harness cwd is the repository root. It validates `adapter-selection.json`, then spawns the built package with `serve --project-root <canonical fixture> --no-open`, using the package's validated server-owned environment and process-tree owner. Readiness is the first valid `Code Explorer: <url>` stdout line. Output before readiness is captured and redacted. A nonzero exit or 30-second readiness timeout fails `practice_start_failed`.

The harness opens bundled Chromium, performs search, focus, one semantic helper follow, Back, Forward, helper rename, stale view, Refocus, and Refresh, and waits at most 35 seconds after the save for the 30-second reconciliation fallback. It restores the fixture in a `finally` path through its disposable copied workspace, closes Chromium, requests graceful server shutdown, and uses the prerequisite process-tree termination path after ten seconds. The whole command times out after 90 seconds. Exit 0 means exact oracle equality; exit 1 means a prerequisite, readiness, navigation, or oracle failure; exit 2 means invalid CLI usage. Each run writes `packages/code-explorer/practice/evidence/<language>.json` with schema version, language, allowlisted backend name and version, operation states, expected and actual normalized locations, start and final generations, elapsed milliseconds, and stable error code. It writes no source body, absolute path, environment value, or raw child output. These live runs are local acceptance evidence rather than CI dependencies on installed language servers.

Alternatives considered:

- Latest Playwright. Rejected because the current release requires a newer Node runtime than the package promises.
- Fake-adapter tests only. Rejected because the user required a system that can be tested in practice for Rust, Python, and C#.
- Installing every language server in CI. Rejected because selection and safe-mode prerequisites are platform-specific and already have contract tests in the navigation change.

### 9. Package one MCP contract for Claude and Codex

The package keeps `.claude-plugin/plugin.json` and `.mcp.json` for the existing Claude marketplace. It also ships the required `.codex-plugin/plugin.json` manifest and a repository-local Codex marketplace entry. Both plugin descriptions name version `0.1.1` until the implementation task applies the repository's normal version policy. Both entries launch the same tracked `dist/bundle.js`; neither copies the bundle, registers another server, accepts a project root from a tool request, or starts the browser mode implicitly. A new task or runtime reload is the installation boundary because MCP tools are discovered when the task starts.

The MCP registration owns one immutable metadata record keyed by `code_search`, `code_focus`, `code_follow`, `code_history`, and `code_status`. Each record contains the closed input schema plus a distinct description. Search describes project symbol and file discovery. Focus names the session and symbol requirements. Follow names the view-scoped handle and supported semantic relations. History names session-local Back, Forward, and recent views. Status names status, session creation, and explicit refresh. `tools/list` is built only from this record so a new tool cannot acquire the old generic description by default.

The call adapter returns the same envelope in two representations:

```ts
{
  content: [{ type: "text", text: JSON.stringify(envelope) }],
  structuredContent: envelope,
  ...(isError ? { isError: true } : {}),
}
```

The envelope remains the source of truth. Tests parse the text item and assert deep equality with `structuredContent` for one success and every stable error family exercised by the process tests. The compatibility text is retained because existing Claude clients and shell smoke scripts already consume it. The structured field gives Codex and other current MCP clients a native object without reparsing text.

Package-integrity tests resolve each manifest from an installed-layout fixture, launch the referenced tracked bundle, complete `initialize` and `tools/list`, call one success and one error, and assert the five exact tools, distinct descriptions, structured/text equality, and absence of write capabilities. A fresh Codex-task fixture proves the local marketplace entry makes the MCP namespace callable without a separate user MCP configuration.

## Risks / Trade-offs

- [No authentication on a source-reading loopback server] -> Bind only to `127.0.0.1`, validate exact Host and API Origin, expose no CORS permission, apply CSP, keep operations read-only, and document the trusted personal-machine boundary.
- [The browser change starts before the navigation core exists] -> Make completion of `add-code-explorer-navigation` and its package tests the first execution gate.
- [Tab duplication copies sessionStorage] -> Hold an exclusive Web Lock per tab identifier and rotate a duplicate before session or navigation work.
- [UTF-16 handle ranges split source incorrectly] -> Validate non-overlap and bounds against the exact returned body before producing DOM spans; fail the focus area locally on mismatch.
- [A large loaded relation set makes SVG unreadable] -> Keep core result bounds, lazy groups, deterministic lanes, omitted counts, and collapsible graph presentation.
- [Browser opener commands vary by platform] -> Keep launch nonfatal and always print the already-listening URL.
- [Playwright browser downloads add CI time] -> Install only bundled Chromium for this package's browser project.

## Migration Plan

1. Confirm `add-code-explorer-navigation` is implemented and its package, bundle, and fixture gates pass.
2. Add `serve` command parsing and a fake-core HTTP handshake without changing MCP startup behavior.
3. Add closed browser API routes, tab sessions, expiry, and packaged static assets.
4. Add the three-pane browser through search, focus, lazy relations, history, and freshness slices.
5. Add the deterministic SVG graph and local graph failure boundary.
6. Add Playwright automation, package scripts, tracked browser assets, dual-runtime plugin metadata, and repository gate adoption.
7. Verify MCP discovery and structured results through installed Claude and Codex layouts.
8. Run and record the Rust, Python, and C# live practice sequences, then run all package and repository gates.

Rollback removes the browser asset entry, HTTP mode, Playwright development dependency, package scripts, Codex manifest, and Codex marketplace entry. It restores the prior text-only MCP result adapter and metadata table. The five tool names and navigation behavior remain unchanged, and no persisted user data requires migration.

## Phase 1 review

Five clean-context lenses reviewed the complete delta in each round: scope and assumptions, internal consistency, security, testability, and implementability.

- Round 1: `REVISE`. The review found underspecified tab duplication, root resolution, freshness and fixture prerequisites, browser-origin checks, untrusted labels, resource ceilings, route schemas, expiry, opener behavior, and deterministic test seams.
- Round 2: `REVISE`. The review found remaining transport denial limits, session-create wording, imported-contract names, reload ownership races, core shutdown, pre-publication behavior, practice cleanup, and fixture-oracle precision.
- Round 3: Security returned `CLEAN`. Testability returned one minor layout-harness finding. The other lenses found the support matrix, reload race, listener contract, generation-0 behavior, and prerequisite validation needed clarification. Those valid findings are resolved above. The report asking `BrowserOpener` to close browser sessions was rejected because the opener starts an external user-owned browser and owns no server navigation session. The session-capacity, view-eviction, adapter protocol, and process-tree contracts were already imported from named prerequisite requirements and are now repeated only where browser mapping required an explicit HTTP outcome.

Final unresolved findings: 0 critical, 0 major, 0 minor. Verdict: `GO` for planning. This verdict does not claim implementation or test coverage; the prerequisite change and all tasks remain execution gates.
