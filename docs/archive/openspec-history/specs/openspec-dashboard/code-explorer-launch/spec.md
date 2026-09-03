# openspec-dashboard/code-explorer-launch Specification

## Purpose
Defines how the local OpenSpec dashboard safely starts, reuses, and stops one project-scoped Code Explorer process without accepting browser-provided paths or proxying navigation.
## Requirements
### Requirement: Launch authority is a capability-bound registry snapshot
The dashboard SHALL publish one opaque registry revision with each ordered project list. A launch SHALL name one index from that list and repeat its revision. The server SHALL compare the revision before resolving the index, resolve the canonical project path only from the current server-side registry, and require that `openspec/` remains readable. The launch SHALL also require the unguessable 256-bit dashboard capability created at startup. The browser SHALL NOT supply a project path, replacement root, or command value.

#### Scenario: Registered readable project is selected
- **WHEN** the browser launches an index using the current registry revision and dashboard capability
- **THEN** the dashboard resolves that registry entry's canonical path as the only launch root

#### Scenario: Registry changed after rendering
- **WHEN** an insertion, removal, or reorder changes the registry revision before launch
- **THEN** the dashboard returns `stale_project_registry`, starts no process, and the browser reloads the project list before another launch

#### Scenario: Browser includes a project path
- **WHEN** a launch request contains a path, root, command argument, or unknown body field
- **THEN** the dashboard returns `invalid_launch_request` before executable discovery or process work

#### Scenario: Registry index does not exist
- **WHEN** a launch request names no registered project at that index in the matching snapshot
- **THEN** the dashboard returns `project_not_registered` and starts no process

#### Scenario: Registered project is no longer readable
- **WHEN** the selected registry entry no longer contains a readable `openspec/` directory
- **THEN** the dashboard returns `project_unavailable` and starts no process

### Requirement: Code Explorer discovery accepts only its packaged entry
The dashboard SHALL use `CODE_EXPLORER_JS` when it is set and SHALL otherwise use `packages/code-explorer/dist/bundle.js` from the monorepo checkout. The selected canonical file SHALL equal `dist/bundle.js` below a package whose `package.json` has `name: "code-explorer"` and `main: "dist/bundle.js"`, and whose `.claude-plugin/plugin.json` has `name: "code-explorer"`. `CODE_EXPLORER_JS` is trusted operator startup configuration, but it SHALL NOT bypass those package checks. The dashboard SHALL NOT search `PATH`, download an entry, or use a project-local executable.

#### Scenario: Operator override names a packaged entry
- **WHEN** `CODE_EXPLORER_JS` resolves to the declared bundle of a valid Code Explorer package
- **THEN** the dashboard freezes its canonical path and does not inspect the fallback entry

#### Scenario: Operator override is absent
- **WHEN** `CODE_EXPLORER_JS` is unset and the monorepo package has the declared bundle and metadata
- **THEN** the dashboard freezes the fallback bundle's canonical path

#### Scenario: Selected package contract is invalid
- **WHEN** the entry, package metadata, plugin metadata, package name, main field, or canonical bundle relationship is missing or invalid
- **THEN** the launch returns `code_explorer_unavailable` and starts no process or undeclared fallback

#### Scenario: Registered project contains an executable candidate
- **WHEN** the selected project contains a Code Explorer bundle, package, script, or configuration value
- **THEN** discovery ignores it and uses only the trusted startup selection

### Requirement: Child launch is fixed, shell-free, and environment-minimal
The dashboard SHALL spawn the current Node executable with `shell: false`. The fixed arguments SHALL be the validated entry, `serve`, `--project-root`, the canonical registry path, and `--no-open`. The working directory SHALL be the dashboard monorepo root. The child environment SHALL contain only the host variables named in the design. It SHALL omit `CODE_EXPLORER_JS`, Node injection variables, credential variables, project variables, and every request-derived value.

#### Scenario: New child is started
- **WHEN** a readable registered project has no live managed child
- **THEN** the dashboard starts the fixed Node argument vector and exact environment allowlist

#### Scenario: Project name contains shell syntax
- **WHEN** the canonical project path contains spaces, quotes, ampersands, or shell metacharacters
- **THEN** the exact path remains one child argument and no shell interpretation occurs

#### Scenario: Dashboard environment contains credentials or Node options
- **WHEN** the parent environment includes credential-shaped variables, `NODE_OPTIONS`, `NODE_PATH`, or `CODE_EXPLORER_JS`
- **THEN** none enters the child environment and required allowlisted host variables retain their exact values

### Requirement: The launch HTTP route is capability-protected and bounded
At startup, the dashboard SHALL generate separate 256-bit browser and replacement capabilities. The printed browser URL SHALL carry its capability only in the fragment. The page SHALL read and remove that fragment before launch, then send the capability in `X-OpenSpec-Dashboard-Capability`. Launch SHALL exist only as `POST /api/project/<registry-index>/code-explorer` with an `application/json` body containing only the 64-hex-character `registry_revision`, limited to 1 KiB. Before reading the body or resolving a project, the server SHALL require the capability, `Host`, and `Origin` to match the dashboard instance. It SHALL emit no CORS permission.

