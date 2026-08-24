## Context

The repository currently treats every npm workspace as an MCP plugin. Its root scripts build, test, and bundle all workspaces, while plugin validation and MCP smoke checks assume plugin manifests and an MCP server. The new package is a CLI-only workspace, so shared workspace gates must include it without inventing plugin metadata.

Git history is the primary evidence source. Current references refine that evidence but cannot prove runtime use. Workspace debris has weaker evidence again because Git has never tracked those files. The design keeps those confidence boundaries explicit.

The repository targets Node.js 18 or newer, TypeScript with Node16 module resolution, esbuild bundles, native Node tests, Biome, and ratcheted coverage and structural checks.

## Goals / Non-Goals

**Goals:**

- Keep the Git parser, reference backend, grader, and presentation layers independently testable.
- Produce deterministic results from one repository snapshot and normalized option set.
- Keep Git command count and file-system traversal bounded for the target runtime.
- Give later skills a typed API and stable JSON data instead of requiring table parsing.
- Preserve the distinction between fossil evidence and workspace-debris review hints.

**Non-Goals:**

- Prove that a reported file is unreachable or safe to delete.
- Interpret reflection, generated dependency injection, or arbitrary dynamic dispatch.
- Persist observations between runs.
- Add an MCP server or a fossil skill in this change.

## Decisions

### CLI-only workspace boundary

Create `packages/fossil` at version `0.1.0`. Its `main` and package export point to `dist/index.js` for programmatic use. Its `fossil` bin points to the tracked `dist/bundle.js` built through the shared esbuild driver.

`src/index.ts` owns Commander setup, the main-module guard, and API exports. `types.ts`, `git-analyzer.ts`, `ref-analyzer.ts`, `fossil-grader.ts`, and `output.ts` own the requested layers. Matching test files sit beside behavioral source files. `README.md` and `AGENTS.md` document the package contract and repository conventions.

Plugin validation will discover plugin packages by `.claude-plugin/plugin.json`, not merely by `packages/*/package.json`. Fossil still participates in JSON, tracked-content, lint, test-presence, audit, structural, and coverage gates. Package integrity gains a CLI smoke check instead of applying an MCP handshake to fossil.

Alternative considered: package fossil as an empty MCP plugin. Rejected because it would publish a server contract the tool does not provide and would couple later skill use to MCP startup.

### Git ingestion and logical file identities

