## 1. CSS styling

- [x] 1.1 Add `border`, `border-radius`, `padding`, and `margin-top` rules to `.tree-folder` in `tools/openspec-dashboard/public/style.css`
- [x] 1.2 Use a translucent `var(--dim)` border color so nested folders stay readable at three levels
- [x] 1.3 Verify the border remains visible when a folder is collapsed (the `<details>` element without `open` still shows the summary row inside its border)

## 2. Visual verification

- [x] 2.1 Start the dashboard with `node tools/openspec-dashboard/serve.mjs` and confirm folders display a visible boundary around their summary and children
- [x] 2.2 Confirm nested folders each draw their own boundary and the inner border sits inside the outer one
- [x] 2.3 Confirm leaf specs have no border of their own