#### Scenario: Capability-bound launch request is valid
- **WHEN** the dashboard page submits the exact capability, route, authority, origin, content type, and current registry revision
- **THEN** the server may resolve the registered project and enter the launch lifecycle

#### Scenario: Another origin targets launch
- **WHEN** a request has another or missing Origin, another Host, or sends a CORS preflight
- **THEN** the server rejects it before body, registry, filesystem, or process work and grants no CORS permission

#### Scenario: Local process forges browser headers
- **WHEN** a local process copies Host and Origin but omits or guesses the browser capability
- **THEN** the server returns `invalid_dashboard_capability` before body, registry, filesystem, or process work

#### Scenario: Launch body exceeds its boundary
- **WHEN** the request body exceeds 1,024 received bytes
- **THEN** the server stops reading it and returns `launch_request_limit` before JSON parsing or launch work

#### Scenario: Launch route uses another method or body shape
- **WHEN** the client uses another method, content type, body schema, revision shape, or route
- **THEN** the dashboard returns `invalid_launch_request` and starts no process

### Requirement: Readiness uses bounded incremental line parsing
The dashboard SHALL incrementally decode stdout as UTF-8 and frame lines on `\n`, removing one preceding `\r`. A line SHALL match `Code Explorer: <url>` exactly. The URL SHALL use `http`, host `127.0.0.1`, one explicit port from 4410 through 4429 as required by the imported browser-server contract, path `/`, and no credentials, query, or fragment. Each stream SHALL have a 65,536-byte pre-readiness ceiling counted before decoding. Partial final lines do not establish readiness. A monotonic 30-second timer SHALL bound startup.

#### Scenario: Child reports valid chunked readiness
- **WHEN** one valid readiness line arrives across arbitrary chunks within 30 seconds and the child remains live
- **THEN** the launch returns that loopback URL with state `open`

#### Scenario: Child prints a non-loopback URL
- **WHEN** a readiness-shaped line contains another host, protocol, credentials, path, query, or fragment
- **THEN** the dashboard rejects it as `invalid_code_explorer_url`, stops the child, and returns no URL

#### Scenario: Child exits or ends a partial line before readiness
- **WHEN** the child exits before one complete valid readiness line
- **THEN** the launch returns `code_explorer_start_failed`, releases its managed slot, and exposes no raw child output

#### Scenario: Readiness deadline is reached
- **WHEN** the fake monotonic clock reaches 30 seconds without valid readiness
- **THEN** the dashboard stops the child, releases its slot, and returns `code_explorer_start_timeout`

#### Scenario: Stream output crosses its byte ceiling
- **WHEN** either stream receives 65,537 bytes before readiness regardless of chunk boundaries
- **THEN** the dashboard stops the child and returns `code_explorer_output_limit`, while exactly 65,536 bytes remain within the limit

### Requirement: Starts are coalesced and healthy children are reused
The dashboard SHALL key managed state by the canonical project path and its filesystem identity. One identity SHALL have at most one starting or open child. Concurrent launch requests SHALL join one startup. Reuse SHALL require the child to remain live and a one-second direct HTTP probe of its recorded `127.0.0.1` port. The probe SHALL send `GET /` with the exact Host, use no proxy, follow no redirect, require the connected remote address to remain `127.0.0.1`, accept only status 200, and discard at most 64 KiB. These checks import `code-explorer/browser-server` requirements `The server is reachable only through loopback` and `Static assets and server errors have stable behavior`.

#### Scenario: Two requests race for one project
- **WHEN** two launch requests for one canonical project identity arrive before readiness
- **THEN** both join one child startup and receive the same successful URL or stable failure

#### Scenario: Request targets a healthy child
- **WHEN** the project has an open live child and its direct root probe returns 200 without redirect
- **THEN** the dashboard returns its recorded URL with `reused: true` and starts no child

#### Scenario: Probe redirects or connects elsewhere
- **WHEN** the health response redirects, uses a proxy, connects to another address, exceeds its limit, times out, or returns another status
- **THEN** the dashboard treats the record as unhealthy, stops it, and does not reuse its URL

#### Scenario: Request targets a different project
- **WHEN** two registered project identities request Code Explorer
- **THEN** each owns a separate managed child and URL

#### Scenario: Recorded child or project identity changed
- **WHEN** the child exited or the registered root now has another filesystem identity
- **THEN** the dashboard removes the stale record and attempts one new startup only for a currently registered identity

