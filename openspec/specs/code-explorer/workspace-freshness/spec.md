# code-explorer/workspace-freshness Specification

## Purpose
Defines how navigation results identify their project revision and reflect saved working-tree changes without silently serving stale semantic data.
## Requirements
### Requirement: Saved project changes become visible without a process restart
The service SHALL use pinned Chokidar 4.0.3 with `atomic: 100`, `awaitWriteFinish.stabilityThreshold: 200`, `awaitWriteFinish.pollInterval: 100`, `alwaysStat: true`, `followSymlinks: false`, and `ignorePermissionErrors: false`. It SHALL observe add, change, rename, atomic-replace, and delete events for supported source and configuration files and coalesce events within 100 milliseconds. Event order and duplicates SHALL not determine state; reconciliation SHALL compare the final filesystem manifest. A watcher error or overflow SHALL trigger a full supported-file rescan before a generation becomes stable. An independent manifest-hash reconciliation SHALL run every 30 seconds while a session is active to detect silently missed events. When watching is unavailable, active sessions SHALL use manifest polling every 5 seconds. Explicit refresh SHALL remain available.

A supported file SHALL not enter analysis until two stat samples 100 milliseconds apart have equal size and modification time and its content hash is read successfully. Stability retries SHALL stop after 10 seconds with `incomplete_write`. One file SHALL be at most 4 MiB. A full reconciliation SHALL examine at most 50,000 supported files and run at most 60 seconds. When permissions, stability, or scan limits prevent a complete reconciliation, status SHALL become `degraded`, the prior generation SHALL remain current, and no partial generation SHALL publish.

Before the first complete publication, `current_generation` SHALL be `0`, which means no queryable generation exists. `code_status` MAY report `initializing` while work remains within bounds. If initial reconciliation reaches a permission, stability, churn, or scan bound, status SHALL become `degraded` with the specific cause and retain generation 0. `code_search`, `code_focus`, `code_follow`, `code_history`, and landmark discovery SHALL return retryable `workspace_unavailable` until generation 1 publishes. Watcher recovery or explicit refresh MAY retry initialization; the service SHALL never represent generation 0 as an empty project.

#### Scenario: Existing symbol is renamed on disk
- **WHEN** a supported source file is saved with one symbol renamed and backend processing completes
- **THEN** a new search finds the new name and does not return the old name from a stale explorer cache

#### Scenario: Source file is deleted
- **WHEN** a supported source file is deleted and backend processing completes
- **THEN** subsequent search and focus operations no longer return its project-local symbols

#### Scenario: Backend is still processing a change
- **WHEN** a query arrives before the backend has processed a reported file change
- **THEN** the response identifies its current revision and reports that fresher project changes are pending

#### Scenario: Editor saves by atomic replacement
- **WHEN** an editor replaces a supported file through a temporary-file rename
- **THEN** reconciliation treats the final path as changed and publishes its content in the next stable generation

#### Scenario: Watcher reports overflow
- **WHEN** the filesystem watcher reports overflow or loss of events
- **THEN** status becomes `refreshing`, a full supported-file rescan runs, and no incomplete generation is published as stable

#### Scenario: Filesystem watching is unavailable
- **WHEN** watcher startup fails while supported paths remain readable and a session is active
- **THEN** status reports polling mode and manifest reconciliation runs at least once every 5 seconds

#### Scenario: Reconciliation loses read permission
- **WHEN** required supported paths cannot be read during watcher recovery, polling, or refresh
- **THEN** status becomes `degraded` with `freshness_unavailable` and the prior generation remains current

#### Scenario: Watcher silently misses a change
- **WHEN** a relevant file changes without an emitted watcher error or file event
- **THEN** the next 30-second manifest reconciliation detects the changed hash and reserves a new generation

#### Scenario: Events are duplicated or reordered
- **WHEN** add, change, and delete events for one path arrive more than once or out of order
- **THEN** one reconciliation uses the final filesystem state and reserves at most one generation for that batch

#### Scenario: File remains incomplete
- **WHEN** a file's size or modification time keeps changing for 10 seconds
- **THEN** status becomes `degraded` with `incomplete_write` and the prior generation remains current

#### Scenario: Full scan exceeds a bound
- **WHEN** reconciliation exceeds 50,000 supported files, a 4 MiB file limit, or 60 seconds
- **THEN** status becomes `degraded` with `scan_limit` and no partial generation is published

#### Scenario: Initial reconciliation cannot publish
- **WHEN** the first scan fails a permission, stability, churn, file-count, file-size, or time bound
- **THEN** status reports generation 0 and the specific degraded cause while every navigation operation returns retryable `workspace_unavailable`

### Requirement: Every result identifies its monotonic project generation
Search, focus, follow, history, landmark, and status responses SHALL carry a non-decreasing integer `project_generation`. Detected relevant changes SHALL reserve the next generation and report it as `pending_generation`. Analysis results SHALL record the generation they captured. Before publication, the service SHALL rebuild and compare a manifest of every supported path, size, modification time, and content hash against the manifest captured for that analysis. It SHALL publish only the latest complete generation when the manifests match. A mismatch SHALL discard the analysis and reserve the next generation. Three consecutive publication mismatches within one reconciliation SHALL preserve the prior complete generation and report `workspace_churn`. Relevant changes are saved supported-source content, supported-source add, rename, or delete, and classification or exclusion configuration changes. The prior complete generation MAY remain the current read-only generation while a newer generation is pending; it SHALL NOT be relabeled as the pending generation.

