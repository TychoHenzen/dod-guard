# Serena code explorer handoff

## Current situation

Serena is installed and registered as a Codex MCP server. Its MCP tools are available in the current Codex session.

The intended work has three separate OpenSpec changes:

1. `add-code-explorer-navigation` gives LLMs precise, IDE-like code navigation without reading entire files.
2. `add-local-code-explorer` gives the user a localized visual view over the same service.
3. Optional `link-code-explorer-from-openspec-dashboard` opens Code Explorer for the selected dashboard project.

The visual view should support moving upward to callers and downward into calls. It must eventually work with Rust, Python, and C#.

No code explorer implementation exists yet. The `add-code-explorer-navigation` OpenSpec change now exists and passed its interview review. It contains 39 requirements, 145 scenarios, 58 tasks, and an exact 145-scenario task-marker bijection. Strict OpenSpec validation passes. The local browser and optional dashboard link remain separate future changes.

## User problem

Current code exploration often relies on commands that dump whole files or guess broad search terms. This wastes context and makes code structure difficult to follow.

The desired navigation model is closer to a JetBrains IDE:

- Show the definition of a symbol visible in the current function.
- Find usages without requiring a fully qualified name.
- Retain navigation context between requests.
- Search filenames, functions, classes, and variables with fuzzy matching and filters.
- Expose common terms or landmarks as a quick project table of contents.
- Show only a small graph around the current function.
- Navigate to callers, callees, definitions, implementations, and references.

The human-facing view must stay localized. A whole-project class diagram would contain too much information.

## Serena installation

Installed tool:

```text
serena-agent 1.7.0
```

Installation command:

```powershell
rtk uv tool install -p 3.13 serena-agent
```

Global Serena configuration:

```text
C:\Users\siriu\.serena\serena_config.yml
```

Serena was initialized with the free LSP backend:

```powershell
rtk proxy serena init -b LSP
```

Codex registration was created with:

```powershell
rtk proxy serena setup codex
```

The resulting Codex MCP registration is:

```text
name: serena
enabled: true
transport: stdio
command: serena
args: start-mcp-server --context=codex --project-from-cwd
```

Verify it in the new session:

```powershell
rtk uv tool list
codex mcp get serena
```

## Licensing and backend decision

Core Serena and its LSP backend are MIT-licensed and free. The optional Serena JetBrains Plugin is paid after its trial.

Use the LSP backend. The paid JetBrains backend does not support Rider or CLion, so it would not cover the required C# and Rust workflows.

Official source:

```text
https://github.com/oraios/serena
```

## Verified behavior

The Serena project health check passes in this repository after generated bundles are excluded:

```powershell
rtk proxy cmd.exe /d /s /c "set PYTHONUTF8=1&&serena project health-check C:\Users\siriu\mcp-servers\dod-guard"
```

Expected final output:

```text
Health check passed - All tools working correctly
```

The health check exercised:

- `get_symbols_overview`
- `find_symbol`
- `find_referencing_symbols`

A direct test against `tools/openspec-dashboard/public/app.js` showed the desired compact behavior:

- `find_symbol` for `openProject` returned only its 14-line function body.
- `find_referencing_symbols` found references in `paintTabs`, `reloadProjects`, and the refresh event listener.
- No whole-file read was needed.

TypeScript, Rust, Python, and C# have now been tested locally. The cross-language results and exact calls are recorded below.

## Cross-language validation

Validation ran through Serena MCP tools. It did not use `rg` or whole-file reads as a substitute for symbol navigation.

### Rust: DeepSeekCustom

Activated project:

```json
{"project":"C:\\Users\\siriu\\RustroverProjects\\DeepSeekCustom"}
```

The initial exact symbol calls used this shape:

```json
{
  "name_path_pattern":"TranscriptContent",
  "include_body":false,
  "include_info":true,
  "max_matches":20,
  "max_answer_chars":12000
}
```

The same call was repeated for `AgentEvent`, `SendMessage`, and `Tool`.

Results:

