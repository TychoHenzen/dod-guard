## Context

See `proposal.md` for motivation and the five delta specs for observable behavior. The monorepo currently has two MCP workspaces and one CLI-only workspace. Every MCP package uses TypeScript, the MCP SDK, a stdio entry point, a tracked esbuild bundle, plugin manifests, root marketplace registration, bundle smoke tests, and root lockfile membership.

The original exploration found three relevant semantic sources. `code-review-graph` supplies broad structural evidence but produced duplicate generated symbols, weak fuzzy discovery, and review-oriented whole-graph views. Serena 1.7.0 returned compact definitions and references across the recorded Rust, Python, and C# checks, but its public tool surface did not expose call hierarchy. Symbols MCP advertises outline, inspection, fuzzy search, references, call hierarchy, and reload operations. The production dependency boundary must be selected from observed behavior rather than copied assumptions.

The current source tree has zero Biome lint violations and zero Biome format violations across the 109 files checked before this change.

## Goals / Non-Goals

**Goals:**

- Ship a project-scoped marketplace MCP plugin with one normalized navigation contract.
- Keep each response centered on one symbol or one bounded candidate set.
- Make session state explicit through view identifiers and view-scoped handles.
- Preserve semantic evidence and expose uncertainty instead of inventing call edges.
- Give every implementation slice a runnable fixture or practice check.

**Non-Goals:**

- No browser or visual graph in this change.
- No OpenSpec dashboard modification in this change.
- No editing, rename, completion, or diagnostics tools.
- No whole-project class diagram or binary dead-code verdict.
- No private Serena imports, private Symbols imports, or copied language-server implementation.
- No cross-project global index or hidden last-view state.

## Decisions

### 1. Ship Code Explorer as an independent workspace and marketplace plugin

Create `packages/code-explorer` with the same package, plugin, MCP, bundle, and main-module boundaries used by `packages/quality-guard`. Register it in the root marketplace and root lockfile. Keep it separate from `dod-guard` because semantic navigation is not definition-of-done verification. Keep it separate from `tools/openspec-dashboard` because the dashboard is a small read-only OpenSpec viewer and does not ship an MCP server.

The package must contain `package.json`, `tsconfig.json`, `.claude-plugin/plugin.json`, `.mcp.json`, `AGENTS.md`, `src/index.ts`, package tests, and tracked `dist/bundle.js`. Its scripts must provide build, test, bundle, and coverage commands compatible with the root workspaces. Root integration must update `package-lock.json`, `.claude-plugin/marketplace.json`, plugin validation fixtures, untested-source and coverage adoption, bundle discovery, and the MCP initialize plus `tools/list` smoke assertion.

Alternatives considered:

- Add tools to `dod-guard`. Rejected because it mixes navigation and verification ownership.
- Put the service inside `openspec-dashboard`. Rejected because it adds language-server process ownership to a dependency-free viewer.
- Ship a skill-only plugin. Rejected because the required state and semantic processes need a server boundary.

### 2. Normalize all backends behind a public adapter contract

The package owns domain types for symbol identity, project revision, focus view, view-scoped handle, relation result, search candidate, landmark evidence, and backend status. A backend adapter implements project initialization, workspace symbol discovery, symbol detail, definition, references, implementation, type, call hierarchy, change notification, and capability reporting.

When supplementation or direct LSP is selected, domain operations map to public requests as follows:

| Domain operation | Public LSP request |
|---|---|
| search | `workspace/symbol` |
| focus range | `textDocument/documentSymbol` plus a bounded project-file read |
| definition | `textDocument/definition` |
| references | `textDocument/references` |
| type | `textDocument/typeDefinition` |
| implementation | `textDocument/implementation` |
| callers | `textDocument/prepareCallHierarchy`, then `callHierarchy/incomingCalls` |
| callees | `textDocument/prepareCallHierarchy`, then `callHierarchy/outgoingCalls` |

The adapter advertises every relation independently. A missing server capability maps to `unavailable`. It never maps to a structural approximation.

