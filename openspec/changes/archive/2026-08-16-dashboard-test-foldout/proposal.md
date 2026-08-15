## Why

The coverage label on each scenario shows the test name but not its code. A reader who wants to see what the test actually does has to leave the dashboard and open the file. Making the label a clickable foldout that reveals the test body keeps the reader in context.

## What Changes

- `markers.ts` extracts the test body (the lines from the test declaration through its closing brace or dedent) alongside the existing `testName` and `file` fields.
- `project-reads.mjs` passes the new `testBody` field through to the spec detail response.
- `render-spec.mjs` replaces the flat `<span>` coverage label with a `<details>/<summary>` element. The summary shows the test name (same as today). The body shows the test source in a `<pre><code>` block.
- `style.css` styles the foldout so it fits the existing scenario layout.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `openspec-dashboard/scenario-coverage`: the marker binding adds a `testBody` field carrying the test function's source text
- `openspec-dashboard/ui`: a bound scenario's coverage label becomes a collapsible foldout that reveals the test body

## Impact

- `packages/dod-guard/src/cover/markers.ts` and `src/cover/languages.ts` - body extraction logic
- `tools/openspec-dashboard/lib/markers.mjs` (re-export, no change needed)
- `tools/openspec-dashboard/lib/project-reads.mjs` - passes `testBody` through
- `tools/openspec-dashboard/public/render-spec.mjs` - foldout rendering
- `tools/openspec-dashboard/public/style.css` - foldout styles
