# AGENTS.md

## Purpose

`@dod-guard/fossil` is a Node 18+ CLI workspace. It reviews Git-history bursts, static reference evidence, and old
workspace files. It is not an MCP server or marketplace plugin. Every finding is advisory and fossil never mutates
the repository it examines.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Commander CLI, option normalization, process exit mapping, bounded control-safe diagnostics, and exported analysis boundary. |
| `src/types.ts` | Stable report, finding, warning, option, and resource contracts. |
| `src/analysis-error.ts` | Typed fatal analysis errors. |
| `src/git-process.ts` | Non-shell, noninteractive Git execution, version capability checks, and bounded stream ingestion. |
| `src/git-analyzer.ts` | NUL-delimited history parsing, logical file activity, bursts, and history limits. |
| `src/ref-analyzer.ts` | Repository-contained inventory, bounded source reads, and supported static reference resolution. |
| `src/fossil-grader.ts` | Pure subscores, score combination, thresholding, and advisory finding construction. |
| `src/workspace-debris.ts` | Safe discovery and review-only workspace-debris evidence. |
| `src/output.ts` | Table and schema-versioned JSON presentation. |

Each source module has a sibling `*.test.ts` file. Keep parsing, scoring, and presentation boundaries injectable or
pure where practical.

## Data flow

The CLI normalizes options, then calls the shared repository-analysis boundary. A composed core gathers bounded Git
history, contained reference evidence, and safe workspace metadata. The grader produces burst-specific advisory
findings. The output layer finalizes report statistics and renders table or JSON data.

The default production analysis core is intentionally not wired yet. Do not fabricate a successful report to bridge
that gap.

## Safety and resource rules

- Pass Git arguments as arrays with `shell: false`. Disable interactive prompts, pagers, fsmonitor, and external diff helpers.
- Treat repository paths and Git filenames as data. Preserve NUL-delimited records and escape repository-derived terminal text.
- Keep reads inside the canonical repository root. Do not traverse directory links, junctions, sensitive paths, dependency stores, or caller exclusions.
- Fatal limits are 100,000 commits, 100,000 inventoried files, 1,000,000 status records, 256 MiB Git stdout, and 1 MiB Git stderr.
- Reference content limits are 1 MiB per file and 256 MiB total. Omitted reference evidence is nonfatal and must remain visible as warnings or incomplete evidence.
- Workspace debris uses modification time as review evidence only. It never proves deletion safety.

## Build, test, and release

Run from the repository root:

```bash
npm run build -w packages/fossil
npm test -w packages/fossil
npm run bundle -w packages/fossil
node --experimental-test-module-mocks --test packages/fossil/dist/<file>.test.js
```

The executable entry point is `dist/bundle.js`. It is tracked and rebuilt by CI. `package-integrity` runs the
CLI-only `smoke-cli-bundle.mjs` check for fossil. Fossil is explicitly outside the MCP initialize and tools/list
handshake loop.
