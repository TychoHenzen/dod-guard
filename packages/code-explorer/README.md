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
from `packages/code-explorer`. `npm run build` type-checks browser sources
without emitting them; `npm run bundle` is the only command that writes
`dist/browser/client.js`.

## Startup and language backends

Launch starts no language server and copies no source. The first valid tool
call, of any kind and including `code_status`, starts a background check for
every language. A language with matching source then gets its backend built
and started. A language without any is never built.

- A language counts as present when its filter finds at least one matching
  file. Rust matches `.rs` files, C# matches `.cs` and `.csx` files, and
  Python matches `.py` and `.pyi` files.
- Rust and C# skip any path with one of these segments: `node_modules`,
  `dist`, `target`, `bin`, `obj`, `.venv`, `coverage`, `docs`, `reports`,
  `.serena`, `.idea`, `.claude`, `.codex`, `.github`, `.data`, `.evo`,
  `.skill-migrate` or `.tighten`.
- Python skips any path with one of these segments: `.venv`, `venv`,
  `node_modules` or `__pycache__`.
- All three skip sensitive paths: `.git`, `.hg` and `.svn` directories, `.env`
  files, key files and credential files.
- While a language's backend is starting, `code_status` reports it as
  `initializing`. If the presence check or the backend start stays
  `initializing` for 30 seconds, `code_status` reports `failed` with
  `initialization_timeout` instead.
- A language with no matching file is reported as `unavailable` with
  `failure_code` `language_not_present`, and its backend is never built.
- `code_status` with `action: "refresh"` checks presence again for a language
  that has no built backend.
- `code_search`, `code_focus` and `code_follow` send a request to every backend
  they target. A request waits for that backend's start, for at most the 10
  second backend request timeout. `code_search` and `code_focus` target every
  backend, and `code_follow` targets each backend that reports the relation as
  `ready`. So a backend that is still starting can delay those calls by up to
  10 seconds.

## Shutdown

SIGINT, SIGTERM and the end of stdin all start one close path in the stdio
server. The close kills backend processes at once with SIGKILL, without a
graceful LSP shutdown, and removes the owned temporary roots. The close has a
1500 ms budget.

- If the close finishes in time, the process exits with code 0.
- If the budget runs out, the server writes one stderr line saying the
  backends were force-killed, and exits with code 1.
- If closing the server fails, the server writes one stderr line with the
  error message and exits with code 1.
- A second SIGINT or SIGTERM during the close exits at once with code 1, and
  writes nothing to stderr.
- Any other exit that fires Node's `exit` event, such as `process.exit()`,
  also kills tracked backends and removes tracked roots. A hard kill, such as
  SIGKILL, runs none of this. The next stdio start removes the roots of owner
  processes that no longer exist (see Temporary roots).
- The MCP TypeScript SDK stdio client closes stdin, waits up to 2 seconds for
  the process to exit, and sends SIGTERM only if the process is still running.
  The 1500 ms budget is shorter than that wait.

## Temporary roots

Backend files live in service roots under the system temporary directory,
`<tmp>`. Native copies go in `<tmp>/code-explorer-native-*/tree`, and Python
mirrors go in `<tmp>/code-explorer-pyright-*/generation-N`. The `*` is a random
suffix, and `N` is the mirror generation number.

- Each service root holds an `owner.json` file with the owning process ID.
  The file sits beside `tree` or `generation-N`, outside the tree a backend
  receives.
- At stdio start, the server removes each service root whose owner process no
  longer exists. It also removes each root with no usable `owner.json` whose
  directory was last modified more than 24 hours ago.
- Each removal writes one stderr line naming the root and the reason,
  `dead_owner` or `stale_unmarked`. Roots whose owner process still exists
  are kept.

## Workspace watcher

The watcher and the freshness manifest use one ignore list. The watcher
ignores a path when one of its segments, compared without case, is one of:
`node_modules`, `.git`, `.hg`, `.svn`, `.venv`, `venv`, `__pycache__`, `dist`,
`dist-test`, `coverage`, `target` or `obj`. The manifest skips directories
with those names.

- Segments are matched relative to the project root, so a project under an
  ancestor named `dist` or `target` is not ignored as a whole.
- `build`, `out` and `bin` are not on this list, so the watcher and the
  manifest do not ignore them.
- If the watcher cannot be created, the mode is `polling`, and a reconcile
  runs every 5 seconds. The wait restarts after each run finishes.
