## Why

Every API request in the openspec-dashboard runs `newestMtime()`, a synchronous recursive stat-walk of the project's `openspec/` directory. The overview endpoint calls it 2+N times (N = number of spec groups), and `parseSpecTitles` and `parseTasks` use synchronous `readFileSync` that blocks the event loop. The filter input rebuilds the sidebar DOM on every keystroke with no debounce, and static assets ship with `cache-control: no-cache` so the browser re-fetches JS and CSS on every navigation.

## What Changes

- Compute `newestMtime()` once per top-level view call and thread the stamp through sub-calls, eliminating repeated directory walks.
- Convert `parseSpecTitles`, `parseTasks`, and `resolveFile` from synchronous to async I/O.
- Cache `parseSpecTitles` and `analyzeSpec` results inside the existing cache layer.
- Add a debounce to the sidebar filter input (150ms).
- Serve static assets with `cache-control: max-age=5` so the browser reuses them within a session.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure performance optimization with no behavioral change. `skip_specs: true` is set.

## Impact

- `tools/openspec-dashboard/lib/cache.mjs` - no API change, `newestMtime` stays exported
- `tools/openspec-dashboard/lib/project-reads.mjs` - `ask` and `coverageForGroup` gain a `stamp` parameter; `parseSpecTitles` becomes async
- `tools/openspec-dashboard/lib/tasks.mjs` - `parseTasks` becomes async
- `tools/openspec-dashboard/lib/static.mjs` - `resolveFile` becomes async, cache-control header changes
- `tools/openspec-dashboard/public/app.js` - filter input gets debounce
