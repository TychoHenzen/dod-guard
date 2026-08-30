## 1. Package Boundary and Dependency Spike

- [x] 1.1 Create `packages/code-explorer` with package, TypeScript, plugin, MCP, main-module, bundle, and package test configuration matching the monorepo contracts.
<!-- status: completed -->
- [x] 1.2 Add a standalone MCP handshake test harness and a controllable fake semantic adapter before connecting a real backend.
<!-- status: completed -->
- [x] 1.3 Install or launch the current public Symbols MCP release in an isolated test configuration and record the exact version and supported process boundary.
<!-- status: completed -->
- [x] 1.4 Run the bounded Serena-versus-Symbols matrix against `TranscriptContent`, `AgentEvent`, `SendMessage`, `Tool`, and `project_block`, recording every observation required by `design.md`.
<!-- status: completed -->
- [x] 1.5 Apply the fixed selection rule, record the selected adapter path and unsupported operations, and stop production source work if the spike record is incomplete.
<!-- status: completed -->
- [x] 1.6 Implement and test the advertised five-tool workspace-read-only MCP surface, internal refresh boundary, and structured unknown-tool failure.
<!-- status: completed -->
  <!-- covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client lists Code Explorer tools -->
  <!-- covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client requests an unknown tool -->
  <!-- covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client refreshes derived state -->
- [x] 1.7 Implement closed versioned request and response schemas for every tool and action.
<!-- status: completed -->
  <!-- covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Tool input contains an unknown field -->
  <!-- covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Successful tool response uses the common envelope -->
  <!-- covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Backend reports an unsupported operation -->
- [x] 1.8 Run the package handshake practice check from the built bundle and confirm no project-editing tool is advertised.
<!-- status: completed -->

## 2. Semantic Adapter Contract

- [x] 2.1 Define normalized symbol, location, relation, capability, revision, and backend-status types with fake-adapter contract tests.
<!-- status: completed -->
- [x] 2.2 Implement and test shared Rust adapter readiness and navigation request shapes.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Rust, Python, and C# share one capability-aware navigation contract :: Rust project is ready -->
- [x] 2.3 Implement and test shared Python adapter readiness and navigation request shapes.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Rust, Python, and C# share one capability-aware navigation contract :: Python project is ready -->
- [x] 2.4 Implement and test shared C# adapter readiness and navigation request shapes.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Rust, Python, and C# share one capability-aware navigation contract :: C# project is ready -->
- [x] 2.5 Preserve semantic authority when structural discovery conflicts or a reference resembles a call.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Semantic results remain authoritative :: Structural candidate conflicts with a semantic definition -->
  <!-- covers: code-explorer/language-adapters :: Semantic results remain authoritative :: Reference resembles a function call -->
- [x] 2.6 Return source-located project relations and label external definitions without issuing project handles.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Relation results cite their source locations :: Project-local caller is found -->
  <!-- covers: code-explorer/language-adapters :: Relation results cite their source locations :: Definition belongs to an external dependency -->
- [x] 2.7 Report missing servers, unsupported call hierarchy, and isolated initialization failures through `code_status`.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Backend readiness and gaps are observable :: Required language server is missing -->
  <!-- covers: code-explorer/language-adapters :: Backend readiness and gaps are observable :: Backend lacks call hierarchy -->
  <!-- covers: code-explorer/language-adapters :: Backend readiness and gaps are observable :: Backend initialization fails -->
  <!-- covers: code-explorer/language-adapters :: Backend readiness and gaps are observable :: Every semantic backend is unavailable -->
  <!-- covers: code-explorer/language-adapters :: Backend readiness and gaps are observable :: Backend version is incompatible -->
- [x] 2.8 Enforce the startup-frozen canonical project root across parent paths, symlinks, junctions, and invalid startup roots.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Client supplies a parent-directory path -->
  <!-- covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: In-root symlink targets an external file -->
  <!-- covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Startup root is invalid -->
  <!-- covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Backend returns a symlinked external file -->
  <!-- covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Local path changes during a protected read -->
- [x] 2.9 Validate backend ranges, payload sizes, declared languages, and local path containment before retaining a result.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns an invalid range -->
  <!-- covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns an oversized payload -->
  <!-- covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns another language unexpectedly -->
  <!-- covers: code-explorer/language-adapters :: Backend results are validated before use :: Backend returns a virtual document -->
