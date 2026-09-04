# openspec-dashboard/folder-nav Specification

## Purpose

Presents the spec tree as a foldable directory hierarchy in the sidebar, mirroring the on-disk layout, with aggregate test coverage at every folder level.

## Requirements

### Requirement: The sidebar renders specs as a foldable directory tree

The sidebar SHALL render the spec list as a tree whose structure matches the `openspec/specs/` folder hierarchy. Each intermediate directory (group) SHALL be a foldable node. Each leaf SHALL be a capability. Folding or unfolding a node SHALL preserve the state of all other nodes.

#### Scenario: Two-level hierarchy renders as nested tree
- **WHEN** a project has specs at `dod-guard/interview`, `dod-guard/ratchet`, and `evomcp/cascade`
- **THEN** the sidebar shows two folder nodes (`dod-guard` and `evomcp`), `dod-guard` contains two leaves, and `evomcp` contains one leaf

#### Scenario: Folding a group hides its children
- **WHEN** the reader folds the `dod-guard` group node
- **THEN** the `dod-guard` node stays visible, its children disappear, and all other nodes remain unchanged

#### Scenario: Unfolding a group reveals its children
- **WHEN** the reader unfolds a previously folded group node
- **THEN** its capability leaves reappear in their original order

#### Scenario: A deeper hierarchy renders correctly
- **WHEN** a project has specs nested three levels deep (e.g. `platform/auth/oauth`)
- **THEN** the sidebar renders three levels of foldable nodes with the leaf at the deepest level

### Requirement: Each tree node shows aggregate coverage

Every node in the spec tree SHALL display a coverage summary. A capability leaf SHALL show its own bound/total scenario count. A folder node SHALL show the sum of bound and total counts across all capabilities it contains, recursively.

#### Scenario: Folder node aggregates child coverage
- **WHEN** a group folder contains three specs with coverage 2/4, 1/3, and 0/2
- **THEN** the folder node displays 3/9

#### Scenario: Leaf node shows its own coverage
- **WHEN** a spec has 5 scenarios, 3 of which are bound
- **THEN** its leaf entry in the sidebar displays 3/5

#### Scenario: A folder with all children fully covered
- **WHEN** every spec under a group has all scenarios bound
- **THEN** the folder node displays N/N and uses the full-coverage visual style

### Requirement: The filter narrows the tree without breaking hierarchy

The existing name filter SHALL work on the tree. When filtering, the sidebar SHALL show only capabilities whose name matches, plus every ancestor folder needed to maintain the tree structure. Filtered-out siblings SHALL be hidden.

#### Scenario: Filter matches one spec in a group of three
- **WHEN** the reader types a filter that matches one capability inside a three-capability group
- **THEN** the group folder appears with only that one capability visible, and unrelated groups are hidden

#### Scenario: Clearing the filter restores the full tree
- **WHEN** the reader clears a filter that was active
- **THEN** the full tree reappears with the same fold states as before

### Requirement: Folder nodes are visually bounded

Each folder node in the sidebar tree SHALL be enclosed in a visible boundary shape (border, outline, or card) that distinguishes it from its leaf-spec children. The boundary SHALL enclose the folder summary row and all of its direct children. Nested folders SHALL each draw their own boundary, so multiple nesting levels remain visually distinct.

#### Scenario: A folder with leaf children has a visible border
- **WHEN** a group folder contains two leaf specs
- **THEN** the folder node is enclosed in a visible border that wraps the folder summary and both leaf entries, and the leaf entries themselves have no such border

#### Scenario: Nested folders each have their own boundary
- **WHEN** a folder contains a subfolder that contains leaf specs
- **THEN** both the outer folder and the inner folder draw their own boundary, and the inner boundary sits inside the outer one

#### Scenario: A collapsed folder keeps its boundary
- **WHEN** the reader folds a folder node
- **THEN** the boundary remains visible around the collapsed summary row

#### Scenario: The boundary respects the dark theme
- **WHEN** the dashboard renders in its dark color scheme
- **THEN** the folder boundary uses a color that is visible against the dark sidebar background without overpowering the text
