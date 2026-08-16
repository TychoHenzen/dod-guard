<!-- plan_artifacts: [{"id":"proposal","status":"done"},{"id":"specs","status":"skipped"},{"id":"design","status":"done"},{"id":"tasks","status":"done"}] -->

## 1. Async I/O conversion

- [x] 1.1 Convert `newestMtime` in `cache.mjs` from sync (`readdirSync`/`statSync`) to async (`readdir`/`stat` from `node:fs/promises`)
<!-- status: completed -->
<!-- manual_required: true -->

- [x] 1.2 Convert `parseTasks` in `tasks.mjs` from `readFileSync` to async `readFile`
<!-- status: completed -->
<!-- manual_required: true -->

- [x] 1.3 Convert `resolveFile` in `static.mjs` from `existsSync`/`statSync` to async `stat`, and change `cache-control` from `no-cache` to `max-age=5`
<!-- status: completed -->
<!-- manual_required: true -->

## 2. Stamp threading and cache consolidation

- [ ] 2.1 Refactor `createReads` in `project-reads.mjs`: compute `newestMtime` once per view function (`overview`, `specDetail`, `changeDetail`) and pass the stamp to `ask()` and `coverageForGroup()` instead of each calling `newestMtime` independently
<!-- status: pending -->
<!-- manual_required: true -->

- [ ] 2.2 Convert `parseSpecTitles` in `project-reads.mjs` to async, and wrap the full `specDetail` computation in a single cache entry (`specView:<id>`) so re-opening a cached spec does zero file reads
<!-- status: pending -->
<!-- manual_required: true -->

## 3. Client-side optimization

- [ ] 3.1 Add a 150ms debounce to the filter input handler in `app.js`
<!-- status: pending -->
<!-- manual_required: true -->

## 4. Smoke test

- [ ] 4.1 Start the dashboard with `node tools/openspec-dashboard/serve.mjs`, open the browser, switch between specs and changes, and confirm views load without errors
<!-- status: pending -->
<!-- manual_required: true -->
<!-- verify_surface: visual -->
