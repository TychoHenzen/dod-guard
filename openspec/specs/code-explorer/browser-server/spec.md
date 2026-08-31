# browser-server Specification

## Purpose

Defines how one project-scoped Code Explorer process exposes its shared read-only navigation service to a local browser.

## Requirements

### Requirement: The package starts a project-scoped browser server
`code-explorer serve` SHALL start one HTTP server for the startup working directory or one `--project-root` argument. When the argument is present, it SHALL always take precedence. A relative argument SHALL resolve from the startup working directory. Before listener or backend work, the server SHALL apply `code-explorer/language-adapters` requirement `One server process is confined to one canonical project root`, including its real-path, filesystem-identity, broken-link, platform-comparison, and revalidation rules. The browser status SHALL display the frozen root as `.` rather than expose its absolute canonical path. The server SHALL use the same frozen project root and navigation core as the MCP mode, and SHALL NOT accept a project path through an HTTP request.

#### Scenario: Server starts from the working directory
- **WHEN** the user runs `code-explorer serve` without `--project-root` from a valid project
- **THEN** the browser server starts for that canonical project and reports the project root as `.`

#### Scenario: Startup argument selects the project
- **WHEN** the user runs `code-explorer serve --project-root <path>` from another directory
- **THEN** the server freezes the canonical argument path and does not initialize the working-directory project

#### Scenario: Browser request contains a project path
- **WHEN** an HTTP request attempts to add or replace the project root
- **THEN** the server returns `invalid_request` before filesystem or backend work

#### Scenario: Startup project is invalid
- **WHEN** the selected project root is missing, inaccessible, or fails the navigation service's root checks
- **THEN** startup exits nonzero with a redacted `invalid_project_root` error and opens no browser

### Requirement: The packaged plugin is discoverable with useful MCP metadata
The package SHALL ship compatible Claude and Codex plugin manifests that identify the same `code-explorer` name, version, tracked bundle, and read-only MCP server. A fresh installation from each local marketplace SHALL start that tracked bundle for the selected project and return exactly `code_search`, `code_focus`, `code_follow`, `code_history`, and `code_status` from `tools/list` without separate manual MCP registration. No manifest SHALL advertise a write, edit, shell, or unrestricted filesystem capability.

Each listed tool SHALL have an operation-specific description that explains its observable result and required navigation context. The five descriptions SHALL NOT all be identical. The descriptions for session-bound tools SHALL identify the session, view, handle, or request identifier required to call them in the correct order.

Every MCP tool result SHALL include the versioned success or error envelope as native `structuredContent`. For compatibility, the first text content item SHALL remain the JSON serialization of that exact envelope. Parsing the text item SHALL produce a value deeply equal to `structuredContent`. Error results SHALL retain `isError: true`, the redacted code, retryability, and closed details object.

#### Scenario: Fresh Codex marketplace installation lists the tools
- **WHEN** a new Codex task installs and enables the packaged Code Explorer entry from its local marketplace
- **THEN** the task can call the five read-only MCP tools without another MCP registration step

#### Scenario: Tool discovery explains each operation
- **WHEN** an MCP client requests `tools/list`
- **THEN** each of the five tools has a distinct operation-specific description that provides the context needed to call it

#### Scenario: Successful tool result is structured and text-compatible
- **WHEN** a Code Explorer tool returns a success envelope
- **THEN** `structuredContent` contains that envelope and the first text content item parses to the same value

#### Scenario: Failed tool result is structured and text-compatible
- **WHEN** a Code Explorer tool returns a redacted error envelope
- **THEN** the result retains `isError: true`, `structuredContent` contains that envelope, and the first text content item parses to the same value

### Requirement: The server is reachable only through loopback
The server SHALL listen on `127.0.0.1` only. It SHALL try ports 4410 through 4429 in ascending order, print the selected URL, and fail after all 20 attempts. Exhaustion SHALL print one `browser_port_unavailable` line to stderr, invoke no opener, release startup resources, and exit with status 1. It SHALL provide no option to bind a non-loopback interface. The port binder SHALL be replaceable in tests so the attempted sequence does not depend on other host processes.

