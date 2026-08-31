import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBrowserStore, renderBrowserShell } from "./app.js";

describe("browser shell", () => {
  // covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Browser opens with no focused symbol
  it("renders landmarks, an empty focus prompt, and no invented relations", () => {
    const html = renderBrowserShell(
      createBrowserStore({ landmarks: [{ group: "Files", items: ["src/lib.rs"] }] }).state(),
      1200,
    );
    assert.match(html, /Landmarks/);
    assert.match(html, /Select a symbol/);
    assert.match(html, /No relations loaded/);
  });

  // covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Symbol is focused
  it("keeps a focused symbol central while both side panes remain available", () => {
    const store = createBrowserStore();
    store.dispatch({ operation: "focus", symbol: { name: "parse", path: "src/lib.rs", kind: "function" } });
    const html = renderBrowserShell(store.state(), 1200);
    assert.match(html, /data-pane="discovery"/);
    assert.match(html, /data-pane="focus"/);
    assert.match(html, /data-pane="relations"/);
    assert.match(html, /parse/);
  });

  // covers: code-explorer/browser-navigation :: The desktop view keeps one symbol central :: Window becomes narrow
  it("renders mouse-operable side drawers below the desktop breakpoint", () => {
    const html = renderBrowserShell(createBrowserStore().state(), 700);
    assert.match(html, /data-drawer="discovery"/);
    assert.match(html, /data-drawer="relations"/);
    assert.match(html, /aria-controls="discovery-pane"/);
    assert.match(html, /aria-controls="relations-pane"/);
  });

  // covers: code-explorer/browser-navigation :: Browser actions cannot modify project content :: User inspects every visible action
  it("maps every visible action to a read-only navigation or local operation", () => {
    const store = createBrowserStore();
    for (const operation of store.visibleOperations()) assert.doesNotThrow(() => store.dispatch({ operation }));
    assert.deepEqual(
      [...store.visibleOperations()].sort(),
      ["back", "focus", "forward", "refresh", "refocus", "search", "set_drawer", "set_filters", "status"].sort(),
    );
  });

  // covers: code-explorer/browser-navigation :: Browser actions cannot modify project content :: Browser submits an unadvertised operation
  it("rejects an operation outside the closed browser action set", () => {
    const store = createBrowserStore();
    assert.throws(() => store.dispatch({ operation: "write_file" }), /unsupported_browser_operation/);
  });
});