The direct-LSP allowlist recognizes `rust-analyzer` for Rust, `pyright-langserver --stdio` for Python, and the spike-selected compatible version of `roslyn-language-server --stdio` or `csharp-ls` for C#. Executables are discovered only on the server process command path. Code Explorer never downloads or installs them. When none is compatible, that language remains `unavailable` and only labeled filename or cached structural discovery remains.

The selection output is checked in as `packages/code-explorer/adapter-selection.json`. It pins schema version, dependency versions, one platform-specific executable prerequisite and fixed argument vector per language, compatible version range, initialization options, capability matrix, and sentinel evidence. Runtime discovery follows that record only. It searches a server-owned command path with project descendants removed, validates a non-link executable's canonical path, filesystem identity, SHA-256 digest, and version before each launch or restart, then repeats the tuple check immediately before spawn and after initialization. A mismatch terminates the new process. A host without stable executable identity fails with `backend_identity_unverifiable` before spawn. The executable and its host-owned directory are trusted host prerequisites outside the project-input threat boundary. Runtime does not try an alternate C# server when the selected one is missing.

Every direct adapter owns a JSON-RPC stdio lifecycle: framed initialize and initialized, monotonic request IDs, cancellation on timeout, rejection of every dynamic registration, two bounded restart attempts, shutdown and exit deadlines, forced termination, and explicit unsolicited-message handling. Malformed framing, oversized payloads, stale document versions, virtual URIs, and unapproved capabilities fail before domain normalization.

Safety is a selection hard gate for documented project-controlled execution hooks. Rust initialization disables Cargo build scripts, procedural macros, check-on-save commands, and project-selected executable overrides. C# initialization disables analyzers and source generators. Python startup removes project entries from `PATH`, clears Python environment selectors, returns empty interpreter and environment settings, and rejects Pyright configuration keys that can select interpreters, virtual environments, extensions, or external analysis paths. A direct Python backend never watches the live project. It runs against a read-only per-generation mirror containing only hash-validated Python source, a service-owned minimal configuration, and allowlisted bundled typeshed. Backend URIs map through that mirror's closed manifest. A live Python config change terminates the old backend and requires a new validated mirror. Every candidate runs against sentinel fixtures that would create a file or network event if one of those hooks executed. A backend mode without a clean sentinel result is recorded unavailable and never launches in production. The compatible installed backend executable is a trusted host prerequisite. This contract does not claim to sandbox a compromised backend binary. This follows rust-analyzer's own warning that default build scripts and procedural macros can execute arbitrary code, and Pyright's documented ability to resolve or run configured Python environments.

The service consumes only public process or protocol boundaries. It does not import Serena or Symbols implementation modules. A structural source may contribute discovery or ranking evidence, but it cannot replace a conflicting semantic relation.

Alternatives considered:

- Expose raw backend tool names and payloads. Rejected because it leaks dependency schemas and could expose write operations.
- Import Serena's installed Python modules. Rejected because the installed module path and internal API are unsupported boundaries.
- Build the browser first and let its API become the MCP contract. Rejected because the agent navigation contract must stand alone.

### 3. Resolve the production adapter with a bounded spike before implementation

The first execution slice compares the installed Serena service and the current public Symbols MCP release against the same DeepSeekCustom symbols and function:

- `TranscriptContent`
- `AgentEvent`
- `SendMessage`
- `Tool`
- `project_block`

For each dependency, record exact and fuzzy discovery, bounded symbol content, definitions, references, implementations, incoming calls, outgoing calls, file-name search, source-versus-test filtering, saved-file freshness, initialization behavior, error shape, elapsed time, and response size. Record whether every result includes a stable source location and whether a public supported boundary can drive it programmatically.

The spike has these hard gates:

- The dependency is callable through a documented public process or protocol boundary.
- It performs no project write during the read-only matrix.
- It initializes within 30 seconds, returns each bounded operation within 10 seconds, and returns no raw response above 1 MiB.
- `TranscriptContent` resolves to its project enum.
- exact `AgentEvent` returns no invented exact match, while fuzzy discovery returns located event candidates.
- exact `SendMessage` returns the `AppCommand` variant, while fuzzy discovery can expose related tool symbols.
- `Tool` returns a bounded, refinable candidate set rather than an arbitrary single symbol.
- `project_block` returns bounded content and can follow its visible project-local type and reference relations.

