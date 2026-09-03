## Context

See proposal.md for motivation. The dashboard is a single-user local tool (`tools/openspec-dashboard/`) with no CI gates. All server-side I/O is synchronous today, and the cache layer (`cache.mjs`) calls `newestMtime()` on every `cache.get()` to decide if the cached result is still valid.

The current request flow for an overview call:

1. `ask(project, "changes", ...)` calls `newestMtime()` - walk 1
2. `ask(project, "specs", ...)` calls `newestMtime()` - walk 2
3. `coverageForGroup(project, group1)` calls `newestMtime()` - walk 3
4. `coverageForGroup(project, group2)` calls `newestMtime()` - walk 4
5. (one walk per additional group)

Each walk stats every file under `openspec/` recursively.

## Goals / Non-Goals

**Goals:**
- Eliminate redundant `newestMtime()` walks within a single request.
- Convert blocking `readFileSync`/`statSync` calls to async equivalents so the event loop stays responsive during I/O.
- Reduce unnecessary browser re-fetches of static assets.
- Debounce the filter input so rapid typing does not trigger a DOM rebuild per keystroke.

**Non-Goals:**
- Changing the cache invalidation strategy (mtime-based stamp is fine for a local tool).
- Adding file watchers or incremental invalidation.
- Changing the public API shape or response format.

## Decisions

### 1. Thread the stamp instead of memoizing newestMtime

Compute `newestMtime()` once at the top of each view function (`overview`, `specDetail`, `changeDetail`) and pass the result down as a `stamp` argument to `ask()` and `coverageForGroup()`.

Alternative: memoize `newestMtime` with a short TTL. Rejected because a threaded stamp is explicit, has no timing edge cases, and costs one extra parameter.

### 2. Make newestMtime async

Replace `readdirSync`/`statSync` with `readdir`/`stat` from `node:fs/promises`. The cache's `get` method already returns a promise, so callers do not change shape.

Alternative: keep newestMtime sync and only thread the stamp. Rejected because the user chose the broader async pass, and an async newestMtime removes the last event-loop-blocking I/O from the request path.

### 3. Cache parseSpecTitles and analyzeSpec inside specDetail

Wrap the full `specDetail` computation (CLI output + parseSpecTitles + analyzeSpec + coverage merge) in a single cache entry keyed `specView:<id>`, so re-opening the same spec on a warm cache does no file reads at all.

Alternative: cache parseSpecTitles and analyzeSpec separately. Rejected because they always run together and share the same invalidation key (the openspec mtime stamp).

### 4. Make parseTasks async

Replace `readFileSync` with `readFile` from `node:fs/promises`.

### 5. Make static file resolution async

Replace `existsSync`/`statSync` in `resolveFile` with `stat` from `node:fs/promises`. Change `cache-control` from `no-cache` to `max-age=5` so the browser reuses assets for 5 seconds.

### 6. 150ms debounce on filter input

Wrap the `paintLists()` call in a `setTimeout`-based debounce. 150ms is fast enough to feel instant but slow enough to skip intermediate keystrokes.

## Risks / Trade-offs

- [Async newestMtime adds a microtask per stat call] -> For a few dozen files, the overhead is negligible compared to the I/O time saved on the event loop.
- [5-second cache-control on static assets means edits during development take up to 5 seconds to appear] -> Acceptable for a tool that is not actively developed. A hard refresh bypasses it.
- [Caching the full specView result means parseSpecTitles changes require a file save to invalidate] -> This is already the behavior for CLI results. The stamp tracks file modifications, so any save invalidates.
