# AGENTS.md

## Build and test

Run these commands from this package directory:

```bash
npm run build
npm test
npm run bundle
```

The package is an ESM MCP server. `src/index.ts` must remain import-safe: it
connects the stdio transport only when executed as the main module. The shipped
entry point is `dist/bundle.js`.

## Package boundary

`code-explorer` provides read-only source navigation for one project. Keep
backend processes, discovery, navigation state, and test fixtures behind this
package boundary. Do not add write or project-editing MCP tools.

`tests/` contains controllable test support and semantic tests. It must not
launch a real semantic backend. The test project writes to `dist-test/`, so
test code cannot enter the production `dist/` build.

## Operating contract

- Treat the directory where the server starts as the frozen project root. Do
  not accept a replacement root from tool input.
- Use `code_search` to discover, `code_focus` to establish a visible symbol,
  `code_follow` only for relations the backend proves, `code_history` for
  session-local views, and `code_status` for readiness or freshness evidence.
- Keep claims bounded by returned paths, ranges, generations, relation status,
  and explicit omission or unavailable states. An empty result is not proof of
  absence when the backend is unavailable.
- On stale roots, backend failure, or degraded relations, preserve the safe
  read-only state, report the observed status, and use the supported refresh or
  retry path. Do not substitute guessed symbols or paths.
- Stop when the requested evidence is unavailable, the root is no longer
  trusted, or the operation would require a write or an unsupported relation.