After the DeepSeekCustom hard gate, run the same operation probes over the small Rust, Python, and C# fixtures. Score one point for each correct operation-language pair across fuzzy symbol search, filename search, focus content, definition, references, type definition, implementation, incoming calls, outgoing calls, and saved-file reload. There are 30 possible points. A claimed unsupported operation scores zero. One incorrect semantic relation rejects the dependency.

Use this fixed selection rule:

1. Reject a dependency that fails a hard gate or returns one incorrect semantic relation.
2. Select the remaining dependency with the higher operation-language score.
3. Break a score tie by more correct incoming and outgoing call pairs, then smaller median response bytes, then smaller median elapsed time, then dependency name in ordinal order.
4. Use the selected dependency alone at 30 points.
5. At 24 through 29 points, use it for the relations it proves and implement missing operation types through standard public LSP requests.
6. Below 24 points, or when neither dependency survives, implement the normalized adapter through standard public LSP requests.
7. Do not merge conflicting answers. One implementation path owns each semantic operation for a project language.

This selection runs once during change execution against the named DeepSeekCustom checkout and checked-in fixtures. Its versioned result is committed as `adapter-selection.json`. `packages/code-explorer/spike/manifest.json` inventories the exact 30 cell identifiers, expected normalized values, hard-gate outcomes, sentinel observations, spike-only module paths, commands, development dependencies, and report paths. Runtime projects do not need the DeepSeek symbols and do not rerun the selection matrix. A bundle test makes every inventoried spike-only resource unavailable, exercises every production startup branch, and asserts that none is loaded, invoked, or included in the production bundle dependency closure.

The 30 fixture cells use this oracle for each language:

| Operation | Rust expected result | Python expected result | C# expected result |
|---|---|---|---|
| fuzzy symbol | `helper` candidate | `helper` candidate | `Helper` candidate |
| filename | `src/lib.rs` | `src/sample.py` | `src/Demo.cs` |
| focus | exact fixture `helper` body | exact fixture `helper` body | exact fixture `Helper` body |
| definition | declared Rust helper range | declared Python helper range | declared C# helper range |
| references | Rust `entry` call site | Python `entry` call site | C# `Entry` call site |
| type definition | fixture `item` to `Item` | fixture `item` to `Item` | fixture `item` to `Item` |
| implementation | fixture `Worker` to `ConcreteWorker` | fixture `Worker` to `ConcreteWorker` | fixture `IWorker` to `ConcreteWorker` |
| incoming calls | helper called by entry | helper called by entry | Helper called by Entry |
| outgoing calls | entry calls helper | entry calls helper | Entry calls Helper |
| saved-file reload | renamed helper replaces old identity | renamed helper replaces old identity | renamed Helper replaces old identity |

Each fixture includes a machine-readable manifest with the exact normalized ranges, identities, source bodies, and expected unavailable results used by the matrix. The score is computed from manifest equality. The selected dependency cannot be named before the observed matrix runs; the deterministic score and tie rules produce that decision.

The spike is complete only when its result names the selected path, cites every matrix observation, identifies unsupported operations, and can be repeated with recorded commands. Production source work does not begin before that record exists.

Alternatives considered:

- Commit to Serena from the earlier installation. Rejected because its missing public call hierarchy is a known contract gap.
- Commit to Symbols from its README. Rejected because its exact DeepSeekCustom and cross-language behavior has not been observed locally.
- Write direct LSP adapters immediately. Rejected because it may repeat stable work already provided by either dependency.

### 4. Use explicit views instead of a hidden current symbol

`code_status` action `start_session` creates a random session token bound to the current MCP connection. A disconnect invalidates it, and a reconnect starts a new session. `code_focus` creates a random immutable focus view. The view stores the project generation, selected symbol identity, bounded content, and random short handles. `code_follow` always receives `session_id`, `view_id`, and handle. It returns a new view or a bounded relation candidate set. A session stores at most 64 views. Concurrent requests for one session enter a per-session FIFO queue. State-changing requests use canonical fingerprints for bounded request-ID replay. An in-flight duplicate joins the original. A conflicting reuse fails. An expired identifier is new work.

