import assert from "node:assert/strict";
import { it } from "node:test";
import * as watching from "../../../freshness/workspace-freshness.js";

it("uses the pinned Chokidar stability and safety options", () => {
  assert.deepEqual(watching.chokidarWatchOptions, {
    atomic: 100,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    alwaysStat: true,
    followSymlinks: false,
    ignorePermissionErrors: false,
  });
});
