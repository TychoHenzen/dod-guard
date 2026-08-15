## Why

The coverage-gate ratchet (`dod-guard cover`) already knows which scenarios are bound to tests and which test name proves each claim. The dashboard does not surface any of that. A reader looking at a spec's scenarios in the browser cannot tell whether a scenario is backed by a test, or which test it is. The information exists - it just does not reach the UI.

## What Changes

- The dashboard's spec detail view gains a per-scenario coverage indicator: bound or unbound, and when bound, the name of the test that proves the claim.
- Each requirement's summary shows how many of its scenarios are bound, and the spec header shows the total across all requirements.
- The dashboard server reads coverage data from `dod-guard cover --all` output (or a cached equivalent), not by running tests itself.
- The spec detail API endpoint returns coverage bindings alongside the existing scenario data.

## Capabilities

### New Capabilities

- `openspec-dashboard/scenario-coverage`: The dashboard reads scenario-to-test bindings and shows, for each scenario, whether a test is bound and what its name is.

### Modified Capabilities

- `openspec-dashboard/ui`: The spec detail view adds a coverage status and test name to each scenario row.

## Impact

- `tools/openspec-dashboard/lib/project-reads.mjs`: new reader that resolves coverage bindings for a project.
- `tools/openspec-dashboard/lib/api.mjs`: spec detail route includes coverage data.
- `tools/openspec-dashboard/public/render-spec.mjs`: scenario items show bound/unbound state and test name.
- `packages/dod-guard/src/cover/markers.ts`: no changes needed, the marker scanner already produces the binding data the dashboard needs. The dashboard will call `dod-guard cover --all` or read from the same marker-scanning logic.