The five MCP tools use the closed inputs and common versioned response envelope declared in `code-explorer/mcp-navigation`. Unknown fields fail before side effects. Ranges are zero-based, end-exclusive UTF-16 positions. Unsupported and proved-empty results remain distinct.

This makes semi-stateful navigation reproducible and prevents two agents sharing the server from changing each other's implicit cursor. Expired or mismatched handles fail without name-based guessing.

### 5. Keep discovery and landmark evidence separate from semantic relations

Search uses Unicode NFKC lowercase exact and prefix classes. Its fuzzy class uses a Damerau-Levenshtein similarity from 0 through 100 and rejects scores below 60. Filters run before limits. Every candidate returns match class, score, classification, and classification source.

Classification precedence is `.code-explorer.json` path configuration, generated markers, test markers, production markers, then unknown. The configuration's `generated`, `test`, and `production` glob arrays are evaluated in that order, so a later matching class wins. Its typed `{ "glob", "class" }` override objects are evaluated afterward in array order, so the last matching override wins. Generated defaults include `dist`, `target`, `bin`, `obj`, `.venv`, and files with a recognized generated header. Test markers include `test`, `tests`, `__tests__`, and language-standard test filename forms. A project may override all markers with normalized project-relative globs. Default discovery includes production, tests, and unknown while excluding generated content.

Landmark scoring and grouping follow the exact formula, thresholds, suffix lists, group priority, and limits in `code-explorer/project-landmarks`. Language-specific visibility contributes only when the active semantic backend explicitly reports public or exported status. Unknown visibility contributes zero. Raw identifier frequency contributes nothing.

Landmark or structural evidence may suggest where to navigate. Only the semantic adapter may assert definitions, implementations, types, callers, or callees.

### 6. Treat freshness as revisioned state

The workspace controller uses pinned `chokidar@4.0.3`, which supports Node 18, recursive watching, atomic-write normalization, stable-write waiting, and polling fallback. The exact options and reconciliation bounds live in `code-explorer/workspace-freshness`. Event order is only a hint. Final filesystem manifests, periodic hashes, and generation equality decide publication. A pre-publication manifest rechecks path, size, modification time, and content hash. Three consecutive mismatches preserve the prior complete generation and report workspace churn.

The controller assigns a monotonic generation to every stable analyzed state. Generation 0 means no complete generation exists. Navigation returns `workspace_unavailable` until generation 1 publishes, so a failed initial scan cannot look like an empty project. One process-global FIFO orders refresh, watcher reconciliation, polling reconciliation, and generation reservation across all sessions. It coalesces watcher events for 100 milliseconds, reconciles affected paths against the filesystem, forwards the new generation to the semantic adapter, and publishes only the latest complete result whose captured and pre-publication manifests match. Silent misses are found by the 30-second manifest hash. Atomic-replace saves are observed as final-path reconciliation. Watcher overflow, permission error, incomplete write, or scan limit preserves the prior generation and exposes `degraded`.

Views keep their bounded recorded content until their session or 64-view history slot expires. History can display an older view with a stale label. Following any handle whose view generation differs from the current generation always returns `stale_view`; the client must refocus. Explicit refresh builds replacement discovery and landmark data off to the side, then swaps one generation atomically. A failed refresh retains the previous complete generation.

### 7. Bound process, path, and response trust boundaries

One MCP process freezes one real-path project root plus its device and file identity from its startup working directory or fixed startup argument before backend initialization. Apply the specified Windows or POSIX comparison. Revalidate that root tuple before every protected read. Real-path and stat every existing local input and backend result, prove it remains a descendant, then compare the opened handle's identity and the post-open path before returning bytes. A host without stable opened-file identity fails the read. A missing or changed root identity exposes status only until restart. `EACCES`, `EPERM`, `EBUSY`, or `EIO` without a proved identity change enters a 30-second, five-second-interval recovery window. Recovery of the same tuple restarts validated backends. Failure to recover becomes the restart-required state. A failed containment proof produces an external non-navigable result or a fail-closed root error. Launch backend processes without a shell and with the fixed executable, arguments, environment, safe options, and loopback boundary recorded by the adapter selection. Validate backend identities, URI scheme, document generation, ranges, languages, paths, and payload sizes before retaining them.

