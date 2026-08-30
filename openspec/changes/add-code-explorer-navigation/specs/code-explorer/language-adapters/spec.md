## Purpose

Defines the semantic navigation contract and honest capability reporting shared by Rust, Python, and C# project adapters.

## ADDED Requirements

### Requirement: Rust, Python, and C# share one capability-aware navigation contract
The service SHALL accept the same search, focus, definition, references, type-definition, implementation, callers, and callees request shapes for Rust, Python, and C#. Each adapter SHALL report every relation as `ready`, `unavailable`, or `failed`; accepting a shared request shape SHALL NOT imply that every language server supports every relation.

#### Scenario: Rust project is ready
- **WHEN** a Rust project has a compatible semantic backend
- **THEN** the service reports Rust ready and accepts the shared navigation operations

#### Scenario: Python project is ready
- **WHEN** a Python project has a compatible semantic backend
- **THEN** the service reports Python ready and accepts the shared navigation operations

#### Scenario: C# project is ready
- **WHEN** a C# project has a compatible semantic backend
- **THEN** the service reports C# ready and accepts the shared navigation operations

### Requirement: Semantic results remain authoritative
Definitions, references, implementations, types, callers, and callees SHALL be labeled as semantic relations only when the active language backend returned that relation.

#### Scenario: Structural candidate conflicts with a semantic definition
- **WHEN** structural discovery suggests one definition and the semantic backend returns another
- **THEN** the returned relation uses every path, range, identity, backend, and relation field from the validated semantic result, omits the structural candidate from the relation set, and may retain that candidate only as `discovery_only`

#### Scenario: Reference resembles a function call
- **WHEN** a reference location has no semantic call-hierarchy result
- **THEN** the service labels it as a reference and does not claim a caller or callee relation

### Requirement: Relation results cite their source locations
Every semantic relation result SHALL identify the normalized project-relative source location that supports it, or SHALL identify it as external when it is outside the project.

#### Scenario: Project-local caller is found
- **WHEN** the backend returns an incoming call from project source
- **THEN** the result includes the caller identity and normalized call-site location

#### Scenario: Definition belongs to an external dependency
- **WHEN** the backend resolves a definition outside the project root
- **THEN** the result identifies the relation as external and does not issue a project-local focus handle for it

### Requirement: Backend readiness and gaps are observable
`code_status` SHALL report each detected language, backend name and version, executable discovery source, state, relation capability map, last transition time, and redacted failure. States SHALL be `initializing`, `ready`, `degraded`, `refreshing`, `unavailable`, or `failed`. Initialization SHALL time out within 30 seconds. `ready` means initialization completed and the backend answered a capability probe. `degraded` means initialization completed while at least one required relation is unavailable.

#### Scenario: Required language server is missing
- **WHEN** a project requires a backend executable that cannot be launched
- **THEN** status identifies the language and missing backend while unaffected languages remain available

#### Scenario: Backend lacks call hierarchy
- **WHEN** a ready backend does not advertise call hierarchy
- **THEN** status marks callers and callees unavailable while supported definition and reference operations remain available

#### Scenario: Backend initialization fails
- **WHEN** a backend exits or returns an initialization error
- **THEN** status reports a stable initialization failure without exposing raw protocol payloads or terminating other adapters

#### Scenario: Every semantic backend is unavailable
- **WHEN** no semantic backend initializes for a detected project language
- **THEN** filename and cached structural discovery remain labeled `discovery_only`, while focus and semantic relations return `backend_unavailable`

#### Scenario: Backend version is incompatible
- **WHEN** backend discovery finds an executable whose version has no passing adapter contract
- **THEN** status reports `unavailable` with `unsupported_backend_version` and does not initialize that executable

