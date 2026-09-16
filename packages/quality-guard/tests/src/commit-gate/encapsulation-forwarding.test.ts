import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { analyzeEncapsulation } from "../../../src/commit-gate/encapsulation.js";

test("reports forwarding compatibility paths as review evidence", () => {
  const result = analyzeEncapsulation({
    beforeFiles: [
      {
        path: "src/service.ts",
        imports: [],
        references: [],
        types: [
          {
            name: "Service",
            members: [],
            dependencies: [],
            forwardingPaths: [],
          },
        ],
      },
    ],
    afterFiles: [
      {
        path: "src/service.ts",
        imports: [],
        references: [],
        types: [
          {
            name: "Service",
            members: [],
            dependencies: [],
            forwardingPaths: [{ member: "oldRun", target: "worker.run" }],
          },
        ],
      },
    ],
    affectedPaths: ["src/service.ts"],
    config: parseQualityConfig("{}"),
  });
  assert.deepEqual(result, [
    {
      kind: "forwarding-path",
      path: "src/service.ts",
      type: "Service",
      member: "oldRun",
      target: "worker.run",
    },
  ]);
});
