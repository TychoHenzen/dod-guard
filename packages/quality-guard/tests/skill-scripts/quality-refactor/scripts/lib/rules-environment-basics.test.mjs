import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import {
  checkEnvironment,
  resolveEntrypoints,
} from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

test("reports missing root Node build and test scripts as E1 and E2", () => {
  withProject(
    { "package.json": '{"scripts":{"lint":"biome check ."}}\n' },
    (root) => {
      const found = checkEnvironment(root, buildConfig("default"));
      assert.deepEqual(
        found.map((violation) => violation.rule),
        ["build-entrypoint", "test-entrypoint"],
      );
      assert.match(found[0].message, /E1/);
      assert.match(found[1].message, /E2/);
      assert.ok(found.every((violation) => violation.file === "package.json"));
    },
  );
});

test("resolves declared and language-standard one-command entry points", () => {
  const cases = [
    [
      { "package.json": '{"scripts":{"build":"tsc","test":"node --test"}}\n' },
      "package.json",
      "npm run build",
      "npm test",
    ],
    [
      { "Cargo.toml": '[package]\nname = "sample"\nversion = "0.1.0"\n' },
      "Cargo.toml",
      "cargo build",
      "cargo test",
    ],
    [
      { "sample.csproj": '<Project Sdk="Microsoft.NET.Sdk" />\n' },
      "sample.csproj",
      "dotnet build sample.csproj",
      "dotnet test sample.csproj",
    ],
    [
      {
        "pyproject.toml":
          '[build-system]\nrequires = ["setuptools"]\n\n[tool.pytest.ini_options]\n',
      },
      "pyproject.toml",
      "python -m build",
      "python -m pytest",
    ],
  ];
  for (const [files, file, build, testCommand] of cases)
    withProject(files, (root) => {
      assert.deepEqual(resolveEntrypoints(root), {
        file,
        build,
        test: testCommand,
      });
      assert.deepEqual(checkEnvironment(root, buildConfig("default")), []);
    });
});
test("uses a root solution as the .NET boundary", () => {
  withProject(
    {
      "sample.sln": "Microsoft Visual Studio Solution File\n",
      "app.csproj": "<Project />\n",
      "test.csproj": "<Project />\n",
    },
    (root) => {
      assert.deepEqual(resolveEntrypoints(root), {
        file: "sample.sln",
        build: "dotnet build sample.sln",
        test: "dotnet test sample.sln",
      });
      assert.deepEqual(checkEnvironment(root, buildConfig("default")), []);
    },
  );
});