#### Scenario: Preferred port is available
- **WHEN** the configured preferred port can be bound on `127.0.0.1`
- **THEN** the printed URL uses that port and no other interface accepts a connection

#### Scenario: Preferred port is occupied
- **WHEN** one or more ports at the start of the configured range are occupied
- **THEN** the server binds the first available later port and prints the actual URL

#### Scenario: Every configured port is occupied
- **WHEN** no port in the finite configured range can be bound
- **THEN** startup exits nonzero with `browser_port_unavailable` and does not open a browser

### Requirement: Startup opens the local browser unless disabled
After the server is listening, it SHALL print exactly one `Code Explorer: <url>` line to stdout and SHALL attempt to open that URL once in the default browser. `--no-open` SHALL suppress only the browser launch. Browser launch failure SHALL print one `browser_open_failed` line to stderr, leave the server running with no nonzero exit transition, and keep the printed URL usable. The opener SHALL be an injectable process adapter whose production command and argument vectors are fixed by platform in the design.

#### Scenario: Default launch succeeds
- **WHEN** the server begins listening without `--no-open`
- **THEN** it prints the URL once and requests that the operating system open that exact URL

#### Scenario: Automatic opening is disabled
- **WHEN** the command includes `--no-open`
- **THEN** it prints the URL and makes no browser-launch request

#### Scenario: Operating system cannot open the browser
- **WHEN** the browser-launch operation fails after the server is listening
- **THEN** the process reports `browser_open_failed`, keeps serving, and preserves the printed URL

### Requirement: The HTTP boundary remains read-only and same-origin
The server SHALL expose closed session-control routes plus read-only code-navigation, status, refresh, and static-asset routes. Session control MAY create, restore, expire, and release derived server state, but no route SHALL edit, rename, create, or delete project content or expose completion or diagnostics. Every request SHALL require `Host` to equal the printed `127.0.0.1:<port>` authority. Every API route uses POST and SHALL also require `Origin` to equal the printed origin; a missing Origin is invalid. A missing or mismatched required value SHALL return `invalid_browser_origin` before session or route work. Asset GET requests SHALL require Host but not Origin. The server SHALL NOT emit an `Access-Control-Allow-Origin` header or support CORS preflight. Every browser response SHALL apply the fixed Content Security Policy from the design. Source, symbol names, paths, relation labels, status, errors, and SVG labels SHALL be inserted only as text nodes or fixed allowlisted attributes. No untrusted value SHALL enter HTML, SVG markup, CSS, a URL attribute, or an event attribute.

#### Scenario: Browser lists or calls a write route
- **WHEN** a request targets a project-writing or unadvertised API route
- **THEN** the server returns a stable route error without changing project content or navigation state

#### Scenario: Cross-origin preflight is sent
- **WHEN** another origin sends an `OPTIONS` request for an API route
- **THEN** the server returns a route or method error without CORS permission headers

#### Scenario: Request authority or origin is not the printed endpoint
- **WHEN** a request has another `Host`, or an API request omits or changes `Origin`
- **THEN** the server returns `invalid_browser_origin` before session lookup, route dispatch, or source access

#### Scenario: Source contains HTML and script text
- **WHEN** focused source contains markup, a script element, or an event-handler attribute
- **THEN** the browser displays the exact text and executes none of it

#### Scenario: Navigation labels contain active browser text
- **WHEN** a symbol, path, relation, status, error, or graph label contains HTML, SVG, CSS, URL, or event-handler syntax
- **THEN** the browser displays it only as text under the fixed Content Security Policy and creates no executable or navigable attribute from it

