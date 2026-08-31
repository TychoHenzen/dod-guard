# code-explorer/mcp-navigation Specification

## Purpose
Defines the read-only MCP interaction that lets an agent focus one symbol, follow visible relations, and retain explicit navigation history.
## Requirements
### Requirement: The MCP surface stays small and workspace-read-only
The Code Explorer SHALL expose `code_search`, `code_focus`, `code_follow`, `code_history`, and `code_status` as its navigation tools and SHALL expose no tool that modifies protected project content. Protected content is supported source plus non-generated project configuration. Internal session, cache, index, refresh state, and excluded backend cache files MAY change without changing protected content or an existing view's recorded content.

#### Scenario: Client lists Code Explorer tools
- **WHEN** an MCP client requests the available tools
- **THEN** the response includes the five navigation tools and no rename, create, update, or delete tool

#### Scenario: Client requests an unknown tool
- **WHEN** an MCP client invokes a tool outside the advertised surface
- **THEN** the server returns a structured unknown-tool error without changing project content or navigation state

#### Scenario: Client refreshes derived state
- **WHEN** the client requests refresh through `code_status`
- **THEN** the server may replace internal discovery data without modifying project files or existing view history

### Requirement: MCP tool schemas are closed and versioned
Every tool input SHALL be a closed JSON object that rejects unknown fields. `code_search` SHALL accept `query: string` plus optional `path_globs: string[]`, `languages: string[]`, `kinds: string[]`, `content: "all" | "production" | "tests"`, `include_generated: boolean`, and `limit: integer`. `code_focus` SHALL require `session_id`, `request_id`, and one `symbol_id`, with optional `body_limit_bytes`. `code_follow` SHALL require `session_id`, `request_id`, `view_id`, `handle`, and `relation: "definition" | "references" | "callers" | "callees" | "type" | "implementation"`, with optional `limit`. `code_history` SHALL require `session_id`, `request_id`, and `action: "back" | "forward" | "recent"`, with optional `limit` only for `recent`. `code_status` SHALL require `action: "status" | "start_session" | "refresh"`; `refresh` SHALL also require `session_id` and `request_id`, while the other actions SHALL reject them.

Every success SHALL return `schema_version: 1`, opaque `project_id`, integer `project_generation`, nullable integer `pending_generation`, one declared operation `state`, and `data`. Every failure SHALL use the error schema below and SHALL NOT return partial `data`. All ranges SHALL be zero-based, end-exclusive UTF-16 LSP positions. Empty arrays SHALL mean a proved empty result; unsupported operations SHALL use an explicit unavailable state instead of an empty array.

#### Scenario: Tool input contains an unknown field
- **WHEN** any tool input contains a field outside its closed schema or a field valid only for another action
- **THEN** the server returns `invalid_request` before session, filesystem, or backend work

#### Scenario: Successful tool response uses the common envelope
- **WHEN** any navigation tool succeeds
- **THEN** its response contains the versioned generation envelope and operation-specific data with no undeclared top-level field

#### Scenario: Backend reports an unsupported operation
- **WHEN** a relation is unsupported rather than proved to have zero results
- **THEN** the response uses an explicit unavailable state and does not return an empty result array as evidence

### Requirement: Focusing a symbol creates a bounded explicit view
`code_focus` SHALL return one selected symbol with a stable `symbol_id`, project-relative path, symbol kind, bounded declaration or body, an explicit `view_id`, and short handles for navigable names visible in that content. `symbol_id` SHALL be derived from the language, normalized path, semantic range, kind, and qualified name. The default body limit SHALL be 32 KiB of UTF-8, and a client MAY request 1 KiB through 128 KiB.

#### Scenario: Function focus succeeds
- **WHEN** the client focuses an unambiguous project function
- **THEN** the response contains that function's identity, kind, path, bounded body, a new `view_id`, and handles for its visible navigable names

#### Scenario: Symbol content exceeds the response budget
- **WHEN** the selected symbol's body exceeds the configured response budget
- **THEN** the response returns a UTF-8-safe prefix and reports `truncated`, `limit_bytes`, `returned_bytes`, and `total_bytes`

#### Scenario: Symbol has no retrievable body
- **WHEN** the semantic backend returns only a signature or location for the selected symbol
- **THEN** the response returns the available identity data without substituting a whole-file read

### Requirement: Sessions, views, and handles have explicit ownership
The server SHALL mint at least 128 bits of cryptographically random data for every opaque `session_id`, `view_id`, and handle. A session SHALL be bound to the MCP connection that created it. Every handle SHALL be interpreted together with its owning `session_id` and `view_id`, and navigation SHALL NOT depend on an unreported process-global current symbol.

