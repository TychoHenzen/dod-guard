import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { analyzeDependencies } from "./dependency.js";

// covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Policy imports a forbidden driver
test("reports a staged forbidden dependency with both normalized paths and the import", () => {
  const config = parseQualityConfig(
    '{"pathGroups":{"policy":["src/policy/**"],"infrastructure":["src/drivers/**"]},"dependencyDirections":[{"from":"policy","to":"infrastructure","allowed":false}]}',
  );
  const result = analyzeDependencies(
    [
      { path: "src/policy/rules.ts", imports: [] },
      { path: "src/drivers/clock.ts", imports: [] },
    ],
    [
      { path: "src/policy/rules.ts", imports: ["../drivers/clock"] },
      { path: "src/drivers/clock.ts", imports: [] },
    ],
    ["src/policy/rules.ts"],
    config,
  );
  assert.deepEqual(result, [
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

// covers: quality-guard/architecture-analysis :: Dependency boundaries are enforceable :: Staged edge closes a cycle
test("reports the complete normalized cycle closed by a staged edge", () => {
  const config = parseQualityConfig("{}");
  const result = analyzeDependencies(
    [
      { path: "src/a.ts", imports: ["./b"] },
      { path: "src/b.ts", imports: [] },
    ],
    [
      { path: "src/a.ts", imports: ["./b"] },
      { path: "src/b.ts", imports: ["./a"] },
    ],
    ["src/b.ts"],
    config,
  );
  assert.deepEqual(result, [
    {
      kind: "cycle",
      cycle: ["src/a.ts", "src/b.ts", "src/a.ts"],
      stagedEdge: { from: "src/b.ts", to: "src/a.ts", dependency: "./a" },
    },
  ]);
});

test("excludes test and generated modules from the production dependency graph", () => {
  const config = parseQualityConfig('{"generatedPaths":["generated/**"],"testPaths":["test/**"]}');
  assert.deepEqual(
    analyzeDependencies(
      [{ path: "src/a.ts", imports: [] }],
      [
        { path: "src/a.ts", imports: ["../generated/driver"] },
        { path: "generated/driver.ts", imports: ["../src/a"] },
        { path: "test/a.test.ts", imports: ["../src/a"] },
      ],
      ["src/a.ts"],
      config,
    ),
    [],
  );
});