### Requirement: Browser API schemas are closed and bounded
Every API request SHALL use the exact route, header, body, and response schemas in the design. Unknown fields, malformed JSON, compressed request bodies, or a content type other than `application/json` SHALL return `invalid_request` before navigation work. The 64 KiB ceiling SHALL count received message-body bytes before UTF-8 decoding: 65,536 bytes are allowed and 65,537 bytes return `resource_limit`, regardless of stream chunking. A serialized API response SHALL NOT exceed 1 MiB. The adapter SHALL reuse `code-explorer/mcp-navigation` requirements `Navigation work has enforceable resource limits`, `Aggregate retained state is bounded`, and `Errors use one redacted schema`. In particular, the four-per-session and eight-per-project limits count concurrently in-flight backend operations, not lifetime requests or status polls. The 64 queue entries count accepted operations waiting for their serialized or backend turn. Browser status polling still counts as an HTTP request but uses no backend slot when status is already available. A ninth session SHALL return retryable `project_capacity` without allocation. A view that would cross 16 MiB SHALL first evict eligible oldest non-current views and SHALL return `project_capacity` without a partial view if eviction cannot create capacity. Work above any other request, response, concurrency, or retained-state limit SHALL return the core's stable `resource_limit`, `backend_timeout`, or `project_capacity` result without retaining partial state. Successful navigation payloads SHALL preserve the shared core's schema version, generation, state, and data meanings.

The HTTP transport SHALL admit at most 16 open TCP connections and eight in-flight HTTP requests, accept at most 16 KiB of request headers, allow five seconds to finish headers and ten seconds to finish an API body, use a five-second keep-alive timeout, and serve at most 100 requests on one socket. A process-wide token bucket SHALL allow 60 requests per second with a burst of 120 across assets, invalid requests, and API calls. Excess rates or in-flight requests SHALL return HTTP 429 `http_capacity` when headers are complete; incomplete or slow connections SHALL close without route dispatch. Every rejection SHALL release its connection, request, body, and core resources.

#### Scenario: Request uses an unknown field
- **WHEN** an API request includes a body field outside its route schema
- **THEN** the server returns `invalid_request` before dispatching the navigation core

#### Scenario: Request body is oversized
- **WHEN** an API request exceeds 64 KiB while streaming
- **THEN** the server stops reading it and returns `resource_limit` without parsing or retaining the remainder

#### Scenario: Request body is at the byte boundary
- **WHEN** otherwise valid JSON bodies of 65,536 and 65,537 received bytes are sent across arbitrary stream chunks
- **THEN** the first body may dispatch and the second returns `resource_limit` before JSON decoding or core work

#### Scenario: Browser session capacity is reached
- **WHEN** eight live core sessions already exist across MCP and browser adapters
- **THEN** browser session creation returns retryable `project_capacity` without allocating browser or core state

#### Scenario: HTTP transport capacity is reached
- **WHEN** a seventeenth connection, ninth in-flight request, oversized header block, slow header, slow body, or request above the token-bucket burst reaches the server
- **THEN** the transport returns `http_capacity` when a response is possible or closes the incomplete connection, dispatches no route or core work, and releases all request resources

#### Scenario: Navigation response succeeds
- **WHEN** a browser operation completes through the shared core
- **THEN** the HTTP response preserves the core schema version, current and pending generations, state, and operation data

### Requirement: Each browser tab owns one isolated session
The browser SHALL store a cryptographically random `tab_instance_id` and opaque `browser_session_id` in `sessionStorage`. Before any navigation, the document SHALL acquire an exclusive Web Lock named from `tab_instance_id`. The shipped page SHALL classify a new document from `PerformanceNavigationTiming.type`: `reload` MAY restore copied identifiers, while `navigate`, `back_forward`, or `prerender` with existing identifiers SHALL discard them and create new identifiers. This makes a duplicated tab rotate even if it wins the old lock during a reload gap. A reload that cannot reacquire its prior lock SHALL also rotate, create an empty session, and visibly report `browser_session_replaced` instead of reading the winning document's session. When Web Locks or Performance Navigation Timing are unavailable, the page SHALL show `browser_capability_unavailable` and SHALL NOT start a session. `POST /api/session` create SHALL accept only `{action:"create", tab_instance_id, document_start:"new"}` and `X-Code-Explorer-Tab`, with no session header. Session restore SHALL accept only `{action:"restore", tab_instance_id, document_start:"reload"}` with both `X-Code-Explorer-Session` and `X-Code-Explorer-Tab`. Every API request except session create SHALL require both ownership headers and SHALL reject a tab identifier that does not own the session. One live tab SHALL NOT read or change another live tab's search, focus, handles, or history.