`code_status` action `start_session` SHALL be the only session creation path. `code_focus`, `code_follow`, `code_history`, and state-changing `code_status` actions SHALL require a client-generated opaque `request_id` of 16 through 128 UTF-8 bytes. A session SHALL retain the last 64 request IDs, canonical request fingerprints, and responses for 5 minutes. The fingerprint SHALL cover the tool name and arguments after recursively sorting object keys and excluding `request_id`; array order and scalar values SHALL remain exact. An in-flight duplicate with the same fingerprint SHALL wait for and return the original response. A completed duplicate SHALL return the recorded response. Reuse with a different fingerprint SHALL return `request_id_conflict` without dispatch. After retention expiry, the identifier is unknown and MAY be accepted as a new request; clients SHALL NOT reuse expired identifiers.

#### Scenario: Client follows a valid visible handle
- **WHEN** the client passes a handle with the `view_id` that issued it
- **THEN** the server resolves the handle from that immutable view and creates a new view for the result

#### Scenario: Handle belongs to another view
- **WHEN** the client passes a handle with a different or expired `view_id`
- **THEN** the server returns `invalid_view_handle` without resolving a symbol or revealing whether another session owns the identifiers

#### Scenario: Client connection closes
- **WHEN** the MCP connection that owns a session closes
- **THEN** the server invalidates that session, its views, and its handles and does not resume them after reconnection

#### Scenario: Concurrent requests target one session
- **WHEN** two navigation requests for one session arrive concurrently
- **THEN** the server applies them in accepted-request order and returns each resulting history position

#### Scenario: Client reconnects after losing its session
- **WHEN** a new MCP connection submits an identifier owned by a closed connection
- **THEN** the server returns retryable `invalid_session` and the client must call `code_status` action `start_session`

#### Scenario: Client retries the same navigation request
- **WHEN** one session repeats a retained `request_id`
- **THEN** the server returns the original response without adding another history view or dispatching another backend operation

#### Scenario: Duplicate request is still in flight
- **WHEN** a session submits the same retained `request_id` and canonical request while the original operation is still running
- **THEN** the duplicate waits for the original operation and receives its response without consuming another queue or backend slot

#### Scenario: Request identifier is reused for different content
- **WHEN** a session submits a retained `request_id` with a different canonical request fingerprint
- **THEN** the server returns `request_id_conflict` and neither request history nor backend work changes

#### Scenario: Request identifier retention expires
- **WHEN** a client reuses an identifier after its five-minute retention entry has expired
- **THEN** the server treats it as a new request and does not claim that the earlier response was replayed

### Requirement: A visible handle can follow semantic relations
`code_follow` SHALL support definition, references, callers, callees, type, and implementation relations when the selected language backend can prove them. A local relation result SHALL contain `relation`, `relation_source: semantic`, `backend_name`, `backend_version`, `symbol_id`, `path`, `kind`, `range.start.line`, `range.start.character`, `range.end.line`, `range.end.character`, and `external: false`. A caller or callee SHALL also contain `call_site` in the same range form. An external result SHALL contain `relation`, backend identity, display name, and `external: true`, and SHALL omit local path, handle, and source content. Relation candidates SHALL default to 50, SHALL never exceed 200, and SHALL sort by normalized path, start position, kind, and symbol identity.

#### Scenario: Visible type follows to its definition
- **WHEN** the client follows a visible type handle using the definition relation
- **THEN** the response focuses the project-local definition and cites the source location used

#### Scenario: Client requests references
- **WHEN** the client follows a symbol handle using the references relation
- **THEN** the response returns bounded, source-located reference candidates that can each become the next focus

#### Scenario: Client requests callers or callees
- **WHEN** the client follows a callable handle using a supported caller or callee relation
- **THEN** the response returns only call-hierarchy results proven by the semantic backend and cites each call site

#### Scenario: Requested semantic relation is unavailable
- **WHEN** the active backend cannot provide the requested relation
- **THEN** the server returns an unavailable-relation result and does not relabel references as calls

### Requirement: Navigation history is explicit, bounded, and isolated
`code_history` SHALL provide Back, Forward, and recent-location operations for one navigation session without exposing or modifying another session. A session SHALL retain at most 64 views. Adding the sixty-fifth SHALL evict the oldest non-current view and invalidate its handles.

#### Scenario: Client navigates back
- **WHEN** a session has at least two focused views and requests Back
- **THEN** the prior view is restored with its original focus and handles

#### Scenario: Client navigates forward
- **WHEN** a session has moved Back and requests Forward
- **THEN** the next recorded view is restored

#### Scenario: New navigation follows Back
- **WHEN** a session moves Back and then follows a different handle
- **THEN** the new view is appended and the abandoned Forward branch is removed

