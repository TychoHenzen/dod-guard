## 1. Server-side tree endpoint

- [x] 1.1 Add a `buildSpecTree()` function in `tools/openspec-dashboard/lib/project-reads.mjs` that takes the flat spec list and returns a nested object keyed by path segments, with each leaf carrying `boundCount` and `totalCount`
- [x] 1.2 Update the spec-detail response to include `boundCount` and `totalCount` fields alongside the existing `coverage` map
- [x] 1.3 Add or update the overview endpoint to return the nested tree alongside the flat spec list

## 2. Sidebar directory tree

- [x] 2.1 Replace the flat group rendering in `sidebar.mjs` with a recursive tree renderer that produces nested `<details>` elements for each folder node
- [x] 2.2 Display bound/total coverage counts on every tree node (folder aggregates, leaf own counts)
- [x] 2.3 Apply visual styles for full, partial, and zero coverage on tree nodes (reuse existing coverage color classes)
- [x] 2.4 Add CSS for the foldable tree structure (indentation, disclosure triangles, node padding) in `style.css`

## 3. Filter integration

- [x] 3.1 Update the sidebar filter to walk the tree and show only matching leaves plus their ancestor chain
- [x] 3.2 Preserve fold state across filter changes by keying on the path string
- [x] 3.3 Restore the full tree with prior fold state when the filter is cleared

## 4. Detail view cleanup

- [x] 4.1 Remove the aggregate coverage summary from the spec detail-view header (it now lives in the sidebar)

## 5. `/spec-explore` skill

- [x] 5.1 Create `packages/dod-guard/skills/spec-explore/SKILL.md` with instructions to read the spec and implementation, compare, and output a delta spec of proposed requirements
- [x] 5.2 Register the skill in `packages/dod-guard/.claude-plugin/plugin.json` and `marketplace.json`
- [x] 5.3 Update the root marketplace.json skill count for dod-guard

## 6. `/spec-test` skill

- [x] 6.1 Create `packages/dod-guard/skills/spec-test/SKILL.md` with instructions that forbid reading implementation for expected values, generate tests from WHEN/THEN contracts, run them, and report contradictions
- [x] 6.2 Register the skill in `packages/dod-guard/.claude-plugin/plugin.json` and `marketplace.json`
- [x] 6.3 Update the root marketplace.json skill count for dod-guard (combined with 5.3)

## 7. Validation

- [ ] 7.1 Run `node tools/openspec-dashboard/serve.mjs` and verify the sidebar tree renders, folds, shows coverage, and filters correctly in a browser
- [x] 7.2 Run `node scripts/ci/validate-plugins.mjs` to verify skill registration passes
- [x] 7.3 Run `node scripts/ci/check-skill-hygiene.mjs` to verify the new skills pass hygiene checks
