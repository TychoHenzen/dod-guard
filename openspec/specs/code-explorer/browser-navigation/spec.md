# browser-navigation Specification

## Purpose

Defines the localized browser workflow for discovering, focusing, and following project symbols through the shared Code Explorer service.

## Requirements

### Requirement: The desktop view keeps one symbol central
The browser SHALL present search and landmarks in a left pane, one focused source view in a center pane, and semantic relation groups in a right pane. It SHALL display project status and Back, Forward, Refocus, and Refresh controls without introducing a whole-project view.

#### Scenario: Browser opens with no focused symbol
- **WHEN** a new session reaches a ready project
- **THEN** the left pane shows landmarks, the center asks for a symbol selection, and the right pane contains no invented relations

#### Scenario: Symbol is focused
- **WHEN** the user selects an unambiguous local symbol
- **THEN** the center pane becomes the primary view and the side panes remain available for discovery and relations

#### Scenario: Window becomes narrow
- **WHEN** the viewport is below the declared desktop breakpoint
- **THEN** each side pane collapses into a mouse-operable drawer while the focused source remains visible

### Requirement: Browser discovery preserves service ranking and filters
The search surface SHALL expose query, path, language, symbol-kind, production-versus-test, and generated-content inputs supported by the shared service. It SHALL preserve the exact candidates, order, match class, score, classification, path, kind, omitted count, and refinement guidance returned by the `code-explorer/symbol-discovery` and `code-explorer/project-landmarks` contracts. It SHALL neither rerank nor recompute fuzzy scores. An empty query SHALL show landmarks rather than ordinary matches.

#### Scenario: User searches with a misspelling
- **WHEN** the query returns a fuzzy symbol candidate
- **THEN** the browser shows its fuzzy label, score, normalized project-relative path, and kind in service order

#### Scenario: User narrows search filters
- **WHEN** the user changes one or more discovery filters
- **THEN** the browser requests the combined filter set and replaces the result list with only matching service results

#### Scenario: User clears the query
- **WHEN** the normalized search query becomes empty
- **THEN** the left pane shows the current grouped landmarks and does not run an ordinary blank symbol search

#### Scenario: Results are omitted by a limit
- **WHEN** the service reports omitted candidates
- **THEN** the browser shows the omitted count and the available refinement guidance

### Requirement: Focused source is bounded text with navigable handles
The center pane SHALL render the service's bounded source body as escaped monospaced text with line numbers. It SHALL mark visible handles as mouse-selectable text without changing the source characters. It SHALL show the symbol identity, kind, normalized path, generation, truncation state, and byte counts supplied by the service.

#### Scenario: Focused body contains visible symbols
- **WHEN** a focus response contains view-scoped handles
- **THEN** the corresponding source spans are selectable and each retains its owning view and relation choices

#### Scenario: Focused body is truncated
- **WHEN** the service returns a truncated source body
- **THEN** the center pane shows the returned prefix and its returned, total, and limit byte counts

#### Scenario: Focused body contains unsafe markup text
- **WHEN** the source includes HTML-like content
- **THEN** line numbers and source characters display as text and no source character becomes browser markup

### Requirement: Semantic relations load only on demand
The right pane SHALL group definition, references, callers, callees, type, and implementation relations. It SHALL not dispatch a relation until the user opens that group or selects the corresponding handle action. Opening a not-yet-loaded group SHALL issue exactly one request with its owning `view_id`, handle, relation, and limit. Loaded results SHALL retain the core maximum of 200 candidates and the exact relation source, backend, path, kind, range, external state, unavailable state, omitted count, and deterministic order returned by the service.

#### Scenario: Focus view first opens
- **WHEN** a new focus response becomes current
- **THEN** relation groups show supported, unavailable, or not-yet-loaded state without dispatching every supported relation

#### Scenario: User opens a relation group
- **WHEN** the user opens one supported relation group
- **THEN** the browser dispatches that relation once and displays only its bounded returned candidates

#### Scenario: Relation is unsupported
- **WHEN** the service reports a relation unavailable
- **THEN** the group shows an unavailable state and does not substitute references or structural candidates

#### Scenario: Result belongs to an external dependency
- **WHEN** a loaded relation is marked external
- **THEN** the browser shows its display identity without a path, source preview, local focus action, or graph navigation handle

### Requirement: Selecting a local result recenters navigation
Selecting a local search candidate, landmark, visible handle result, or loaded relation SHALL focus that symbol as a new view. The browser SHALL update the center pane, relation groups, history position, and localized graph together after the new focus succeeds.

#### Scenario: User selects a search candidate
- **WHEN** the user clicks a project-local search result
- **THEN** the result becomes the focused view and creates one new history position

#### Scenario: User follows a visible handle
- **WHEN** the user chooses one supported relation for a visible source handle
- **THEN** the returned local symbol becomes the new focus and the prior view remains available through Back

#### Scenario: Focus request fails
- **WHEN** the selected candidate becomes invalid or the backend fails before focus completes
- **THEN** the existing focus remains visible and the browser shows the redacted failure without appending history

