## Context

See proposal.md for motivation. The dashboard is a zero-dependency browser app served by `tools/openspec-dashboard/serve.mjs`. The sidebar currently lists specs in flat groups (one per package prefix) with requirement counts. Coverage data (bound/total scenarios) exists in `render-spec.mjs` and is shown only in the spec detail view header. Two new skills ship under `packages/dod-guard/skills/`.

## Goals / Non-Goals

**Goals:**
- Sidebar renders the spec tree as a foldable directory hierarchy matching `openspec/specs/` on disk
- Every tree node (folder and leaf) shows aggregate bound/total scenario coverage
- The coverage summary that was only in the detail-view header now lives in the sidebar entries
- `/spec-explore` discovers missing requirements by reading spec + implementation
- `/spec-test` generates tests from the spec contract, refuses to read the implementation for expected values, and reports contradictions

**Non-Goals:**
- Making coverage numbers editable or actionable from the dashboard (read-only policy stands)
- Auto-applying `/spec-explore` output into the main spec (user reviews and adopts)
- Supporting test generation for languages other than the project's own test framework

## Decisions

### 1. Tree data built server-side, folding client-side

The server already returns a flat list of specs with their ids (which encode the path, e.g. `dod-guard/interview`). The server will return specs as a nested tree object keyed by path segments, with each leaf carrying `boundCount` and `totalCount`. The client renders the tree with `<details>` elements for folding. No JavaScript tree-diffing library.

Alternative considered: building the tree client-side from the flat list. Rejected because the server already has the coverage data and rolling up counts is simpler in one place.

### 2. Coverage counts returned per-spec in the tree endpoint

The existing spec-detail endpoint returns a per-scenario coverage map. For the sidebar, each spec needs only two numbers (bound, total). The tree endpoint will include these counts per leaf so the client does not need to fetch every spec's detail just to render the sidebar. The detail view keeps its per-scenario map.

Alternative considered: a separate `/coverage-summary` endpoint. Rejected as over-engineered for a read-only tool with no separate frontend build.

### 3. `/spec-explore` uses a subagent that reads spec + source

The skill's SKILL.md will instruct the agent to read the spec, then read the implementation files in the named package, and compare. The agent writes a delta spec file as output. The user reviews it and merges what they want.

Alternative considered: a standalone script that diffs spec scenarios against test files. Rejected because requirement discovery is a reasoning task, not a structural diff.

### 4. `/spec-test` enforces spec-only assertions via agent instructions

The skill's SKILL.md will contain explicit instructions forbidding the agent from reading the implementation to determine expected values. The agent reads the spec scenarios, generates tests whose assertions come from the WHEN/THEN contract, runs them, and reports pass/fail. A failing test is reported as a spec-vs-implementation contradiction, not silently fixed.

Alternative considered: a two-phase approach where a first agent writes tests and a second audits them for implementation-mirroring. Rejected in favor of a single agent with clear instructions, since `/test-integrity-checker` already exists as the audit skill and can be run separately.

### 5. Filter preserves hierarchy by showing ancestor chain

When a filter is active, the client walks the tree and keeps every leaf whose name matches, plus every ancestor node on the path to it. Siblings that do not match are hidden. Fold state is preserved across filter changes by keying it on the path string.

## Risks / Trade-offs

- [Spec count growth] The sidebar tree DOM grows with the spec count. At the current 44 specs across 6 groups this is not a concern. If it reaches hundreds, virtual scrolling would be needed. -> Defer until the problem exists.
- [Agent compliance] `/spec-test` relies on the agent following the instruction not to read implementation source. An agent that disobeys writes blessed tests. -> The `/test-integrity-checker` skill exists as a second gate. The SKILL.md will be explicit about what the agent must not do.
- [Coverage cache invalidation] The tree endpoint reuses the existing cache key (mtime of openspec directory). Adding test-file mtime to the key was already done in the scenario-coverage work. No new invalidation logic needed.
