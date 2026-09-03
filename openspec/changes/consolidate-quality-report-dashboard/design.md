## Context

The canonical zero-dependency structural scanner lives under the quality-refactor skill. `quality_scan`, hooks, and CI already delegate to it. The newer `quality_report` MCP tool calls that same scanner, scores its output, and adds current-state architecture evidence. The local OpenSpec dashboard already provides registered-project identity, API routing, cached reads, and structured browser rendering without dependencies or a build step.

## Goals / Non-Goals

**Goals:**

- Keep one MCP structural scan surface and one structural rule implementation.
- Preserve a reusable report builder and expose its durable output through the existing dashboard.
- Make report generation explicit, project-bound, atomic, and recoverable.
- Make current-state cross-file evidence precise enough to display.

**Non-Goals:**

- Score architecture findings or turn the report into a commit verdict.
- Regenerate reports during ordinary navigation, project refresh, or server startup.
- Add dependencies or make the OpenSpec dashboard a published package.
- Modify OpenSpec artifacts or source files from the dashboard.

## Decisions

### Keep `quality_scan` and remove only the overlapping MCP registration

`quality_scan` remains the raw, parameterized MCP contract. The report builder remains shared application logic for an external generation command. Removing the builder would move duplicate aggregation and schema logic into the dashboard.

Alternative: make `quality_scan` return the enriched report. Rejected because it changes the established raw scanner contract and couples every scan to repository-wide architecture work.

### Persist a versioned report through an external generator

The generator resolves the selected project root, rejects filesystem indirection at the artifact path, builds the full report, validates schema and resource bounds, writes a temporary sibling, then renames it over `.quality/quality-report.json`. A failed build or validation never touches the existing artifact. The dashboard API invokes this bundled generator with `process.execPath`, a fixed script path and argument list, no shell, the registered project as working directory, and a 120-second timeout.

Alternative: generate inside the dashboard reader. Rejected because it mixes artifact mutation with reading and makes generation harder to use outside the UI.

### Separate regeneration from loading

The API exposes one read route and one explicit regeneration route. Quality opens and Reload call only the read route. Regenerate calls the generator route and then reads the resulting artifact. Ordinary project Refresh does not regenerate.

Because regeneration adds a local write endpoint, the server creates an unguessable per-process token for its own page. The browser sends it on state-changing requests, and the server also checks the request Origin against its bound loopback origin. Project selection remains a registry index rather than a path from the browser.

The API keeps an in-memory set of project identities with generation in flight. It rejects a second regeneration for the same identity with a conflict response and removes the identity in a `finally` path. Artifact reads repeat the containment and filesystem-indirection checks instead of trusting generation-time validation.

Alternative: regenerate whenever Quality opens. Rejected because opening a view would unexpectedly rewrite project state and delay every read.

### Reuse architecture fact extraction after making current-state analysis strict

The appendix reuses the commit-gate fact inventory and analyzers, but current-state symbol extraction must accept only supported declarations and must deduplicate stable finding keys. Fixture tests will pin keywords, locals, object keys, repeated member use, real unused public symbols, placement, boundaries, and cycles before the report is exposed in the dashboard.

Alternative: display the existing appendix and label it heuristic. Rejected because the observed false positives overwhelm real concerns.

### Render report structure in a dedicated dashboard module

The browser gets a Quality sidebar entry and a dedicated renderer. Filtering happens over the loaded artifact by case-insensitive text, severity, production/test classification, and rule, with active filters combined by AND. Cross-file groups remain outside per-file scores and filters that apply only to structural findings. All artifact content goes through the existing text-node DOM builder.

Alternative: embed raw JSON. Rejected because it does not provide the requested structured issue view.

## Risks / Trade-offs

- [Current architecture parsing may still miss language constructs] -> Pin supported constructs with cross-language fixtures and report extraction errors explicitly.
- [A report can become stale] -> Display artifact generation metadata and keep Regenerate separate from Reload.
- [A browser action can now cause one project write] -> Restrict generation to the registry-selected root and one fixed artifact path.
- [Removing an MCP tool is a compatibility break] -> Keep `quality_scan` unchanged and document the direct replacement.
- [A large report can slow rendering] -> Group collapsed findings and filter in memory without rendering every detail eagerly.
- [Local regeneration could be triggered cross-origin] -> Require a per-process token and exact Origin on the state-changing endpoint.
- [A project can redirect the artifact path] -> Reject links, junctions, reparse points, and resolved paths outside the registered root.

## Migration Plan

1. Repair and test current-state architecture extraction and report validation.
2. Add the atomic external generator while retaining the existing MCP tool temporarily.
3. Add dashboard read, regenerate, rendering, and failure behavior.
4. Remove `quality_report` from MCP registration and update tool-list tests and documentation.
5. Roll back by restoring the MCP registration and hiding the Quality entry; existing report artifacts remain inert generated data.

## Phase 1 review

Verdict: **GO** after three rounds. The final round had 0 critical, 2 major, and 2 minor findings.

- Security: 1 major. Pre-operation path validation still has a local time-of-check/time-of-use window when another process can mutate the project tree.
- Assumptions: 2 minor. Concurrent path mutation and crash/power-loss durability remain outside the ordinary filesystem-failure guarantee.
- Testability: 0 findings. The reviewer found the schema, limits, ordering, command, and UI states falsifiable.
- Consistency: 0 findings. The reviewer found one MCP scanner surface and one explicit dashboard write path coherent with the request.
- Implementability: 1 major. The reviewer questioned atomic replacement of an existing file on Windows; implementation must prove the chosen Node filesystem operation on supported platforms or use the design's rollback path before claiming the scenario.

The implementation must treat a detected path identity change as an unavailable/read or generation failure. Atomicity means readers never observe a partial JSON artifact during ordinary operation and filesystem API failures preserve the last complete artifact. Crash and hostile same-user filesystem mutation are not claimed as durable transaction guarantees.
