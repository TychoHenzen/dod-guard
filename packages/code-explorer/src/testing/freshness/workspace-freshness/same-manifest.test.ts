import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { manifest } from "./manifest.js";

it(
  "retains one published generation when two operations " +
    "observe the same manifest",
  async () => {
    const freshness = new WorkspaceFreshness({
      reconcile: async () => manifest({ "src/a.ts": "one" }),
    });
    await freshness.start();
    const first = freshness.status();
    const second = freshness.status();
    assert.equal(first.current_generation, second.current_generation);
    assert.equal(first.pending_generation, null);
  },
);
