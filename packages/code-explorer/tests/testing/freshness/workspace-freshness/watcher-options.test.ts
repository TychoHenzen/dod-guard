import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import * as watching from "../../../../src/freshness/workspace-freshness.js";

it("uses the pinned Chokidar stability and safety options", () => {
  assert.deepEqual(watching.chokidarWatchOptions, {
    atomic: 100,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    alwaysStat: true,
    followSymlinks: false,
    ignorePermissionErrors: false,
  });
});

it("passes the shared ignore predicate as chokidar ignored", () => {
  const root = join(tmpdir(), "project");
  const { ignored, ...rest } = watching.chokidarOptionsFor([root]);
  assert.equal(typeof ignored, "function");
  assert.equal(ignored(join(root, "node_modules", "x.js")), true);
  assert.equal(ignored(join(root, "src", "a.ts")), false);
  assert.deepEqual(rest, watching.chokidarWatchOptions);
});
