import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { analyzeCurrentArchitecture } from "./current-architecture.js";

test("audits current placement, boundaries, cycles, and encapsulation without a base tree", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: { core: ["src/utils/**"], infra: ["src/infra/**"] },
      dependencyDirections: [{ from: "core", to: "infra", allowed: false }],
    }),
  );
  const report = analyzeCurrentArchitecture(
    [
      {
        path: "src/utils/Service.ts",
        imports: ["../infra/Store"],
        references: [],
        types: [
          {
            name: "Service",
            members: [{ name: "run", kind: "method", visibility: "public" }],
            dependencies: [],
            forwardingPaths: [{ member: "oldRun", target: "run" }],
          },
        ],
      },
      {
        path: "src/infra/Store.ts",
        imports: ["../utils/Service"],
        references: [],
        types: [{ name: "Store", members: [], dependencies: [], forwardingPaths: [] }],
      },
    ],
    config,
  );

  assert.equal(report.placement[0]?.kind, "generic-bucket");
  assert.equal(report.dependencies[0]?.kind, "forbidden-direction");
  assert.deepEqual(report.cycles[0]?.cycle, ["src/infra/Store.ts", "src/utils/Service.ts", "src/infra/Store.ts"]);
  assert.deepEqual(
    report.encapsulation.map((finding) => finding.kind),
    ["forwarding-path", "public-surface-growth"],
  );
});
