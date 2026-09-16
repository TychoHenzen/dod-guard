import assert from "node:assert/strict";
import { test } from "node:test";
import { hasInboundWorkspaceUsage } from "../src/workspace-debris.js";
import { referenceEdge } from "./fossil-grader.test-support.js";

test("uses a supplied reference graph without reparsing sources", () => {
  assert.equal(
    hasInboundWorkspaceUsage({
      candidatePath: "scratch/old.ts",
      sources: [],
      inventoryPaths: [],
      graph: {
        edges: [
          referenceEdge({
            sourcePath: "src/importer.ts",
            targetPath: "scratch/old.ts",
            start: 0,
            column: 1,
          }),
        ],
        unresolved: [],
        complete: true,
        unavailablePaths: [],
      },
    }),
    true,
  );
});
