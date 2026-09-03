## Why

Folder nodes and leaf specs in the sidebar look nearly identical - same flat rows, same hover style, same padding. The only visual cue is a small triangle on folders. At a glance, the hierarchy is hard to read because nothing groups a folder's children into a visible unit.

## What Changes

- Add a visible boundary shape (border or card outline) around each folder node in the sidebar tree, so the folder and its children read as a single visual group.
- The boundary must respect the existing dark theme, fold/unfold behavior, and nesting depth.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `openspec-dashboard/folder-nav`: Add a requirement that folder nodes are visually distinguished from leaf entries by a boundary shape that encloses the folder and its children.

## Impact

- `tools/openspec-dashboard/public/style.css` - new CSS rules for the folder boundary.
- `tools/openspec-dashboard/public/sidebar.mjs` - possible minor HTML changes if the current `<details>` structure needs a wrapper for the border.
