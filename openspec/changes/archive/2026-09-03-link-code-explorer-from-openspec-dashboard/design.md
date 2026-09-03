## Context

The dashboard is a dependency-free Node 18 tool under `tools/openspec-dashboard`. It is not a workspace, marketplace plugin, or current CI target. Its server already resolves project indices through the server-side registry. Its browser receives an ordered project list and uses plain JavaScript modules with no build step.

This change depends on `add-code-explorer-navigation` and `add-local-code-explorer`. It imports these prerequisite contracts:

| Capability | Imported requirement |
| --- | --- |
| `code-explorer/browser-server` | `The package starts a project-scoped browser server` |
| `code-explorer/browser-server` | `The server is reachable only through loopback` |
| `code-explorer/browser-server` | `Startup opens the local browser unless disabled` |
| `code-explorer/browser-server` | `The HTTP boundary remains read-only and same-origin` |
| `code-explorer/browser-server` | `Static assets and server errors have stable behavior` |
| `code-explorer/language-adapters` | `One server process is confined to one canonical project root` |
| `code-explorer/language-adapters` | `Backend launch configuration is server-owned` |

Together, those requirements define `serve --project-root <path> --no-open`, the exact `Code Explorer: <url>` readiness line, `GET /` as the packaged HTML shell, signal-driven cleanup, one frozen project root, and the read-only service boundary. This change does not redefine those behaviors.

The current root Biome commands exclude `tools/`. Their pre-change baseline is zero lint and zero format findings across 137 checked package and CI files. The dashboard has no existing tests.

## Goals / Non-Goals

**Goals:**

- Keep project selection and process configuration on the dashboard server.
- Make one click start or reuse one project-scoped Code Explorer URL.
- Keep startup, reuse, failure, capacity, and cleanup deterministic.
- Add dependency-free unit tests, bounded platform integrations, and a real practice path.

**Non-Goals:**

- No navigation proxy, embedded frame, language preflight, download, installation, or PATH discovery.
- No new Code Explorer CLI or browser-server behavior.
- No child that intentionally survives completed dashboard-managed shutdown.
- No dashboard migration into a current CI job.
- No general rewrite of existing dashboard reads or registry mutation routes.
- No accessibility-specific acceptance work for this personal tool.

## Decisions

### 1. Bind launch to a registry revision and browser capability

The project-list response gains `registry_revision`, a SHA-256 digest of the ordered canonical registry entries and their readability state. A launch route remains index-shaped:

`POST /api/project/<registry-index>/code-explorer`

Its closed JSON body is:

```json
{"registry_revision":"<64 lowercase hex characters>"}
```

The server compares the revision before resolving the index. A mismatch returns retryable `stale_project_registry`. The browser reloads the project list and waits for another click. This prevents an insertion, removal, or reorder from changing what a rendered index means.

Dashboard startup generates a 32-byte browser capability with `crypto.randomBytes`. The printed and opened dashboard URL carries it only as a fragment. The page reads it once, removes the fragment with `history.replaceState`, and sends it as `X-OpenSpec-Dashboard-Capability` on launch. The server compares its bytes with `timingSafeEqual`. The token never enters logs, JSON, referrers, error text, or child state.

The route also requires the exact printed `Host`, exact printed `Origin`, JSON content type, a body no larger than 1,024 received bytes, and no unknown field. It rejects `OPTIONS` and emits no CORS headers. Existing read routes keep their current contract.

The local machine and user account remain trusted. The capability blocks hostile pages and unrelated local requests that do not possess the printed fragment. It is not authentication against a same-user process that can inspect this process or browser memory.

### 2. Validate the Code Explorer package, not an arbitrary JavaScript file

`CODE_EXPLORER_JS` is an explicit operator startup override. When absent, discovery uses `packages/code-explorer/dist/bundle.js` from this checkout. An invalid override fails closed and never falls back.

For either location, discovery:

1. Real-paths the selected regular `.js` file.
2. Requires its relative path below the package root to equal `dist/bundle.js`.
3. Parses the package-root `package.json`.
4. Requires `name: "code-explorer"` and `main: "dist/bundle.js"`.
5. Parses `.claude-plugin/plugin.json` and requires `name: "code-explorer"`.
6. Re-resolves the declared main and requires the same canonical file identity.