- [x] 2.10 Isolate invalid encodings, syntax errors, and unsupported generated syntax to per-file partial or unavailable states.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Partial files fail locally instead of disabling a language :: One source file has invalid encoding -->
  <!-- covers: code-explorer/language-adapters :: Partial files fail locally instead of disabling a language :: One file contains syntax errors -->
  <!-- covers: code-explorer/language-adapters :: Partial files fail locally instead of disabling a language :: Project contains unsupported source syntax -->
- [x] 2.11 Enforce the server-owned backend allowlist, reject project command configuration and protocol writes, and permit loopback endpoints only.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Project config names another executable -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Backend requests a workspace edit -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Allowlisted executable is missing -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Backend advertises a remote endpoint -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Allowlisted executable changes before restart -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Executable changes during launch -->
  <!-- covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Host cannot prove executable identity -->
  <!-- covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Rust project contains executable build hooks -->
  <!-- covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: C# project contains executable analyzers -->
  <!-- covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Python project selects an interpreter or external path -->
  <!-- covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Python configuration changes after validation -->
  <!-- covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Backend lacks a verified safe configuration -->
- [x] 2.12 Create the exact Rust, Python, and C# helper fixtures and machine-readable range manifests.
<!-- status: completed -->
  <!-- covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: Rust helper oracle -->
  <!-- covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: Python helper oracle -->
  <!-- covers: code-explorer/language-adapters :: Language fixtures define one exact semantic oracle :: C# helper oracle -->
- [ ] 2.13 Implement and test JSON-RPC stdio framing, initialization, cancellation, dynamic registration, crash restart, shutdown, and malformed-response handling.
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP backend starts and stops normally -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP response is malformed or oversized -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP request times out -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP backend crashes repeatedly -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend dynamically registers a write method -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend ignores cancellation or shutdown -->
  <!-- covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend sends an unsolicited request -->
- [ ] 2.14 Persist the exact adapter selection record and prove every production startup path runs without spike-only dependencies.
  <!-- covers: code-explorer/language-adapters :: Production runtime uses a checked-in adapter selection record :: Runtime starts without spike dependencies -->
  <!-- covers: code-explorer/language-adapters :: Production runtime uses a checked-in adapter selection record :: Approved C# executable is absent -->
- [ ] 2.15 Run the same definition, reference, call, external-location, and unavailable-relation practice fixture against Rust, Python, and C#.

## 3. Symbol and File Discovery

- [ ] 3.1 Implement exact, prefix, fuzzy, and filename discovery with match evidence.
  <!-- covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Exact symbol name exists -->
  <!-- covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Symbol name is misspelled -->
  <!-- covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Query matches a filename -->
- [ ] 3.2 Implement deterministic ranking and stable tie keys for unchanged project revisions.
  <!-- covers: code-explorer/symbol-discovery :: Search order is deterministic :: Equal-rank candidates are returned -->
  <!-- covers: code-explorer/symbol-discovery :: Search order is deterministic :: Search is repeated without project changes -->
- [ ] 3.3 Apply path, language, symbol-kind, test, production, and generated filters before ranking and limiting.
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client filters by symbol kind and path -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client requests production content -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Generated content uses the default policy -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Client includes generated content -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Classification rules conflict -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: File classification is unknown -->
  <!-- covers: code-explorer/symbol-discovery :: Search filters narrow results before the limit :: Classification configuration is malformed -->
- [ ] 3.4 Apply the non-overridable sensitive-path denylist before watching, backend initialization, indexing, or output.
  <!-- covers: code-explorer/symbol-discovery :: Sensitive paths are never indexed or returned :: Project contains a denied credential file -->
  <!-- covers: code-explorer/symbol-discovery :: Sensitive paths are never indexed or returned :: Project configuration tries to include a denied path -->
- [ ] 3.5 Return bounded candidate sets, omitted counts, narrowing filters, and honest empty results.
  <!-- covers: code-explorer/symbol-discovery :: Broad searches return a refinement response :: Candidate count exceeds the limit -->
  <!-- covers: code-explorer/symbol-discovery :: Broad searches return a refinement response :: No candidate matches -->
- [ ] 3.6 Route empty and whitespace-only searches exclusively to ready or not-ready landmark results.
  <!-- covers: code-explorer/symbol-discovery :: Empty search is reserved for landmarks :: Empty query has no qualifying landmarks -->
  <!-- covers: code-explorer/symbol-discovery :: Empty search is reserved for landmarks :: Whitespace-only query is submitted -->
