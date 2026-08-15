## Why

The dashboard sidebar lists specs as flat groups with requirement counts, but the on-disk layout is a two-level hierarchy (group/capability). The flat list hides structure and makes navigation slow as the spec count grows. Coverage numbers exist per-scenario in the detail view but are not visible at a glance in the sidebar. Separately, there is no skill to expand a thin spec into deeper requirements, and no skill to generate tests that resist the LLM pattern of blessing buggy implementations.

## What Changes

- Move the spec summary line (bound/total scenarios) from the detail-view title area into the sidebar, next to each spec entry
- Replace the flat group listing in the sidebar with a foldable directory tree that mirrors the `openspec/specs/` folder hierarchy (group > capability)
- Roll up coverage numbers to every level of the tree: each folder node shows the aggregate bound/total across all specs it contains
- Add a new dod-guard skill (`/spec-explore`) that takes a spec path and generates deeper requirements, scenarios, and edge cases for it
- Add a new dod-guard skill (`/spec-test`) that generates tests for a spec or requirement that has no test coverage, using adversarial techniques to avoid writing tests that merely mirror the current implementation

## Capabilities

### New Capabilities

- `openspec-dashboard/folder-nav`: Foldable directory-tree sidebar navigation with coverage rollups at every level
- `dod-guard/spec-explore`: Skill to discover and expand requirements for an existing spec
- `dod-guard/spec-test`: Skill to generate adversarial, implementation-independent tests for uncovered specs and requirements

### Modified Capabilities

- `openspec-dashboard/scenario-coverage`: Coverage summary moves from detail-view header into sidebar entries

## Impact

- `tools/openspec-dashboard/`: sidebar.mjs (major rewrite for tree rendering), render-spec.mjs (remove redundant header summary), index.html (CSS for foldable tree nodes)
- `packages/dod-guard/skills/`: two new skill directories with SKILL.md files
- `packages/dod-guard/.claude-plugin/`: marketplace.json and plugin.json gain two new skill entries
- Root marketplace.json skill count for dod-guard increases