These are the package and plugin metadata created by `add-code-explorer-navigation`. The override supports another checkout or an installed marketplace cache without granting arbitrary script execution. Project-local packages and configuration never participate.

### 3. Spawn one fixed command with a minimal environment

The process adapter receives:

```text
executable: process.execPath
arguments: [entry, "serve", "--project-root", canonicalProjectPath, "--no-open"]
cwd: monorepoRoot
shell: false
windowsHide: true
stdio: ["ignore", "pipe", "pipe"]
```

The child environment copies only defined values from this allowlist:

- Cross-platform: `PATH`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `TMPDIR`, `LANG`, `LC_ALL`, and `PYTHONUTF8`.
- Windows host support: `SystemRoot`, `WINDIR`, `ComSpec`, `PATHEXT`, `APPDATA`, and `LOCALAPPDATA`.

It adds no other variable. In particular, it drops `CODE_EXPLORER_JS`, `NODE_OPTIONS`, `NODE_PATH`, npm injection variables, credential-shaped variables, and request values. Code Explorer applies its imported backend environment rules after this outer allowlist.

### 4. Parse readiness incrementally under deterministic bounds

The parser counts received bytes before UTF-8 decode. Stdout and stderr each permit 65,536 bytes before readiness. It uses a streaming `TextDecoder`, buffers incomplete text, frames on `\n`, and removes one preceding `\r`. A partial final line is not readiness.

Only `^Code Explorer: (\S+)$` is considered. The URL must be `http://127.0.0.1:<4410-4429>/`, matching the imported Code Explorer browser-server port contract, with no credentials, query, or fragment. A fake monotonic timer ends startup at 30 seconds. The record is installed before spawn, so synchronous spawn errors and racing callers still share one state transition.

Tests split the prefix and URL across chunks, split multi-byte UTF-8 input, use LF and CRLF, finish on a partial line, feed 65,536 and 65,537 bytes in different chunk shapes, advance a fake clock to the deadline, and race exit against readiness.

### 5. Reuse only a live child with a direct loopback shell probe

Managed records are keyed by the canonical project path plus its filesystem identity. A record is either `starting` or `open`. Concurrent calls for one identity share the same promise.

An open record is reusable only when its direct child is live and a one-second probe succeeds. The probe uses Node's direct `http.request`, not `fetch`. It:

- Connects to the recorded `127.0.0.1` port.
- Sends `GET /` and the exact Host header.
- Uses no proxy configuration.
- Never follows redirects.
- Requires `socket.remoteAddress` to normalize to `127.0.0.1`.
- Accepts only status 200.
- Reads at most 65,536 response bytes before destroying the response.

This probes the imported packaged-shell route without creating a Code Explorer session. Any failure stops and removes the old record before one replacement attempt.

### 6. Bound retained children

The manager admits at most eight `starting` or `open` records. A monotonic `lastUsedAt` changes on successful startup or reuse. Before admitting a ninth project, it may stop the least-recently-used open child whose idle age is at least 30 minutes. Starting and recently used children are not eligible.

If no record is eligible, launch returns retryable `code_explorer_capacity`. It does not queue unbounded work or disturb an active record.

### 7. Use authenticated ownership handoff instead of PID killing

The ownership record is `~/.openspec-dashboard/dashboard-owner.json`. Startup real-paths `homedir()`, rejects a linked or reparse-point dashboard directory, and proves the record remains below that directory. It creates the directory and file through exclusive, no-follow operations. On POSIX it requires the current uid, directory mode `0700`, and file mode `0600`. On Windows a replaceable ACL verifier requires the current user SID as owner and permits access only to that SID, `SYSTEM`, and `Administrators`; the implementation invokes a fixed host adapter without a shell. Any unverifiable owner, inherited access for another account, link, reparse point, preexisting replacement, or containment failure returns `dashboard_replacement_failed` before a capability is read or written.

The JSON record contains the dashboard PID for diagnostics, its control URL, and a separate 32-byte replacement capability. A new dashboard never signals that PID.

The control URL must parse exactly as `http://127.0.0.1:<1-65535>/api/admin/shutdown`, with no credentials, query, or fragment. The replacement uses Node's direct `http.request`, not `fetch`, and ignores proxy environment variables. It disables redirects, limits the response to 1,024 bytes and one second, and requires `socket.remoteAddress` to normalize to `127.0.0.1`. It waits for socket connection and validates that address before adding the replacement-capability header and ending the request. Thus an altered record cannot receive the secret at another target.