Sensitive-path exclusion runs before watchers and backends. VCS metadata, environment files, common private-key forms, and named package credential files never expose a path or body. Project classification cannot override this denylist. Status exposes only the aggregate excluded count.

Use the numeric bounds in `code-explorer/mcp-navigation`. Backend states are `initializing`, `ready`, `degraded`, `refreshing`, `unavailable`, and `failed`. Workspace states are `initializing`, `ready`, `refreshing`, `degraded`, and `refresh_failed`. Errors use the stable redacted schema from the spec. `code_status` reports active limits, exclusions, pending work, and backend capabilities.

### 8. Verify each language and milestone independently

Use small checked-in fixture workspaces for Rust, Python, and C#. Each fixture contains exact definitions, references, calls, tests, generated duplicates, and a dynamic or unresolved edge. Adapter contract tests run the same observable cases for all three languages. A separate DeepSeekCustom practice check records live behavior without turning that external repository into a CI dependency.

Milestones remain independently runnable:

1. Package and MCP handshake.
2. Spike and adapter selection record.
3. Search and filter fixtures.
4. Focus, handles, semantic follow, and history fixtures.
5. Landmark evidence fixtures.
6. Freshness and refresh fixtures.
7. Live DeepSeekCustom practice navigation.

## Risks / Trade-offs

- [Symbols or Serena public contracts differ from their documentation] -> Run the spike against pinned observed versions and keep contract fixtures at the process boundary.
- [Language servers expose different relation capabilities] -> Report per-language capabilities and return unavailable relations instead of fabricating parity.
- [Fuzzy ranking or landmarks become opaque] -> Return match and ranking evidence with deterministic tie rules.
- [Workspace changes invalidate view handles] -> Bind views to revisions and return explicit stale-view results.
- [Large repositories exhaust memory or produce oversized results] -> Enforce configurable caps and expose omitted counts and refinement paths.
- [Generated or test content distorts discovery] -> Classify before ranking, exclude generated content by default, and retain classification evidence.
- [C# server choice changes] -> Keep the C# process behind the shared adapter contract and select the public server through the same compatibility checks.

## Migration Plan

1. Add the new workspace, manifests, MCP entry point, and handshake test without changing existing plugins.
2. Complete and record the dependency spike before production adapter work.
3. Add the normalized domain and backend contract with fake-adapter tests.
4. Add the selected semantic adapter path and language fixtures.
5. Add discovery, focus, follow, history, landmarks, and freshness in independently runnable slices.
6. Add the root marketplace entry, lockfile update, tracked bundle, validation fixtures, and bundle smoke checks.
7. Run package tests, root tests, Biome, ratchets, plugin validation, bundle smoke tests, strict OpenSpec validation, and the external practice check.

Rollback removes the new marketplace entry and workspace. No existing capability or persisted user data requires migration.

## Phase 1 review

Verdict: `GO`. The user authorized review beyond the default three-round cap. The final confirmation found 0 critical, 0 major, and 0 minor findings.

- Security: clean. Root and opened-file identity, sensitive-path exclusion, trusted executable checks, known-hook disabling, and the immutable Python mirror close the reviewed trust boundaries.
- Assumptions: clean. Generation 0, request replay, global ordering, publication manifests, transient root recovery, and unverifiable executable identity have exact outcomes.
- Testability: clean. Closed tool schemas, fixed limits, manifest-backed spike oracles, exact state transitions, and scenario bindings provide falsifiable checks.
- Consistency: clean. External results, current and pending generations, root-loss behavior, semantic precedence, and scope exclusions agree.
- Implementability: clean. Per-language selection records, complete LSP lifecycle, pinned watcher behavior, fixture manifests, and platform failure states can be built without inventing material behavior.
