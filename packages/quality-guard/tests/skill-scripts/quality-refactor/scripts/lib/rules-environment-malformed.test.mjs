import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "#quality-guard-config";
import { checkEnvironment } from "#quality-guard-rules-project";
import { withProject } from "./rules-environment-test-support.mjs";

test("reports a malformed package.json as no root manifest", () => {
  const inspected =
    "no supported root entry point declaration found; inspected " +
    "package.json, Cargo.toml, pyproject.toml, .sln, or .csproj";
  withProject({ "package.json": "{" }, (root) =>
    assert.deepEqual(
      checkEnvironment(root, buildConfig()).map((violation) => [
        violation.file,
        violation.message,
      ]),
      [
        [
          "<repository root>",
          `E1: ${inspected} - add one documented root build entry point`,
        ],
        [
          "<repository root>",
          `E2: ${inspected} - add one documented root test entry point`,
        ],
      ],
    ),
  );
});
