import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { analyzeCurrentArchitecture } from "../../../src/commit-gate/current-architecture.js";
import { analyzeDesignSmells } from "../../../src/commit-gate/design-smells/design-smells.js";

test("reports harmful-looking receiver chains but excludes fluent markers", () => {
  const config = parseQualityConfig("{}");
  const files = [
    {
      path: "src/Service.ts",
      imports: [],
      references: [],
      types: [],
      transitiveNavigation: [
        {
          method: "run",
          root: "client",
          hops: ["get", "store", "save"],
          chain: "this.client.get().store().save()",
          line: 2,
        },
        {
          method: "build",
          root: "builder",
          hops: ["step", "next", "build"],
          chain: "this.builder.step().next().build()",
          line: 3,
        },
      ],
    },
  ];
  const result = analyzeDesignSmells({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: ["src/Service.ts"],
    config,
  });
  assert.deepEqual(result, [
    {
      kind: "transitive-navigation",
      path: "src/Service.ts",
      method: "run",
      root: "client",
      hops: ["get", "store", "save"],
      chain: "this.client.get().store().save()",
      line: 2,
    },
  ]);
  assert.equal(
    analyzeCurrentArchitecture(files, config).transitiveNavigation.length,
    1,
  );
});