### Requirement: One server process is confined to one canonical project root
The process SHALL take its project root only from its startup working directory or one `--project-root` startup argument, never from a tool request. The argument SHALL take precedence when both exist. Before initializing a backend, it SHALL resolve the root through the operating system's real-path operation and freeze its canonical path plus filesystem device and file identity from `stat`. On Windows it SHALL compare resolved paths with ordinal case-insensitive comparison after removing extended-path prefixes. On POSIX it SHALL compare resolved path segments case-sensitively. It SHALL reject broken links and paths that cannot be resolved. Before each protected read it SHALL revalidate the root tuple.

For every existing local input and backend-returned local path, the service SHALL real-path and stat the path, prove it is a descendant, open it with no-follow semantics where the host provides them, compare the opened handle's device and file identity with the checked path, and revalidate the path and root tuple after opening. A host that cannot establish stable opened-file identity SHALL fail the read with `path_identity_unavailable`. Any mismatch, symlink, junction, alias, parent escape, mount replacement, or directory replacement SHALL fail closed before bytes are returned.

#### Scenario: Client supplies a parent-directory path
- **WHEN** a navigation input resolves outside the configured project root
- **THEN** the request fails before a backend receives the out-of-project path

#### Scenario: In-root symlink targets an external file
- **WHEN** a project path appears inside the root but its real target is outside the canonical root
- **THEN** the request fails before backend dispatch and the external real path is not returned

#### Scenario: Backend returns a symlinked external file
- **WHEN** a backend returns a local file URI whose real target is not a descendant of the frozen root
- **THEN** the result is classified external and contains no local path, body, source, handle, or follow operation

#### Scenario: Local path changes during a protected read
- **WHEN** a checked in-root path is replaced, retargeted, or moved before or while its file handle opens
- **THEN** opened-file identity validation fails, no bytes or handle are returned, and the operation reports `path_identity_changed`

#### Scenario: Startup root is invalid
- **WHEN** the startup root is missing, inaccessible, or cannot be canonicalized
- **THEN** the process reports `invalid_project_root`, identifies whether `cwd` or `--project-root` was rejected without returning its absolute value, and initializes no semantic backend

### Requirement: Backend launch configuration is server-owned
Backend executable names, arguments, environment keys, and protocol endpoints SHALL come only from the versioned adapter allowlist produced by the dependency spike. The record SHALL contain one platform-specific executable basename, compatible version range, and fixed argument vector for each language. Runtime SHALL search only a server-owned command path with project-root descendants removed, resolve the executable to a non-project canonical regular file, reject symlinks and reparse points, and run the allowlisted version probe without a shell before every launch and restart. It SHALL retain that canonical path, device, file identity, SHA-256 digest, and observed version for the process lifetime. If the host cannot supply a stable device or file identity, or any required identity read fails, discovery SHALL stop with `backend_identity_unverifiable` and SHALL NOT spawn the executable. Immediately before process creation and immediately after LSP initialization, it SHALL repeat the stat, digest, and version tuple check. A mismatch at any check SHALL terminate the new process, produce `backend_identity_changed`, and leave the language unavailable. The installed executable and its host-owned directory are explicit trusted prerequisites; a host user who can replace them is outside the project-input threat boundary.

Project files and tool inputs SHALL NOT select or alter launch configuration. The service SHALL launch no shell or project build command, SHALL reject every backend `workspace/applyEdit` or equivalent write request, and SHALL permit network endpoints only on loopback. A missing allowlisted executable SHALL produce `backend_unavailable`; the service SHALL never install a backend automatically.

#### Scenario: Project config names another executable
- **WHEN** a project file attempts to configure a backend command or argument
- **THEN** the service ignores it, reports `project_backend_config_ignored`, and launches only the allowlisted adapter command

#### Scenario: Backend requests a workspace edit
- **WHEN** a semantic backend sends `workspace/applyEdit` or another protocol write request
- **THEN** the service rejects the request, records `backend_write_rejected`, and leaves protected project content unchanged

#### Scenario: Allowlisted executable is missing
- **WHEN** no allowlisted executable is discoverable on the server-owned command path
- **THEN** the language becomes unavailable and discovery-only behavior remains available without automatic installation