After that validation, the new process sends one shutdown request. The prior dashboard closes launch admission, settles starting callers, terminates each direct Code Explorer child, awaits every observed child exit, closes its listener, and removes its ownership file. The replacement waits up to 15 seconds for successful shutdown and ownership-file removal before claiming ownership.

If the ownership boundary is unverifiable, the endpoint is absent, the capability is invalid, a child does not exit, or the file is not released, startup fails with `dashboard_replacement_failed`. It never steals ownership or sends PID-only `taskkill` or process-group signals. This fail-closed path can require manual recovery after an abrupt operating-system termination. That limitation avoids terminating an unrelated reused PID.

For an ordinary dashboard signal, the same shutdown path sends the direct Code Explorer child its platform-normal Node termination signal and awaits exit. The imported Code Explorer browser-server lifecycle owns its sessions, listener, watchers, backend trees, and bounded forced cleanup. The dashboard does not duplicate that process-tree implementation. Shutdown is not reported complete while a direct child remains live.

### 8. Bind each placeholder to one immutable launch

Browser launch state is keyed by `<registry-revision>:<project-index>`. A click captures that key, creates a unique launch token, and synchronously calls `window.open("about:blank", "_blank")`. A null result produces `browser_tab_blocked` and no HTTP request.

The controller retains the exact `WindowProxy`, project snapshot, and launch token until settlement. A selected-tab change does not rebind them. Success checks `WindowProxy.closed`, then uses `location.replace(url)` only on that handle. A closed handle produces `browser_tab_closed`; the server child stays reusable. Server failure closes the unused handle when possible and stores only the stable error.

The client does not poll child health. A later click asks the server to reuse or replace the child.

### 9. Separate dependency-free controller proof from real-browser practice

The automated dashboard suite uses only `node:test` and injected filesystem, spawn, timer, probe, registry, API, and WindowPort adapters. The WindowPort contract includes synchronous `openBlank()`, nullable handle, readable `closed`, `replace(url)`, and `close()`. Those tests falsify call order, immutable launch binding, popup-null behavior, closure-before-response, selection changes, and duplicate suppression without pretending that a fake object proves a browser implementation.

The real-browser acceptance path reuses the pinned Playwright 1.55.1 and Chromium installed by the prerequisite `code-explorer` workspace. The dashboard adds no dependency. Its practice runner starts the real dashboard and packaged explorer, then drives the dashboard page to prove synchronous blank-tab creation, cross-origin navigation, second-click reuse, and browser closure behavior.

The suite layout is:

```text
tools/openspec-dashboard/test/all.test.mjs
tools/openspec-dashboard/test/code-explorer-discovery.test.mjs
tools/openspec-dashboard/test/code-explorer-api.test.mjs
tools/openspec-dashboard/test/code-explorer-launch.test.mjs
tools/openspec-dashboard/test/code-explorer-action.test.mjs
tools/openspec-dashboard/test/code-explorer-platform.test.mjs
tools/openspec-dashboard/test/fixtures/fake-code-explorer.mjs
tools/openspec-dashboard/test/fixtures/process-tree-parent.mjs
tools/openspec-dashboard/test/fixtures/process-tree-child.mjs
tools/openspec-dashboard/practice-code-explorer-link.mjs
```

Platform integration tests start a real fixture child and descendant. They prove the dashboard waits for direct-child exit and that the imported packaged Code Explorer process leaves no descendant after signal shutdown. They never simulate PID reuse by signaling another process because the design performs no PID-only signal.

The root script is:

```json
"test:openspec-dashboard": "node --test tools/openspec-dashboard/test/all.test.mjs"
```

The exact live command is:

```text
node tools/openspec-dashboard/practice-code-explorer-link.mjs --language rust
```

It requires a built `packages/code-explorer/dist/bundle.js`, the prerequisite Rust fixture manifest, and Playwright 1.55.1 with its pinned Chromium from the Code Explorer workspace. It needs no installed language server because this check stops at the packaged browser shell. The runner copies that fixture into a temporary directory, adds the minimal `openspec/` data needed for dashboard registration, and sets both `HOME` and `USERPROFILE` for the spawned dashboard to an isolated temporary home. It does not touch the user's registry.

