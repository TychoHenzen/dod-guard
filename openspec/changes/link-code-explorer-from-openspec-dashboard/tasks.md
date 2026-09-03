## 1. Prerequisites, registry identity, and executable boundary

- [x] 1.1 Verify the two prerequisite Code Explorer changes and their imported requirements are implemented and passing. Record the exact package, CLI, readiness, shell-route, read-only, root, and signal-cleanup contracts used by this bridge.
<!-- status: completed -->

- [x] 1.2 Add deterministic registry revisions and snapshot-aware selection. Reject stale revisions before index resolution, reload the browser list without automatic retry, and test insert, removal, reorder, missing index, unreadable project, and forbidden path fields. Verify with `npm run test:openspec-dashboard`.
<!-- status: completed -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered readable project is selected -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry changed after rendering -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Browser includes a project path -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry index does not exist -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered project is no longer readable -->

- [ ] 1.3 Add Code Explorer package discovery with explicit override precedence, monorepo fallback, canonical bundle identity, package and plugin metadata validation, and project-local candidate rejection. Verify both checkout and installed-cache layouts with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Operator override names a packaged entry -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Operator override is absent -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Selected package contract is invalid -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Registered project contains an executable candidate -->

- [ ] 1.4 Add the fixed shell-free child adapter and exact child-environment allowlist. Test metacharacter paths and parent credential, Node injection, override, and request values. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: New child is started -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: Project name contains shell syntax -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: Dashboard environment contains credentials or Node options -->

## 2. HTTP and child lifecycle

- [ ] 2.1 Generate browser and replacement capabilities. Add the fragment bootstrap, constant-time launch-capability check, exact Host and Origin checks, closed revision body, 1 KiB streaming limit, and no-CORS behavior. Test rejection before registry or process work. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: The launch HTTP route is capability-protected and bounded :: Capability-bound launch request is valid -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: The launch HTTP route is capability-protected and bounded :: Another origin targets launch -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: The launch HTTP route is capability-protected and bounded :: Local process forges browser headers -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: The launch HTTP route is capability-protected and bounded :: Launch body exceeds its boundary -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: The launch HTTP route is capability-protected and bounded :: Launch route uses another method or body shape -->

- [ ] 2.2 Implement the fakeable incremental UTF-8 readiness parser with LF and CRLF framing, a fake monotonic timer, strict loopback URL validation, and per-stream byte counters. Test chunk-split readiness, partial final lines, early exit, 30-second expiry, and 65,536 versus 65,537 bytes across chunk shapes. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Readiness uses bounded incremental line parsing :: Child reports valid chunked readiness -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Readiness uses bounded incremental line parsing :: Child prints a non-loopback URL -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Readiness uses bounded incremental line parsing :: Child exits or ends a partial line before readiness -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Readiness uses bounded incremental line parsing :: Readiness deadline is reached -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Readiness uses bounded incremental line parsing :: Stream output crosses its byte ceiling -->

- [ ] 2.3 Implement the project-identity launch state machine and direct Node HTTP probe. Test joined starts, independent projects, exact 200 reuse, redirects, changed remote address, response overflow, timeout, dead children, and changed filesystem identity. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Starts are coalesced and healthy children are reused :: Two requests race for one project -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Starts are coalesced and healthy children are reused :: Request targets a healthy child -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Starts are coalesced and healthy children are reused :: Probe redirects or connects elsewhere -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Starts are coalesced and healthy children are reused :: Request targets a different project -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Starts are coalesced and healthy children are reused :: Recorded child or project identity changed -->

- [ ] 2.4 Add the eight-child limit, monotonic last-use timestamps, 30-minute least-recently-used eviction, and retryable capacity error. Test exact boundaries without wall-clock waiting. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed child capacity is finite :: Idle capacity can be reclaimed -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed child capacity is finite :: Every capacity slot is active -->

