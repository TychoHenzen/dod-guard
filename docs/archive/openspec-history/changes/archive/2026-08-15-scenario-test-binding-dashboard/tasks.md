## 1. Marker scanner for the dashboard

- [x] 1.1 Create `tools/openspec-dashboard/lib/markers.mjs` that scans test files for `// covers:` markers and returns a `Map<scenarioId, { testFile, testName }>`. Reimplement the regex from `packages/dod-guard/src/cover/markers.ts` (MARKER_RE and TEST_CALL_RE). Add a comment naming the canonical source.
<!-- covers: openspec-dashboard/scenario-coverage :: The dashboard resolves scenario-to-test bindings for a project :: A project has bound and unbound scenarios -->
- [x] 1.2 Create a group-to-test-glob mapping in `markers.mjs` that maps a spec group name to `packages/<group>/src/**/*.test.ts` and `tools/<group>/**/*.test.mjs` (matching the two directory conventions in the monorepo).
<!-- covers: openspec-dashboard/scenario-coverage :: The dashboard resolves scenario-to-test bindings for a project :: A project has no test files -->

## 2. Wire coverage into the spec detail API

- [x] 2.1 Add a `coverageForGroup(projectPath, group)` function to `project-reads.mjs` that calls the marker scanner and caches the result using the same mtime-based cache key the other reads use.
<!-- covers: openspec-dashboard/scenario-coverage :: Coverage data is cached until the project's openspec directory changes :: Bindings are served from cache on repeated requests -->
- [x] 2.2 Modify `specDetail` in `project-reads.mjs` to include a `coverage` property in its return value: an object keyed by scenario id, each entry carrying `testFile` and `testName`. Derive the group from the spec id (the first path segment).
<!-- covers: openspec-dashboard/scenario-coverage :: The spec detail API includes coverage bindings :: Spec detail response includes bindings -->

## 3. Render coverage in the spec detail view

- [x] 3.1 Modify `scenarioItem()` in `render-spec.mjs` to accept a coverage entry (or null) and render the test name when bound, or an "unbound" indicator when not.
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: A bound scenario shows its test name -->
- [x] 3.2 Pass coverage data from the spec detail response into `renderSpec()` and down to each `scenarioItem()` call, matching scenarios to coverage entries by scenario id.
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: An unbound scenario shows no test -->
- [x] 3.3 Add CSS for the coverage indicator: a small label next to each scenario showing the test name in a muted style when bound, and a "no test" label in a warning style when unbound.

## 3b. Render coverage counts at requirement and spec level

- [x] 3b.1 Modify `requirementBlock()` in `render-spec.mjs` to count bound scenarios (those whose `scenarioId` appears in the coverage map) and display the count in the requirement summary line, e.g. "2/4 bound".
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: A requirement summary shows its coverage count -->
- [x] 3b.2 Modify `renderSpec()` in `render-spec.mjs` to compute a total coverage count across all requirements and display it in the spec header's meta line, e.g. "5 requirements, 4/10 scenarios bound".
<!-- covers: openspec-dashboard/ui :: A spec opens down to its scenarios :: The spec header shows total coverage across all requirements -->
- [x] 3b.3 Add CSS for the coverage count: use the existing `--done` color when all scenarios are bound, `--ready` when partially bound, and `--dim` when none are bound.

## 4. Verify

- [x] 4.1 Start the dashboard, open a project with bound scenarios (dod-guard itself), confirm bound scenarios show their test name and unbound scenarios show "no test".
- [x] 4.2 Open a spec with zero bound scenarios and confirm the empty-coverage state renders correctly.
