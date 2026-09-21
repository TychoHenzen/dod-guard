import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import {
  checkEnvironment,
  resolveEntrypoints,
} from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

test("reports every candidate in an ambiguous solution layout", () => {
  withProject(
    {
      "first.sln": "Microsoft Visual Studio Solution File\n",
      "second.sln": "Microsoft Visual Studio Solution File\n",
      "app.csproj": "<Project />\n",
    },
    (root) => {
      const config = buildConfig("default");
      assert.deepEqual(checkEnvironment(root, config), [
        {
          file: "first.sln",
          line: 1,
          rule: "build-entrypoint",
          severity: "warn",
          message:
            "E1: multiple root .NET solution files (first.sln, second.sln) — " +
            "add one root build entry point",
          metric: 1,
        },
        {
          file: "first.sln",
          line: 1,
          rule: "test-entrypoint",
          severity: "warn",
          message:
            "E2: multiple root .NET solution files (first.sln, second.sln) — " +
            "add one root test entry point",
          metric: 1,
        },
      ]);
    },
  );
});

test("reports unsupported and directory-shaped roots through the scan", () => {
  withProject(
    {
      "README.md": "run whatever works\n",
      "Cargo.toml": null,
      "nested.csproj": null,
      "nested.sln": null,
    },
    (root) => {
      assert.equal(resolveEntrypoints(root), null);
      const result = scan(
        { paths: ["."], root, excludes: [], testPaths: [], rules: null },
        buildConfig("default"),
      );
      assert.deepEqual(
        result.violations.map(({ file, rule, message }) => ({
          file,
          rule,
          message,
        })),
        [
          {
            file: "<repository root>",
            rule: "build-entrypoint",
            message:
              "E1: no supported root entry point declaration found; inspected package.json, " +
              "Cargo.toml, pyproject.toml, .sln, or .csproj — add one documented " +
              "root build entry point",
          },
          {
            file: "<repository root>",
            rule: "test-entrypoint",
            message:
              "E2: no supported root entry point declaration found; inspected package.json, " +
              "Cargo.toml, pyproject.toml, .sln, or .csproj — add one documented " +
              "root test entry point",
          },
        ],
      );
    },
  );
});
