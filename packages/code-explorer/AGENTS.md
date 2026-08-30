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

`src/testing/` contains controllable test support. It must not launch a real
semantic backend.
