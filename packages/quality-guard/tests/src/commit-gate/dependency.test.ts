import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { analyzeCurrentDependencies } from "../../../src/commit-gate/dependency-current.js";

test("reports a current forbidden dependency with normalized paths and import", () => {
  const config = parseQualityConfig(
    '{"pathGroups":{"policy":["src/policy/**"],"infrastructure":' +
      '["src/drivers/**"]},"dependencyDirections":[{"from":"policy",' +
      '"to":"infrastructure","allowed":false}]}',
  );
  const result = analyzeCurrentDependencies(
    [
      { path: "src/policy/rules.ts", imports: ["../drivers/clock"] },
      { path: "src/drivers/clock.ts", imports: [] },
    ],
    config,
  );
  assert.deepEqual(result.dependencies, [
    {
      kind: "forbidden-direction",
      from: "src/policy/rules.ts",
      to: "src/drivers/clock.ts",
      dependency: "../drivers/clock",
      fromGroup: "policy",
      toGroup: "infrastructure",
    },
  ]);
});
test("reports the complete normalized current cycle", () => {
  const config = parseQualityConfig("{}");
  const result = analyzeCurrentDependencies(
    [
      { path: "src/a.ts", imports: ["./b"] },
      { path: "src/b.ts", imports: ["./a"] },
    ],
    config,
  );
  assert.deepEqual(result.cycles, [
    {
      kind: "cycle",
      cycle: ["src/a.ts", "src/b.ts", "src/a.ts"],
    },
  ]);
});

test("excludes test and generated modules", () => {
  const config = parseQualityConfig(
    '{"generatedPaths":["generated/**"],"testPaths":["test/**"]}',
  );
  assert.deepEqual(
    analyzeCurrentDependencies(
      [
        { path: "src/a.ts", imports: ["../generated/driver"] },
        { path: "generated/driver.ts", imports: ["../src/a"] },
        { path: "test/a.test.ts", imports: ["../src/a"] },
      ],
      config,
    ),
    { dependencies: [], cycles: [] },
  );
});