The runner waits at most 90 seconds. It expects the new tab URL to match `http://127.0.0.1:<4410-4429>/`, the shell to report root `.`, a second click to return the same URL with reuse, and the closure case to leave no wrong-tab navigation. It hashes protected source and configuration before launch and after shutdown. Service-owned caches must remain outside the copied project.

Exit 0 requires every browser observation, child and descendant exit, released dashboard ownership, and equal protected-file hash. Exit 1 records one stable failed check. Exit 2 reports invalid CLI usage or a missing prerequisite. The redacted result is `tools/openspec-dashboard/practice/code-explorer-link-rust.json`; it contains check names, booleans, stable error codes, elapsed milliseconds, and normalized loopback ports, but no absolute path, capability, environment value, source text, or raw process output. A `finally` path closes Chromium, requests managed dashboard shutdown, waits for child cleanup, removes the temporary home and fixture, and records cleanup failure before exit.

No CI workflow changes. The root test and exact practice command remain explicit local gates for this developer tool.

## Failure envelope

Success is:

```json
{"state":"open","url":"http://127.0.0.1:4410/","reused":false}
```

Failure is:

```json
{"code":"code_explorer_start_failed","message":"code_explorer_start_failed","retryable":true}
```

Errors omit capabilities, canonical paths, environment values, child arguments, raw streams, and stacks. Stable codes include `invalid_dashboard_capability`, `invalid_launch_request`, `launch_request_limit`, `stale_project_registry`, `project_not_registered`, `project_unavailable`, `code_explorer_unavailable`, `code_explorer_start_failed`, `invalid_code_explorer_url`, `code_explorer_start_timeout`, `code_explorer_output_limit`, `code_explorer_capacity`, `dashboard_shutting_down`, and `dashboard_replacement_failed`.

## Risks / Trade-offs

- The link gives the dashboard process-start authority. The capability, registry revision, package validation, fixed command, minimal environment, and closed route bound that authority.
- A same-user process that can inspect process or browser memory remains trusted. This matches the personal loopback-tool boundary.
- Replacement after a crashed or unresponsive owner can require manual ownership-file recovery. This is safer than PID-only termination.
- The dashboard remains outside CI. Local Node tests, platform integrations, and Playwright practice are explicit rather than implied CI evidence.
- Eight projects and 30-minute idle eviction add a finite resource boundary. A user can retry after an idle child becomes eligible.

## Migration Plan

1. Verify both Code Explorer prerequisite changes are implemented and their imported requirements pass.
2. Add registry revisions, browser and replacement capabilities, and ownership handoff without changing read behavior.
3. Add package discovery, fixed child environment, readiness parsing, direct health probe, capacity, and shutdown tests.
4. Add the launch route and API boundary tests.
5. Add the selected-project action and pure WindowPort controller tests.
6. Add platform integration fixtures, root test script, README changes, and Playwright-backed live practice.
7. Run dashboard tests, syntax checks, root lint and format baselines, strict OpenSpec validation, and live practice.

Rollback first completes managed shutdown. It then removes the route, launch manager, action, tests, practice runner, and root script. Existing OpenSpec reads, registry administration, and static browsing remain unchanged.

## Adversarial review record

Round 1 found mutable-index ambiguity, arbitrary override execution, inherited-environment leakage, forged local HTTP, redirecting health probes, PID-reuse termination, unbounded children, chunked readiness gaps, selection races, and evidence gaps between fake windows and browsers. This revision addresses each finding through registry revisions, packaged-entry validation, explicit environment and capability boundaries, a direct non-redirecting probe, authenticated ownership handoff, finite capacity, incremental parsing, immutable launch tokens, platform integrations, and real-browser practice.

Round 2 found that the ownership file and control target were not private or strict enough, and that live practice lacked one reproducible command and evidence contract. The final design adds per-user ACL and no-follow checks, validates the control socket before sending its capability, and fixes the practice command, prerequisites, 90-second bound, exit codes, expected observations, cleanup, and redacted evidence.

Round 3 aligned readiness with the imported ports 4410 through 4429. Scope, security, consistency, and testability then returned clean. The implementability request to add dashboard PID-only tree termination was rejected because this design deliberately imports Code Explorer's signal cleanup and forbids PID-only termination after the identified PID-reuse risk. Its other Node HTTP, ownership, and browser-proof concerns were already explicit in decisions 5, 7, and 9.