#### Scenario: Backend advertises a remote endpoint
- **WHEN** an adapter attempts to use a non-loopback network endpoint
- **THEN** initialization fails with `backend_endpoint_rejected`

#### Scenario: Allowlisted executable changes before restart
- **WHEN** the resolved executable path, device, file identity, digest, or probed version differs from the tuple accepted earlier in the process
- **THEN** restart is refused with `backend_identity_changed` and the language remains unavailable

#### Scenario: Executable changes during launch
- **WHEN** the immediate pre-spawn or post-initialization tuple differs from the previously accepted executable tuple
- **THEN** the new process is terminated, no result is accepted, and status reports `backend_identity_changed`

#### Scenario: Host cannot prove executable identity
- **WHEN** the host cannot return stable device and file identity values or an identity read fails
- **THEN** discovery reports `backend_identity_unverifiable`, does not spawn the executable, and does not relabel the failure as an identity change

### Requirement: Known project-controlled execution hooks stay disabled
The installed allowlisted backend executable is a trusted host dependency. Project source and configuration are not trusted to select executable behavior. An allowlisted backend mode SHALL disable its documented project build scripts, procedural macros, analyzers, source generators, tasks, extensions, workspace commands, and project-selected executables. The adapter selection record SHALL contain the exact supported backend version, fixed initialization options, and a passing sentinel-fixture result for those known hooks. Rust safe mode SHALL disable Cargo build scripts, procedural macros, check-on-save commands, and project configuration overrides. C# safe mode SHALL disable analyzers and source generators.

Python safe mode SHALL remove project-root entries from `PATH` and clear `PYTHONPATH`, `VIRTUAL_ENV`, and `CONDA_PREFIX`. It SHALL return empty values for client configuration requests for `python.pythonPath`, `python.venvPath`, and `python.analysis.extraPaths`. A direct Python backend SHALL run only against an internal immutable mirror for one captured project generation. The mirror SHALL contain only supported non-sensitive `.py` and `.pyi` content whose hashes match that generation, a service-owned minimal Pyright configuration, and the allowlisted bundled typeshed. It SHALL contain no project `pyrightconfig.json`, `pyproject.toml`, virtual environment, plugin, extension, executable, symlink, or external path. After population, the service SHALL make the mirror read-only before backend launch. Backend file URIs SHALL map through a closed mirror manifest to the original project-relative path and SHALL be accepted only while both content hashes match the captured generation. A project configuration add or change SHALL reserve a new generation, terminate the old Python backend, and build a new mirror; the running backend SHALL never watch the live project root.

Before building the mirror, the service SHALL parse `pyrightconfig.json` and `[tool.pyright]` from `pyproject.toml` when present and reject `extends`, `venvPath`, `venv`, `extraPaths`, `typeshedPath`, `stubPath`, `executionEnvironments`, or any absolute, parent-traversing, symlinked, or external path value with `unsafe_backend_mode`. The Python sentinel SHALL include a project interpreter, virtual environment, external import path, configuration replacement, and side effect. Semantic startup must either use the immutable mirror without executing the sentinel or remain unavailable.

If the named backend version cannot prove its language's safe mode, that language SHALL remain `unavailable` with `unsafe_backend_mode`. No backend MAY fall back to its unsafe defaults. This contract does not claim to sandbox a compromised trusted backend executable.

#### Scenario: Rust project contains executable build hooks
- **WHEN** a fixture contains a build script, procedural macro, Cargo executable override, and sentinel side effect
- **THEN** Rust semantic startup and navigation either complete without executing the sentinel or fail with `unsafe_backend_mode`

#### Scenario: C# project contains executable analyzers
- **WHEN** a fixture contains an analyzer or source generator with a sentinel side effect
- **THEN** C# semantic startup and navigation either complete without executing the sentinel or fail with `unsafe_backend_mode`

