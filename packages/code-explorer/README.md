# Code Explorer

Code Explorer is a read-only MCP server for source navigation inside one project.

Install it from the `dod-guard-monorepo` marketplace. Claude Code starts the
tracked `dist/bundle.js` through the package `.mcp.json` manifest.

Start Claude Code from the project you want to explore. The server freezes that
startup directory as its project root. It does not accept a different root from
tool input and it does not advertise project-editing tools.

The server provides five tools:

- `code_search` finds files and symbols.
- `code_focus` returns a bounded source view.
- `code_follow` follows supported semantic relations from a visible handle.
- `code_history` restores or lists session-local views.
- `code_status` reports backend and workspace freshness state.

For local package checks, run `npm run build`, `npm test`, and `npm run bundle`
from `packages/code-explorer`.
