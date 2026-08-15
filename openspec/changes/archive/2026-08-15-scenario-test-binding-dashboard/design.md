## Context

See proposal.md for motivation. The dashboard already reads specs and their scenarios via `openspec show <id> --json`. `dod-guard cover` already scans `// covers:` markers and binds them to scenario ids via `scanMarkers()` in `packages/dod-guard/src/cover/markers.ts`. The dashboard is a `tools/` utility with no npm dependencies on `dod-guard`, and importing from `packages/dod-guard/dist/` would create a coupling the project avoids.

## Goals / Non-Goals

**Goals:**
- Show per-scenario test binding status (bound with test name, or unbound) in the spec detail view.
- Resolve bindings by scanning `// covers:` markers directly, not by shelling out to `dod-guard cover`.

**Non-Goals:**
- Running tests or reporting pass/fail status. The dashboard shows bindings only.
- Showing the three-outcome report (`covered-and-integrated`, `covered-but-not-integrated`, `unwired`). That requires running tests under c8 for reachability. The dashboard shows whether a marker exists and names the test.
- Importing or depending on `packages/dod-guard`. The marker scanner is reimplemented in the dashboard as a standalone `.mjs` module.

## Decisions

### Reimplement the marker scanner instead of importing from dod-guard

The dashboard is a `tools/` utility that runs from a checkout with zero npm dependencies beyond Node built-ins. Importing from `packages/dod-guard/dist/` would require building dod-guard before the dashboard works, and `tools/` is explicitly dependency-free by convention. The marker regex and the `test(`/`it(` detection are each one line. Reimplementing them costs less than the coupling.

**Alternative considered:** Shell out to `dod-guard cover --all` and parse stdout. Rejected because `cover` runs reachability checks (spawns c8, runs tests), which takes seconds per bound scenario. The dashboard needs only marker presence, not reachability.

### Attach coverage to the spec detail endpoint, not a separate route

The spec detail view already shows scenarios. Adding a `coverage` map to the existing `specDetail` response keeps the client from needing a second fetch. The coverage resolver runs per-group (one group = one spec's package), so it aligns with the existing per-spec-id cache key.

**Alternative considered:** A separate `/api/project/:idx/coverage` endpoint. Rejected because the client would need to join two responses, and the cache invalidation would duplicate.

### Map from spec group to test file locations

The dashboard needs to know where test files live for each spec group. `dod-guard` uses `cover/package-dir.ts` for this, mapping group names to `packages/<group>/dist/**/*.test.js` globs. The dashboard reimplements this mapping as a small lookup, scanning `packages/<group>/src/**/*.test.ts` (source files, since the dashboard does not need compiled output).

### Aggregate coverage counts at requirement and spec level

The coverage map is keyed by scenario id. Each requirement's scenario count is
known from the `openspec show` response. Counting how many of those ids appear
in the coverage map gives the bound count. The spec-level count sums across
requirements. Both counts are computed client-side from data already in the
response, so no new API field is needed.

## Risks / Trade-offs

- [Risk] The reimplemented marker regex drifts from `dod-guard`'s `MARKER_RE`. -> Mitigation: both are one-line regexes matching the same documented format. A comment in the dashboard scanner names the canonical source.
- [Risk] Scanning all test files on every cache miss adds latency for large projects. -> Mitigation: the scan is cached per project, invalidated on mtime change, same as every other read. A typical project has tens of test files, not thousands.