- `TranscriptContent` resolved to the enum in `crates/deepseek-custom/src/application/dto.rs`.
- `AgentEvent` returned no match. A substring search for `Agent` returned `AgentCommand`, `AgentLoop`, and related symbols. A substring search for `Event` returned 29 candidates, including `StreamEvent`, `AppEvent`, `CodexEvent`, and `ClaudeEvent`.
- `SendMessage` resolved to `AppCommand/SendMessage`. A substring search also found `SendMessageInput`, `SendMessageTool`, and its implementations.
- `Tool` returned three exact matches: `Role/Tool`, `HarnessError/Tool`, and the `Tool` interface.

References used this call:

```json
{
  "name_path":"AppCommand/SendMessage",
  "relative_path":"crates\\deepseek-custom\\src\\application\\dto.rs",
  "max_answer_chars":20000
}
```

It found the production caller `ApplicationActor/submit` and focused test callers. The same operation on `TranscriptContent` and the `Tool` interface returned symbol-grouped references with short snippets.

The localized function test read only `project_block`:

```json
{
  "name_path_pattern":"project_block",
  "relative_path":"crates\\deepseek-custom\\src\\application\\session.rs",
  "include_body":true,
  "max_matches":1,
  "max_answer_chars":12000
}
```

`find_declaration` followed the visible `BlockKind` reference to `application/transcript.rs`. `find_referencing_symbols` found the caller `ApplicationSession/transcript_projection` and the recursive self-call.

### Python: Pensive

Activated project:

```json
{"project":"C:\\Users\\siriu\\PycharmProjects\\Pensive"}
```

`find_symbol` resolved `VarianceHysteresisScheduler` in `train/alternating_scheduler.py`. `depth: 1` returned its methods without the class body.

The localized body call was:

```json
{
  "name_path_pattern":"VarianceHysteresisScheduler/train_records",
  "relative_path":"train\\alternating_scheduler.py",
  "include_body":true,
  "max_matches":1,
  "max_answer_chars":10000
}
```

`find_declaration` followed `self._train_records` to `VarianceHysteresisScheduler/_train_records`. `find_referencing_symbols` found calls in `train/run_alternating.py` and `tests/test_alternating_scheduler.py`.

### C#: CodeMap

Activated project:

```json
{"project":"C:\\Users\\siriu\\RiderProjects\\CodeMap"}
```

An exact `Program` lookup resolved `CodeMap/Program.cs`, but `get_symbols_overview` returned `{}` because the file uses top-level statements.

Substring searches exposed two useful limits:

- `Graph` matched 35 symbols and exceeded `max_matches: 30`. Serena returned a shortened candidate map for refinement.
- `Service` returned production-like test fixture symbols, including `OrderService` and `IOrderService`.

The localized body call resolved the 18-line `MyApp.Services/OrderService` class. `find_declaration` followed `PricingCalculator` and `IOrderService` to their files. `find_referencing_symbols` returned no references for `OrderService`.

One framework lookup failed. From `MainWindow/LoadGraphHtml`, `find_declaration` could not resolve `System.Reflection.Assembly`. It returned:

```text
ValueError: No symbol declaration found at the location of the regex match.
```

The same method's reference lookup succeeded and found `MainWindow/RunPipelineAsync`.

### Observed extension gaps

- Serena calls are stateless from the client's perspective. The client must retain the active symbol, history, and selected candidate.
- Exact short names can be missing, stale, or ambiguous. The wrapper needs a refinement flow and stable short handles.
- Substring search is useful but not fuzzy ranking. Common terms can exceed the match limit and mix source, tests, fixtures, files, and members.
- Reference results approximate callers well for functions, but the tool does not label a dedicated call hierarchy or separate recursive calls.
- External framework declarations may not resolve even when project-local declarations do.
- Top-level C# files may have an empty symbol overview.
- Paths use platform separators in requests and results. A browser-facing model should normalize them.

## Local Serena project configuration

Serena created:

```text
C:\Users\siriu\mcp-servers\dod-guard\.serena\project.yml
```

It contains this exclusion:

```yaml
ignored_paths:
  - "**/dist/**"
```

The exclusion prevents generated `dist/bundle.js` files from being selected for symbol analysis.

## Candidate dependency boundary evidence