- [ ] 2.5 Replace PID signaling with the authenticated ownership endpoint and fail-closed handoff. Add idempotent managed shutdown, joined-start settlement, direct-child exit waiting, private-directory and ACL checks, strict direct control-target validation, bounded response handling, tampering tests, and real platform fixture tests for descendant cleanup. Verify on Windows and a POSIX CI-equivalent shell when available.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Dashboard stops with open explorers -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Dashboard stops during startup -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Responsive dashboard replacement starts -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Ownership file is exposed or replaceable -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Ownership record contains an unsafe control target -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Managed shutdown is identity-safe :: Prior dashboard ownership cannot be proved -->

- [ ] 2.6 Add closed success and redacted error envelopes, isolated project failures, retry transitions, and navigation-operation rejection. Verify exact JSON keys and absence of capabilities, paths, arguments, environment values, raw streams, and stacks.
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch failures are stable and redacted :: Child writes a verbose failure -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch failures are stable and redacted :: One project launch fails -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: Launch failures are stable and redacted :: User retries after failure -->
  <!-- covers: openspec-dashboard/code-explorer-launch :: The bridge does not proxy navigation or write project content :: Browser requests navigation through the dashboard -->

## 3. Dashboard browser action

- [ ] 3.1 Add the selected-project `Code Explorer` action beside `Refresh`. Key state by registry revision and index. Test readable, missing, switched, stale, and empty registry snapshots with injected render state. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Readable project is selected -->
  <!-- covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Missing project is selected -->
  <!-- covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: User switches project tabs -->
  <!-- covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Registry becomes stale -->
  <!-- covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: No project is registered -->

- [ ] 3.2 Add the pure WindowPort action controller with immutable launch tokens and project snapshots. Test synchronous open ordering, success, redacted failure, null popup, `WindowProxy.closed`, duplicate suppression, selection changes, and stale-child replacement. Verify with `npm run test:openspec-dashboard`.
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: Launch succeeds -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: Launch fails -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: Browser blocks the placeholder -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: User closes the placeholder during startup -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: User clicks while startup is pending -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: Selection changes during startup -->
  <!-- covers: openspec-dashboard/ui :: Launch state and browser handoff remain locally bound :: Managed child exits after opening -->

- [ ] 3.3 Preserve task boxes as display-only controls and prove dashboard launch code writes no registered-project content. Verify with UI action tests and fixture hash assertions.
  <!-- covers: openspec-dashboard/ui :: The view never edits anything :: Reader clicks a task's completion box -->
  <!-- covers: openspec-dashboard/ui :: The view never edits anything :: Reader launches Code Explorer -->

## 4. Commands, documentation, and real acceptance

- [ ] 4.1 Add the dependency-free test aggregator, fake explorer, process fixtures, and root `test:openspec-dashboard` script. Run that command and syntax-check every touched `.mjs` and `.js` file.

- [ ] 4.2 Update `tools/openspec-dashboard/README.md` with the action, registry refresh behavior, package override contract, capabilities, capacity, managed lifetime, stable failures, recovery from a stale ownership file, test command, practice command, and absence of a CI gate.

- [ ] 4.3 Add and run `node tools/openspec-dashboard/practice-code-explorer-link.mjs --language rust` using the prerequisite workspace's pinned browser and built bundle. Use an isolated temporary home and disposable fixture. Enforce the 90-second bound, exit codes, redacted evidence schema, blank-tab handoff, root `.`, selection isolation, second-click reuse, browser closure, managed cleanup, external cache placement, and protected-file hash equality.
  <!-- covers: openspec-dashboard/code-explorer-launch :: The bridge does not proxy navigation or write project content :: Real packaged launch lifecycle runs -->

- [ ] 4.4 Run final local gates: `npm run test:openspec-dashboard`, platform integration tests, dashboard syntax checks, unchanged root Biome lint and format commands, `openspec validate --all --strict --no-interactive`, live practice, and `dod-guard cover link-code-explorer-from-openspec-dashboard` after test markers exist.
