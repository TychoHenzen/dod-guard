import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { analyzeCurrentArchitecture } from "../../../src/commit-gate/current-architecture.js";
import { structuralFindings } from "../../../src/commit-gate/decision-findings-architecture.js";
import { analyzeDesignSmells } from "../../../src/commit-gate/design-smells.js";

test("reports only configured low-level configuration defaults", () => {
  const config = parseQualityConfig(
    JSON.stringify({
      pathGroups: { infrastructure: ["src/infra/**"] },
      lowLevelPathGroups: ["infrastructure"],
    }),
  );
  const files = [
    {
      path: "src/infra/Client.ts",
      imports: [],
      references: [],
      types: [],
      configurationDefaults: [
        { method: "run", parameter: "timeout", defaultValue: "30", line: 2 },
      ],
    },
    {
      path: "src/app/Client.ts",
      imports: [],
      references: [],
      types: [],
      configurationDefaults: [
        { method: "run", parameter: "timeout", defaultValue: "30", line: 2 },
      ],
    },
  ];
  const result = analyzeDesignSmells({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: ["src/infra/Client.ts", "src/app/Client.ts"],
    config,
  });
  assert.deepEqual(result, [
    {
      kind: "configurable-data",
      path: "src/infra/Client.ts",
      group: "infrastructure",
      method: "run",
      parameter: "timeout",
      defaultValue: "30",
      line: 2,
    },
  ]);
  assert.equal(
    analyzeCurrentArchitecture(files, config).configurableData.length,
    1,
  );
  const [finding] = structuralFindings({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: ["src/infra/Client.ts"],
    config,
  });
  assert.equal(finding?.severity, "review");
  assert.match(finding?.reason ?? "", /configurable-data/);
});

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
  const [finding] = structuralFindings({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: ["src/Service.ts"],
    config,
  });
  assert.equal(finding?.severity, "review");
  assert.match(finding?.reason ?? "", /transitive-navigation/);
});
