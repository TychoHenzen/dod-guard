import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkEnvironment } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

test("reports blank, unconfigured, and ambiguous supported root manifests", () => {
  const cases = [
    {
      files: { "package.json": '{"scripts":{"build":" ","test":""}}\n' },
      expected: ["build-entrypoint", "test-entrypoint"],
    },
    {
      files: {
        "pyproject.toml": '[build-system]\nrequires = ["setuptools"]\n',
      },
      expected: ["test-entrypoint"],
    },
    {
      files: {
        "first.csproj": "<Project />\n",
        "second.csproj": "<Project />\n",
      },
      expected: ["build-entrypoint", "test-entrypoint"],
    },
  ];
  for (const { files, expected } of cases)
    withProject(files, (root) =>
      assert.deepEqual(
        checkEnvironment(root, buildConfig("default")).map(
          (violation) => violation.rule,
        ),
        expected,
      ),
    );
});

test("routes E1 and E2 findings through the repository scan", () => {
  withProject({ "package.json": "{}\n" }, (root) => {
    const result = scan(
      { paths: ["."], root, excludes: [], testPaths: [], rules: null },
      buildConfig("default"),
    );
    assert.deepEqual(
      result.violations.map((violation) => violation.rule),
      ["build-entrypoint", "test-entrypoint"],
    );
  });
});

test("routes an unconfigured Python root through the repository scan", () => {
  withProject({ "pyproject.toml": '[project]\nname = "sample"\n' }, (root) => {
    const result = scan(
      { paths: ["."], root, excludes: [], testPaths: [], rules: null },
      buildConfig("default"),
    );
    assert.deepEqual(
      result.violations.map((violation) => violation.rule),
      ["build-entrypoint", "test-entrypoint"],
    );
  });
});