#### Scenario: Two responses use the same analyzed state
- **WHEN** two operations run without an intervening relevant project change
- **THEN** both responses carry the same project revision identifier

#### Scenario: Relevant source content changes
- **WHEN** a supported source file changes and analysis reaches a new stable state
- **THEN** later responses carry a different project revision identifier

#### Scenario: Older analysis finishes after newer analysis
- **WHEN** analysis for generation 4 finishes after generation 5 has already become current
- **THEN** the generation 4 result is discarded and no response reports it as newer than generation 5

#### Scenario: One saved change advances the observable timeline
- **WHEN** generation 7 is current, one relevant save reserves generation 8, and backend processing later completes for generation 8
- **THEN** status first reports `current_generation: 7`, `pending_generation: 8`, and `state: refreshing`, then atomically reports `current_generation: 8`, no pending generation, and `state: ready`

#### Scenario: Files change during analysis
- **WHEN** the pre-publication manifest differs from the manifest captured when analysis began
- **THEN** that analysis is discarded, no partial generation publishes, and repeated churn preserves the prior generation with `workspace_churn`

### Requirement: Project generation work has one global order
The process SHALL assign one monotonic accepted-request sequence across all MCP connections. Project-wide refresh, watcher reconciliation, polling reconciliation, and generation reservation SHALL enter one process-global FIFO scheduler. Concurrent refresh requests SHALL coalesce into the earliest active refresh. Ordinary requests SHALL capture the current and pending generation when they reach the global scheduler, then run under the per-session limits. One session SHALL NOT publish a generation independently of another session.

#### Scenario: Two sessions request refresh concurrently
- **WHEN** two live sessions request refresh before either refresh completes
- **THEN** both requests join one globally ordered refresh, observe the same pending generation, and receive the same publication result

#### Scenario: Search races with a generation reservation
- **WHEN** one session searches while another session's change or refresh reaches the global scheduler
- **THEN** accepted-request order determines whether the search captures the prior current generation or the new pending generation, and the response reports both values

### Requirement: Views remain immutable after creation
An existing `view_id` SHALL continue to display the generation and symbol content recorded when it was created. When the current project generation differs from the view generation, history MAY restore that view for reading but `code_follow` SHALL always return `stale_view`. The client must refocus the symbol at the current generation before following a relation.

#### Scenario: Client follows a handle from an older view
- **WHEN** the project changed after a view was created and the client follows one of that view's handles
- **THEN** the server returns `stale_view` with the view generation and current generation and does not dispatch a semantic relation

#### Scenario: Client restores old history
- **WHEN** Back restores a view created before the latest project revision
- **THEN** the response labels the restored view with its original revision and current staleness state

### Requirement: Explicit refresh rebuilds derived discovery data
The service SHALL provide `code_status` action `refresh`. One refresh SHALL reserve one pending generation, reconcile the full supported-file set, refresh or restart each selected backend through its public adapter operation, and build replacement search and landmark data. Until every required step succeeds, all ordinary requests SHALL continue reading the prior complete generation. Publication SHALL be one atomic generation change visible to all later requests.

#### Scenario: Refresh completes
- **WHEN** the client requests refresh and all required analysis completes
- **THEN** status reports the new project revision and later searches use the replacement data

#### Scenario: Refresh fails before completion
- **WHEN** a backend becomes unavailable during refresh
- **THEN** status reports `refresh_failed` with a redacted error and later searches and landmarks continue using the complete prior generation

### Requirement: Workspace status exposes freshness-relevant state
`code_status` SHALL report an opaque `project_id`, `project_root: "."`, current generation, pending generation, state, changed or deleted tracked project-relative paths, untracked supported-source paths, active exclusions, backend readiness, and pending analysis. Workspace states SHALL be `initializing`, `ready`, `refreshing`, `degraded`, or `refresh_failed`. No normal response SHALL expose an absolute path, drive name, UNC host, or home-directory segment.

#### Scenario: Working tree contains source changes
- **WHEN** tracked source is modified and another supported source file is untracked
- **THEN** status reports both paths with their distinct working-tree states

#### Scenario: Generated path is excluded
- **WHEN** an active exclusion matches a generated directory
- **THEN** status reports the exclusion and navigation omits matching content by default

#### Scenario: Frozen project root disappears
- **WHEN** root revalidation before a protected read cannot resolve the frozen root or resolves a different filesystem identity
- **THEN** status alone reports `degraded` with `project_root_unavailable`, semantic backends stop, every other navigation operation including history rejects, retained view bodies are not returned, and restart is required

#### Scenario: Project root is temporarily inaccessible
- **WHEN** root revalidation returns `EACCES`, `EPERM`, `EBUSY`, or `EIO` without proving that the frozen identity changed
- **THEN** status alone reports `degraded` with `project_root_inaccessible`, protected reads stop, and the service retries every 5 seconds for at most 30 seconds

#### Scenario: Same root identity becomes accessible again
- **WHEN** transient root retry resolves the same canonical path, device, and file identity within 30 seconds
- **THEN** selected backends restart through their validated launch path and navigation resumes without an MCP process restart

#### Scenario: Root accessibility does not recover
- **WHEN** the root stays inaccessible for 30 seconds, becomes missing, or resolves to a different canonical path, device, or file identity
- **THEN** status changes to `project_root_unavailable` and the process requires restart before navigation
