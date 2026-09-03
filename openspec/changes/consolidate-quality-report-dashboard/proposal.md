## Why

`quality_scan` and `quality_report` expose overlapping MCP entry points over the same structural scanner, while the richer report has no readable interface and its current architecture appendix emits false positives. The repository needs one scanner contract, one durable report artifact, and a structured way to inspect that artifact.

## What Changes

- **BREAKING** Remove the `quality_report` MCP tool while retaining `quality_scan` as the only on-demand scan tool.
- Add an external repository-report generator that atomically writes `.quality/quality-report.json` from the canonical scanner and cross-file architecture analysis.
- Repair current-state placement, dependency, cycle, and encapsulation analysis so the report excludes parser artifacts and duplicate findings.
- Add a per-project Quality view to the OpenSpec dashboard with summary counts, filters, rule groups, file details, and a cross-file appendix.
- Add separate dashboard actions to regenerate the artifact through the external generator and reload the artifact from disk.
- Preserve the last valid artifact and displayed report when generation or reload fails.

## Capabilities

### New Capabilities

- `quality-guard/repository-report`: Generation, validation, atomic persistence, and reload behavior for `.quality/quality-report.json`.

### Modified Capabilities

- `quality-guard/mcp-tools`: Remove the overlapping `quality_report` tool and retain `quality_scan` as the scanner surface.
- `quality-guard/architecture-analysis`: Add accurate whole-repository placement, dependency, cycle, and encapsulation evidence for the report appendix.
- `openspec-dashboard/ui`: Add the structured per-project Quality view and its regenerate and reload controls.

## Impact

- Removes one MCP tool from `packages/quality-guard/src/index.ts` and updates its tests and documentation.
- Retains the report builder in `packages/quality-guard/src/` as shared reporting logic rather than an MCP endpoint.
- Adds a report-generation command that writes only `.quality/quality-report.json` under the selected project.
- Extends `tools/openspec-dashboard` API, reader, browser state, rendering, styles, tests, and documentation.
- Changes the dashboard's read-only statement: ordinary views remain read-only, while an explicit Regenerate action invokes the external generator that writes the report artifact.