### Requirement: Managed child capacity is finite
The dashboard SHALL admit at most eight starting or open Code Explorer children. An open child unused for 30 minutes becomes eligible for least-recently-used eviction before a new launch. A starting child SHALL NOT be evicted. When no eligible child exists, launch SHALL return retryable `code_explorer_capacity` and leave existing records unchanged.

#### Scenario: Idle capacity can be reclaimed
- **WHEN** an eighth child has been unused for at least 30 minutes and another project launches
- **THEN** the dashboard stops the least-recently-used eligible child before starting the new one

#### Scenario: Every capacity slot is active
- **WHEN** eight children are starting or were used within 30 minutes
- **THEN** another project receives `code_explorer_capacity` and no child is stopped or started

### Requirement: Managed shutdown is identity-safe
The dashboard SHALL signal each direct Code Explorer child and await its exit before releasing that record. It SHALL import `code-explorer/browser-server` requirement `The package starts a project-scoped browser server` for signal cleanup of sessions, listeners, watchers, and backend trees. It SHALL NOT run PID-only tree termination. Dashboard replacement SHALL use an exclusive, non-link ownership file under the protected per-user dashboard directory. The file SHALL contain a control URL and separate 256-bit replacement capability. Creation SHALL fail closed unless the directory and file have the platform-specific private ownership defined in the design.

A replacement SHALL accept only `http://127.0.0.1:<port>/api/admin/shutdown`, connect directly with no proxy or redirects, verify the connected remote address before sending the capability, bound the response to one second and 1 KiB, and wait for ownership-file removal. An invalid, unreachable, or incomplete owner SHALL produce `dashboard_replacement_failed` and SHALL NOT disclose the capability, signal its recorded PID, steal ownership, or admit launches.

#### Scenario: Dashboard stops with open explorers
- **WHEN** managed shutdown begins while Code Explorer children are open
- **THEN** launch admission closes, each direct child receives termination, and shutdown completes only after every child exit is observed

#### Scenario: Dashboard stops during startup
- **WHEN** shutdown begins before a child reports readiness
- **THEN** the child is terminated, joined requests receive `dashboard_shutting_down`, and later stdout is ignored

#### Scenario: Responsive dashboard replacement starts
- **WHEN** a new dashboard presents the ownership file's replacement capability to the live prior control endpoint
- **THEN** the prior dashboard completes managed child cleanup and releases ownership before the replacement admits launches

#### Scenario: Ownership file is exposed or replaceable
- **WHEN** the per-user directory or ownership file is linked, has another owner, or grants another non-administrator account access
- **THEN** dashboard startup fails with `dashboard_replacement_failed` before reading or writing a capability

#### Scenario: Ownership record contains an unsafe control target
- **WHEN** the control URL has another host, protocol, path, credentials, query, fragment, redirect, proxy route, or connected remote address
- **THEN** replacement returns `dashboard_replacement_failed` without sending the capability

#### Scenario: Prior dashboard ownership cannot be proved
- **WHEN** the ownership file exists but its control endpoint cannot complete authenticated shutdown
- **THEN** replacement returns `dashboard_replacement_failed` without PID signaling, ownership theft, or launch admission

### Requirement: Launch failures are stable and redacted
Every launch failure SHALL return one stable code, a retryable flag, and a message equal to the code. It SHALL omit capabilities, canonical paths, environment values, command arguments, raw child output, and stack traces. A failed launch SHALL leave other dashboard reads and project launch records usable.

#### Scenario: Child writes a verbose failure
- **WHEN** child stderr contains a local path, environment value, capability, or stack trace before failure
- **THEN** the browser receives only the stable redacted launch failure

#### Scenario: One project launch fails
- **WHEN** Code Explorer fails for one registered project while another project has a live child
- **THEN** the failed project becomes retryable and the other child remains reusable

#### Scenario: User retries after failure
- **WHEN** the cause is corrected and the user requests the failed project again
- **THEN** the dashboard performs a new bounded startup rather than replaying the prior failure

### Requirement: The bridge does not proxy navigation or write project content
The dashboard SHALL return only launch state, a validated loopback URL, reuse state, or a redacted error. It SHALL NOT proxy Code Explorer navigation, source, sessions, or status. The launched service remains governed by `code-explorer/browser-server` requirement `The HTTP boundary remains read-only and same-origin` and `code-explorer/language-adapters` requirements `One server process is confined to one canonical project root` and `Backend launch configuration is server-owned`. Dashboard lifecycle code SHALL write no registered-project content.

#### Scenario: Browser requests navigation through the dashboard
- **WHEN** a client submits a Code Explorer search, focus, follow, history, status, or arbitrary tool request to the dashboard launch route
- **THEN** the dashboard rejects it without forwarding the operation

#### Scenario: Real packaged launch lifecycle runs
- **WHEN** the packaged Code Explorer starts and stops against a disposable project fixture
- **THEN** protected source and configuration hashes remain unchanged and any service-owned cache remains outside that fixture