#### Scenario: Python project selects an interpreter or external path
- **WHEN** Python configuration selects a project interpreter, virtual environment, extension path, or external analysis path
- **THEN** Python remains unavailable with `unsafe_backend_mode` and no selected interpreter or project-controlled code executes

#### Scenario: Python configuration changes after validation
- **WHEN** project Pyright configuration is added or replaced after one Python generation was mirrored
- **THEN** the old backend terminates, receives no live configuration event, and no new Python result publishes until a new immutable mirror passes validation

#### Scenario: Backend lacks a verified safe configuration
- **WHEN** the adapter selection record lacks a passing no-execution sentinel result for one backend mode
- **THEN** runtime discovery rejects that mode before launch

### Requirement: Backend results are validated before use
The service SHALL validate every backend identity, language, location range, payload size, and real path before storing or returning it. A local range SHALL fit the current file bounds. A local payload SHALL not exceed 1 MiB before normalization. Invalid results SHALL be rejected. External locations SHALL remain non-navigable.

#### Scenario: Backend returns an invalid range
- **WHEN** a backend result has a negative position or extends beyond the current file
- **THEN** the result is rejected as `invalid_backend_result` and is not assigned a handle

#### Scenario: Backend returns an oversized payload
- **WHEN** one backend response exceeds 1 MiB before normalization
- **THEN** the operation fails with `backend_response_limit` and the payload is neither stored nor echoed

#### Scenario: Backend returns another language unexpectedly
- **WHEN** a backend result declares a language outside the adapter's detected language set
- **THEN** the result is rejected and status records a redacted adapter gap

#### Scenario: Backend returns a virtual document
- **WHEN** a backend relation uses a URI scheme other than `file` or a document version not mapped to the current project generation
- **THEN** that relation becomes `unavailable`, the adapter becomes `degraded`, and no virtual or stale content receives a handle

### Requirement: Direct LSP adapters follow one bounded process lifecycle
Direct adapters SHALL use JSON-RPC 2.0 over stdio with ASCII `Content-Length` headers, `\r\n\r\n`, and UTF-8 JSON bodies. They SHALL send one `initialize` request with the frozen root URI, declared client capabilities, and the allowlisted safe initialization options, then `initialized`. Request IDs SHALL be monotonic positive integers. Shutdown SHALL send `shutdown`, await its response for at most 5 seconds, send `exit`, await process exit for at most 5 seconds, then force termination. Timed-out requests SHALL send `$/cancelRequest` and ignore any later response. Two request timeouts within 60 seconds SHALL force the same bounded termination and consume one crash-restart attempt. The client SHALL reject every `client/registerCapability` request and operate only from capabilities returned by `initialize`.

The client SHALL accept only `window/logMessage`, `window/showMessage`, `telemetry/event`, and `$/progress` as unsolicited notifications, redact and bound their payloads, and ignore them for semantic results. It SHALL answer any other unsolicited request with JSON-RPC `MethodNotFound`; `workspace/applyEdit` SHALL additionally record `backend_write_rejected`. Malformed unsolicited protocol data SHALL fail the backend. Restart SHALL use the two-attempt schedule below. A third crash, forced termination, or initialization failure within 60 seconds SHALL leave the backend unavailable until explicit refresh.

#### Scenario: LSP backend starts and stops normally
- **WHEN** a direct adapter launches a compatible backend
- **THEN** the recorded protocol trace contains initialize, initialized, bounded semantic requests, shutdown, and exit in that order with valid framing

#### Scenario: LSP response is malformed or oversized
- **WHEN** a backend returns invalid framing, invalid JSON-RPC, an incomplete body, or more than 1 MiB
- **THEN** the adapter rejects in-flight results, marks the backend failed, and does not return the malformed content

#### Scenario: LSP request times out
- **WHEN** a request reaches its configured timeout
- **THEN** the adapter sends `$/cancelRequest`, returns `backend_timeout`, and ignores a later response for that request ID