#### Scenario: Tab reloads during a live session
- **WHEN** a browser tab reloads before its session expires
- **THEN** it restores the same focus and navigation history from the server session

#### Scenario: User opens another tab
- **WHEN** the explorer loads in a second or duplicated tab
- **THEN** the second tab receives an isolated session and changing it does not change the first tab

#### Scenario: Tab presents another session identifier
- **WHEN** one tab submits an identifier owned by another active tab
- **THEN** the server returns `invalid_browser_session` without revealing the other tab's state

#### Scenario: Duplicated tab presents copied storage
- **WHEN** a second `navigate` document starts with copied `tab_instance_id` and `browser_session_id`, whether or not the first document still holds the matching Web Lock
- **THEN** the second document rotates both identifiers through `create` before issuing search, focus, follow, history, or status

#### Scenario: Browser lacks the tab-isolation primitive
- **WHEN** the browser does not provide Web Locks
- **THEN** the page reports `browser_capability_unavailable` and sends no session or navigation request

### Requirement: Idle browser sessions expire predictably
A browser session SHALL use a monotonic clock and sliding idle expiry. Session acceptance and expiry SHALL serialize with core requests. At the request acceptance point, `now - last_accepted_at >= 1,800,000 ms` SHALL release the browser mapping and core session, and return HTTP 410 with `browser_session_expired` without dispatch or timer reset. An accepted request below that boundary SHALL set `last_accepted_at` to its acceptance time. After HTTP 410, the page SHALL discard both stored identifiers, acquire a new tab lock, call session `create`, show the prior expiry, and display an empty view.

#### Scenario: Session remains active
- **WHEN** accepted browser requests occur less than 30 minutes apart
- **THEN** the session and its navigation history remain available

#### Scenario: Session is idle for 30 minutes
- **WHEN** no request is accepted for 30 minutes
- **THEN** the server releases its state and the next page operation reports `browser_session_expired`

#### Scenario: Request arrives at the expiry boundary
- **WHEN** a request reaches the serialized acceptance point exactly 1,800,000 ms after the prior accepted request
- **THEN** it returns HTTP 410 with `browser_session_expired`, releases state, and does not dispatch the requested core operation

#### Scenario: Page recovers from expiry
- **WHEN** the browser receives `browser_session_expired`
- **THEN** it starts a new isolated session and shows an empty initial view instead of replaying stale handles

### Requirement: Static assets and server errors have stable behavior
The server SHALL serve only checked-in regular browser assets from the real `dist/browser` asset root resolved relative to the installed package module. It SHALL decode a URL path exactly once, reject invalid encoding, NUL, encoded separators, absolute forms, and parent traversal, real-path the candidate, reject links and reparse points, and prove the final identity remains below the real asset root before reading. It SHALL return correct content types and use stable JSON errors for API failures. Static-route failures SHALL return plain 404 responses without local filesystem paths.

#### Scenario: Browser requests the application shell
- **WHEN** the browser requests `/`
- **THEN** the server returns the packaged HTML shell and its same-origin script and style assets

#### Scenario: Static path attempts traversal
- **WHEN** a static URL normalizes outside the packaged asset root
- **THEN** the server returns 404 without reading or naming the external path

#### Scenario: Navigation core returns a redacted error
- **WHEN** the shared core rejects an operation
- **THEN** the HTTP adapter preserves its stable code and retryability without adding raw paths, environment data, or backend payloads