#### Scenario: Client asks for recent locations
- **WHEN** the client requests recent history for one session
- **THEN** the response lists that session's bounded recent views without another session's locations

#### Scenario: History exceeds its capacity
- **WHEN** a session creates a sixty-fifth retained view
- **THEN** the oldest non-current view is evicted and later use of its handle returns `stale_view`

### Requirement: Navigation work has enforceable resource limits
The server SHALL reject a query longer than 1,024 Unicode code points, more than 32 filter values, any filter value above 256 UTF-8 bytes, a serialized tool request above 64 KiB, a requested candidate limit above 200, or a requested body limit above 128 KiB. Path filters SHALL support literal text plus `*`, `**`, and `?` globs and SHALL NOT interpret regular expressions. It SHALL allow at most four active backend requests per session and eight per project, coalesce concurrent refresh requests, and apply a configurable backend timeout that defaults to 10 seconds and cannot exceed 60 seconds.

#### Scenario: Request exceeds a declared limit
- **WHEN** a client submits a query, filter set, candidate limit, or body limit above its maximum
- **THEN** the server returns `resource_limit` with the violated limit and does not dispatch the request to a backend

#### Scenario: Backend request times out
- **WHEN** a backend operation exceeds the configured timeout
- **THEN** the server cancels or abandons that operation, releases its concurrency slot, and returns a retryable `backend_timeout`

#### Scenario: Refresh is already running
- **WHEN** another client requests refresh for the same project while refresh is active
- **THEN** the server joins the active refresh instead of starting duplicate project analysis

#### Scenario: Filter value is oversized
- **WHEN** a filter value exceeds 256 UTF-8 bytes or the serialized request exceeds 64 KiB
- **THEN** the server returns `resource_limit` before compiling a glob, reading the filesystem, or dispatching a backend

### Requirement: Aggregate retained state is bounded
One project process SHALL admit at most eight live MCP connections and eight live sessions, retain at most 16 MiB of view bodies and 32 MiB of derived discovery data, and queue at most 64 requests. A session idle for 30 minutes SHALL expire. Before allocating state that would cross a limit, the server SHALL reject the operation with `project_capacity`.

#### Scenario: Live session capacity is reached
- **WHEN** an additional client requests a session while eight sessions are live
- **THEN** the server returns retryable `project_capacity` without allocating a session identifier

#### Scenario: Retained view bytes reach the project limit
- **WHEN** creating a view would make retained view bodies exceed 16 MiB
- **THEN** the server evicts eligible oldest non-current views and returns `project_capacity` if eviction cannot create enough capacity

#### Scenario: Idle session expires
- **WHEN** a session has no accepted request for 30 minutes
- **THEN** its views and queued work are released and later use returns `invalid_session`

### Requirement: Errors use one redacted schema
Every tool error SHALL contain only `schema_version: 1`, one allowlisted `code`, `message` equal to that code, `retryable`, and optional `details`. The allowlisted codes SHALL be `unknown_tool`, `invalid_request`, `invalid_session`, `invalid_view_handle`, `stale_view`, `request_id_conflict`, `resource_limit`, `project_capacity`, `workspace_unavailable`, `backend_timeout`, `backend_crashed`, `backend_unavailable`, `unavailable_relation`, `invalid_backend_result`, `backend_response_limit`, `path_outside_project`, `path_identity_unavailable`, `path_identity_changed`, `invalid_project_root`, `project_root_inaccessible`, `project_root_unavailable`, `backend_identity_unverifiable`, `backend_identity_changed`, `backend_endpoint_rejected`, `backend_write_rejected`, `backend_capability_rejected`, `unsafe_backend_mode`, `unsupported_backend_version`, `classification_config_invalid`, `freshness_unavailable`, `incomplete_write`, `scan_limit`, `workspace_churn`, `refresh_failed`, and `internal_error`. `retryable` SHALL be true only for `invalid_session`, `project_capacity`, `workspace_unavailable`, `backend_timeout`, `backend_crashed`, `backend_unavailable`, `path_identity_changed`, `project_root_inaccessible`, `freshness_unavailable`, `incomplete_write`, `workspace_churn`, and `refresh_failed`. `details` SHALL be a closed object containing only `field`, `limit`, `actual`, `view_generation`, `current_generation`, `state`, or a normalized project-relative `path`. Errors SHALL omit raw backend payloads, absolute local paths, environment values, credentials, and source content not requested by the client.

#### Scenario: Backend returns a verbose failure
- **WHEN** a backend failure contains an absolute path, raw protocol payload, or environment value
- **THEN** the client receives a redacted stable error and none of those values

#### Scenario: Path input is rejected
- **WHEN** an input path fails project containment
- **THEN** the client receives `path_outside_project` without the resolved external path
