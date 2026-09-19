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

## Safe operating path

Start Claude Code from the project you want to inspect. Code Explorer freezes
that startup directory as its root and never accepts a replacement root from a
tool call.

1. Use `code_search` to discover a file or symbol.
2. Use `code_focus` to establish a visible symbol and source range.
3. Use `code_follow` only when the returned relation is supported and proved.
4. Use `code_history` to restore or list views created by this session.
5. Use `code_status` when readiness, freshness, unavailable backends, or a
   changed root affects what the evidence means.

Results are bounded by project-relative paths, ranges, generations, relation
status, and explicit omission/unavailable states. A missing backend or stale
root is a stop condition for semantic claims, not permission to guess. Keep
the package read-only; writes and alternate project roots are unsupported.

For local package checks, run `npm run build`, `npm test`, and `npm run bundle`
from `packages/code-explorer`.