Do not import Serena's private Python modules. Treat Serena only as one public-boundary candidate in the mandatory Serena-versus-Symbols spike. The recorded matrix decides whether production reuses it, supplements it with direct public LSP requests, or uses direct LSP adapters.

The observed Serena boundaries are:

1. Keep Serena registered directly as an MCP server for ordinary LLM navigation.
2. Use its read-only project server as one spike candidate.

Start the project server with:

```powershell
serena start-project-server
```

It exposes:

```text
GET /heartbeat
POST /query_project
```

The query payload contains:

```json
{
  "project_name": "<registered project>",
  "tool_name": "find_symbol",
  "tool_params_json": "{...}"
}
```

The server rejects write tools. This makes it a useful read-only boundary for the visual explorer.

The endpoint implementation was found in:

```text
C:\Users\siriu\AppData\Roaming\uv\tools\serena-agent\Lib\site-packages\serena\project_server.py
```

Treat that path as inspection evidence only. Production must not build against the installed module path.

The spike must pin and contract-test the observed Serena version. Its HTTP project-server API may change between versions.

### Live project-server contract check

The project server was started and stopped during this continuation. It listened on its default loopback port, `24225`.

The heartbeat returned:

```json
{"status":"alive"}
```

This request succeeded through the public HTTP boundary:

```json
{
  "project_name":"DeepSeekCustom",
  "tool_name":"find_file",
  "tool_params_json":"{\"file_mask\":\"*.rs\",\"relative_path\":\"crates/deepseek-custom/src/application\"}"
}
```

It returned the Rust files in that directory. This confirms that the project server can expose read-only tools such as `find_file` even when the direct Codex context does not expose that tool.

An unsupported `outgoing_calls` request returned HTTP 500 with an HTML error page. The server log contained:

```text
ValueError: Tool named 'outgoing_calls' not found.
```

The wrapper must therefore allowlist tool names, validate payloads before forwarding them, and convert upstream failures into stable JSON errors.

The installed `solidlsp` dependency contains requests for `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, and `callHierarchy/outgoingCalls`. Its Rust, Python, and C# clients advertise call-hierarchy capability. Serena 1.7.0 does not wrap those requests as a public tool. Importing `solidlsp` or Serena internals from this repository would cross the chosen dependency boundary.

## What Serena already supplies

The default Serena tool set includes:

- Symbol overview and symbol lookup.
- Reference, declaration, and implementation lookup.
- Diagnostics and rename support.
- Symbol-level editing and safe deletion tools.

This already solves most of the whole-file dumping problem.

## Approved OpenSpec boundary

The repository keeps semantic navigation, the localized browser, and the OpenSpec dashboard link separate.

### `add-code-explorer-navigation`

This is the current planned change. It creates `packages/code-explorer` as an independent npm workspace and marketplace MCP plugin. It owns read-only search, focus views, handles, semantic relations, history, landmarks, language adapters, freshness, and filtering.

The first implementation slice must run the bounded Serena-versus-Symbols spike against the exact DeepSeekCustom examples. The deterministic cross-language matrix selects the production adapter path. Direct public LSP adapters may supplement gaps found by the spike. Production never imports private Serena or Symbols modules and never reruns the spike.

The approved plan also fixes the trust boundary. It includes canonical root and opened-file identity checks, sensitive-path exclusion, per-language executable records, exact LSP lifecycle rules, generation and watcher behavior, and safe modes for Rust, Python, and C#. Direct Python LSP analysis uses an immutable per-generation mirror rather than the live project root.

### `add-local-code-explorer`

This remains a separate future change. It will add a localized browser view over the navigation service, with Rust, Python, and C# practice projects. The visual model below remains the starting interaction concept. Agent-follow mode is deferred to a later scenario or change.

### `link-code-explorer-from-openspec-dashboard`

This remains optional and separate. It will make a small change to `openspec-dashboard/ui` that opens Code Explorer for the selected project. It must keep the existing dashboard server read-only and small.

The existing Serena web dashboard remains an operational and logging dashboard. It is not the localized code visualization requested here.

## Visual interaction model

The browser should keep one symbol in focus:

```text
[Back] [Forward] [Search________________] [kind] [path] [source/tests]