Resolve the containing repository with `git rev-parse --show-toplevel` after requiring Git 2.30 or newer. Run Git with argument arrays, `shell: false`, `--no-pager`, `--no-ext-diff` where accepted, `-c core.fsmonitor=false`, `-c diff.external=`, `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, and a repository `cwd`. Use `core.quotepath=false`, epoch committer timestamps, and NUL-delimited output from `git log HEAD --no-merges --find-renames=50% --no-find-copies --name-status -z`. This follows every parent reachable from HEAD, not only first-parent history. Sort records by committer epoch then hash before burst analysis.

Merge commits and their file statuses never add activity or rename evidence. Full reachable non-merge history is used rather than first-parent history. Squash and rebased commits appear as ordinary commits. Copies and delete-recreate sequences create new logical identities. Git-reported case-only and cross-extension renames retain identity.

Use the lookback log for burst activity and every reachable later non-merge commit through HEAD for consolidation. Because each retained burst lies inside the lookback window, the same chronological stream already contains its later activity. Current tracked inventory determines whether the resolved logical path still exists.

Analysis time is captured once in UTC. A future-dated commit produces a completeness warning and leaves its cluster unfinished. Shallow and sparse repositories produce nonfatal completeness warnings. Submodules are opaque entries. An empty repository returns a zero-result report.

Alternative considered: treat every historical path as a separate file. Rejected because renames would manufacture both an abandoned old path and a newly active survivor.

### Hybrid burst segmentation

First split included commits when an adjacent gap exceeds the configured temporal gap. Drop merge commits before this step.

Within each temporal cluster, evaluate a cut before commit `i` when five commits exist on each side. The left set is the union from `i-5` through `i-1`; the right set is the union from `i` through `i+4`. The windows never overlap. Give file `f` the history-window weight `ln((1 + C) / (1 + touches(f))) + 1`, where `C` is the included commit count. Calculate weighted Jaccard similarity from summed intersection weight divided by summed union weight. Define two empty sets as similarity 1.0.

A cut qualifies at similarity `<= 0.10` only when both resulting partitions retain at least five commits and three files. Select the lowest similarity, then the largest gap, then the earliest position. Recursively evaluate both partitions. This makes close scope changes visible while making repeated generated files less influential.

Alternative considered: time-only clusters. The three-repository sample joined unrelated work into clusters lasting hundreds of hours. Raw per-commit Jaccard was also rejected because merge, documentation, and generated-file commits produced many false boundaries.

### Consolidation and scoring pipeline

The Git analyzer returns closed bursts with per-file burst and post-burst counts. A file is a survivor when post-burst count is at least three, or when the maximum post-burst count is positive and the file reaches 20 percent of it. Existing non-survivors become candidates.

The reference analyzer then builds the current graph. The grader classifies candidate-to-candidate edges as vestigial, calculates all available subscores, renormalizes missing reference weights, applies the threshold inclusively, and assembles burst-path findings. A path can appear in more than one burst because its evidence is burst-specific.

Alternative considered: deduplicate candidates before scoring. Rejected because it would discard the exact prototype session that explains each finding.

### Replaceable regex reference backend

Define a backend interface that accepts a current file inventory and returns resolved edges, unresolved references, and warnings. The first backend uses regex extraction plus lightweight source-region checks. Scoring consumes only the backend result.

Resolution handles literal relative TypeScript and JavaScript specifiers through a fixed extension and index list. It does not interpret tsconfig aliases, package exports, or package specifiers. C# namespace resolution matches one `.cs` path suffix after replacing dots with separators. Rust resolution uses sibling module paths and the nearest Cargo package's `src` root. Ambiguous references stay unresolved.

Normalized parser results carry source path, target candidates, source span, language, reference kind, strength evidence, and resolution status. An unresolved reference whose path tail or unique basename could target a candidate makes that candidate's two reference subscores unavailable.

Weakness checks inspect lexically balanced try or catch regions, conditionals carrying the tokens `fallback`, `legacy`, `old`, or `default`, `||` and `??` defaults, C# preprocessor guards, and Rust `cfg` items. If any usage occurs outside those regions, the edge is strong. This conservative rule avoids calling a normally used import weak because one fallback use also exists.

Canonical containment precedes every content read. Directory symlinks and Windows junctions are never traversed. A visited-realpath set prevents duplicate traversal. Regular file real paths must remain under the canonical repository root and remain stable between metadata and read operations. Regexes must be linear-time. Content scanning is capped at 1 MiB per file and 256 MiB per run; binary and skipped files produce incomplete reference evidence rather than negative evidence.

The report declares the canonical repository root as its analysis boundary. Sibling repositories, deployment consumers, reflection, runtime path construction, and unsupported language mechanisms are unobserved. External and unresolved references are retained as incomplete evidence and never converted to absence evidence.

Alternative considered: tree-sitter in the first release. Rejected to keep production dependencies and language setup small. The backend boundary preserves that later replacement path.

### Workspace debris pipeline

Use `git ls-files -z --others --exclude-standard` and its `--ignored` form to collect workspace paths. Use NUL-delimited `git check-ignore -z -v --stdin` to obtain repository, local-exclude, or global-exclude provenance. Apply caller exclusions, sensitive-name exclusions, and age filters before metadata or content reads. Last modification time at or before the inclusive cutoff controls eligibility. Every finding identifies `mtime` as uncertain filesystem metadata; creation time is display-only when plausible.

Search tracked and eligible workspace source for resolved imports, exact normalized relative paths, and distinctive candidate basenames. Do not report a file with discovered inbound evidence. Preserve the matching ignore rule from `git check-ignore -v`.

Exclude `.git`, the named dependency stores and secret patterns in the spec, and all symlinks. Never print excluded paths or ignore rules. When at least 20 findings share an ignored top-level directory, normal table output collapses them into a directory row. JSON and verbose output keep individual records.

Alternative considered: blend workspace files into fossil scoring. Rejected because untracked files have no commit churn or consolidation evidence.

### Output and API contract

`analyzeRepository()` normalizes options and returns a discriminated report with `schemaVersion: 1`. It rejects with typed fatal errors and accumulates nonfatal warnings in successful reports. Report metadata includes the analysis boundary, Git version, resource limits and usage, completeness flags, and omitted-scope counts. JSON output uses `JSON.stringify` over typed fields and never carries source text or raw command output. Table and stderr output visibly escape repository-derived control characters; stderr diagnostics cap at 4 KiB. Table output only emits fossil-owned ANSI colors when stdout is a TTY.

Bursts sort newest first. Survivors and debris sort by normalized path. Findings sort by descending score then path. Warnings sort by code then path. Dates render in UTC. Both formats distinguish candidate findings from unique candidate paths and identify `full` versus `git-only` score bases.

Warnings are data in the API and JSON report. The CLI also writes fatal diagnostics to stderr. Individual reference read failures degrade gracefully; Git discovery or log failures are fatal.

Alternative considered: expose table output as the skill boundary. Rejected because presentation changes would break downstream automation.

### Verification and performance

Unit fixtures pin Git parsing, rename chains, boundary timestamps, weighted split selection, reference resolution, weakness regions, score formulas, debris filtering, and both formatters. Temporary Git repositories cover real command invocation and CLI exit behavior.

A deterministic `git fast-import` setup creates a temporary repository with 5,000 non-merge commits and 1,000 eligible source files. On GitHub-hosted `ubuntu-24.04` with Node.js 22, one untimed full analysis warms caches. Three fresh processes then run JSON analysis. Each must finish under 10 seconds and the harness records all durations and their maximum as JSON. The implementation streams Git output, caches path resolution, skips binary content, and avoids quadratic all-file comparisons.

Fatal resource limits are 100,000 included commits and 100,000 inventoried files. CLI numeric maxima are 3,650 days, 8,760 gap hours, 3,650 untracked-age days, and 64 extensions. These limits fail explicitly rather than returning silent partial Git evidence.

Git subprocess readers additionally cap status records at 1,000,000, stdout at 256 MiB, and stderr at 1 MiB while streaming. Breaches terminate the child. Reference content limits remain nonfatal but set report completeness false and identify omitted paths.

### Deterministic time and filesystem fixtures

Capture analysis time once and pass it into history and workspace calculations. Internal constructors accept a clock dependency for tests while the public CLI uses the system clock. Workspace fixtures set mtimes explicitly and test one instant before, exactly at, and one instant after the cutoff. Race fixtures replace or remove a file between metadata and read operations.

### Exact package and CI integration

`packages/fossil/package.json` uses `build: tsc`, `test: tsc && node --test "dist/**/*.test.js"`, `bundle: node esbuild.config.mjs`, and a c8 coverage script over compiled non-test files. The shared esbuild driver bundles `src/index.ts` with its executable shebang to tracked `dist/bundle.js`; `dist/index.js` remains the package API entry.

Root plugin discovery includes only workspaces holding `.claude-plugin/plugin.json`. Existing MCP smoke iteration remains limited to plugin packages. A separate fossil smoke runs `node packages/fossil/dist/bundle.js --help`, then analyzes a prepared fixture with `--format json` and asserts schema version 1. Fossil is added explicitly to the coverage package list and otherwise participates through existing workspace globs.

## Risks / Trade-offs

- [Regex regions can misclassify nested or unusual syntax] -> Keep findings explanatory, treat any normal-flow usage as strong, and isolate the parser behind a replaceable backend.
- [A four-hour change-point floor can miss an immediate switch of prototype scope] -> Preserve the configurable temporal gap and document that the calibrated close-split heuristic favors precision in version 1.
- [Tracked generated files can still distort activity] -> Use inverse-frequency file weights and fixtures based on repositories that contain generated artifacts.
- [File modification time does not prove that workspace content is unused] -> Keep workspace debris separate and label every result for review only.
- [Filename searches can produce false usage evidence] -> Prefer false negatives in debris reporting because omission is safer than suggesting deletion.
- [Large repositories may exceed the runtime target] -> Stream Git records, bound file reads, cache resolution, and expose elapsed statistics for benchmark diagnosis.

## Migration Plan

1. Add the workspace, lockfile entry, package documentation, source, and tests.
2. Extend shared validation and CI gates to distinguish CLI packages from plugins.
3. Build and track the CLI bundle through the existing CI-owned bundle workflow.
4. Run repository-wide build, tests, Biome, ratchets, OpenSpec validation, and the fossil CLI smoke and performance checks.

Rollback removes the fossil workspace and its CLI-specific validation entries. Existing plugin packages and their MCP bundle checks retain their current behavior.

## Phase 1 review

**Verdict:** GO

- Security: 3 findings. Two major residual risks cover inherited Git location environment variables and atomic no-follow file opening. One minor finding covers exclusion-glob limits.
- Assumptions: 0 findings. Repository scope, incomplete evidence, timestamp uncertainty, and resource semantics are explicit.
- Testability: 0 findings. Inputs, boundaries, clocks, benchmark runs, and scenario assertions are deterministic and observable.
- Consistency: 0 findings. Thresholds, scoring bases, output counts, package scope, and advisory wording agree across artifacts.
- Implementability: 0 findings. Git parsing, parser results, API errors, package integration, and benchmark execution have concrete contracts.

Review history: Round 1 returned REVISE with 29 major and 8 minor findings. Round 2 returned REVISE with 11 major and 4 minor findings. Round 3 met the GO threshold with no critical findings and two major findings.

Residual implementation risks:

- Git subprocesses should clear inherited repository-location, object-store, index, and environment-config variables before setting fossil-owned environment values.
- Source reads should use no-follow file handles and validate the opened file identity where the platform supports it. Unsupported platforms should skip mutable paths.
- Caller exclusion globs should have count, byte, syntax, and matching-complexity limits.