#### Scenario: LSP backend crashes repeatedly
- **WHEN** a backend crashes during a request
- **THEN** in-flight calls return `backend_crashed`, the adapter retries at most twice with 250 ms then 1 second delay, and a third crash within 60 seconds leaves it unavailable until explicit refresh

#### Scenario: Backend dynamically registers a write method
- **WHEN** a backend requests any dynamic registration
- **THEN** the client rejects the registration and records `backend_capability_rejected`

#### Scenario: Backend ignores cancellation or shutdown
- **WHEN** a backend ignores cancellation, produces two request timeouts within 60 seconds, or does not exit within the shutdown deadlines
- **THEN** the adapter force-terminates it, consumes one bounded restart attempt, and never accepts its late results

#### Scenario: Backend sends an unsolicited request
- **WHEN** a backend sends a request other than the explicitly handled write request
- **THEN** the adapter returns JSON-RPC `MethodNotFound`, retains no payload, and continues only when framing remains valid

### Requirement: Production runtime uses a checked-in adapter selection record
The change SHALL produce a checked-in adapter selection record containing schema version, source dependency versions, one selected path for each language, one platform-specific executable prerequisite and fixed arguments for each language, compatible version range, safe initialization options, capability matrix, and sentinel evidence. Runtime SHALL read only that record and SHALL never invoke spike commands, modules, or output generation.

#### Scenario: Runtime starts without spike dependencies
- **WHEN** the production bundle starts with Serena, Symbols, spike fixtures, and spike commands unavailable
- **THEN** it loads the checked-in record, attempts only its approved runtime backends, and exposes status without accessing a spike dependency

#### Scenario: Approved C# executable is absent
- **WHEN** the selection record names one C# executable and no compatible version is present
- **THEN** C# status is `unavailable` with `backend_unavailable` and the runtime does not try another unrecorded server

### Requirement: Partial files fail locally instead of disabling a language
Adapters SHALL accept UTF-8 and UTF-8-with-BOM source. A file with invalid encoding, syntax errors, unsupported generated syntax, or incomplete semantic analysis SHALL carry a per-file `partial` or `unavailable` status. Other files and languages SHALL remain queryable.

#### Scenario: One source file has invalid encoding
- **WHEN** a supported-extension file cannot be decoded as UTF-8 or UTF-8 with BOM
- **THEN** status identifies the project-relative file as unavailable while navigation in other files continues

#### Scenario: One file contains syntax errors
- **WHEN** a backend reports incomplete analysis for one file with syntax errors
- **THEN** results from that file are labeled partial and no missing relation is inferred

#### Scenario: Project contains unsupported source syntax
- **WHEN** an adapter cannot analyze a supported-extension file generated with unsupported syntax
- **THEN** the file is reported as unavailable and does not terminate project indexing

### Requirement: Language fixtures define one exact semantic oracle
The adapter contract SHALL pass the same located helper relation in checked-in Rust, Python, and C# fixtures, using zero-based line and character positions.

#### Scenario: Rust helper oracle
- **WHEN** `src/lib.rs` contains `helper()` at line 1 characters 4 through 10 and `fn helper` at line 4 characters 3 through 9
- **THEN** definition from the call resolves to the line 4 range, callers of `helper` include `entry` at the line 1 call site, and callees of `entry` include `helper` at that call site

#### Scenario: Python helper oracle
- **WHEN** `src/sample.py` contains `helper()` at line 1 characters 4 through 10 and `def helper` at line 3 characters 4 through 10
- **THEN** definition from the call resolves to the line 3 range, callers of `helper` include `entry` at the line 1 call site, and callees of `entry` include `helper` at that call site

#### Scenario: C# helper oracle
- **WHEN** `src/Demo.cs` contains `Helper()` at line 1 characters 33 through 39 and `void Helper` at line 2 characters 24 through 30
- **THEN** definition from the call resolves to the line 2 range, callers of `Helper` include `Entry` at the line 1 call site, and callees of `Entry` include `Helper` at that call site