### Requirement: Back and Forward restore explicit views
The browser Back and Forward controls SHALL use the shared core's 64-view session history rather than browser URL history. A successful focus or a follow that focuses one local result SHALL append one core view. Search, filter, pane, status, relation-load, and graph-collapse actions SHALL append no view. Browser relation and graph snapshots SHALL be keyed by immutable `view_id`. Restoring a view SHALL restore its bounded source, loaded relation state, graph center, and staleness label with zero additional search, focus, or follow requests. New navigation after Back SHALL remove the abandoned Forward branch and its browser snapshots.

#### Scenario: User selects Back
- **WHEN** at least two focused views exist and the user clicks Back
- **THEN** the prior explicit view and its recorded graph state are restored

#### Scenario: User selects Forward
- **WHEN** the session has moved Back and the user clicks Forward
- **THEN** the next recorded view is restored

#### Scenario: User navigates after Back
- **WHEN** the user moves Back and focuses a different symbol
- **THEN** the new view replaces the abandoned Forward branch

### Requirement: Freshness remains visible without replacing the focus
The browser SHALL display current generation, pending generation, workspace state, and backend readiness from the shared `code-explorer/workspace-freshness` controller. It SHALL poll status every 5,000 ms only while `document.visibilityState` is `visible` and once after each navigation response. It SHALL NOT create another watcher or freshness timeline. A detected newer generation SHALL not silently replace the focused view. A stale view SHALL remain readable, SHALL set the focus and graph state to `stale`, and SHALL disable handle, relation-row, and graph-node follow actions until the user Refocuses at the current generation. Refocus SHALL issue one focus request for the recorded symbol identity. Refresh SHALL issue one shared atomic refresh request and expose its running, success, and failure states. `freshness_unavailable`, watcher degradation, saved-file detection, polling fallback, generation publication, and refresh failure SHALL preserve the exact prerequisite service meanings.

#### Scenario: New generation is pending
- **WHEN** the workspace reports a pending generation while the current view remains valid
- **THEN** the browser shows the pending state and keeps the current content in place

#### Scenario: Current view becomes stale
- **WHEN** the project generation advances beyond the focused view
- **THEN** the browser labels the view stale and disables all follow actions from its handles and relation results

#### Scenario: User selects Refocus
- **WHEN** a stale symbol still resolves in the current generation
- **THEN** a new current view replaces the stale focus and relation loading becomes available again

#### Scenario: Refresh fails
- **WHEN** explicit refresh returns `refresh_failed` or another freshness error
- **THEN** the browser keeps the prior complete view and displays the stable failure and workspace state

### Requirement: Empty, loading, and failure states preserve context
Each pane SHALL distinguish not loaded, loading, proved empty, unavailable, stale, and failed states. A failure in search, one relation group, graph rendering, or refresh SHALL remain local to that area unless the shared service reports the entire workspace unavailable.

#### Scenario: Search has no matches
- **WHEN** the service proves that no result satisfies the query and filters
- **THEN** the left pane shows an empty result state rather than an error or guessed replacement

#### Scenario: One relation fails
- **WHEN** one lazy relation request fails while the focus remains valid
- **THEN** only that relation group shows the failure and other loaded groups remain visible

#### Scenario: Workspace has no published generation
- **WHEN** the service reports generation 0 and `workspace_unavailable`
- **THEN** navigation controls remain unavailable while status and the retryable cause stay visible

### Requirement: Browser actions cannot modify project content
No browser control SHALL invoke a project edit, rename, create, delete, completion, diagnostics, or arbitrary backend operation. Refocus, Refresh, filter changes, pane controls, and graph navigation SHALL affect only navigation and derived state.

#### Scenario: User inspects every visible action
- **WHEN** the application shell is rendered
- **THEN** every project-facing action maps to search, focus, follow, history, status, refresh, or local pane state

#### Scenario: Browser submits an unadvertised operation
- **WHEN** a modified client requests an editing or arbitrary backend action
- **THEN** the browser server rejects it without changing protected project content

### Requirement: The same browser workflow supports Rust, Python, and C#
The browser SHALL use the same panes, result fields, history, freshness behavior, and graph rules for the checked-in Rust `src/lib.rs`, Python `src/sample.py`, and C# `src/Demo.cs` oracle fixtures from `code-explorer/language-adapters`. Language-specific backend gaps SHALL appear as capability or unavailable states rather than different browser workflows. Live practice completion SHALL require the compatible adapter executable selected by `adapter-selection.json`; a missing or incompatible executable SHALL be a failed practice prerequisite, not a passing unavailable result. Each run SHALL use the fixture's exact zero-based helper definition and call-site ranges, rename the helper on disk, wait at most 35 seconds for the shared 30-second reconciliation fallback, and write a redacted JSON evidence record containing language, backend identity, operation states, expected and actual normalized locations, generations, elapsed milliseconds, and stable error code.

#### Scenario: Rust practice project is explored
- **WHEN** the live Rust fixture runs search, focus, one semantic follow, Back, Forward, and saved-file freshness
- **THEN** the browser completes the workflow with Rust source locations and honest capability states

#### Scenario: Python practice project is explored
- **WHEN** the live Python fixture runs search, focus, one semantic follow, Back, Forward, and saved-file freshness
- **THEN** the browser completes the workflow with Python source locations and honest capability states

#### Scenario: C# practice project is explored
- **WHEN** the live C# fixture runs search, focus, one semantic follow, Back, Forward, and saved-file freshness
- **THEN** the browser completes the workflow with C# source locations and honest capability states

