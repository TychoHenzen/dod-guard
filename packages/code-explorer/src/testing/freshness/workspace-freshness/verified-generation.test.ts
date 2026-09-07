import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { manifest } from "./manifest.js";

it(
  "publishes a new generation only after a changed manifest " + "verifies",
  async () => {
    const captured = [
      manifest({ "src/a.ts": "one" }),
      manifest({ "src/a.ts": "two" }),
    ];
    const verified = [
      manifest({ "src/a.ts": "one" }),
      manifest({ "src/a.ts": "two" }),
    ];
    const freshness = new WorkspaceFreshness({
      reconcile: async () =>
        captured.shift() ?? manifest({ "src/a.ts": "two" }),
      verify: async () => verified.shift() ?? manifest({ "src/a.ts": "two" }),
    });
    await freshness.start();
    const first = freshness.status().current_generation;
    await freshness.reconcile();
    assert.ok(freshness.status().current_generation > first);
  },
);
