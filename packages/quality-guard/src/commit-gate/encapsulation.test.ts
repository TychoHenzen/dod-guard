import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { analyzeEncapsulation } from "./encapsulation.js";

test("reports a newly public symbol with its observed callers", () => {
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
            members: [
              { name: "preview", kind: "method", visibility: "public" },
            ],
            dependencies: [],
            forwardingPaths: [],
          },
        ],
      },
      {
        path: "test/service.test.ts",
        imports: [],
        references: ["Service.preview"],
        types: [],
      },
    ],
    affectedPaths: ["src/service.ts"],
    config: parseQualityConfig("{}"),
  });
  assert.deepEqual(result, [
    {
      kind: "public-surface-growth",
      path: "src/service.ts",
      symbol: "Service.preview",
      productionCallers: [],
      testCallers: ["test/service.test.ts"],
    },
    {
      kind: "test-only-seam",
      path: "src/service.ts",
      symbol: "Service.preview",
      productionCallers: [],
      testCallers: ["test/service.test.ts"],
    },
  ]);
});