- [ ] 3.7 Normalize browser-independent project paths and reject out-of-root backend locations.
  <!-- covers: code-explorer/symbol-discovery :: Browser-independent paths use one form :: Backend returns Windows separators -->
  <!-- covers: code-explorer/symbol-discovery :: Browser-independent paths use one form :: Backend returns a path outside the project root -->
- [ ] 3.8 Run the discovery practice fixture with misspellings, duplicate generated symbols, tests, sensitive paths, broad queries, and Windows-form paths.

## 4. Focus Views, Handles, and History

- [ ] 4.1 Implement immutable focus views with bounded bodies, identity metadata, revisions, and visible-symbol handles.
  <!-- covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Function focus succeeds -->
  <!-- covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Symbol content exceeds the response budget -->
  <!-- covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Symbol has no retrievable body -->
- [ ] 4.2 Mint connection-bound opaque sessions, views, and handles and serialize concurrent requests within one session.
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client follows a valid visible handle -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Handle belongs to another view -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client connection closes -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Concurrent requests target one session -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client reconnects after losing its session -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client retries the same navigation request -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Duplicate request is still in flight -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Request identifier is reused for different content -->
  <!-- covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Request identifier retention expires -->
- [ ] 4.3 Follow definition, reference, caller, callee, type, and implementation relations with bounded candidates and honest unsupported results.
  <!-- covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Visible type follows to its definition -->
  <!-- covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Client requests references -->
  <!-- covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Client requests callers or callees -->
  <!-- covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Requested semantic relation is unavailable -->
- [ ] 4.4 Implement session-isolated Back, Forward, branch replacement, recent locations, and deterministic 64-view eviction.
  <!-- covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client navigates back -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client navigates forward -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: New navigation follows Back -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client asks for recent locations -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: History exceeds its capacity -->
- [ ] 4.5 Enforce query, filter, result, body, concurrency, timeout, and refresh-coalescing resource limits.
  <!-- covers: code-explorer/mcp-navigation :: Navigation work has enforceable resource limits :: Request exceeds a declared limit -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation work has enforceable resource limits :: Backend request times out -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation work has enforceable resource limits :: Refresh is already running -->
  <!-- covers: code-explorer/mcp-navigation :: Navigation work has enforceable resource limits :: Filter value is oversized -->
- [ ] 4.6 Enforce project-wide connection, session, retained-byte, queue, and idle-expiry limits before allocation.
  <!-- covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Live session capacity is reached -->
  <!-- covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Retained view bytes reach the project limit -->
  <!-- covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Idle session expires -->
- [ ] 4.7 Normalize every failure through the stable redacted error schema.
  <!-- covers: code-explorer/mcp-navigation :: Errors use one redacted schema :: Backend returns a verbose failure -->
  <!-- covers: code-explorer/mcp-navigation :: Errors use one redacted schema :: Path input is rejected -->
- [ ] 4.8 Run the navigation practice fixture from fuzzy search through focus, visible-handle follow, Back, Forward, and stale-handle rejection.

## 5. Evidence-Ranked Project Landmarks

- [ ] 5.1 Return grouped landmarks for an empty query and report landmark initialization instead of arbitrary fallback symbols.
  <!-- covers: code-explorer/project-landmarks :: An empty search returns project landmarks :: Client has no search term -->
  <!-- covers: code-explorer/project-landmarks :: An empty search returns project landmarks :: Landmark index is not ready -->
- [ ] 5.2 Compute and expose the declared landmark counters and score while treating unavailable evidence as zero.
  <!-- covers: code-explorer/project-landmarks :: Landmarks use a visible deterministic score :: Public type is used across production directories -->
  <!-- covers: code-explorer/project-landmarks :: Landmarks use a visible deterministic score :: Call evidence is unavailable -->
- [ ] 5.3 Penalize test-only candidates and remove generated duplicate identities from default landmarks.
  <!-- covers: code-explorer/project-landmarks :: Tests and generated content do not dominate landmarks :: Symbol appears only in tests -->
  <!-- covers: code-explorer/project-landmarks :: Tests and generated content do not dominate landmarks :: Generated symbol duplicates a source symbol -->
