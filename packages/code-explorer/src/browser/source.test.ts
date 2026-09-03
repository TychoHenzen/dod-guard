import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderFocusedSource } from "./source.js";

describe("focused source", () => {
  it("renders UTF-16 validated handles as view-owned selectable text", () => {
    const html = renderFocusedSource({
      view_id: "view-1",
      symbol: { name: "run", kind: "function", path: "src/main.ts", symbol_id: "project:run" },
      generation: 4,
      body: "const \ud83d\ude00Target = 1;\r\nnext",
      handles: [{ handle: "handle-target", start: 8, end: 14, relations: ["definition", "references"] }],
      returned_bytes: 24,
      total_bytes: 24,
      limit_bytes: 64,
      truncated: false,
    });
    assert.match(html, /data-handle="handle-target"/);
    assert.match(html, /data-view-id="view-1"/);
    assert.match(html, /data-relations="definition references"/);
    assert.match(html, /data-line="1"/);
    assert.match(html, /data-line="2"/);
    assert.match(html, /project:run/);
    assert.match(html, /const \ud83d\ude00[\s\S]*Target/);
  });
  it("keeps the returned prefix and reports every byte count", () => {
    const html = renderFocusedSource({
      view_id: "view-1",
      symbol: { name: "run", kind: "function", path: "src/main.ts", symbol_id: "project:run" },
      generation: 4,
      body: "returned prefix",
      handles: [],
      returned_bytes: 15,
      total_bytes: 40,
      limit_bytes: 16,
      truncated: true,
    });
    assert.match(html, /returned prefix/);
    assert.match(html, /15 returned bytes/);
    assert.match(html, /40 total bytes/);
    assert.match(html, /16 byte limit/);
    assert.match(html, /data-truncated="true"/);
  });
  it("renders hostile source as text rather than markup", () => {
    const html = renderFocusedSource({
      view_id: "view-1",
      symbol: { name: "<script>", kind: "function", path: "src/<main>.ts", symbol_id: "project:run" },
      generation: 4,
      body: "<img src=x onerror=alert(1)>\n<script>alert(1)</script>",
      handles: [],
      returned_bytes: 54,
      total_bytes: 54,
      limit_bytes: 64,
      truncated: false,
    });
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<img|<script/);
  });
});
