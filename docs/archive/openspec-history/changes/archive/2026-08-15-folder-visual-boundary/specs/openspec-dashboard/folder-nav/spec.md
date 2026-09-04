## ADDED Requirements

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