- [ ] 5.4 Group and bound types, messages or events, services, entry points, and common actions with omitted counts.
  <!-- covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: Project contains candidates for several groups -->
  <!-- covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: One group exceeds its limit -->
  <!-- covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: Candidate matches several group rules -->
- [ ] 5.5 Exclude raw frequency from landmark selection and use deterministic tie ordering.
  <!-- covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Generic identifier occurs most often -->
  <!-- covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Landmark scores tie -->
  <!-- covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Language does not report visibility -->
- [ ] 5.6 Run the landmark practice fixture and inspect every selected concept's visible evidence and group.

## 6. Revisioned Workspace Freshness

- [ ] 6.1 Watch or receive saved renames and deletions, invalidate affected data, and expose pending backend processing.
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Existing symbol is renamed on disk -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Source file is deleted -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Backend is still processing a change -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Editor saves by atomic replacement -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Watcher reports overflow -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Filesystem watching is unavailable -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Reconciliation loses read permission -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Watcher silently misses a change -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Events are duplicated or reordered -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: File remains incomplete -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Full scan exceeds a bound -->
  <!-- covers: code-explorer/workspace-freshness :: Saved project changes become visible without a process restart :: Initial reconciliation cannot publish -->
- [ ] 6.2 Attach monotonic project generations to every response and discard analysis that finishes for an older generation.
  <!-- covers: code-explorer/workspace-freshness :: Every result identifies its monotonic project generation :: Two responses use the same analyzed state -->
  <!-- covers: code-explorer/workspace-freshness :: Every result identifies its monotonic project generation :: Relevant source content changes -->
  <!-- covers: code-explorer/workspace-freshness :: Every result identifies its monotonic project generation :: Older analysis finishes after newer analysis -->
  <!-- covers: code-explorer/workspace-freshness :: Every result identifies its monotonic project generation :: One saved change advances the observable timeline -->
  <!-- covers: code-explorer/workspace-freshness :: Every result identifies its monotonic project generation :: Files change during analysis -->
- [ ] 6.3 Serialize project-wide generation reservation, reconciliation, and refresh across every MCP connection.
  <!-- covers: code-explorer/workspace-freshness :: Project generation work has one global order :: Two sessions request refresh concurrently -->
  <!-- covers: code-explorer/workspace-freshness :: Project generation work has one global order :: Search races with a generation reservation -->
- [ ] 6.4 Preserve immutable old views and return explicit stale-view behavior after the project advances.
  <!-- covers: code-explorer/workspace-freshness :: Views remain immutable after creation :: Client follows a handle from an older view -->
  <!-- covers: code-explorer/workspace-freshness :: Views remain immutable after creation :: Client restores old history -->
- [ ] 6.5 Rebuild derived discovery and landmark data atomically while retaining the prior complete revision after refresh failure.
  <!-- covers: code-explorer/workspace-freshness :: Explicit refresh rebuilds derived discovery data :: Refresh completes -->
  <!-- covers: code-explorer/workspace-freshness :: Explicit refresh rebuilds derived discovery data :: Refresh fails before completion -->
- [ ] 6.6 Report project root, revision, working-tree source states, exclusions, readiness, and pending analysis through `code_status`.
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Working tree contains source changes -->
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Generated path is excluded -->
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Frozen project root disappears -->
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Project root is temporarily inaccessible -->
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Same root identity becomes accessible again -->
  <!-- covers: code-explorer/workspace-freshness :: Workspace status exposes freshness-relevant state :: Root accessibility does not recover -->
- [ ] 6.7 Run the freshness practice fixture through save, rename, delete, pending analysis, concurrent sessions, successful refresh, and failed refresh without restarting the MCP process.

## 7. Packaging and Repository Gates

- [ ] 7.1 Add the root marketplace entry, root lockfile workspace data, tracked bundle, and package documentation for installation and project-scoped startup.
- [ ] 7.2 Extend plugin validation fixtures and bundle smoke discovery for the new MCP package.
- [ ] 7.3 Add explicit resource limits and tests for body bytes, candidates, handles, views, history, concurrent requests, and refresh work.
- [ ] 7.4 Run the live DeepSeekCustom practice sequence and record results for all five spike targets without broad file dumps.
- [ ] 7.5 Run the package build, package tests, bundle, handshake smoke test, Biome checks, root tests, ratchets, plugin validation, and strict OpenSpec validation.
- [ ] 7.6 Run `dod-guard cover add-code-explorer-navigation` and close every scenario binding before implementation is reported complete.
