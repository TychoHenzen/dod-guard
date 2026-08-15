## Context

The sidebar renders the spec tree as nested `<details class="tree-folder">` elements. Each folder is a `<details>` containing a `<summary class="tree-summary">` and a `<div class="tree-children">`. Leaf specs are `<button class="entry">` elements inside the children div. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Make folders visually distinct from leaves using a border or outline on each `.tree-folder` element.
- Maintain readability at three or more nesting levels.

**Non-Goals:**

- Changing the fold/unfold interaction or the triangle indicator.
- Adding folder icons or other non-border visual cues.
- Modifying leaf-spec (`entry`) styling.

## Decisions

### CSS-only border on `.tree-folder`

Add a `border` and `border-radius` to `.tree-folder`. The existing `<details>` element already wraps the summary and children, so no HTML changes are needed.

Alternative considered: wrapping each folder in a new `<div class="folder-card">`. This adds DOM weight for no gain, because `<details>` already serves as the container.

### Subtle border color from the existing palette

Use `var(--dim)` at reduced opacity (e.g. `rgba(141,154,171,0.25)`) or a near-neighbor of the sidebar background (`#1a2130`). The border should separate without competing with text.

Alternative considered: a solid `var(--dim)` border. That reads too heavy when three folders are nested.

### Small padding and margin for nesting clarity

Add `padding: 4px` and `margin-top: 4px` to `.tree-folder` so the border does not sit flush against its children or its parent's border.

## Risks / Trade-offs

- [Deeply nested folders accumulate padding] -> At three levels the indentation is already 42px from `tree-children` padding. Adding 4px per folder border adds 12px more. Acceptable for a dashboard with at most four nesting levels in practice.
- [Border on collapsed folder looks like a button] -> The triangle indicator and hover style already signal "clickable folder." The border frames the group, not the click target.
