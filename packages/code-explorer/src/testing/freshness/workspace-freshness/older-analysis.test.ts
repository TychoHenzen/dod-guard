import assert from "node:assert/strict";
import { it } from "node:test";
import * as publication from "../../../freshness/workspace-freshness.js";

it(
  "rejects an older completed analysis after a newer " +
    "generation is current",
  () => {
    const stable = new Map([["src/a.ts", "stable"]]);
    assert.equal(publication.canPublishGeneration(5, 4, stable, stable), false);
  },
);