References                 Current symbol                 Definitions
or possible callers        signature and compact body     and implementations
      [r1]  --------->      [s1] selected function  -----> [d1]
      [r2]                  clickable visible names        [d2]

                one-hop graph centered on [s1]
```

Each result receives a stable short handle for the browser session. Selecting a result recenters the view and records back and forward history.

Search should combine Serena symbol substring matching with `find_file`. The wrapper should rank exact matches first, then prefixes, then other substring matches. Filters should cover symbol kind, path, and source versus tests. A result should show its normalized project-relative path and kind before selection.

The graph should show only the selected symbol, its visible one-hop relations, and nodes the user reached from it. Recenter the graph after navigation. Do not render a whole-project diagram.

For the first release, upward edges come from `find_referencing_symbols`. Label them `reference` unless call semantics are certain. Downward movement happens when the user selects a visible name in the current body and the server resolves it with `find_declaration` or `find_implementations`.

Do not label this a complete call graph. Automatic incoming and outgoing call hierarchy remains blocked on a public Serena tool. If Serena exposes that tool later, it can replace the reference approximation without changing the browser state model.

Project landmarks should be an explicit later slice. Build them from Serena symbol overviews, not from whole-file reads. Cache only normalized symbol metadata and provide a refresh control.

## Planned navigation outcomes

The current `add-code-explorer-navigation` change pins these outcomes in its five capability specs:

1. A small read-only MCP surface provides search, focus, follow, history, and status.
2. Search and project landmarks replace guessed terms with deterministic, evidence-bearing candidates.
3. Immutable views and scoped handles make navigation explicit and reproducible.
4. Semantic adapters report proven definitions, references, implementations, types, callers, and callees without structural invention.
5. Saved-file freshness, generations, refresh, exclusions, dirty state, and failure states remain visible and bounded.

The later browser change will pin the visual graph, layout, browser lifecycle, and project selection behavior. Those UI requirements are not part of the navigation change.

## Issues discovered during setup

Two Serena behaviors are possible upstream contributions:

1. Project health check selected a tracked generated bundle and failed instead of trying another source file.
2. Error reporting raised `UnicodeEncodeError` on Windows CP1252 while printing an emoji.

Setting `PYTHONUTF8=1` avoided the second failure. Excluding `**/dist/**` avoided the first failure in this repository.

## Current next action

The `add-code-explorer-navigation` planning phase is complete. Its Phase 1 interview gate is `GO`. No production code has changed.

The recommended executor is `dod-guard:adversarial-workflow`, starting at Phase 2. This change has cross-language process, filesystem, freshness, and security gates that benefit from review at each implementation phase.

The first execution slice remains the bounded dependency spike. Production adapter work must wait for its checked-in selection record. Every later slice must leave a runnable Rust, Python, or C# practice check.

The other two changes remain separate. Run their own interviews before proposal work because the browser interaction and dashboard handoff behavior still need observable scenarios.

## Suggested implementation prompt

```text
Apply the OpenSpec change `add-code-explorer-navigation` through
`dod-guard:adversarial-workflow`, starting at Phase 2.

Read the complete proposal, design, five delta specs, and tasks first. Run the
bounded Serena-versus-Symbols spike before production adapter work. Preserve
the exact scenario bindings, trust boundaries, and independently runnable
practice checks. Do not add the browser or OpenSpec dashboard link in this
change.
```

## Repository state at handoff creation

No application source code was changed for the Serena investigation.

At handoff creation, this unrelated untracked file already existed and was left unchanged:

```text
.serena/transcript-breakdown-analysis.md
```

This handoff document is the only file added by the handoff-writing session.

## Repository state after cross-language validation

The validation created untracked `.serena/` project metadata and symbol caches in:

```text
C:\Users\siriu\PycharmProjects\Pensive
C:\Users\siriu\RiderProjects\CodeMap
```

`C:\Users\siriu\RustroverProjects\DeepSeekCustom` also has an untracked `.serena/` directory. Its Serena project was already registered when this continuation activated it.

The three validation repositories contain unrelated tracked and untracked work. That work was left unchanged. No application source was edited for this investigation.
